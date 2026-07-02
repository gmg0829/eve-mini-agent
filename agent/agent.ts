import { defineAgent } from "eve";
import { createOpenAI } from "@ai-sdk/openai";

// 直连 minimax 的 OpenAI 兼容端点，绕开 Vercel AI Gateway。
// 需要 .env 里有 MINIMAX_API_KEY。
const minimax = createOpenAI({
  baseURL: "https://api.minimaxi.com/v1",
  apiKey: process.env.MINIMAX_API_KEY,
});

export default defineAgent({
  model: minimax("MiniMax-M3"),
  // 显式声明 context window，跳过 AI Gateway catalog 查询
  modelContextWindowTokens: 128000,

  // 推理档位：medium 适合日常；可在 instructions 里用 /reasoning 提示模型按需调档
  reasoning: "medium",

  // 上下文压缩：达到 75% 窗口时触发（默认 90%），长对话更早腾地方
  compaction: {
    thresholdPercent: 0.75,
  },
});
