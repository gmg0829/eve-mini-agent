import { defineAgent } from "eve";
import { createOpenAI } from "@ai-sdk/openai";

const minimax = createOpenAI({
  baseURL: "https://api.minimaxi.com/v1",
  apiKey: process.env.MINIMAX_API_KEY,
});

export default defineAgent({
  description:
    "Research specialist. Gathers information from the web (web_search) and fetches article content (read_url) to answer research questions. Use when the user wants up-to-date facts, news, or detailed page content. Does NOT call get_weather, get_time, or any other tools.",
  model: minimax("MiniMax-M3"),
  modelContextWindowTokens: 128000,
  reasoning: "medium",
});
