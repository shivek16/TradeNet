import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "../../dashboard/src/Dashboard.jsx";
import { api, money } from "./api.js";
import "./styles.css";

function App() {
  const [path, setPath] = useState(location.pathname),
    [user, setUser] = useState(null),
    [loading, setLoading] = useState(true);
  function go(to) {
    history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }
  useEffect(() => {
    const pop = () => setPath(location.pathname);
    const expired = () => {
      setUser(null);
      go("/login");
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("session-expired", expired);
    api("/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  const link = (to, text, cls = "") => (
    <a
      className={cls}
      href={to}
      onClick={(e) => {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          go(to);
        }
      }}
    >
      {text}
    </a>
  );
  if (loading) return <div className="loading">Loading your workspace…</div>;
  const signedIn = (u) => {
    setUser(u);
    go("/dashboard");
  };
  if (path.startsWith("/dashboard") && user)
    return (
      <Dashboard
        user={user}
        path={path}
        go={go}
        link={link}
        onLogout={async () => {
          await api("/auth/logout", {});
          setUser(null);
          go("/");
        }}
      />
    );
  let content;
  if (["/login", "/signup"].includes(path) || path.startsWith("/dashboard"))
    content = (
      <Auth
        key={path}
        signup={path === "/signup"}
        signedIn={signedIn}
        link={link}
      />
    );
  else if (path === "/")
    content = (
      <>
        <section className="hero">
          <span className="eyebrow">YOUR FIRST STEP INTO THE MARKETS</span>
          <h1>Invest in your learning.</h1>
          <p>
            A familiar trading experience. A space to practice.
            <br />
            Build a portfolio with virtual money and understand every move.
          </p>
          <div className="button-row">
            {link(
              user ? "/dashboard" : "/signup",
              user ? "Open dashboard" : "Create a practice account",
              "button",
            )}
            <Demo signedIn={signedIn} />
          </div>
          <p className="small">
            Independent educational project · No real money · Live quotes when configured
          </p>
          <Preview />
        </section>
        <section className="section split">
          <div>
            <span className="eyebrow">LEARN BY DOING</span>
            <h2>
              Your portfolio.
              <br />
              The complete picture.
            </h2>
            <p>
              Follow instruments, place simulated orders, and see how each trade
              changes your holdings and available cash.
            </p>
            {link("/product", "Explore the platform →")}
          </div>
          <div className="feature-grid">
            {[
              [
                "01",
                "Watch the market",
                "Search the US instrument list and inspect current quotes.",
              ],
              [
                "02",
                "Make a trade",
                "Buy and sell shares at the latest server-side quote.",
              ],
              [
                "03",
                "Track your progress",
                "Review holdings, order history and portfolio allocation.",
              ],
              [
                "04",
                "Keep your work",
                "Your account and activity are saved on this computer.",
              ],
            ].map(([n, t, d]) => (
              <article key={n}>
                <span className="feature-number">{n}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="callout">
          <h2>Confidence starts with practice.</h2>
          <p>Start with $100,000 in virtual cash and a US stock portfolio.</p>
          {link("/signup", "Get started", "button")}
        </section>
      </>
    );
  else if (path === "/about")
    content = (
      <section className="section narrow">
        <span className="eyebrow">ABOUT THE PROJECT</span>
        <h1>
          Learning the market,
          <br />
          one trade at a time.
        </h1>
        <p>
          TradeNet is a full-stack paper-trading platform. It
          connects the public website, account flow and trading dashboard in a
          single runnable project.
        </p>
        <h2>Designed for practice</h2>
        <p>
          Every account starts with sample US holdings and $100,000 in virtual
          cash. When a Twelve Data API key is configured, the dashboard refreshes
          current quotes automatically. Orders remain simulated.
        </p>
        <h2>Independent by design</h2>
        <p>
          TradeNet is an independent educational platform. It does
          not open brokerage accounts, handle real payments or submit orders to
          an exchange.
        </p>
        {link("/product", "See what you can do →")}
      </section>
    );
  else if (path === "/product")
    content = (
      <section className="section">
        <div className="page-heading">
          <span className="eyebrow">ONE CONNECTED WORKSPACE</span>
          <h1>Everything you need to practice.</h1>
          <p>From your first watchlist to your complete order history.</p>
        </div>
        <Preview />
        <div className="three-grid">
          {[
            [
              "Trading dashboard",
              "Search instruments, place buy and sell orders, and review today’s net activity.",
            ],
            [
              "Portfolio insights",
              "See investment cost, current value, unrealized profit and loss, and an allocation chart.",
            ],
            [
              "Virtual wallet",
              "Add or withdraw simulated funds and keep a transaction history.",
            ],
          ].map(([t, d]) => (
            <article className="card" key={t}>
              <h3>{t}</h3>
              <p>{d}</p>
              {link("/dashboard", "Open dashboard →")}
            </article>
          ))}
        </div>
      </section>
    );
  else if (path === "/pricing")
    content = (
      <section className="section">
        <div className="page-heading">
          <span className="eyebrow">SIMPLE, SIMULATED, FREE</span>
          <h1>Practice without a price tag.</h1>
          <p>All amounts in this project are virtual.</p>
        </div>
        <div className="three-grid">
          {[
            [
              "$0",
              "Account access",
              "Create a local account and explore the complete dashboard.",
            ],
            [
              "$0",
              "Simulated brokerage",
              "No fees or taxes are charged in this simplified simulation.",
            ],
            [
              "$100,000",
              "Starting virtual cash",
              "Each new account receives a practice balance and sample holdings.",
            ],
          ].map(([n, t, d]) => (
            <article className="card" key={t}>
              <strong className="price-big">{n}</strong>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
        <p className="note">
          These are TradeNet simulation rules, not real-world fees or
          brokerage pricing.
        </p>
        {link("/signup", "Start practicing", "button")}
      </section>
    );
  else if (path === "/support") content = <Support user={user} link={link} />;
  else
    content = (
      <section className="section narrow">
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        {link("/", "Back to home", "button")}
      </section>
    );
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          {link("/", "◩ TradeNet", "brand")}
          <nav aria-label="Main navigation">
            {link("/about", "About")}
            {link("/product", "Products")}
            {link("/pricing", "Pricing")}
            {link("/support", "Support")}
            {link(
              user ? "/dashboard" : "/login",
              user ? "Dashboard" : "Log in",
            )}
            {link("/signup", "Sign up", "nav-cta")}
          </nav>
        </div>
      </header>
      <main>{content}</main>
      <footer>
        <div className="footer-inner">
          <div>
            <span className="brand">
              ◩ TradeNet
            </span>
            <p>An independent paper-trading project.</p>
          </div>
          <div>
            {link("/about", "About")}
            {link("/support", "Help & support")}
            {link("/dashboard", "Trading dashboard")}
          </div>
        </div>
        <p className="small">
          TradeNet is for educational simulation only. Sample
          prices are not live market data.
        </p>
      </footer>
    </>
  );
}
function Demo({ signedIn }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span>
      <button
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            signedIn((await api("/auth/demo", {})).user);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening…" : "Try the demo →"}
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
function Auth({ signup, signedIn, link }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      signedIn(
        (await api(`/auth/${signup ? "register" : "login"}`, values)).user,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-layout section">
      <div>
        <span className="eyebrow">A BETTER WAY TO LEARN</span>
        <h1>
          {signup
            ? "Your investing journey starts here."
            : "Welcome back to your workspace."}
        </h1>
        <p>
          Explore the market with virtual money.
          <br />
          Your portfolio, orders and progress, all in one place.
        </p>
        <div className="auth-stat">
          <strong>$100,000</strong>
          <span>Virtual starting balance</span>
        </div>
      </div>
      <div className="card auth-card">
        <h2>{signup ? "Create an account" : "Log in"}</h2>
        <p className="muted">For this local practice project only.</p>
        <form onSubmit={submit}>
          {signup && (
            <label>
              Your name
              <input name="name" autoComplete="name" maxLength={60} required />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          {signup && <p className="small">Use at least 8 characters.</p>}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="button full" disabled={busy}>
            {busy ? "Please wait…" : signup ? "Create account" : "Log in"}
          </button>
        </form>
        <p>
          {signup ? "Already have an account?" : "New here?"}{" "}
          {link(signup ? "/login" : "/signup", signup ? "Log in" : "Sign up")}
        </p>
        <div className="auth-demo">
          <Demo signedIn={signedIn} />
          <p className="small">
            Demo creates a fresh practice account. Register to sign in again
            later.
          </p>
        </div>
      </div>
    </section>
  );
}
function Preview() {
  return (
    <div className="preview" aria-label="Illustrative trading dashboard">
      <div className="preview-top">
        <b>◩ Practice workspace</b>
        <span className="badge">PAPER TRADING</span>
      </div>
      <div className="preview-body">
        <div className="preview-watch">
          {[
            ["AAPL", "$190.00"],
            ["MSFT", "$420.00"],
            ["NVDA", "$125.00"],
            ["AMZN", "$185.00"],
          ].map(([s, p]) => (
            <div key={s}>
              <b>{s}</b>
              <span>{p}</span>
            </div>
          ))}
        </div>
        <div className="preview-main">
          <span className="muted">Your portfolio, at a glance</span>
          <h2>{money(6700)}</h2>
          <span className="positive">+$306.00 total return</span>
          <div className="bars" aria-hidden="true">
            {[32, 44, 39, 60, 54, 68, 58, 80, 72, 90, 82, 100].map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
          <span className="small">Illustration · Sample data</span>
        </div>
      </div>
    </div>
  );
}
function Support({ user, link }) {
  const [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tickets, setTickets] = useState([]);
  useEffect(() => {
    if (user)
      api("/portfolio")
        .then((d) => setTickets(d.tickets))
        .catch((e) => setError(e.message));
  }, [user]);
  const faqs = [
    [
      "How do I place an order?",
      "Open the dashboard, search an instrument in the watchlist and select Buy or Sell. Orders execute instantly at the latest quote returned by the server.",
    ],
    [
      "Are these live prices?",
      "Live/current quotes are requested from Twelve Data when an API key is configured. Without a key, the app clearly falls back to sample prices.",
    ],
    [
      "How do I add funds?",
      "Open Funds in the dashboard and choose Add virtual funds. No bank account or real payment is involved.",
    ],
    [
      "Where is my account stored?",
      "Account and portfolio data are saved in a local SQLite database on the computer running the server. Register with email and password to return to your account.",
    ],
    [
      "What are positions?",
      "Positions show net quantities bought or sold today in the simulation, using the server’s UTC calendar date. Your complete share ownership appears in Holdings.",
    ],
  ];
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      const d = await api("/tickets", Object.fromEntries(new FormData(form)));
      setTickets((t) => [d.ticket, ...t]);
      form.reset();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section narrow">
      <span className="eyebrow">HELP CENTRE</span>
      <h1>How can we help?</h1>
      <input
        aria-label="Search help"
        placeholder="Search questions…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="faq">
        {faqs
          .filter((f) =>
            f.join(" ").toLowerCase().includes(query.toLowerCase()),
          )
          .map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
      </div>
      <h2>Project feedback</h2>
      <p>
        Save a local support request for your project demonstration. These
        requests stay in your account and are not sent to a support team.
      </p>
      {user ? (
        <>
          <form className="card" onSubmit={submit}>
            <label>
              Subject
              <input name="subject" minLength={3} maxLength={100} required />
            </label>
            <label>
              Message
              <textarea
                name="message"
                minLength={10}
                maxLength={2000}
                required
              />
            </label>
            <button className="button" disabled={busy}>
              {busy ? "Saving…" : "Save request"}
            </button>
          </form>
          <h3>Your requests ({tickets.length})</h3>
          {tickets.map((t) => (
            <article className="card" key={t.id}>
              <strong>{t.subject}</strong>
              <span className="badge">{t.status}</span>
              <p>{t.message}</p>
            </article>
          ))}
        </>
      ) : (
        link("/login", "Log in to save a request", "button")
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
createRoot(document.getElementById("root")).render(<App />);
