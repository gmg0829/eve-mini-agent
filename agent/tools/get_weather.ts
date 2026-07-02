import { defineTool } from "eve/tools";

export default defineTool({
  description:
    "Get the current weather for a given city. Uses wttr.in (no API key).",
  inputSchema: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "City name, supports Chinese (e.g. 上海, Beijing)",
      },
    },
    required: ["city"],
  },
  async execute({ city }: { city: string }) {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "zh" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { city, error: `wttr.in HTTP ${res.status}` };
    }
    const data: any = await res.json();
    const cur = data?.current_condition?.[0];
    const area = data?.nearest_area?.[0];
    if (!cur) {
      return { city, error: "no data" };
    }
    const resolved = area?.areaName?.[0]?.value
      ? `${area.areaName[0].value}, ${area.country?.[0]?.value ?? ""}`
      : city;
    return {
      city,
      resolved,
      tempC: Number(cur.temp_C),
      feelsLikeC: Number(cur.FeelsLikeC),
      humidity: Number(cur.humidity),
      windKph: Number(cur.windspeedKmph),
      windDir: cur.winddir16Point,
      desc: (cur.weatherDesc?.[0]?.value ?? "").trim(),
      observedAt: cur.localObsDateTime,
    };
  },
});
