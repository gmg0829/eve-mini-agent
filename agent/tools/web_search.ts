import { defineTool } from "eve/tools";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// 三个后端的优先级：有 key 的优先。模型在 description 里能看到当前实际走的是哪个。
//   1. TAVILY_API_KEY   — 1000/月免费，AI 搜索（带 answer 摘要）
//   2. BRAVE_API_KEY    — 2000/月免费，传统 SERP
//   3. (无 key)         — DDG 公开端点兜底，经常被 anti-bot 拦
//
// 统一的输出 schema：
//   { query, source, count, results: [{title, url, snippet}], answer?, error? }
// 模型侧不感知后端切换。

// ============ Tavily ============
async function tavilySearch(
  query: string,
  apiKey: string,
  cap: number,
): Promise<{ ok: boolean; data?: any; status: number; error?: string }> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: cap,
        // "basic" 便宜快，"advanced" 更深但更慢；月度额度更紧
        search_depth: "basic",
        // 让 Tavily 给一个 LLM-friendly 的答案摘要，省一次 LLM 自己总结
        include_answer: true,
        // 不抓 raw HTML，content 已经是清洗后的纯文本
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `tavily HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      results?: Array<{ title: string; url: string; content: string }>;
      answer?: string;
    };
    return { ok: true, data, status: 200 };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message ?? String(e) };
  }
}

// ============ Brave Search ============
async function braveSearch(
  query: string,
  apiKey: string,
  cap: number,
): Promise<{ ok: boolean; data?: any; status: number; error?: string }> {
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${cap}`,
      {
        method: "GET",
        headers: {
          "X-Subscription-Token": apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      return { ok: false, status: res.status, error: `brave HTTP ${res.status}` };
    }
    const raw = (await res.json()) as {
      web?: { results?: Array<{ title: string; url: string; description: string }> };
    };
    return { ok: true, data: { source: "brave", results: raw.web?.results ?? [], answer: undefined }, status: 200 };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message ?? String(e) };
  }
}

// ============ DDG 兜底（无 key） ============
async function tryEndpoint(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; html?: string; json?: any; status: number }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    if (url.includes("api.duckduckgo.com")) {
      const json = await res.json();
      return { ok: res.ok, json, status: res.status };
    }
    return { ok: res.ok, html: await res.text(), status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}


function parseHtmlResults(html: string, cap: number) {
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) && results.length < cap) {
    let link = m[1];
    try {
      const u = new URL(link, "https://html.duckduckgo.com");
      const uddg = u.searchParams.get("uddg");
      if (uddg) link = decodeURIComponent(uddg);
    } catch {
      /* keep as-is */
    }
    const title = stripHtml(m[2]);
    if (!title || seen.has(link)) continue;
    seen.add(link);
    results.push({ title, url: link, snippet: "" });
  }
  const snippets: string[] = [];
  let s: RegExpExecArray | null;
  while ((s = snippetRe.exec(html))) snippets.push(stripHtml(s[1]));
  for (let i = 0; i < results.length; i++) {
    results[i].snippet = snippets[i] ?? "";
  }
  return results;
}

async function ddgSearch(
  query: string,
  cap: number,
): Promise<{ ok: boolean; data?: any; status: number; error?: string }> {
  // 1) HTML 端点
  const body = new URLSearchParams({ q: query, kl: "us-en" });
  const r1 = await tryEndpoint("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
    },
    body,
  });
  if (r1.ok && r1.html) {
    const results = parseHtmlResults(r1.html, cap);
    if (results.length > 0) {
      return {
        ok: true,
        status: 200,
        data: { source: "ddg-html", results, answer: undefined },
      };
    }
  }

  // 2) Instant Answer 兜底
  const r2 = await tryEndpoint(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    { method: "GET", headers: { "User-Agent": UA, Accept: "application/json" } },
  );
  if (r2.ok && r2.json) {
    const d = r2.json;
    const abstract = (d.AbstractText || "").trim();
    const url = d.AbstractURL || "";
    if (abstract && url) {
      return {
        ok: true,
        status: 200,
        data: {
          source: "ddg-instant",
          results: [{ title: d.Heading || query, url, snippet: abstract }],
          answer: undefined,
        },
      };
    }
    const topics = (d.RelatedTopics || [])
      .filter((t: any) => t.Text && t.FirstURL)
      .slice(0, cap)
      .map((t: any) => ({ title: t.Text.split(" - ")[0], url: t.FirstURL, snippet: t.Text }));
    if (topics.length > 0) {
      return {
        ok: true,
        status: 200,
        data: { source: "ddg-instant", results: topics, answer: undefined },
      };
    }
  }

  return { ok: false, status: 0, error: "DDG 公开端点未返回任何可用结果" };
}

