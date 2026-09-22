export function createMarketService({
  fallbackQuotes = [],
  apiKey = process.env.TWELVE_DATA_API_KEY || "",
  ttlMs = Number(process.env.MARKET_CACHE_MS || 65000),
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  if (/^(your_api_key_here|YOUR_PRIVATE_KEY_HERE)$/i.test(apiKey)) apiKey = "";
  ttlMs = Math.max(15000, Number.isFinite(ttlMs) ? ttlMs : 65000);
  const fallback = new Map(fallbackQuotes.map((q) => [q.name, q])),
    cache = new Map(),
    attempts = new Map();
  let pending = null,
    lastUpdated = null,
    lastError = null;
  const sample = (s) => ({
    ...fallback.get(s),
    source: "sample",
    live: false,
    timestamp: null,
    isMarketOpen: null,
  });
  function classify(entry) {
    const age = now() - Date.parse(entry.quote.timestamp),
      expired = now() - entry.fetchedAt >= ttlMs;
    const live =
      !expired &&
      age >= -30000 &&
      age <= 120000 &&
      entry.quote.isMarketOpen !== false;
    return {
      ...entry.quote,
      live,
      source: expired
        ? "cached"
        : entry.quote.isMarketOpen === false
          ? "closed"
          : live
            ? entry.quote.source
            : "delayed",
    };
  }
  async function request(symbols) {
    symbols.forEach((s) => attempts.set(s, now()));
    try {
      const url = new URL("https://api.twelvedata.com/quote");
      url.search = new URLSearchParams({
        symbol: symbols.join(","),
        apikey: apiKey,
        dp: "2",
      });
      const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(8000),
        }),
        payload = await response.json();
      if (!response.ok || payload.status === "error" || payload.code)
        throw Error();
      let count = 0;
      for (const symbol of symbols) {
        const row =
            symbols.length === 1 && payload.symbol ? payload : payload[symbol],
          price = Number(row?.close ?? row?.price);
        if (!row || !Number.isFinite(price) || price <= 0) continue;
        const stamp = Number(row.timestamp) * 1000,
          change = Number(row.percent_change);
        cache.set(symbol, {
          fetchedAt: now(),
          quote: {
            ...fallback.get(symbol),
            name: symbol,
            company: row.name || fallback.get(symbol)?.company || symbol,
            price: Math.round(price * 100) / 100,
            day: Number.isFinite(change)
              ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`
              : "—",
            timestamp:
              Number.isFinite(stamp) && stamp > 0
                ? new Date(stamp).toISOString()
                : null,
            source: "provider",
            isMarketOpen:
              typeof row.is_market_open === "boolean"
                ? row.is_market_open
                : null,
          },
        });
        count++;
      }
      lastUpdated = count ? new Date(now()).toISOString() : lastUpdated;
      lastError =
        count === symbols.length
          ? null
          : "Some quotes are unavailable; older quotes are labeled separately.";
    } catch {
      lastError =
        "Quotes unavailable. Check your API key, plan and remaining request allowance.";
    }
  }
  async function getSnapshot(symbols) {
    const unique = [...new Set(symbols)].filter((s) => fallback.has(s));
    if (apiKey) {
      while (pending) await pending;
      const stale = unique.filter(
        (s) =>
          (!cache.has(s) || now() - cache.get(s).fetchedAt >= ttlMs) &&
          (!attempts.has(s) || now() - attempts.get(s) >= 15000),
      );
      if (stale.length) {
        pending = request(stale);
        try {
          await pending;
        } finally {
          pending = null;
        }
      }
    }
    const quotes = unique.map((s) =>
        cache.has(s) ? classify(cache.get(s)) : sample(s),
      ),
      liveCount = quotes.filter((q) => q.live).length;
    return {
      quotes,
      meta: {
        provider: "Twelve Data",
        configured: !!apiKey,
        status: !apiKey
          ? "sample"
          : liveCount === unique.length && unique.length
            ? "live"
            : liveCount
              ? "partial"
              : quotes.some((q) => q.source === "closed")
                ? "closed"
                : quotes.some((q) => q.source !== "sample")
                  ? "delayed"
                  : "unavailable",
        liveCount,
        symbolCount: unique.length,
        lastUpdated,
        refreshMs: ttlMs,
        error: lastError,
      },
    };
  }
  function ingestTrade(tick) {
    if (
      !fallback.has(tick.symbol) ||
      !Number.isFinite(tick.price) ||
      tick.price <= 0 ||
      !Number.isFinite(tick.timestamp)
    )
      return;
    const timestamp = tick.timestamp * 1000;
    if (timestamp > now() + 30000 || now() - timestamp > 120000) return;
    const old = cache.get(tick.symbol);
    if (old && Date.parse(old.quote.timestamp) > timestamp) return;
    cache.set(tick.symbol, {
      fetchedAt: now(),
      quote: {
        ...fallback.get(tick.symbol),
        ...old?.quote,
        name: tick.symbol,
        price: Math.round(tick.price * 100) / 100,
        timestamp: new Date(timestamp).toISOString(),
        source: "stream",
        isMarketOpen: true,
      },
    });
  }
  return {
    getSnapshot,
    getQuote: async (symbol) => (await getSnapshot([symbol])).quotes[0] || null,
    ingestTrade,
    configured: !!apiKey,
  };
}
