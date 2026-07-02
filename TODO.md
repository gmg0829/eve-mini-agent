# eve-mini-agent 功能增强任务列表

按"从最值钱到最工程化"分四阶段。状态：✅ 已完成 · 🚧 进行中 · ⬜ 待办

## Phase 1 · 让聊天框真能干活的（高 ROI）

- ✅ **1. `get_weather` 换成 wttr.in 真接口**
  - 文件：`agent/tools/get_weather.ts`
  - 实测：上海 25°C / 局部多云 / 89% 湿度

- ✅ **2. 加多工具：`get_time` / `web_search` / `read_url`**
  - `get_time`：基于 `Intl.DateTimeFormat` + IANA 时区，无需网络
  - `web_search`：DDG HTML 端点（被 anti-bot 拦）+ Instant Answer 兜底
  - `read_url`：`@mozilla/readability` 抽正文 + `turndown` 转 markdown
  - 新增依赖：`@mozilla/readability` `turndown` `jsdom`
  - 实测：read_url 抓 rust-lang.org 正确抽到 3 个卖点
  - 已知问题：DDG 公共搜索对模型 IP 限流 → 工具返回结构化失败，模型诚实降级到知识回答

- ✅ **3. `instructions.md` 加中文工具路由示例**
  - 文件：`agent/instructions.md`（37 行）
  - 实测1：用户问"东京热不热"（未点名工具）→ 自动调 get_weather → 拿到 26°C 准确回答

  - 实测2：5 城市天气请求 → 模型 fan-out 并发查询 → 5×2=10 次工具调用 → 汇总成漂亮表格
  - 额外收益：instructions 里写明多 agent 协作规则（emit 多次 agent 调用 / message 只传必要 context）

## Phase 2 · 让 agent 变"程序化"（eve 差异化能力）

- ✅ **4. 加 `agent/skills/`：按需加载流程**
  - 文件：`agent/skills/code-review.md` + `agent/skills/sql-helper.md`
  - 实测1：贴 Python 注入代码 → 模型调 `load_skill` 2 次 → 按 skill 格式输出 必改/建议/好的地方 + 修正版
  - 实测2：要求写 PG 每日新用户统计 SQL → 模型调 `load_skill` 2 次 → 输出标准 SQL + 假设/注意/索引建议
  - 优势：skills 按需拉入 context，常驻 token 成本低
  - 触发：description 路由命中 → 模型自己 emit `load_skill`

- ✅ **5. 调 `agent.ts` 档位**
  - 文件：`agent/agent.ts`（`reasoning: "medium"` + `compaction.thresholdPercent: 0.75`）
  - 实测：ping/pong 正常，无回归

## Phase 3 · 多入口与定时（走出浏览器）

- ✅ **6. `agent/subagents/` 专家分工**
  - 文件：`agent/subagents/{researcher,coder}/agent.ts` + `instructions.md`
  - 实测：贴 Node SQL 注入代码 → 模型调 `coder` 1 次 → 父流收到 `subagent.called` 事件 → coder 产出 3 类问题 + 修正版
  - **关键发现**：eve 0.17.1 实际隔离模型比 docs 严格
    - 子 agent **不继承**父的 user-tools（get_weather/get_time/read_url/web_search 在 coder 里完全看不见）
    - `disableTool()` **只对框架工具**有效（bash/read_file/web_search 框架版等），对 user-tools 调用会报错
    - 想给子 agent 复用 user-tool：在 `subagents/<id>/tools/` 复制一份（用 `lib/` 共享更优雅）

- ✅ **7. `agent/channels/telegram.ts` 多入口**
  - 文件：`agent/channels/telegram.ts`（直接用官方 `telegramChannel`，配 uploadPolicy 限制 10MB 内图片/PDF）
  - 实测：`POST /eve/v1/telegram` 路由已生效；无 secret token → 401（验签策略生效）
  - 部署时：手动 `setWebhook` 注册公网 URL + 配 env（`TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET_TOKEN`）
  - 触发条件：私聊、群内 @bot、回复 bot 消息、`/ask` 命令

- ✅ **8. `agent/schedules/daily-briefing.ts` 定时任务**
  - 文件：`agent/schedules/daily-briefing.ts`
  - cron：`0 1 * * *`（UTC 1:00 = 北京时间 9:00）
  - 走 `run` handler → `receive(telegram, { message, target: { chatId } })`
  - 实测：`POST /eve/v1/dev/schedules/daily-briefing` 手动触发 → session 建好 → 模型调 get_weather + get_time → 输出上海 25°C / 体感 28°C 简报

