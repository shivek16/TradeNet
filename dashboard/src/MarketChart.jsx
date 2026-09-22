import React, { useEffect, useRef, useState } from "react";
import { api, money } from "../../frontend/src/api.js";
import { applyTick, SECONDS } from "./candles.js";

const stamp = (t, daily = false) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: daily ? "UTC" : "America/New_York",
    month: "short",
    day: "numeric",
    ...(daily ? {} : { hour: "2-digit", minute: "2-digit" }),
  }).format(new Date(t * 1000));
export default function MarketChart({ quotes, onTrade, onQuoteTick }) {
  const [symbol, setSymbol] = useState(quotes[0]?.name || "AAPL"),
    [interval, setIntervalValue] = useState("1min");
  const selected = quotes.find((q) => q.name === symbol) || quotes[0];
  return (
    <section className="market-chart card" aria-label="Market chart">
      <div className="chart-heading">
        <div>
          <span className="eyebrow">MARKET EXPLORER</span>
          <h2>Price action</h2>
        </div>
        <label className="symbol-select">
          Stock
          <select
            value={selected?.name}
            onChange={(e) => setSymbol(e.target.value)}
          >
            {quotes.map((q) => (
              <option key={q.name} value={q.name}>
                {q.name} · {q.company || q.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="chart-toolbar">
        <div className="timeframes" aria-label="Chart timeframe">
          {Object.keys(SECONDS).map((i) => (
            <button
              key={i}
              aria-pressed={interval === i}
              onClick={() => setIntervalValue(i)}
            >
              {i === "1day" ? "1D" : i === "1h" ? "1H" : i.replace("min", "m")}
            </button>
          ))}
        </div>
        <div className="inline-actions">
          <button
            className="trade-button buy"
            onClick={() => onTrade(selected, "BUY")}
          >
            Buy {selected?.name}
          </button>
          <button
            className="trade-button sell"
            onClick={() => onTrade(selected, "SELL")}
          >
            Sell {selected?.name}
          </button>
        </div>
      </div>
      {selected && (
        <ChartPanel
          key={`${selected.name}:${interval}`}
          symbol={selected.name}
          interval={interval}
          marketOpen={selected.isMarketOpen}
          onQuoteTick={onQuoteTick}
        />
      )}
    </section>
  );
}
export function ChartPanel({ symbol, interval, marketOpen, onQuoteTick }) {
  const callback = useRef(onQuoteTick);
  callback.current = onQuoteTick;
  const [bars, setBars] = useState([]),
    [info, setInfo] = useState(null),
    [feed, setFeed] = useState({ state: "connecting", message: "Connecting…" }),
    [tickAt, setTickAt] = useState(0),
    [clock, setClock] = useState(Date.now()),
    [busy, setBusy] = useState(true),
    [hover, setHover] = useState(null),
    [count, setCount] = useState(60),
    [offset, setOffset] = useState(0);
  const latest = useRef(null),
    reload = useRef(() => {});
  useEffect(() => {
    let active = true,
      loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      setBusy(true);
      try {
        const result = await api(
          `/market/history?symbol=${encodeURIComponent(symbol)}&interval=${interval}`,
        );
        if (!active) return;
        setInfo(result);
        setBars((current) => {
          let next = result.bars.length ? result.bars : current;
          if (latest.current) next = applyTick(next, latest.current, interval);
          return next;
        });
      } catch (e) {
        if (active) setInfo({ status: "unavailable", error: e.message });
      } finally {
        loading = false;
        if (active) setBusy(false);
      }
    }
    reload.current = load;
    load();
    const timer = setInterval(load, 65000),
      clockTimer = setInterval(() => setClock(Date.now()), 5000);
    const events = new EventSource(
      `/api/market/stream?symbol=${encodeURIComponent(symbol)}`,
    );
    events.addEventListener("feed", (event) => {
      if (active) setFeed(JSON.parse(event.data));
    });
    events.addEventListener("tick", (event) => {
      const tick = JSON.parse(event.data),
        now = Date.now();
      if (
        tick.symbol !== symbol ||
        tick.timestamp * 1000 > now + 30000 ||
        now - tick.timestamp * 1000 > 120000 ||
        latest.current?.timestamp > tick.timestamp
      )
        return;
      latest.current = tick;
      if (active) {
        callback.current?.(tick);
        setTickAt(tick.timestamp * 1000);
        setClock(now);
        setFeed({
          state: "streaming",
          message: "Receiving provider price ticks.",
        });
        setBars((current) => applyTick(current, tick, interval));
      }
    });
    events.onerror = () => {
      if (active)
        setFeed({
          state: "reconnecting",
          message:
            "Stream unavailable; retrying. Periodic history updates remain enabled.",
        });
    };
    return () => {
      active = false;
      clearInterval(timer);
      clearInterval(clockTimer);
      events.close();
    };
  }, [symbol, interval]);
  const maxOffset = Math.max(0, bars.length - count),
    safeOffset = Math.min(offset, maxOffset),
    end = bars.length - safeOffset,
    visible = bars.slice(Math.max(0, end - count), end);
  const selected =
      visible[Math.min(hover ?? visible.length - 1, visible.length - 1)],
    daily = interval === "1day";
  const streamed = feed.state === "streaming" && clock - tickAt < 15000;
  const label =
    marketOpen === false
      ? "MARKET CLOSED"
      : streamed
        ? "STREAMING"
        : info?.status === "cached"
          ? "CACHED"
          : info?.status === "provider"
            ? "PROVIDER DATA"
            : info?.status === "unconfigured"
              ? "SETUP REQUIRED"
              : busy
                ? "LOADING"
                : "AWAITING DATA";
  const x0 = 14,
    x1 = 835,
    y0 = 20,
    y1 = 270,
    v0 = 304,
    v1 = 367,
    step = (x1 - x0) / Math.max(visible.length, 1);
  let low = Math.min(...visible.map((b) => b.low)),
    high = Math.max(...visible.map((b) => b.high));
  const pad = (high - low) * 0.12 || 1;
  low -= pad;
  high += pad;
  const y = (p) => y1 - ((p - low) / (high - low)) * (y1 - y0),
    x = (i) => x0 + (i + 0.5) * step,
    volMax = Math.max(1, ...visible.map((b) => b.volume || 0));
  return (
    <>
      <div className="chart-status">
        <span className={`feed-pill ${streamed ? "connected" : ""}`}>
          {label}
        </span>
        <span>
          {tickAt
            ? `Last tick ${stamp(tickAt / 1000)} ET`
            : info?.fetchedAt
              ? `Fetched ${new Date(info.fetchedAt).toLocaleTimeString("en-US")}`
              : "USD · Twelve Data"}
        </span>
      </div>
      <div className="ohlc" aria-live="off">
        {selected ? (
          <>
            <strong>
              {symbol} {money(selected.close)}
            </strong>
            <span>O {money(selected.open)}</span>
            <span>H {money(selected.high)}</span>
            <span>L {money(selected.low)}</span>
            <span>C {money(selected.close)}</span>
            <span>
              Vol{" "}
              {selected.volume === null
                ? "pending"
                : Number(selected.volume).toLocaleString("en-US")}
            </span>
          </>
        ) : (
          <span>
            {busy
              ? "Loading provider candles…"
              : "No chart data available yet."}
          </span>
        )}
      </div>
      {visible.length ? (
        <>
          <svg
            viewBox="0 0 925 415"
            className="candlestick-svg"
            role="img"
            aria-label={`${symbol} ${interval} candlestick and volume chart, ${visible.length} bars`}
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHover(
                Math.max(
                  0,
                  Math.min(
                    visible.length - 1,
                    Math.floor(
                      (((e.clientX - rect.left) / rect.width) * 925 - x0) /
                        step,
                    ),
                  ),
                ),
              );
            }}
            onPointerLeave={() => setHover(null)}
          >
            <rect width="925" height="415" fill="#fff" />
            {[0, 1, 2, 3, 4].map((i) => {
              const yy = y0 + ((y1 - y0) * i) / 4;
              return (
                <g key={i}>
                  <line x1={x0} x2={x1} y1={yy} y2={yy} stroke="#eaf0f5" />
                  <text x="850" y={yy + 4} fill="#7c8999" fontSize="11">
                    {money(high - ((high - low) * i) / 4)}
                  </text>
                </g>
              );
            })}
            <line x1={x0} x2={x1} y1="291" y2="291" stroke="#eaf0f5" />
            <text x="850" y="320" fill="#7c8999" fontSize="10">
              VOLUME
            </text>
            {visible.map((b, i) => {
              const color = b.close >= b.open ? "#159d82" : "#e15f68",
                height =
                  b.volume === null ? 0 : (b.volume / volMax) * (v1 - v0);
              return (
                <g key={b.time}>
                  <title>
                    {stamp(b.time, daily)}: O {b.open} H {b.high} L {b.low} C{" "}
                    {b.close}; volume {b.volume ?? "pending"}
                  </title>
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={y(b.high)}
                    y2={y(b.low)}
                    stroke={color}
                    strokeWidth="1.3"
                  />
                  <rect
                    x={x(i) - step * 0.31}
                    y={Math.min(y(b.open), y(b.close))}
                    width={Math.max(1, step * 0.62)}
                    height={Math.max(1.4, Math.abs(y(b.open) - y(b.close)))}
                    fill={color}
                  />
                  <rect
                    x={x(i) - step * 0.31}
                    y={v1 - height}
                    width={Math.max(1, step * 0.62)}
                    height={height}
                    fill={color}
                    opacity=".35"
                  />
                </g>
              );
            })}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const i = Math.round((visible.length - 1) * f);
              return (
                <text
                  key={f}
                  x={x(i)}
                  y="392"
                  textAnchor="middle"
                  fontSize="10"
                  fill="#7c8999"
                >
                  {stamp(visible[i].time, daily)}
                </text>
              );
            })}
            {hover !== null && selected && (
              <g>
                <line
                  x1={x(Math.min(hover, visible.length - 1))}
                  x2={x(Math.min(hover, visible.length - 1))}
                  y1={y0}
                  y2={v1}
                  stroke="#8fa3b9"
                  strokeDasharray="4 4"
                />
                <line
                  x1={x0}
                  x2={x1}
                  y1={y(selected.close)}
                  y2={y(selected.close)}
                  stroke="#8fa3b9"
                  strokeDasharray="4 4"
                />
              </g>
            )}
          </svg>
          <div className="chart-navigation">
            <button
              onClick={() => setCount((n) => Math.max(15, n - 15))}
              disabled={count <= 15}
              aria-label="Zoom in chart"
            >
              ＋
            </button>
            <button
              onClick={() => setCount((n) => Math.min(200, n + 15))}
              disabled={count >= 200}
              aria-label="Zoom out chart"
            >
              −
            </button>
            <label>
              History
              <input
                type="range"
                min="0"
                max={maxOffset}
                value={safeOffset}
                onChange={(e) => {
                  setOffset(Number(e.target.value));
                  setHover(null);
                }}
                aria-label="Browse older candles"
              />
            </label>
            <button
              onClick={() => {
                setOffset(0);
                setCount(60);
              }}
            >
              Latest
            </button>
            <span>{daily ? "Trading date" : "Eastern Time"}</span>
          </div>
        </>
      ) : (
        <div className="chart-empty">
          <span>⌁</span>
          <h3>
            {busy ? "Loading market history" : "Connect your market data"}
          </h3>
          <p>
            {info?.error ||
              "Historical candles will appear when the provider responds."}
          </p>
          <p>No invented prices or animated sample candles are shown.</p>
        </div>
      )}
      {info?.error && bars.length > 0 && (
        <p className="error" role="status">
          {info.error}
        </p>
      )}
      <div className="chart-footnote">
        <span>
          {marketOpen === false
            ? visible.length
              ? "The provider reports the market closed. Showing the latest available candles."
              : "The provider reports the market closed."
            : feed.message}{" "}
          {visible.length > 0 &&
            "Streamed candles are provisional. Volume comes from provider history; unknown volume is not fabricated."}
        </span>
        <button
          className="chart-refresh"
          disabled={busy}
          onClick={() => reload.current()}
        >
          {busy ? "Updating…" : "↻ Refresh"}
        </button>
      </div>
    </>
  );
}
