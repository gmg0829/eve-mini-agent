import { defineTool } from "eve/tools";

export default defineTool({
  description:
    "Get the current time in a given IANA timezone (e.g. Asia/Shanghai, UTC, America/New_York). Defaults to the system timezone.",
  inputSchema: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA timezone id. Omit to use the system default.",
      },
    },
  },
  async execute({ timezone }: { timezone?: string }) {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const now = new Date();
      const fmt = new Intl.DateTimeFormat("zh-CN", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        weekday: "long",
      });
      const parts = fmt.formatToParts(now).reduce<Record<string, string>>(
        (acc, p) => {
          acc[p.type] = p.value;
          return acc;
        },
        {},
      );
      return {
        timezone: tz,
        iso: now.toISOString(),
        local: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.weekday}`,
        utcOffsetMin: -now.getTimezoneOffset(),
      };
    } catch (e: any) {
      return { timezone: tz, error: e?.message ?? String(e) };
    }
  },
});
