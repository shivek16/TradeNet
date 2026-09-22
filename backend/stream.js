export function createPriceStream({
  apiKey = process.env.TWELVE_DATA_API_KEY || "",
  WebSocketImpl = globalThis.WebSocket,
  onTrade = () => {},
} = {}) {
  if (/^(your_api_key_here|YOUR_PRIVATE_KEY_HERE)$/i.test(apiKey)) apiKey = "";
  const listeners = new Set();
  let socket = null,
    heartbeat = null,
    retry = null,
    subscribed = new Set();
  const status = (state, message) =>
    listeners.forEach((l) => l.send("feed", { state, message }));
  function sync() {
    if (socket?.readyState !== 1) return;
    const wanted = new Set([...listeners].map((l) => l.symbol)),
      add = [...wanted].filter((s) => !subscribed.has(s)),
      remove = [...subscribed].filter((s) => !wanted.has(s));
    if (remove.length)
      socket.send(
        JSON.stringify({
          action: "unsubscribe",
          params: { symbols: remove.join(",") },
        }),
      );
    if (add.length)
      socket.send(
        JSON.stringify({
          action: "subscribe",
          params: { symbols: add.join(",") },
        }),
      );
    subscribed = wanted;
  }
  function connect() {
    if (socket || !listeners.size || !apiKey) return;
    status("connecting", "Connecting to the price stream…");
    try {
      socket = new WebSocketImpl(
        `wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(apiKey)}`,
      );
    } catch {
      schedule();
      return;
    }
    const connection = socket;
    socket.addEventListener("open", () => {
      if (socket !== connection) return;
      sync();
      status("waiting", "Connected; waiting for market ticks.");
      heartbeat = setInterval(() => {
        if (socket?.readyState === 1)
          socket.send(JSON.stringify({ action: "heartbeat" }));
      }, 10000);
    });
    socket.addEventListener("message", (event) => {
      if (socket !== connection) return;
      let data;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (data.event === "price") {
        const tick = {
          symbol: data.symbol,
          price: Number(data.price),
          timestamp: Number(data.timestamp),
        };
        if (
          !Number.isFinite(tick.price) ||
          tick.price <= 0 ||
          !Number.isFinite(tick.timestamp) ||
          tick.timestamp <= 0
        )
          return;
        onTrade(tick);
        listeners.forEach((l) => {
          if (l.symbol === tick.symbol) l.send("tick", tick);
        });
      } else if (data.event === "subscribe-status") {
        for (const l of listeners)
          if (
            data.status === "error" ||
            (data.fails || []).some((f) => (f.symbol || f) === l.symbol)
          )
            l.send("feed", {
              state: "unavailable",
              message:
                "Streaming unavailable for this symbol or plan. Periodic chart updates remain enabled.",
            });
      } else if (data.event === "error" || data.status === "error")
        status(
          "unavailable",
          "Provider rejected streaming. Periodic chart updates remain enabled.",
        );
    });
    socket.addEventListener("error", () => {
      if (socket === connection)
        status(
          "reconnecting",
          "Stream disconnected; periodic chart updates remain enabled.",
        );
    });
    socket.addEventListener("close", () => {
      if (socket !== connection) return;
      socket = null;
      subscribed.clear();
      clearInterval(heartbeat);
      schedule();
    });
  }
  function schedule() {
    if (!listeners.size) return;
    status("reconnecting", "Reconnecting to streaming data…");
    clearTimeout(retry);
    retry = setTimeout(connect, 10000);
  }
  function stop() {
    clearTimeout(retry);
    clearInterval(heartbeat);
    const old = socket;
    socket = null;
    subscribed.clear();
    old?.close();
  }
  function subscribe(symbol, send) {
    const listener = { symbol, send };
    listeners.add(listener);
    send("feed", {
      state: apiKey ? "connecting" : "unconfigured",
      message: apiKey
        ? "Connecting to market data…"
        : "Configure a Twelve Data API key to enable charts and streaming.",
    });
    if (apiKey) {
      connect();
      sync();
    }
    return () => {
      listeners.delete(listener);
      if (!listeners.size) stop();
      else sync();
    };
  }
  return {
    subscribe,
    close: () => {
      listeners.clear();
      stop();
    },
  };
}
