import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// 验证：read_url 抓白名单内的 URL → 应返回 markdown，回复应含 Rust
export default defineEval({
  description: "read_url on a whitelisted host returns markdown including 'Rust'.",
  async test(t) {
    await t.send(
      "请调用 read_url 工具，URL 是 https://www.rust-lang.org/，然后告诉我页面里第一段正文里出现了什么关键词",
    );
    t.succeeded();
    t.calledTool("read_url");
    t.check(t.reply, includes("Rust"));
  },
});