export default defineTool({
  description:
    "Web search. Backend priority (auto-detected from env): 1) Tavily (TAVILY_API_KEY, 1000/mo free) — returns AI-summarized answer, 2) Brave Search (BRAVE_API_KEY, 2000/mo free), 3) DuckDuckGo public endpoint (no key, best-effort, often blocked by anti-bot). Returns { query, source, count, results, answer? }.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      maxResults: {
        type: "number",
        description: "How many results to return (1-10, default 5)",
      },
    },
    required: ["query"],
  },
  async execute({ query, maxResults = 5 }: { query: string; maxResults?: number }) {
    const cap = Math.min(Math.max(maxResults, 1), 10);
    const tavilyKey = process.env.TAVILY_API_KEY;
    const braveKey = process.env.BRAVE_API_KEY;

    // 1) Tavily
    if (tavilyKey) {
      const r = await tavilySearch(query, tavilyKey, cap);
      if (r.ok && r.data) {
        const results = (r.data.results ?? []).map((x: any) => ({
          title: x.title,
          url: x.url,
          snippet: x.content,
        }));
        return {
          query,
          source: "tavily",
          count: results.length,
          results,
          answer: r.data.answer || undefined,
        };
      }
      // 失败：降级到 Brave / DDG
      const fallback = braveKey
        ? await braveSearch(query, braveKey, cap)
        : await ddgSearch(query, cap);
      if (fallback.ok && fallback.data) {
        return {
          query,
          source: fallback.data.source,
          count: fallback.data.results.length,
          results: fallback.data.results,
          answer: fallback.data.answer,
          warning: `Tavily 调用失败 (${r.error})，已降级到 ${fallback.data.source}`,
        };
      }
      return {
        query,
        source: "tavily-failed",
        count: 0,
        results: [],
        error: `Tavily: ${r.error}; 降级也失败: ${fallback.error}`,
      };
    }

    // 2) Brave
    if (braveKey) {
      const r = await braveSearch(query, braveKey, cap);
      if (r.ok && r.data) {
        const results = (r.data.results ?? []).map((x: any) => ({
          title: x.title,
          url: x.url,
          snippet: x.description,
        }));
        return { query, source: "brave", count: results.length, results };
      }
      // 失败：降级 DDG
      const fallback = await ddgSearch(query, cap);
      if (fallback.ok && fallback.data) {
        return {
          query,
          source: fallback.data.source,
          count: fallback.data.results.length,
          results: fallback.data.results,
          warning: `Brave 调用失败 (${r.error})，已降级到 ${fallback.data.source}`,
        };
      }
      return {
        query,
        source: "brave-failed",
        count: 0,
        results: [],
        error: `Brave: ${r.error}; 降级也失败: ${fallback.error}`,
      };
    }

    // 3) DDG 兜底
    const r = await ddgSearch(query, cap);
    if (r.ok && r.data) {
      return {
        query,
        source: r.data.source,
        count: r.data.results.length,
        results: r.data.results,
        answer: r.data.answer,
        warning:
          "无 TAVILY_API_KEY / BRAVE_API_KEY，使用 DDG 公开端点（经常被 anti-bot 限流）。" +
          "建议在 .env 加 TAVILY_API_KEY 以获得稳定结果。",
      };
    }
    return {
      query,
      source: "ddg-failed",
      count: 0,
      results: [],
      error:
        "DDG 公开端点未返回任何结果。建议在 .env 加 TAVILY_API_KEY 或 BRAVE_API_KEY。",
    };
  },
});