## Phase 4 · 工程化

- ✅ **9. `agent/hooks/log-turn.ts` 生命周期记录**
  - 文件：`agent/hooks/log-turn.ts`（订阅 7 类事件：session.started / message.received / actions.requested / action.result / message.completed / turn.completed / session.failed）
  - 输出：`.eve/logs/turns.jsonl`（带时间戳 + sessionId + nodeId + 关键 payload）
  - 实测：发"东京天气" → log 精确记下 6 类事件，tool 调用的 inputKeys、isError 都有
  - 已知：子 agent 的 hook 不会冒泡到父级（按 docs 设计），nodeId 字段能区分

- ✅ **10. `agent/sandbox/` 收紧出网白名单**
  - 文件 1：`agent/sandbox.ts`（`onSession` 配 `networkPolicy: "deny-all"`，只影响框架 bash 工具）
  - 文件 2：`agent/tools/read_url.ts`（加域名白名单：wikipedia / github / rust-lang / mozilla / vercel / minimaxi / 等 14 个）
  - 实测：rust-lang.org 通过 → 拿正确标题；example.com 拒绝 → 工具返回清晰错误
  - **重要发现**：sandbox networkPolicy 只覆盖 bash 工具，**user-tools 需各自加白名单**——docs 警告'defaultBackend is not a substitute for configuring network policy'就是这个意思

- ⬜ **11. `evals/` 写 5–10 个 fixture + 跑通**
  - 至少覆盖：`get_weather`（必调工具）/ `read_url`（必出 markdown）/ `web_search`（失败时诚实验证）
  - 用 eve 自带 `assertions.mdx` 体系

- ⬜ **12. 给关键工具加 human-in-the-loop approval gate**
  - 范围：`read_url`（抓外部页面）、未来要加的 `write_file` / `bash` / `send_email`
  - 绕开 `eve/tools/approval` 的已知 bug：用 `defineHook` 在工具执行前注入 confirmation，或在工具 `execute` 里调一个 HTTP approval-gate 微服务

---

## 建议执行顺序

- 想"今天能跑"：先做完 Phase 1（30 分钟内见效）
- 想"明天能部署"：再做 Phase 2 + 3
- Phase 4 是上线前再补

## 已变更文件清单

- `agent/tools/get_weather.ts` — 改写
- `agent/tools/get_time.ts` — 新增
- `agent/tools/web_search.ts` — 新增
- `agent/tools/read_url.ts` — 新增
- `package.json` / `package-lock.json` — 新增 3 个依赖
- `TODO.md` — 本文件


## Phase 5 · UI 优化（已完成 P0）

- ✅ **13. UI 优化 P0 三件套**
  - 文件：`public/index.html`（660 → 916 行，21.8K → 33.3K，备份在 `public/index.html.bak`）
  - **P0.1 扩 preset**：4 → 9 个按钮，分 3 组（🌤 天气&时间 / 🌐 联网&抓页面 / 🛠 Skills&子 agent），覆盖所有新能力
  - **P0.2 升级 tool card**：加 `TOOL_META` 字典给每个工具专属图标/动词/头摘要 + `renderResult` 工具输出专属渲染（天气显示温度体感湿度、抓页面显示标题+markdown 预览、web_search 显示 top-3 链接列表、load_skill 显示 skill 名）；状态从 "..." 变 ✓/✗；input 默认折叠到 details 标签里
  - **P0.3 子 agent 可视化**：handleEvent 加 `subagent.called` / `subagent.completed` 分支；父流收到 called → 渲染带子 agent 名 + 任务预览的卡片 + 并行调 `subscribeChild` 拉子流；子流里的 tool call 实时追加到子卡片；completed → 状态变 ✓
  - 实测：发"用 coder 子 agent 帮我 review..." → 父流返回 1 次 subagent.called（含 childSessionId: wrun_01...）+ 1 次 subagent.completed → UI 把这些事件渲染成可折叠的子卡片
  - 验证：HTTP 200，体积正常；JS 语法 OK；evals 跑过不回归

## 后续 P1 候选
- 多会话侧栏（`GET /eve/v1/sessions` + `attachSession`）
- URL 抓取助手（输入框旁 🔗 按钮）
- 流式状态细分（searching / fetching / reviewing / compacting）
- Markdown 渲染升级（表格/列表/链接/heading）
- Dev 模式抽屉显示 hook 日志


