import { defineSandbox } from "eve/sandbox";

// 把 sandbox 出网默认改成 deny-all。
// 注意：这只影响框架内置的 bash 工具。
// 用户自定义工具（get_weather / read_url / web_search）从 agent 进程直接出网，
// 由各工具自己内部的 URL 域名白名单收口。
//
// 这样组合：sandbox 内禁止随意 bash 出网 + 用户工具白名单，
// 大幅减少 prompt injection 让 agent 乱抓站 / 乱装包的风险。
export default defineSandbox({
  async onSession({ use }) {
    await use({ networkPolicy: "deny-all" });
  },
});
