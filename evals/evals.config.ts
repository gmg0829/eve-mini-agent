import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({
  // 默认 timeout：单测 60s，模型延迟 + 工具调用
  timeoutMs: 120_000,
});