- ✅ **14. UI: 完整 Markdown 渲染（无依赖）**
  - 文件：`public/index.html`（1116 → 1229 行，+113 行，+5K）
  - 替换原 renderText：原来只支持 code/bold，现在支持：
    - fenced code block + inline code
    - bold / italic
    - heading h1-h4
    - 链接 `[text](url)` + 裸 URL 自动识别
    - 无序列表 (`-` `*`) + 有序列表 (`1.`)
    - 引用 `>` + 分隔线 `---`
    - **GFM 表格**（`| col | col |` + `|---|---|` 分隔符）
    - 双换行 `\n\n` → `</p><p>`，单换行 → `<br>`
  - 配套 CSS：表格边框、h1-h4 字号、blockquote 灰底斜杠、code 背景、a 蓝色 + hover 下划线
  - 实测：headless Node 跑渲染器，h2 + 表格 + 列表 + bold + 链接全部正确转 HTML
  - 验证：JS 语法 OK，HTTP 200，体积 41.8K → 47.3K，evals 5/6 通过（read-url/success-eval 这次反通过了，唯一挂的是 weather/reply-includes-temp 因模型路由抖动超时——与 UI 改动无关）


## Phase 6 · 改名（已完成）

- ✅ **15. 目录改名：eve-mini-chat → eve-mini-agent**
  - 改动：`mv /home/gaominggang/workspace/eve-mini-chat /home/gaominggang/workspace/eve-mini-agent`
  - 8 个用户可见位置已对齐（package.json / README / TODO / UI title / UI header / hook log agentName / agentId / .gitignore）
  - 验证：eve dev 重启 → :2000 listening；serve.py 重启 → :3000 listening；ping/pong 正常
  - 坑：eve dev 在 sandbox 初始化时需要 `setsid + nohup + disown` 三件套才能脱离 exec 父进程，否则 `MainThread` 子进程被带死；serve.py 同理


## Phase 7 · 搜索升级 + UI 重做（已完成）

- ✅ **16. UI 全面重做（Phase A 视觉 + Phase B 部分）**
  - 文件：`public/index.html`（1230 → 1714 行，47K → 66K）
  - Token 体系 17 → 38 个；glassmorphism header / composer；4 级 shadow 体系
  - 工具卡片重做：左 3px 工具色条 + 圆角 12 + spinner → ✓/✗ 状态机 + chevron 平滑动画
  - Avatar 改内联 SVG（用户中性 / 助手渐变光晕）
  - 空状态改 hero：左侧 badge + 渐变大标题 + 右侧 3 组 example card
  - 主题切换：亮/暗/跟随三态 + localStorage 持久化 + sun/moon/auto 图标
  - 流式状态细分：`搜索中…` / `查天气…` / `抓取页面…` / `加载技能…` / `执行命令…`
  - 每条消息 hover 显示时间戳 + 复制按钮
  - 响应式 + prefers-reduced-motion 降级
  - 验证：jsdom 端到端 10/10 通过；TS 编译干净

- ✅ **17. web_search 接入 Tavily + Brave（可降级链）**
  - 文件：`agent/tools/web_search.ts`（142 → 318 行）
  - 后端优先级：`TAVILY_API_KEY` > `BRAVE_API_KEY` > DDG 兜底
  - Tavily：`POST api.tavily.com/search`，带 `include_answer` 和 `search_depth=basic`
  - Brave：`GET api.search.brave.com/res/v1/web/search`，header `X-Subscription-Token`
  - DDG 兜底：HTML 端点 → Instant Answer → 失败返空 + 友好提示
  - 自动降级：上游失败自动跳下一级，warning 字段告知用户
  - 统一 schema：`{ query, source, count, results, answer?, warning?, error? }`
  - 验证：mocked 测试 5/5（Tavily 成功 / Brave 成功 / Tavily 失败→Brave / 双失败 / DDG 兜底）
  - 真实联网：sandbox 拦外网,失败提示 `建议加 TAVILY_API_KEY`(用户可见)
  - 同步更新：`.env.example` 加 `TAVILY_API_KEY` / `BRAVE_API_KEY` 模板;UI example card 描述加"需 TAVILY/BRAVE key,否则走 DDG 兜底"
  - **获 Tavily key**: https://tavily.com/  注册免绑卡,免费 1000/月
  - **获 Brave key**:  https://brave.com/search/api  免绑卡,免费 2000/月
