#!/usr/bin/env python3
"""
反代 + 静态文件。
- 静态: GET /  → public/
- 其它: 反代到 EVE_BASE
  - 响应 content-type 含 event-stream / ndjson → 透传 chunked
  - 其它 → 解码 chunked，返回 Content-Length
"""
import http.server, socketserver, os, sys, mimetypes, signal
from urllib.parse import urlsplit
import socket

PORT = int(os.environ.get("CHAT_PORT", "3000"))
EVE = os.environ.get("EVE_BASE", "http://127.0.0.1:2000")
HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(HERE, "public")

_spl = urlsplit(EVE)
EVE_HOST = _spl.hostname
EVE_PORT = _spl.port or 80

HOP_BY_HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
              "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length"}

def read_request_body(rfile, headers):
    body = b""
    cl = headers.get("Content-Length")
    te = (headers.get("Transfer-Encoding") or "").lower()
    if cl:
        try:
            n = int(cl)
            body = rfile.read(n) if n > 0 else b""
        except Exception:
            body = b""
    elif te == "chunked":
        while True:
            line = rfile.readline().strip()
            if not line:
                break
            try:
                size = int(line, 16)
            except ValueError:
                break
            if size == 0:
                rfile.readline()
                break
            body += rfile.read(size)
            rfile.readline()
    return body

def read_response_headers(s):
    """Return (status_code, hdrs_dict, body_so_far)."""
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = s.recv(4096)
        if not chunk:
            return None, {}, b""
        buf += chunk
    head, _, rest = buf.partition(b"\r\n\r\n")
    status_line = head.split(b"\r\n", 1)[0].decode("iso-8859-1", "replace")
    try:
        status_code = int(status_line.split(" ", 2)[1])
    except Exception:
        status_code = 502
    hdrs = {}
    for line in head.split(b"\r\n")[1:]:
        if b":" not in line:
            continue
        k, _, v = line.partition(b":")
        hdrs[k.decode("iso-8859-1").strip().lower()] = v.decode("iso-8859-1").strip()
    return status_code, hdrs, rest

def decode_chunked(s, pre_read):
    body = b""
    buf = pre_read
    while True:
        if b"\r\n" not in buf:
            ch = s.recv(4096)
            if not ch:
                return body
            buf += ch
            continue
        size_line, _, buf = buf.partition(b"\r\n")
        try:
            size = int(size_line.strip(), 16)
        except ValueError:
            return body
        if size == 0:
            if buf.startswith(b"\r\n"):
                buf = buf[2:]
            return body
        while len(buf) < size + 2:
            ch = s.recv(4096)
            if not ch:
                return body
            buf += ch
        body += buf[:size]
        buf = buf[size+2:]

def read_until_close(s, pre_read, timeout=60):
    body = pre_read
    s.settimeout(timeout)
    try:
        while True:
            chunk = s.recv(64 * 1024)
            if not chunk:
                break
            body += chunk
    except Exception:
        pass
    return body

class Handler(http.server.BaseHTTPRequestHandler):
    wbufsize = 0
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[serve] " + (fmt % args) + "\n")

    def _serve_static(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        full = os.path.normpath(os.path.join(PUBLIC_DIR, rel))
        if not full.startswith(PUBLIC_DIR) or not os.path.isfile(full):
            self.send_error(404)
            return
        ctype, _ = mimetypes.guess_type(full)
        ctype = ctype or "application/octet-stream"
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Connection", "close")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _proxy(self, method):
        body = read_request_body(self.rfile, dict(self.headers))

        fwd_lines = [f"{method} {self.path} HTTP/1.1", f"Host: {EVE_HOST}:{EVE_PORT}"]
        for k, v in self.headers.items():
            if k.lower() in HOP_BY_HOP or k.lower() == "host":
                continue
            fwd_lines.append(f"{k}: {v}")
        if body:
            fwd_lines.append(f"Content-Length: {len(body)}")
        fwd_lines.append("Connection: close")
        fwd_lines.append("")
        fwd_lines.append("")
        upstream_req = ("\r\n".join(fwd_lines)).encode() + body

        s = socket.create_connection((EVE_HOST, EVE_PORT), timeout=600)
        try:
            s.sendall(upstream_req)
            status_code, hdrs, rest = read_response_headers(s)
            if status_code is None:
                self.send_response(502)
                self.end_headers()
                return

            upstream_te = hdrs.get("transfer-encoding", "").lower()
            upstream_ct = hdrs.get("content-type", "").lower()
            is_stream = ("event-stream" in upstream_ct) or ("ndjson" in upstream_ct)

            # Forward headers (skip hop-by-hop + TE + CL)
            self.send_response(status_code)
            for k, v in hdrs.items():
                if k in HOP_BY_HOP:
                    continue
                if k in ("transfer-encoding", "content-length"):
                    continue
                self.send_header(k, v)
            self.send_header("Connection", "close")

            if is_stream:
                # Pass through chunked
                self.send_header("Transfer-Encoding", "chunked")
                self.end_headers()
                if rest:
                    self.wfile.write(rest)
                s.settimeout(60)
                try:
                    while True:
                        chunk = s.recv(64 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                except Exception:
                    pass
            else:
                # Decode chunked, send as Content-Length
                if upstream_te == "chunked":
                    body_out = decode_chunked(s, rest)
                else:
                    body_out = read_until_close(s, rest)
                self.send_header("Content-Length", str(len(body_out)))
                self.end_headers()
                self.wfile.write(body_out)
        except Exception as e:
            sys.stderr.write(f"[serve] proxy err: {e}\n")
            try:
                if not self.wfile.closed:
                    msg = f"upstream error: {e}".encode()
                    self.send_response(502)
                    self.send_header("Content-Type", "text/plain; charset=utf-8")
                    self.send_header("Content-Length", str(len(msg)))
                    self.end_headers()
                    self.wfile.write(msg)
            except Exception:
                pass
        finally:
            try:
                s.close()
            except Exception:
                pass

    def _is_static(self):
        p = self.path.split("?", 1)[0]
        return p in ("/", "") or (p.startswith("/") and not p.startswith("/eve/") and not p.startswith("/api/"))

    def do_GET(self):
        if self._is_static():
            self._serve_static()
        else:
            self._proxy("GET")
    def do_POST(self):   self._proxy("POST")
    def do_PUT(self):    self._proxy("PUT")
    def do_DELETE(self): self._proxy("DELETE")
    def do_OPTIONS(self):self._proxy("OPTIONS")

class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True

def _shutdown(*_):
    print("\n[serve] shutting down", flush=True)
    sys.exit(0)

if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)
    if not os.path.isdir(PUBLIC_DIR):
        print(f"missing public dir: {PUBLIC_DIR}", file=sys.stderr)
        sys.exit(1)
    with ThreadingServer(("127.0.0.1", PORT), Handler) as srv:
        print(f"[serve] http://127.0.0.1:{PORT}/  ->  {EVE}", flush=True)
        print(f"[serve] static: {PUBLIC_DIR}", flush=True)
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
