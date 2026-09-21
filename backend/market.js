const round = (value) => Math.round(Number(value) * 100) / 100;

function normalizeDay(value, fallback = "0.00%") {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function createMarketService({
  fallbackQuotes = [],
  apiKey = process.env.TWELVE_DATA_API_KEY || "",
  ttlMs = Number(process.env.MARKET_CACHE_MS || 65000),
  fetchImpl = globalThis.fetch,
} = {}) {
  const fallback = new Map(
    fallbackQuotes.map((quote) => [quote.name, { ...quote }]),
  );
  const cache = new Map();
  let lastUpdated = null;
  let lastError = null;
  let lastAttempt = 0;

  const sample = (symbol) => {
    const quote = fallback.get(symbol);
    if (!quote) return null;
    return {
      ...quote,
      source: "sample",
      live: false,
      timestamp: null,
      isMarketOpen: null,
    };
  };

  async function requestQuotes(symbols) {
    if (!apiKey || !symbols.length) return new Map();

    const url = new URL("https://api.twelvedata.com/quote");
    url.searchParams.set("symbol", symbols.join(","));
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("dp", "2");

    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload?.status === "error" || payload?.code) {
      throw new Error(
        payload?.message || `Market data request failed (${response.status}).`,
      );
    }

    const rows = new Map();
    if (symbols.length === 1 && payload?.symbol) {
      rows.set(symbols[0], payload);
    } else {
      for (const symbol of symbols) {
        const direct = payload?.[symbol] || payload?.[symbol.toUpperCase()];
        if (direct && direct.status !== "error") rows.set(symbol, direct);
      }
      const candidates = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      for (const row of candidates) {
        if (row?.symbol && symbols.includes(row.symbol) && row.status !== "error") {
          rows.set(row.symbol, row);
        }
      }
    }

    const result = new Map();
    for (const symbol of symbols) {
      const row = rows.get(symbol);
      if (!row) continue;
      const price = Number(row.close ?? row.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      const base = fallback.get(symbol) || {};
      result.set(symbol, {
        name: symbol,
        company: row.name || base.company || symbol,
        price: round(price),
        day: normalizeDay(row.percent_change, base.day || "0.00%"),
        source: "live",
        live: true,
        timestamp: row.timestamp
          ? new Date(Number(row.timestamp) * 1000).toISOString()
          : new Date().toISOString(),
        isMarketOpen:
          typeof row.is_market_open === "boolean" ? row.is_market_open : null,
      });
    }
    return result;
  }

  async function getSnapshot(symbols) {
    const unique = [...new Set(symbols)].filter((symbol) => fallback.has(symbol));
    const now = Date.now();
    const stale = apiKey
      ? unique.filter((symbol) => {
          const entry = cache.get(symbol);
          return !entry || now - entry.fetchedAt >= ttlMs;
        })
      : [];

    if (stale.length && now - lastAttempt >= 15000) {
      lastAttempt = now;
      try {
        const fresh = await requestQuotes(stale);
        const fetchedAt = Date.now();
        for (const [symbol, quote] of fresh) {
          cache.set(symbol, { quote, fetchedAt });
        }
        lastUpdated = fresh.size ? new Date(fetchedAt).toISOString() : lastUpdated;
        lastError = fresh.size
          ? null
          : "The market-data provider returned no usable quotes.";
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Market data is unavailable.";
      }
    }

    const quotes = unique
      .map((symbol) => {
        const entry = cache.get(symbol);
        if (!entry) return sample(symbol);
        const expired = Date.now() - entry.fetchedAt >= ttlMs;
        if (expired && lastError) {
          return { ...entry.quote, source: "cached", live: false };
        }
        return entry.quote;
      })
      .filter(Boolean);

    const liveCount = quotes.filter((quote) => quote.live).length;
    const status = !apiKey
      ? "sample"
      : liveCount === unique.length && unique.length
        ? "live"
        : liveCount
          ? "partial"
          : "sample";

    return {
      quotes,
      meta: {
        provider: "Twelve Data",
        configured: Boolean(apiKey),
        status,
        liveCount,
        symbolCount: unique.length,
        lastUpdated,
        refreshMs: ttlMs,
        error: lastError,
      },
    };
  }

  async function getQuote(symbol) {
    const snapshot = await getSnapshot([symbol]);
    return snapshot.quotes[0] || sample(symbol);
  }

  return { getSnapshot, getQuote, configured: Boolean(apiKey) };
}
