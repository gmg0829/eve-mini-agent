import { defineSchedule } from "eve/schedules";
import telegram from "../channels/telegram.js";

// 每天北京时间 9:00（UTC 1:00）触发，调用 get_weather 拿本地天气，
// 然后把"今日简报"推给 Telegram。
// 部署到 Vercel 后会自动变成 Vercel Cron Job。
// 本地 dev 不会按 cron 触发，但你可以用 eve 的 one-shot dispatch 手动验证。
export default defineSchedule({
  cron: "0 1 * * *", // 1:00 UTC = 9:00 北京时间
  async run({ receive, waitUntil, appAuth }) {
    waitUntil(
      receive(telegram, {
        message:
          "生成一份'今日简报'，用中文，简短（200 字以内）。\n" +
          "必须包含：\n" +
          "1) 用 get_weather 查上海当前天气（温度 + 概况）\n" +
          "2) 用 get_time 报当前时间\n" +
          "3) 一句给上班族的温馨提醒（自己组织，不要编造新闻）\n" +
          "不要联网搜新闻，专注天气 + 时间。",
        target: { chatId: process.env.TELEGRAM_BRIEFING_CHAT_ID ?? "0" },
        auth: appAuth,
      }),
    );
  },
});
