import { test } from "node:test";
import assert from "node:assert/strict";
import { createMarketService } from "../backend/market.js";
import { createChartService } from "../backend/charts.js";
import { createPriceStream } from "../backend/stream.js";
import { applyTick } from "../dashboard/src/candles.js";
import { createApp } from "../backend/server.js";
const fallbackQuotes = [
  { name: "AAPL", price: 190 },
  { name: "MSFT", price: 420 },
];
const response = (payload) => ({ ok: true, json: async () => payload });
test("concurrent order waits for pending provider quote instead of filling at sample", async () => {
  let resolve,
    calls = 0;
  const service = createMarketService({
    fallbackQuotes,
    apiKey: "test",
    now: () => 1000000,
    fetchImpl: () => {
      calls++;
      return new Promise((r) => (resolve = r));
    },
  });
  const first = service.getSnapshot(["AAPL", "MSFT"]);
  const order = service.getQuote("AAPL");
  resolve(
    response({
      AAPL: { close: "250", timestamp: 1000 },
      MSFT: { close: "500", timestamp: 1000 },
    }),
  );
  await first;
  assert.equal((await order).price, 250);
  assert.equal(calls, 1);
});
test("partial refresh downgrades expired symbols independently", async () => {
  let now = 1000000,
    count = 0;
  const service = createMarketService({
    fallbackQuotes,
    apiKey: "test",
    now: () => now,
    fetchImpl: async () =>
      response(
        ++count === 1
          ? {
              AAPL: { close: "250", timestamp: 1000 },
              MSFT: { close: "500", timestamp: 1000 },
            }
          : { AAPL: { close: "251", timestamp: 1070 } },
      ),
  });
  await service.getSnapshot(["AAPL", "MSFT"]);
  now += 70000;
  const result = await service.getSnapshot(["AAPL", "MSFT"]);
  assert.equal(result.meta.status, "partial");
  assert.equal(result.quotes[1].source, "cached");
  assert.equal(result.quotes[1].live, false);
});
test("delayed and closed quotes are not marked live", async () => {
  const service = createMarketService({
    fallbackQuotes,
    apiKey: "test",
    now: () => 1000000,
    fetchImpl: async () =>
      response({
        AAPL: { close: "250", timestamp: 500 },
        MSFT: { close: "500", timestamp: 1000, is_market_open: false },
      }),
  });
  const { quotes } = await service.getSnapshot(["AAPL", "MSFT"]);
  assert.equal(quotes[0].source, "delayed");
  assert.equal(quotes[1].source, "closed");
  assert.ok(quotes.every((q) => !q.live));
});
test("history is sorted, validated, cached and concurrent calls share a request", async () => {
  let calls = 0;
  const service = createChartService({
    apiKey: "test",
    fetchImpl: async () => {
      calls++;
      return response({
        values: [
          {
            datetime: "2026-09-21 14:01:00",
            open: "11",
            high: "13",
            low: "10",
            close: "12",
            volume: "80",
          },
          {
            datetime: "2026-09-21 14:00:00",
            open: "10",
            high: "12",
            low: "9",
            close: "11",
            volume: "50",
          },
          { datetime: "bad", open: "0", high: "1", low: "0", close: "0" },
        ],
      });
    },
  });
  const [a, b] = await Promise.all([
    service.history("AAPL", "1min"),
    service.history("AAPL", "1min"),
  ]);
  assert.equal(a.bars.length, 2);
  assert.ok(a.bars[0].time < a.bars[1].time);
  assert.equal(a.bars[1].volume, 80);
  assert.deepEqual(a, b);
  await service.history("AAPL", "1min");
  assert.equal(calls, 1);
});
test("missing key and provider failures do not invent chart candles", async () => {
  assert.deepEqual(
    (await createChartService({ apiKey: "" }).history("AAPL", "1min")).bars,
    [],
  );
  const failed = createChartService({
    apiKey: "test",
    fetchImpl: async () => {
      throw Error("private api key must not be shown");
    },
  });
  const result = await failed.history("AAPL", "1min");
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.bars, []);
  assert.ok(!result.error.includes("private"));
});
test("stream updates latest OHLC, opens new candles and never invents volume", () => {
  const original = [
    { time: 600, open: 100, high: 102, low: 99, close: 101, volume: 50 },
  ];
  const next = applyTick(original, { timestamp: 620, price: 104 }, "1min");
  assert.equal(next[0].high, 104);
  assert.equal(next[0].close, 104);
  assert.equal(next[0].volume, 50);
  assert.equal(original[0].close, 101);
  const newBar = applyTick(next, { timestamp: 660, price: 103 }, "1min");
  assert.equal(newBar.length, 2);
  assert.equal(newBar[1].volume, null);
  assert.deepEqual(
    applyTick(next, { timestamp: 599, price: 500 }, "1min"),
    next,
  );
});
test("upstream stream is shared, routes symbols, unsubscribes, and ignores obsolete socket events", () => {
  const sockets = [];
  class FakeSocket extends EventTarget {
    readyState = 0;
    sent = [];
    constructor() {
      super();
      sockets.push(this);
    }
    send(text) {
      this.sent.push(JSON.parse(text));
    }
    close() {
      this.readyState = 3;
    }
    open() {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    }
    message(value) {
      this.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify(value) }),
      );
    }
  }
  const stream = createPriceStream({
      apiKey: "test",
      WebSocketImpl: FakeSocket,
    }),
    a = [],
    b = [];
  const stopA = stream.subscribe("AAPL", (e, d) => a.push([e, d])),
    stopB = stream.subscribe("MSFT", (e, d) => b.push([e, d]));
  assert.equal(sockets.length, 1);
  sockets[0].open();
  sockets[0].message({
    event: "price",
    symbol: "AAPL",
    price: 200,
    timestamp: 1000,
  });
  assert.equal(a.filter((e) => e[0] === "tick").length, 1);
  assert.equal(b.filter((e) => e[0] === "tick").length, 0);
  stopA();
  assert.equal(sockets[0].sent.at(-1).action, "unsubscribe");
  stopB();
  const stopC = stream.subscribe("AAPL", () => {});
  sockets[1].open();
  sockets[0].dispatchEvent(new Event("close"));
  assert.equal(sockets[1].readyState, 1);
  stopC();
  stream.close();
});
test("chart routes require authentication and stale quotes block new orders", async (t) => {
  const { app, db, closeStreams } = createApp({
    dbPath: ":memory:",
    marketService: {
      configured: true,
      getQuote: async () => ({ name: "AAPL", price: 190, live: false }),
      getSnapshot: async () => ({ quotes: [], meta: {} }),
    },
    chartService: { history: async () => ({ bars: [], status: "provider" }) },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    closeStreams();
    await new Promise((r) => server.close(r));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (await fetch(base + "/api/market/history?symbol=AAPL")).status,
    401,
  );
  const demo = await fetch(base + "/api/auth/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    cookie = demo.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (
      await fetch(base + "/api/market/history?symbol=AAPL&interval=1min", {
        headers: { cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/api/market/history?symbol=UNKNOWN&interval=bad", {
        headers: { cookie },
      })
    ).status,
    400,
  );
  const order = await fetch(base + "/api/orders", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "AAPL",
      qty: 1,
      side: "BUY",
      requestId: "stale-quote-order",
    }),
  });
  assert.equal(order.status, 503);
  assert.equal(
    JSON.parse(db.prepare("SELECT state FROM users").get().state).cash,
    100000,
  );
});
