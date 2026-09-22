export const INTERVALS = {
  "1min": 60,
  "5min": 300,
  "15min": 900,
  "1h": 3600,
  "1day": 86400,
};
export function createChartService({
  apiKey = process.env.TWELVE_DATA_API_KEY || "",
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  if (/^(your_api_key_here|YOUR_PRIVATE_KEY_HERE)$/i.test(apiKey)) apiKey = "";
  const cache = new Map(),
    pending = new Map(),
    attempts = new Map();
  async function history(symbol, interval) {
    const key = `${symbol}:${interval}`,
      saved = cache.get(key);
    if (!apiKey)
      return {
        bars: [],
        status: "unconfigured",
        error: "Set your Twelve Data API key in .env to load real chart data.",
        refreshMs: 65000,
      };
    if (saved && now() - saved.fetchedAt < 65000)
      return { ...saved, status: "provider", refreshMs: 65000 };
    if (pending.has(key)) return pending.get(key);
    if (attempts.has(key) && now() - attempts.get(key) < 65000)
      return {
        ...(saved || { bars: [] }),
        status: saved ? "cached" : "unavailable",
        error:
          "Waiting before retrying the provider. Check your data plan or request allowance.",
        refreshMs: 65000,
      };
    attempts.set(key, now());
    const task = (async () => {
      let errorMessage =
        "Chart data unavailable. Check API access for this symbol or interval and your request allowance.";
      try {
        const url = new URL("https://api.twelvedata.com/time_series");
        url.search = new URLSearchParams({
          symbol,
          interval,
          outputsize: "200",
          timezone: "UTC",
          apikey: apiKey,
        });
        const response = await fetchImpl(url, {
            signal: AbortSignal.timeout(10000),
          }),
          payload = await response.json();
        if (response.status === 429 || payload.code === 429)
          errorMessage =
            "Provider request limit reached. Automatic refresh will retry in about one minute. Switching symbols and intervals also uses provider credits.";
        if (
          !response.ok ||
          payload.status === "error" ||
          !Array.isArray(payload.values)
        )
          throw Error();
        const byTime = new Map();
        for (const row of payload.values) {
          if (typeof row.datetime !== "string") continue;
          const time =
            Date.parse(
              row.datetime.replace(" ", "T") +
                (row.datetime.length === 10 ? "T00:00:00Z" : "Z"),
            ) / 1000;
          const [open, high, low, close] = ["open", "high", "low", "close"].map(
            (k) => Number(row[k]),
          );
          const volume = row.volume === undefined ? null : Number(row.volume);
          if (
            !Number.isFinite(time) ||
            ![open, high, low, close].every(
              (n) => Number.isFinite(n) && n > 0,
            ) ||
            high < Math.max(open, close) ||
            low > Math.min(open, close)
          )
            continue;
          byTime.set(time, {
            time,
            open,
            high,
            low,
            close,
            volume: Number.isFinite(volume) && volume >= 0 ? volume : null,
          });
        }
        const bars = [...byTime.values()].sort((a, b) => a.time - b.time);
        if (!bars.length) throw Error();
        const result = {
          bars,
          fetchedAt: now(),
          timezone: "UTC",
          symbol,
          interval,
        };
        cache.set(key, result);
        return { ...result, status: "provider", refreshMs: 65000 };
      } catch {
        return {
          ...(saved || { bars: [] }),
          status: saved ? "cached" : "unavailable",
          error: errorMessage,
          refreshMs: 65000,
        };
      }
    })();
    pending.set(key, task);
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  }
  return { history };
}
