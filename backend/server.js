import express from "express";
import { createMarketService } from "./market.js";
import { createChartService, INTERVALS } from "./charts.js";
import { createPriceStream } from "./stream.js";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seed = JSON.parse(
  readFileSync(path.join(root, "backend/seed.json"), "utf8"),
);
const round = (n) => Math.round(n * 100) / 100;
const fail = (status, message) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const quotes = [
  ...new Map(
    [...seed.holdings, ...seed.positions, ...seed.watchlist].map((s) => [
      s.name,
      {
        name: s.name,
        company: s.company || s.name,
        price: s.price,
        day: s.day || s.percent || "0%",
      },
    ]),
  ).values(),
];
const initial = () => ({
  cash: 100000,
  holdings: structuredClone(seed.holdings),
  orders: [],
  transactions: [],
  tickets: [],
});

export function createApp({
  dbPath = process.env.DATA_FILE || path.join(root, "data/trading.sqlite"),
  marketService = null,
  chartService = null,
  streamService = null,
} = {}) {
  if (dbPath !== ":memory:")
    mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), expires INTEGER NOT NULL);",
  );
  // Keep previously owned symbols sellable when the default watchlist changes.
  const universe = new Map(quotes.map((q) => [q.name, q]));
  for (const row of db.prepare("SELECT state FROM users").all()) {
    for (const holding of JSON.parse(row.state).holdings || []) {
      if (
        !universe.has(holding.name) &&
        /^[A-Z][A-Z0-9.&-]{0,14}$/.test(holding.name)
      )
        universe.set(holding.name, {
          name: holding.name,
          company: holding.company || holding.name,
          price: holding.price,
          day: holding.day || "0%",
        });
    }
  }
  const availableQuotes = [...universe.values()];
  const market =
    marketService || createMarketService({ fallbackQuotes: availableQuotes });
  const charts = chartService || createChartService();
  const stream =
    streamService ||
    createPriceStream({ onTrade: (tick) => market.ingestTrade?.(tick) });
  const app = express();
  app.disable("x-powered-by");
  const allowedDevOrigins = new Set([
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ]);
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
    });
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      let origin;
      try {
        origin = new URL(req.headers.origin);
      } catch {
        return res.status(403).json({ error: "Invalid origin" });
      }
      const requestOrigin = `${origin.protocol}//${origin.host}`;
      const sameOrigin = origin.host === req.headers.host;
      const allowedLocalDevelopmentOrigin =
        process.env.NODE_ENV !== "production" &&
        allowedDevOrigins.has(requestOrigin);
      if (!sameOrigin && !allowedLocalDevelopmentOrigin)
        return res.status(403).json({ error: "Cross-origin request rejected" });
    }
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  const authLimits = new Map();
  app.use("/api/auth", (req, res, next) => {
    if (req.method !== "POST") return next();
    const now = Date.now(),
      key = req.ip;
    for (const [k, v] of authLimits) if (v.until < now) authLimits.delete(k);
    const entry = authLimits.get(key) || { until: now + 60000, count: 0 };
    entry.count++;
    authLimits.set(key, entry);
    if (entry.count > 30)
      return res
        .status(429)
        .json({ error: "Too many attempts. Try again in one minute." });
    next();
  });
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });
  function session(req, res, user) {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
      hash(token),
      user.id,
      Date.now() + 7 * 86400000,
    );
    res.cookie("session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 7 * 86400000,
      path: "/",
    });
    return res.json({ user: publicUser(user) });
  }
  function credentials(body) {
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      fail(400, "Enter a valid email address.");
    if (password.length < 8 || password.length > 128)
      fail(400, "Password must contain 8–128 characters.");
    return { email, password };
  }
  app.get("/api/health", (req, res) =>
    res.json({
      status: "ok",
      mode: "paper",
      storage: "sqlite",
      marketConfigured: market.configured,
    }),
  );
  app.post("/api/auth/register", (req, res) => {
    const { email, password } = credentials(req.body || {}),
      name = String(req.body.name || "").trim();
    if (!name || name.length > 60)
      fail(400, "Enter a name of 1–60 characters.");
    if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
      fail(409, "An account with this email already exists.");
    const salt = randomBytes(16).toString("hex");
    const user = { id: randomUUID(), name, email };
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?)").run(
      user.id,
      name,
      email,
      `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
      JSON.stringify(initial()),
    );
    session(req, res, user);
  });
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = credentials(req.body || {});
    const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
    const [salt, saved] = (
      user?.password || `${"0".repeat(32)}:${"0".repeat(128)}`
    ).split(":");
    const valid = timingSafeEqual(
      scryptSync(password, salt, 64),
      Buffer.from(saved, "hex"),
    );
    if (!user || !valid) fail(401, "Email or password is incorrect.");
    session(req, res, user);
  });
  app.post("/api/auth/demo", (req, res) => {
    const user = {
      id: randomUUID(),
      name: "Demo Trader",
      email: `demo-${randomUUID()}@example.test`,
    };
    const salt = randomBytes(16).toString("hex");
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?)").run(
      user.id,
      user.name,
      user.email,
      `${salt}:${scryptSync(randomBytes(32), salt, 64).toString("hex")}`,
      JSON.stringify(initial()),
    );
    session(req, res, user);
  });
  app.use("/api", (req, res, next) => {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("session="))
      ?.slice(8);
    const user =
      cookie &&
      db
        .prepare(
          "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
        )
        .get(hash(cookie), Date.now());
    if (!user)
      return res.status(401).json({ error: "Please sign in to continue." });
    req.user = user;
    req.token = hash(cookie);
    next();
  });
  app.get("/api/auth/me", (req, res) =>
    res.json({ user: publicUser(req.user) }),
  );
  app.post("/api/auth/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(req.token);
    res.clearCookie("session", { path: "/" });
    res.json({ ok: true });
  });
  app.get("/api/portfolio", async (req, res) => {
    const state = JSON.parse(req.user.state);
    const snapshot = await market.getSnapshot(
      availableQuotes.map((quote) => quote.name),
    );
    const bySymbol = new Map(
      snapshot.quotes.map((quote) => [quote.name, quote]),
    );
    const holdings = state.holdings.map((holding) => {
      const quote = bySymbol.get(holding.name);
      return quote
        ? {
            ...holding,
            company: quote.company || holding.company,
            price: quote.price,
            day: quote.day,
          }
        : holding;
    });
    res.json({
      ...state,
      holdings,
      quotes: snapshot.quotes,
      market: snapshot.meta,
      user: publicUser(req.user),
    });
  });
  app.get("/api/market/history", async (req, res) => {
    const { symbol, interval = "1min" } = req.query;
    if (!universe.has(symbol) || !Object.hasOwn(INTERVALS, interval))
      return res
        .status(400)
        .json({ error: "Unsupported symbol or chart interval." });
    res.json(await charts.history(symbol, interval));
  });
  app.get("/api/market/stream", (req, res) => {
    const symbol = req.query.symbol;
    if (!universe.has(symbol))
      return res.status(400).json({ error: "Unsupported symbol." });
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const send = (event, value) => {
      if (!res.destroyed)
        res.write(
          "event: " + event + "\ndata: " + JSON.stringify(value) + "\n\n",
        );
    };
    const unsubscribe = stream.subscribe(symbol, send);
    const keepAlive = setInterval(() => {
      if (
        !db
          .prepare("SELECT token FROM sessions WHERE token=? AND expires>?")
          .get(req.token, Date.now())
      )
        return res.end();
      res.write(": keep-alive\n\n");
    }, 15000);
    res.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });
  function mutate(req, operation) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const state = JSON.parse(
        db.prepare("SELECT state FROM users WHERE id=?").get(req.user.id).state,
      );
      const result = operation(state);
      db.prepare("UPDATE users SET state=? WHERE id=?").run(
        JSON.stringify(state),
        req.user.id,
      );
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  app.post("/api/orders", async (req, res) => {
    const { name, qty, side, requestId } = req.body || {};
    const listed = universe.has(name);
    const quote = listed ? await market.getQuote(name) : null;
    if (
      !quote ||
      !Number.isSafeInteger(qty) ||
      qty < 1 ||
      qty > 100000 ||
      !["BUY", "SELL"].includes(side)
    )
      fail(
        400,
        "Choose a listed symbol, BUY or SELL, and a whole quantity from 1 to 100000.",
      );
    if (typeof requestId !== "string" || !/^[\w-]{8,80}$/.test(requestId))
      fail(400, "A valid request ID is required.");
    // Retries return their original fill, even if the quote feed subsequently failed.
    const saved = JSON.parse(req.user.state).orders.find(
      (o) => o.requestId === requestId,
    );
    if (saved) {
      if (saved.name !== name || saved.qty !== qty || saved.side !== side)
        fail(409, "Request ID already used.");
      return res.status(201).json({ order: saved });
    }
    if (market.configured && !quote.live)
      fail(
        503,
        "Paper order paused: a fresh market quote is unavailable or the market is closed. No sample-price fill was made.",
      );
    const order = mutate(req, (state) => {
      const previous = state.orders.find((o) => o.requestId === requestId);
      if (previous) {
        if (
          previous.name !== name ||
          previous.qty !== qty ||
          previous.side !== side
        )
          fail(409, "Request ID already used.");
        return previous;
      }
      const total = round(quote.price * qty),
        holding = state.holdings.find((h) => h.name === name);
      if (side === "BUY") {
        if (total > state.cash)
          fail(
            400,
            "Insufficient virtual funds. Add funds or reduce quantity.",
          );
        state.cash = round(state.cash - total);
        if (holding) {
          holding.avg =
            (holding.avg * holding.qty + total) / (holding.qty + qty);
          holding.qty += qty;
        } else
          state.holdings.push({
            name,
            company: quote.company || name,
            qty,
            avg: quote.price,
            price: quote.price,
            day: quote.day,
          });
      } else {
        if (!holding || holding.qty < qty)
          fail(400, "You cannot sell more shares than you hold.");
        holding.qty -= qty;
        state.holdings = state.holdings.filter((h) => h.qty > 0);
        state.cash = round(state.cash + total);
      }
      const order = {
        id: randomUUID(),
        requestId,
        name,
        qty,
        side,
        price: quote.price,
        total,
        status: "COMPLETE",
        quoteSource: quote.source || "sample",
        createdAt: new Date().toISOString(),
      };
      state.orders.unshift(order);
      return order;
    });
    res.status(201).json({ order });
  });
  app.post("/api/funds", (req, res) => {
    const { amount, type, requestId } = req.body || {};
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount < 1 ||
      amount > 1000000 ||
      Math.abs(round(amount) - amount) > 0.000001 ||
      !["DEPOSIT", "WITHDRAW"].includes(type)
    )
      fail(400, "Enter $1–$1,000,000 with at most two decimal places.");
    if (typeof requestId !== "string" || !/^[\w-]{8,80}$/.test(requestId))
      fail(400, "A valid request ID is required.");
    const transaction = mutate(req, (state) => {
      const old = state.transactions.find((t) => t.requestId === requestId);
      if (old) {
        if (old.amount !== amount || old.type !== type)
          fail(409, "Request ID already used.");
        return old;
      }
      if (type === "WITHDRAW" && amount > state.cash)
        fail(400, "Insufficient virtual cash.");
      if (type === "DEPOSIT" && state.cash + amount > 100000000)
        fail(400, "Maximum virtual balance is $100,000,000.");
      state.cash = round(state.cash + (type === "DEPOSIT" ? amount : -amount));
      const t = {
        id: randomUUID(),
        requestId,
        amount,
        type,
        createdAt: new Date().toISOString(),
      };
      state.transactions.unshift(t);
      return t;
    });
    res.status(201).json({ transaction });
  });
  app.post("/api/tickets", (req, res) => {
    const subject = String(req.body?.subject || "").trim(),
      message = String(req.body?.message || "").trim();
    if (
      subject.length < 3 ||
      subject.length > 100 ||
      message.length < 10 ||
      message.length > 2000
    )
      fail(
        400,
        "Use a subject of 3–100 characters and a message of 10–2000 characters.",
      );
    const ticket = mutate(req, (state) => {
      const t = {
        id: randomUUID(),
        subject,
        message,
        status: "Saved locally",
        createdAt: new Date().toISOString(),
      };
      state.tickets.unshift(t);
      return t;
    });
    res.status(201).json({ ticket });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API endpoint not found." }),
  );
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.get("/{*path}", (req, res) => {
    if (path.extname(req.path)) return res.status(404).send("File not found");
    if (!existsSync(path.join(dist, "index.html")))
      return res
        .status(503)
        .send("Run npm run build first, or use npm run dev.");
    res.sendFile(path.join(dist, "index.html"));
  });
  app.use((err, req, res, next) => {
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({
      error: err.status
        ? err.message
        : "Unexpected server error. Please try again.",
    });
  });
  return { app, db, closeStreams: () => stream.close() };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { app, db, closeStreams } = createApp();
  const port = Number(process.env.PORT || 3002);
  const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`TradeNet paper trading: http://localhost:${port}`),
  );
  server.on("error", (e) => {
    console.error(
      e.code === "EADDRINUSE"
        ? `Port ${port} is occupied. Close the other server or set PORT.`
        : e,
    );
    db.close();
    process.exit(1);
  });
  const stop = () => {
    closeStreams();
    server.closeAllConnections();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
