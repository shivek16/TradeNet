export const SECONDS = {
  "1min": 60,
  "5min": 300,
  "15min": 900,
  "1h": 3600,
  "1day": 86400,
};
export function applyTick(bars, tick, interval) {
  if (
    !bars.length ||
    !Number.isFinite(tick.price) ||
    tick.price <= 0 ||
    !Number.isFinite(tick.timestamp)
  )
    return bars;
  const last = bars.at(-1),
    step = SECONDS[interval];
  if (!step || tick.timestamp < last.time) return bars;
  let time = last.time + Math.floor((tick.timestamp - last.time) / step) * step;
  if (interval === "1day") {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(tick.timestamp * 1000)),
      get = (k) => parts.find((p) => p.type === k).value;
    time =
      Date.parse(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`) /
      1000;
    if (time < last.time) return bars;
  }
  const next =
    time === last.time
      ? {
          ...last,
          high: Math.max(last.high, tick.price),
          low: Math.min(last.low, tick.price),
          close: tick.price,
          provisional: true,
        }
      : {
          time,
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: null,
          provisional: true,
        };
  return (
    time === last.time ? [...bars.slice(0, -1), next] : [...bars, next]
  ).slice(-300);
}
