import { telegramChannel } from "eve/channels/telegram";

// 把 agent 暴露给 Telegram bot。
// 必填 env：
//   TELEGRAM_BOT_TOKEN          BotFather 给的 token
//   TELEGRAM_WEBHOOK_SECRET_TOKEN  自己生成的一段随机串，用来验签
//
// 部署后还要手动调 setWebhook 把公网 URL 注册到 Telegram：
//   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
//     -H "Content-Type: application/json" \
//     -d '{"url":"https://your-app.example.com/eve/v1/telegram",
//          "secret_token":"'"$TELEGRAM_WEBHOOK_SECRET_TOKEN"'",
//          "allowed_updates":["message","callback_query"]}'
//
// 私聊、群内 @ 机器人、回复机器人消息，这三种会触发；
// 加 /ask 命令也可以（私聊/群）。
export default telegramChannel({
  botUsername: "eveAgentTest_bot", // 改成你 bot 的真实 username（不要带 @）
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "application/pdf"],
    maxBytes: 10 * 1024 * 1024, // 10 MB
  },
});
