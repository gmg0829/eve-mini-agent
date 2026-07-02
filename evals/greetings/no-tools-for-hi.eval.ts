import { defineEval } from "eve/evals";

// 验证：普通打招呼不应该触发任何工具
export default defineEval({
  description: "Plain greeting should not trigger any tool calls.",
  async test(t) {
    await t.send("你好！");
    t.succeeded();
    t.usedNoTools();
  },
});
