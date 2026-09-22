import MarketChart from "./MarketChart.jsx";
import React, { useState, useEffect, useRef } from "react";
import { api, money, date } from "../../frontend/src/api.js";
const tabs = ["Overview", "Orders", "Holdings", "Positions", "Funds", "Apps"];
const routes = [
  "/dashboard",
  "/dashboard/orders",
  "/dashboard/holdings",
  "/dashboard/positions",
  "/dashboard/funds",
  "/dashboard/apps",
];
const pct = (value, base) =>
  base ? `${((value / base) * 100).toFixed(2)}%` : "0.00%";

export default function Dashboard({ user, path, go, link, onLogout }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [trade, setTrade] = useState(null),
    [notice, setNotice] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try {
      setData(await api("/portfolio"));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 65000);
    return () => clearInterval(timer);
  }, []);
  const holdings = data?.holdings || [],
    investment = holdings.reduce((s, h) => s + h.avg * h.qty, 0),
    value = holdings.reduce((s, h) => s + h.price * h.qty, 0),
    profit = value - investment;
  const active = routes.indexOf(path);
  async function logout() {
    try {
      await onLogout();
    } catch (e) {
      setError(e.message);
    }
  }
  async function completed(message) {
    setNotice(message);
    setTrade(null);
    await refresh();
  }
  const tradeButton = (stock, side) => (
    <button
      className={`trade-button ${side.toLowerCase()}`}
      onClick={() => setTrade({ ...stock, side })}
    >
      {side === "BUY" ? "Buy" : "Sell"}
    </button>
  );
  const totals = (
    <div className="metrics">
      <Metric label="Available cash" value={money(data?.cash)} />
      <Metric label="Current holdings value" value={money(value)} />
      <Metric label="Total invested" value={money(investment)} />
      <Metric
        label="Unrealized P&L"
        value={money(profit)}
        detail={pct(profit, investment)}
        tone={profit >= 0 ? "positive" : "negative"}
      />
    </div>
  );
  let content;
  if (!data)
    content = (
      <div className="empty">
        {error ? "Portfolio could not be loaded." : "Loading portfolio…"}
        <button className="button secondary" onClick={refresh}>
          Retry
        </button>
      </div>
    );
  else if (active === 0)
    content = (
      <>
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h1>Hi, {user.name.split(" ")[0]}.</h1>
            <p className="muted">A clear view of your practice portfolio.</p>
          </div>
          <button
            className="button secondary"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
        {totals}
        <MarketChart
          quotes={data.quotes}
          onQuoteTick={(tick) =>
            setData((current) =>
              current
                ? {
                    ...current,
                    quotes: current.quotes.map((q) =>
                      q.name === tick.symbol
                        ? {
                            ...q,
                            price: tick.price,
                            source: "stream",
                            live: true,
                            isMarketOpen: true,
                            timestamp: new Date(
                              tick.timestamp * 1000,
                            ).toISOString(),
                          }
                        : q,
                    ),
                    holdings: current.holdings.map((h) =>
                      h.name === tick.symbol ? { ...h, price: tick.price } : h,
                    ),
                  }
                : current,
            )
          }
          onTrade={(stock, side) => setTrade({ ...stock, side })}
        />
        <div className="overview-grid">
          <section className="card">
            <h3>Portfolio allocation</h3>
            <p className="small">By current holding value</p>
            <Allocation holdings={holdings} total={value} />
          </section>
          <section className="card">
            <div className="panel-heading">
              <h3>Recent orders</h3>
              {link("/dashboard/orders", "View all →")}
            </div>
            {data.orders.length ? (
              <div className="recent-orders">
                {data.orders.slice(0, 5).map((o) => (
                  <div key={o.id}>
                    <span className={`side ${o.side.toLowerCase()}`}>
                      {o.side}
                    </span>
                    <div>
                      <strong>{o.name}</strong>
                      <small>
                        {o.qty} shares · {date(o.createdAt)}
                      </small>
                    </div>
                    <b>{money(o.total)}</b>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                <span className="empty-icon">↗</span>
                <h3>Your first trade starts here</h3>
                <p>Choose an instrument from the watchlist and select Buy.</p>
              </div>
            )}
          </section>
        </div>
        <section className="learn-strip">
          <div>
            <strong>A practice space, built for you.</strong>
            <p>
              Orders fill at the latest server quote. Your activity is saved
              automatically.
            </p>
          </div>
          {link("/support", "Learn how it works →")}
        </section>
      </>
    );
  else if (active === 1)
    content = (
      <>
        <PageTitle
          title="Orders"
          subtitle="Your complete simulated trade history."
        />
        <Orders orders={data.orders} />
      </>
    );
  else if (active === 2)
    content = (
      <>
        <PageTitle
          title={`Holdings (${holdings.length})`}
          subtitle="All shares you own in this practice account."
        />
        {totals}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Instrument",
                  "Qty.",
                  "Avg. cost",
                  "Market price",
                  "Current value",
                  "P&L",
                  "Actions",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.name}>
                  <td>
                    <strong>{h.name}</strong>
                  </td>
                  <td>{h.qty}</td>
                  <td>{money(h.avg)}</td>
                  <td>{money(h.price)}</td>
                  <td>{money(h.qty * h.price)}</td>
                  <td className={h.price >= h.avg ? "positive" : "negative"}>
                    {money((h.price - h.avg) * h.qty)}
                  </td>
                  <td>
                    <div className="inline-actions">
                      {tradeButton(h, "BUY")}
                      {tradeButton(h, "SELL")}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!holdings.length && (
            <div className="empty">
              No holdings yet. Buy an instrument to begin.
            </div>
          )}
        </div>
      </>
    );
  else if (active === 3) {
    const today = new Date().toISOString().slice(0, 10),
      map = new Map();
    data.orders
      .filter((o) => o.createdAt.startsWith(today))
      .forEach((o) => {
        const p = map.get(o.name) || {
          name: o.name,
          bought: 0,
          sold: 0,
          net: 0,
        };
        p[o.side === "BUY" ? "bought" : "sold"] += o.qty;
        p.net += o.side === "BUY" ? o.qty : -o.qty;
        map.set(o.name, p);
      });
    content = (
      <>
        <PageTitle
          title="Positions"
          subtitle="Today’s trading activity (UTC). Net quantity is buys minus sells, not your total ownership."
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Bought</th>
                <th>Sold</th>
                <th>Net quantity</th>
              </tr>
            </thead>
            <tbody>
              {[...map.values()].map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.bought}</td>
                  <td>{p.sold}</td>
                  <td>{p.net}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!map.size && (
            <div className="empty">
              No trades today. Your existing shares are in Holdings.
            </div>
          )}
        </div>
      </>
    );
  } else if (active === 4)
    content = <Funds data={data} completed={completed} />;
  else if (active === 5)
    content = (
      <>
        <PageTitle
          title="Apps & resources"
          subtitle="Everything in your practice workspace."
        />
        <div className="three-grid">
          {[
            [
              "Portfolio",
              "Understand your holdings and unrealized returns.",
              "/dashboard/holdings",
            ],
            [
              "Trade history",
              "Review executed orders and export your record.",
              "/dashboard/orders",
            ],
            [
              "Help centre",
              "Find answers or save local project feedback.",
              "/support",
            ],
          ].map(([t, d, to]) => (
            <article className="card" key={t}>
              <h3>{t}</h3>
              <p>{d}</p>
              {link(to, "Open →")}
            </article>
          ))}
        </div>
      </>
    );
  else
    content = (
      <>
        <PageTitle
          title="Page not found"
          subtitle="This dashboard page does not exist."
        />
        {link("/dashboard", "Back to overview", "button")}
      </>
    );
  return (
    <div className="workspace">
      <div className="simulation-bar">
        PAPER TRADING{" "}
        <span>
          Virtual money · Market quotes when configured · No real orders
        </span>
      </div>
      <header className="trading-header">
        {link("/", "◩ TradeNet", "brand")}
        <nav aria-label="Dashboard navigation">
          {tabs.map((t, i) => (
            <React.Fragment key={t}>
              {link(routes[i], t, active === i ? "active" : "")}
            </React.Fragment>
          ))}
        </nav>
        <div className="account">
          <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
          <span>{user.name}</span>
          <button onClick={logout}>Log out</button>
        </div>
      </header>
      <div className="trading-body">
        <aside className="watchlist">
          <div className="watchlist-title">
            <h3>Watchlist</h3>
            <span className="badge">
              {(data?.market?.status || "sample").toUpperCase()}
            </span>
          </div>
          <div className="watch-search">
            <input
              type="search"
              aria-label="Search instruments"
              placeholder="Search instruments…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="watch-items">
            {data?.quotes
              .filter((q) =>
                q.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((q) => (
                <div className="watch-row" key={q.name}>
                  <div className="watch-quote">
                    <strong>{q.name}</strong>
                    <span>{money(q.price)}</span>
                  </div>
                  <div className="watch-actions">
                    <span
                      className={
                        parseFloat(q.day) >= 0 ? "positive" : "negative"
                      }
                    >
                      {q.day}
                    </span>
                    <div>
                      {tradeButton(q, "BUY")}
                      {tradeButton(q, "SELL")}
                    </div>
                  </div>
                </div>
              ))}
            {data &&
              !data.quotes.some((q) =>
                q.name.toLowerCase().includes(search.toLowerCase()),
              ) && <p className="empty">No instruments found.</p>}
          </div>
          <p className="watch-note">
            {data?.market?.status === "closed"
              ? "Market closed · latest available provider quotes."
              : data?.market?.status === "delayed"
                ? "Delayed or cached quotes. Fresh quotes are required for paper orders."
                : data?.market?.status === "live"
                  ? `Twelve Data quotes · refreshed about every ${Math.round((data.market.refreshMs || 65000) / 1000)} seconds.`
                  : data?.market?.status === "partial"
                    ? "Some symbols are live; unavailable symbols use cached or sample prices."
                    : data?.market?.configured
                      ? "Live provider unavailable right now; using cached/sample prices."
                      : "Add TWELVE_DATA_API_KEY to .env for live/current quotes. Using sample prices now."}
          </p>
        </aside>
        <main className="dashboard-content">
          {error && (
            <div className="error" role="alert">
              {error} <button onClick={refresh}>Retry</button>
            </div>
          )}
          {notice && (
            <div className="success" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {content}
        </main>
      </div>
      {trade && (
        <OrderModal
          stock={trade}
          cash={data.cash}
          owned={holdings.find((h) => h.name === trade.name)?.qty || 0}
          close={() => setTrade(null)}
          completed={completed}
        />
      )}
    </div>
  );
}
function Metric({ label, value, detail, tone = "" }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
      {detail && <small className={tone}>{detail}</small>}
    </article>
  );
}
function PageTitle({ title, subtitle }) {
  return (
    <div className="dashboard-heading">
      <div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
    </div>
  );
}
function Allocation({ holdings, total }) {
  const sorted = [...holdings].sort(
      (a, b) => b.price * b.qty - a.price * a.qty,
    ),
    colors = ["#387ed1", "#62b0a0", "#edb667", "#9294d0", "#81bad8"];
  let accumulated = 0;
  const segments = sorted.map((h, i) => {
    const start = accumulated;
    accumulated += ((h.price * h.qty) / total) * 100;
    return `${colors[i % 5]} ${start}% ${accumulated}%`;
  });
  return total ? (
    <div className="allocation">
      <div
        className="donut"
        role="img"
        aria-label={`Holdings allocation across ${holdings.length} instruments`}
        style={{ background: `conic-gradient(${segments.join(",")})` }}
      >
        <div>
          <strong>{holdings.length}</strong>
          <span>instruments</span>
        </div>
      </div>
      <div className="legend">
        {sorted.slice(0, 5).map((h, i) => (
          <div key={h.name}>
            <i style={{ background: colors[i] }} />
            <span>{h.name}</span>
            <b>{pct(h.price * h.qty, total)}</b>
          </div>
        ))}
        {sorted.length > 5 && (
          <small className="muted">
            + {sorted.length - 5} more in Holdings
          </small>
        )}
      </div>
    </div>
  ) : (
    <p>No holdings to display.</p>
  );
}
function Orders({ orders }) {
  const [filter, setFilter] = useState("ALL");
  const visible = orders.filter((o) => filter === "ALL" || o.side === filter);
  function download() {
    const rows = [
      ["Date", "Symbol", "Side", "Quantity", "Price", "Total", "Status"],
      ...visible.map((o) => [
        o.createdAt,
        o.name,
        o.side,
        o.qty,
        o.price,
        o.total,
        o.status,
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\r\n")], {
        type: "text/csv",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "paper-trading-orders.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="toolbar">
        <label>
          Show{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">All orders</option>
            <option>BUY</option>
            <option>SELL</option>
          </select>
        </label>
        <button
          className="button secondary"
          disabled={!visible.length}
          onClick={download}
        >
          Export CSV
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Time",
                "Type",
                "Instrument",
                "Quantity",
                "Price",
                "Total",
                "Status",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => (
              <tr key={o.id}>
                <td>{date(o.createdAt)}</td>
                <td>
                  <span className={`side ${o.side.toLowerCase()}`}>
                    {o.side}
                  </span>
                </td>
                <td>{o.name}</td>
                <td>{o.qty}</td>
                <td>{money(o.price)}</td>
                <td>{money(o.total)}</td>
                <td>
                  <span className="status">Complete</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty">
            No orders to show. Use the watchlist to place a trade.
          </div>
        )}
      </div>
    </>
  );
}
function OrderModal({ stock, cash, owned, close, completed }) {
  const [qty, setQty] = useState("1"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef(crypto.randomUUID()),
    dialog = useRef(null);
  const total = Number(qty) * stock.price;
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => previous?.focus();
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/orders", {
        name: stock.name,
        side: stock.side,
        qty: Number(qty),
        requestId: request.current,
      });
      await completed(
        `${stock.side === "BUY" ? "Bought" : "Sold"} ${qty} ${stock.name} at ${money(result.order.price)} per share (${result.order.quoteSource || "sample"} quote).`,
      );
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="order-modal"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      aria-labelledby="order-title"
    >
      <div className={`modal-top ${stock.side.toLowerCase()}`}>
        <div>
          <span className="small">SIMULATED MARKET ORDER</span>
          <h2 id="order-title">
            {stock.side === "BUY" ? "Buy" : "Sell"} {stock.name}
          </h2>
        </div>
        <button aria-label="Close order" disabled={busy} onClick={close}>
          ×
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="order-meta">
          <span>Latest execution quote</span>
          <strong>{money(stock.price)}</strong>
        </div>
        <label>
          Quantity
          <input
            autoFocus
            type="number"
            min="1"
            max="100000"
            step="1"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              request.current = crypto.randomUUID();
            }}
            required
            disabled={busy}
          />
        </label>
        <p className="small">
          Owned: {owned} shares · Cash: {money(cash)}
        </p>
        <div className="order-total">
          <span>Order total</span>
          <strong>{money(total)}</strong>
        </div>
        <p className="small">
          Executes immediately at the latest quote returned by the server. No
          brokerage or taxes in this simulation.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Placing order…" : `Confirm ${stock.side.toLowerCase()}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
function Funds({ data, completed }) {
  const [type, setType] = useState("DEPOSIT"),
    [amount, setAmount] = useState("10000"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    request = useRef(crypto.randomUUID());
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/funds", {
        type,
        amount: Number(amount),
        requestId: request.current,
      });
      request.current = crypto.randomUUID();
      await completed(
        type === "DEPOSIT"
          ? "Virtual funds added."
          : "Virtual funds withdrawn.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Funds"
        subtitle="Manage your virtual balance. No real payments or bank transfers."
      />
      <div className="funds-grid">
        <div className="card balance">
          <span>Available virtual cash</span>
          <h2>{money(data.cash)}</h2>
          <p>Use this balance for simulated purchases.</p>
        </div>
        <form className="card" onSubmit={submit}>
          <h3>Transfer virtual funds</h3>
          <label>
            Action
            <select
              disabled={busy}
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                request.current = crypto.randomUUID();
              }}
            >
              <option value="DEPOSIT">Add virtual funds</option>
              <option value="WITHDRAW">Withdraw virtual funds</option>
            </select>
          </label>
          <label>
            Amount (USD)
            <input
              type="number"
              min="1"
              max="1000000"
              step="0.01"
              required
              disabled={busy}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                request.current = crypto.randomUUID();
              }}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy
              ? "Processing…"
              : type === "DEPOSIT"
                ? "Add virtual funds"
                : "Withdraw virtual funds"}
          </button>
        </form>
      </div>
      <h3>Transfer history</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((t) => (
              <tr key={t.id}>
                <td>{date(t.createdAt)}</td>
                <td>{t.type}</td>
                <td>{money(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.transactions.length && (
          <div className="empty">
            No transfers yet. Your starting balance was $100,000.
          </div>
        )}
      </div>
    </>
  );
}
