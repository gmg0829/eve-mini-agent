import { defineEval } from "eve/evals";

// 验证：用户问天气 → 模型必须调 get_weather 工具
export default defineEval({
  description: "User asks about weather in Chinese → must invoke get_weather tool.",
  async test(t) {
    await t.send("上海现在天气怎么样？");
    t.succeeded();
    t.calledTool("get_weather");
  },
});
