import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// 验证：read_url 抓非白名单 URL → 工具应返回 allowlist 错误
export default defineEval({
  description: "read_url on a non-whitelisted host is rejected; reply mentions allowlist.",
  async test(t) {
    await t.send(
      "请调用 read_url 工具，URL 是 https://example.com/，并把工具返回的错误原文告诉我",
    );
    t.succeeded();
    t.calledTool("read_url");
    t.check(t.reply, includes("allowlist"));
  },
});
