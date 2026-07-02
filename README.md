# eve-mini-agent

一个最小可运行的 [Vercel Eve](https://github.com/vercel/eve) 聊天应用 + agent 框架示例。

- 直连 **minimax**（`https://api.minimaxi.com/v1`）的 `MiniMax-M3` 模型，**不走 Vercel AI Gateway**（无需绑卡）
- HTTP API 通过 eve 自带 `/eve/v1/session` + `/eve/v1/session/:id/stream`
- 浏览器聊天框走 `serve.py`（同源反代，绕开 CORS）
- 4 个内置工具：`get_weather`（wttr.in 真接口）/ `get_time`（IANA 时区）/ `web_search`（DDG + Instant Answer 兜底）/ `read_url`（Readability + turndown）
- `agent/skills/`：按需加载的代码评审 / SQL 助手流程
- `agent/subagents/`：`coder` + `researcher` 两条子 agent
- `agent/channels/telegram.ts`：Telegram bot 通道
- `agent/schedules/daily-briefing.ts`：每日简报定时推送
- `evals/`：6 个回归用例（greetings / read-url / skills / weather）

## 前置条件

- Node.js **≥ 24**（`node -v`，v22/v20 会被 eve 拒绝）
- 一个 minimax API key
- （可选）Python 3，启动 `serve.py` 拿浏览器 UI
- （可选）Telegram：bot token + chat id，启用 channel 与每日简报

## 启动

### 1. 装依赖
```bash
npm install
```

### 2. 写 .env
```bash
cat > .env <<'EOF'
MINIMAX_API_KEY=sk-cp-你的key
EOF
```
完整模板（含 Telegram / Tavily / Brave / Vercel AI Gateway 等可选变量）见 `.env.example`。

### 3. 启动 eve dev（后端 API，监听 :2000）
```bash
./node_modules/.bin/eve dev --no-ui
# 或
npm run dev -- --no-ui
```
看到 `[DEV] server listening at http://127.0.0.1:2000/` 表示就绪。

### 4. 启动聊天框（监听 :3000）
另一个终端：
```bash
python3 serve.py
```
打开浏览器 `http://127.0.0.1:3000/` 即可。

### 5. 启用 Telegram bot + 每日简报（可选）
见下面 [Telegram 通道](#telegram-通道) 一节。

## 内置工具

| 工具 | 干嘛的 | 网络 |
|---|---|---|
| `get_weather` | 当前天气（温度 / 天气状况 / 湿度） | wttr.in |
| `get_time` | 给定 IANA 时区（如 `Asia/Shanghai`）的当前时间 | 无（本地） |
| `web_search` | 关键词搜索，带 answer 摘要 | DDG HTML → Instant Answer（被 anti-bot 拦时降级） |
| `read_url` | 给定 URL，抽正文转 markdown | `@mozilla/readability` + `turndown` |

未在调用时显式点名工具的情况下，`agent/instructions.md` 里写明了中文路由示例，模型会按描述自动 fan-out。

## Skills（按需加载流程）

`agent/skills/<name>.md` 是一份 markdown 流程，模型通过 `load_skill` 工具按需拉入 context。常驻 token 成本低。

- `agent/skills/code-review.md`：贴 Python 注入代码 → 模型按"必改 / 建议 / 好的地方"格式输出 + 修正版
- `agent/skills/sql-helper.md`：写 PG 每日新用户统计 → 标准 SQL + 假设 + 索引建议
- `agent/subagents/coder/skills/code-review.md`：coder 子 agent 用的代码评审 skill

子 agent 路由命中（description 里的关键词）→ 模型自己 emit `load_skill`，不需要在业务代码里 if/else。

## Sub-agents

`agent/subagents/<name>/` 下定义独立的 system prompt + 工具子集 + skill：

- `coder/`：代码相关任务（读文件 / 改文件 / 评审）
- `researcher/`：联网研究（`web_search` + `read_url`）

主 agent 的 `instructions.md` 写明多 agent 协作规则：emit 多次 agent 调用时，每次 `message` 只传必要 context。

## Telegram 通道

把 agent 暴露成 Telegram bot，需要 3 个 env + 1 处代码改动 + 1 处公网部署。

### a) 跟 @BotFather 创建 bot
1. Telegram 搜 `@BotFather`，发 `/newbot`
2. 按提示输入显示名 + username（必须以 `bot` 结尾）
3. BotFather 返回 **username**（去掉 `@`）和 **token**（形如 `123:AAHxxx...`）

### b) 改 1 处代码
编辑 `agent/channels/telegram.ts:21`，把 `botUsername` 改成你真实的 username（不带 `@`）。

### c) 在 `.env` 里追加 3 个变量
```bash
TELEGRAM_BOT_TOKEN=123456789:AAHxxxxxxxxxxxxxxxxxx
TELEGRAM_WEBHOOK_SECRET_TOKEN=$(openssl rand -hex 32)
# 拿法：先给 bot 发条消息，再 GET
#   https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates
# 响应里的 chat.id 就是要填的
TELEGRAM_BRIEFING_CHAT_ID=123456789
```

### d) 部署到公网 + 注册 webhook
本地 dev 起的是 `:2000`，Telegram 打不到。**必须先有公网 HTTPS URL**（Vercel / VPS / ngrok 都行），然后：
```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.example.com/eve/v1/telegram",
    "secret_token": "'"${TELEGRAM_WEBHOOK_SECRET_TOKEN}"'",
    "allowed_updates": ["message", "callback_query"]
  }'
```
返回 `{"ok": true}` 就算通了。触发条件：私聊 bot、群里 `@bot_username`、回复 bot 消息、`/ask <问题>`。

### 每日简报
`agent/schedules/daily-briefing.ts` 通过 eve 的 schedule 机制按 cron 推送简报到 `TELEGRAM_BRIEFING_CHAT_ID`。具体 cron 表达式与简报内容模板见该文件顶部注释。

## 项目结构
```
eve-mini-agent/
├── agent/
│   ├── agent.ts                 # 主 agent：直连 minimax，reasoning: medium，compaction 0.75
│   ├── instructions.md          # 中文 system prompt（工具路由 + 多 agent 协作规则）
│   ├── sandbox.ts               # 沙箱配置
│   ├── channels/
│   │   └── telegram.ts          # Telegram webhook 适配
│   ├── hooks/
│   │   └── log-turn.ts          # 每个 turn 的日志埋点
│   ├── schedules/
│   │   └── daily-briefing.ts    # 每日简报定时任务
│   ├── skills/
│   │   ├── code-review.md
│   │   └── sql-helper.md
│   ├── subagents/
│   │   ├── coder/               # 写代码子 agent
│   │   └── researcher/          # 联网研究子 agent
│   └── tools/
│       ├── get_time.ts
│       ├── get_weather.ts       # wttr.in
│       ├── read_url.ts          # Readability + turndown
│       └── web_search.ts        # DDG + Instant Answer 兜底
├── evals/                       # 6 个回归用例
│   ├── evals.config.ts
│   ├── greetings/no-tools-for-hi.eval.ts
│   ├── read-url/blocks-non-whitelisted.eval.ts
│   ├── read-url/success-eval.eval.ts
│   ├── skills/triggers-code-review.eval.ts
│   ├── weather/reply-includes-temp.eval.ts
│   └── weather/uses-real-tool.eval.ts
├── public/
│   └── index.html               # 浏览器聊天框
├── scripts/
│   └── patch-nf3.mjs            # postinstall: 给 node-fetch 打个 polyfill shim
├── serve.py                     # :3000 静态 + /eve/v1/* 反代 → :2000
├── package.json
├── tsconfig.json
└── .env                         # gitignored
```

## HTTP API 速查

### 创建会话 + 发首条消息
```bash
curl -X POST http://127.0.0.1:2000/eve/v1/session \
  -H "Content-Type: application/json" \
  -d '{"message":"上海天气怎么样？"}'
# → {"sessionId":"wrun_xxx","ok":true,"continuationToken":"..."}
```

### 订阅流式响应（SSE / ndjson）
```bash
curl -N http://127.0.0.1:2000/eve/v1/session/wrun_xxx/stream
```

### 续聊
```bash
curl -X POST http://127.0.0.1:2000/eve/v1/session/wrun_xxx \
  -H "Content-Type: application/json" \
  -d '{"message":"那北京呢？"}'
```

## 切换模型

编辑 `agent/agent.ts`，把 `"MiniMax-M3"` 换成 minimax `/v1/models` 列表里的其它 id：
- `MiniMax-M3`（默认）
- `MiniMax-M2.7` / `MiniMax-M2.7-highspeed`
- `MiniMax-M2.5` / `MiniMax-M2.5-highspeed`
- `MiniMax-M2.1` / `MiniMax-M2.1-highspeed`

## 加新工具

在 `agent/tools/<name>.ts` 写：
```ts
import { defineTool } from "eve/tools";

export default defineTool({
  description: "做什么的",
  inputSchema: {
    type: "object",
    properties: { foo: { type: "string" } },
    required: ["foo"],
  },
  async execute({ foo }) {
    return { result: `you said ${foo}` };
  },
});
```

eve dev 会热重载。

**注意**：暂时别 `import { never } from "eve/tools/approval"` — 这个 import 会触发 eve 内部的 `undefined.input` 错误。`approval` 字段直接省略即可。

## 运行 evals

```bash
npm run build
# 然后用 eve eval 跑 evals/*.eval.ts（具体 CLI 见 eve 文档）
```

## 已知坑

- **Node 版本**：必须 ≥ 24
- **`approval` import**：见上
- **CORS**：eve dev server 不返回 CORS 头，所以**不要**用 `fetch` 直接打 `:2000`（除非带 server 端代理）。`serve.py` 帮你解决了这个问题
- **DDG 公共搜索**：anti-bot 对模型出口 IP 限流时，`web_search` 会结构化失败，模型诚实降级到知识回答；生产建议接 Tavily / Brave
