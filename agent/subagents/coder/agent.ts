import { defineAgent } from "eve";
import { createOpenAI } from "@ai-sdk/openai";

const minimax = createOpenAI({
  baseURL: "https://api.minimaxi.com/v1",
  apiKey: process.env.MINIMAX_API_KEY,
});

export default defineAgent({
  description:
    "Code analysis specialist. Reviews code the user pastes, finds bugs, suggests refactors. Does NOT fetch the web, does NOT get weather/time. Use when the user wants code review, refactor advice, or explanation of a snippet.",
  model: minimax("MiniMax-M3"),
  modelContextWindowTokens: 128000,
  reasoning: "high", // 代码分析开高 reasoning
});
