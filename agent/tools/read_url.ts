import { defineTool } from "eve/tools";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { JSDOM } from "jsdom";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// 域名白名单：防止 prompt injection 让 agent 抓恶意站点
// 真实生产里可以根据用户需求放开
const ALLOWED_HOST_SUFFIXES = [
  "wikipedia.org",
  "github.com",
  "rust-lang.org",
  "nodejs.org",
  "python.org",
  "typescriptlang.org",
  "developer.mozilla.org",
  "vercel.com",
  "anthropic.com",
  "openai.com",
  "minimaxi.com",
  "gov.cn",
  "zhihu.com",
  "stackoverflow.com",
];

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => h === suffix || h.endsWith("." + suffix),
  );
}

export default defineTool({
  description:
    "Fetch a URL and return the article body as markdown. Strips ads/nav. URL must be on the allowlist (default: common doc/wiki sites).",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Absolute http(s) URL" },
      maxChars: {
        type: "number",
        description: "Cap returned markdown length (default 8000)",
      },
    },
    required: ["url"],
  },
  async execute({ url, maxChars = 8000 }: { url: string; maxChars?: number }) {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return { url, error: "invalid url" };
    }
    if (!/^https?:$/.test(target.protocol)) {
      return { url, error: "only http(s) supported" };
    }
    if (!isAllowedHost(target.hostname)) {
      return {
        url,
        error: `host "${target.hostname}" is not on the allowlist. Allowed: ${ALLOWED_HOST_SUFFIXES.join(", ")}`,
      };
    }
    const res = await fetch(target, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { url, error: `HTTP ${res.status}` };
    const html = await res.text();
    const dom = new JSDOM(html, { url: target.toString() });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article) {
      return {
        url,
        title: target.hostname,
        markdown: "",
        note: "Readability could not extract an article; page may not be article-shaped.",
      };
    }
    const td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    let md = td.turndown(article.content ?? "");
    if (md.length > maxChars) md = md.slice(0, maxChars) + "\n\n[...truncated]";
    return {
      url,
      title: article.title ?? target.hostname,
      byline: article.byline ?? null,
      markdown: md,
    };
  },
});
