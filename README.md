# eve-mini-agent

一个最小可运行的 [Vercel Eve](https://github.com/vercel/eve) 聊天应用：

- 直连 **minimax**（`https://api.minimaxi.com/v1`）的 MiniMax-M3 模型，**不走 Vercel AI Gateway**（无需绑卡）
- HTTP API 通过 eve 自带 `/eve/v1/session` + `/eve/v1/session/:id/stream`
- 自带一个工具 `get_weather`（mock 数据）
- `serve.py` 提供 `http://127.0.0.1:3000/` 的浏览器聊天框（同源反代，绕开 CORS）

## 前置条件

- Node.js **≥ 24**（`node -v`，v22/v20 会被 eve 拒绝）
- 一个 minimax API key
- （可选）Python 3，用于启动 `serve.py` 拿到浏览器 UI

## 启动

### 1. 装依赖
```bash
cd eve-mini-agent
npm install
```

### 2. 写 .env
```bash
cat > .env <<'EOF'
MINIMAX_API_KEY=sk-cp-你的key
EOF
```

### 3. 启动 eve dev（后端 API，监听 :2000）
```bash
./node_modules/.bin/eve dev --no-ui
# 或用 package.json 里的脚本：
npm run dev -- --no-ui
```
看到 `[DEV] server listening at http://127.0.0.1:2000/` 表示就绪。

### 4. 启动聊天框（监听 :3000）
另一个终端：
```bash
python3 serve.py
```
打开浏览器 `http://127.0.0.1:3000/` 即可。

### 5. 启用 Telegram bot（可选）
如果你想把 agent 暴露成 Telegram bot、或者用每日简报定时推送，需要额外配 3 个 env + 1 处代码改动：

#### a) 跟 @BotFather 创建 bot
1. 在 Telegram 搜 `@BotFather`，发 `/newbot`
2. 按提示输入显示名 + username（必须以 `bot` 结尾）
3. BotFather 会返回两样东西：
   - **username**（去掉 `@`，例如 `eve_mini_agent_bot`）
   - **token**（形如 `123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxx`）

#### b) 改 1 处代码
编辑 `agent/channels/telegram.ts:21`，把 `botUsername` 改成你真实的 username（不要带 `@`）。

#### c) 在 `.env` 里追加 3 个变量
```bash
# BotFather 给的 token
TELEGRAM_BOT_TOKEN=123456789:AAHxxxxxxxxxxxxxxxxxx

# 验签随机串（自己生成，部署到生产前重做一次）
TELEGRAM_WEBHOOK_SECRET_TOKEN=$(openssl rand -hex 32)

# 收每日简报的 chat id
# 拿法：先给 bot 发一条消息，然后 GET
#   https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates
# 响应里的 chat.id 就是要填的值
TELEGRAM_BRIEFING_CHAT_ID=123456789
```
完整模板见 `.env.example`。

#### d) 部署到公网 + 注册 webhook
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
返回 `{"ok": true}` 就算通了。触发条件：私聊 bot、群里 `@bot_username`、回复 bot 消息、`/ask <问题>``。


## 项目结构
```
eve-mini-agent/
├── agent/
│   ├── agent.ts            # 直连 minimax，modelContextWindowTokens: 128000
│   ├── instructions.md     # 中文 system prompt
│   └── tools/
│       └── get_weather.ts  # 示例工具（JSON Schema 风格）
├── public/
│   └── index.html          # 聊天框 UI（同源反代访问 eve API）
├── serve.py                # 静态文件 + /eve/v1/* 反代 → :2000
├── package.json
├── tsconfig.json
└── .env
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

## 已知坑

- **Node 版本**：必须 ≥ 24
- **`approval` import**：见上
- **CORS**：eve dev server 不返回 CORS 头，所以**不要**用 `fetch` 直接打 `:2000`（除非带 server 端代理）。`serve.py` 帮你解决了这个问题
