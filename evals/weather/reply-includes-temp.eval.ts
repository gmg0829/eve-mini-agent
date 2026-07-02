import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// 验证：天气回复里必须含 "°C"，且必须调了 get_weather
export default defineEval({
  description: "User asks for real-time weather in 东京 → must call get_weather, reply must include °C.",
  async test(t) {
    await t.send("请帮我查一下东京现在的实时温度");
    t.succeeded();
    t.calledTool("get_weather");
    t.check(t.reply, includes("°C"));
  },
});
