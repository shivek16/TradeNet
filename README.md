# TradeNet — Full Running Paper-Trading Project

TradeNet is a local full-stack educational paper-trading app. It includes signup/login, SQLite persistence, virtual cash, holdings, buy/sell orders, order history, positions, funds, support requests, and optional current US stock quotes from Twelve Data.

It does **not** place real brokerage orders and it does not use real money.

## Requirements

- Node.js 24 or newer
- npm
- Optional: a Twelve Data API key for current/live-ready quotes

Check Node:

```powershell
node --version
```

## Fastest way to run in VS Code

Open this `TradeNet` folder in VS Code, then open **Terminal → New Terminal**.

First time only:

```powershell
npm ci
```

For current quotes, copy the example environment file:

```powershell
Copy-Item .env.example .env
code .env
```

Replace `your_api_key_here` with your own Twelve Data API key:

```env
TWELVE_DATA_API_KEY=YOUR_PRIVATE_KEY_HERE
MARKET_CACHE_MS=65000
```

Do not commit or share `.env`. It is already ignored by Git.

You can also double-click `SETUP-LIVE-DATA.cmd` on Windows and paste the key there.

Start development mode:

```powershell
npm run dev
```

Then open:

```text
http://127.0.0.1:5173/
```

The backend runs on:

```text
http://127.0.0.1:3002/
```

Vite proxies `/api` from port 5173 to port 3002. The backend explicitly allows the two local Vite development origins, so signup/login works in development without the previous cross-origin rejection.

## Production-style local run

Build the frontend:

```powershell
npm run build
```

Then start Express:

```powershell
npm start
```

Open:

```text
http://127.0.0.1:3002/
```

In this mode Express serves the built frontend and API from the same origin.

## Market data behavior

The default watchlist contains seven US symbols:

- AAPL
- MSFT
- NVDA
- AMZN
- GOOGL
- META
- TSLA

When `TWELVE_DATA_API_KEY` is configured, the backend requests Twelve Data quotes and caches them for about 65 seconds. The dashboard shows a market badge:

- `LIVE` — all requested symbols came from the provider
- `PARTIAL` — some symbols are live and others are cached/sample
- `SAMPLE` — no key is configured or the provider is unavailable

Buy/sell orders always use the latest quote selected by the **backend**, not a price supplied by the browser. If live data is unavailable, the app falls back safely to sample prices so the project still runs.

## Database

The app uses SQLite:

```text
data/trading.sqlite
```

It is created automatically on first server start. Account state includes cash, holdings, orders, transfers and support requests.

To reset all local accounts, stop the server and delete the `data` folder. This is permanent.

## Useful commands

```powershell
npm run dev
npm run build
npm start
npm test
npm run check
```

`npm run check` runs the integration tests and production build.

## Project layout

```text
backend/server.js       Express API, authentication, SQLite and trading
backend/market.js       Twelve Data quote service + cache + fallback
backend/seed.json       Seven US sample symbols and starting holdings
frontend/src/main.jsx   Public pages, routing, signup and login
frontend/src/api.js     API client, USD/date formatting
dashboard/src/          Trading dashboard
scripts/dev.js          Starts backend + Vite together
tests/api.test.js       Integration tests
.env.example            Safe environment template
```

## Troubleshooting

**Cross-origin request rejected**

Use the supplied code and run `npm run dev`. Open exactly `http://127.0.0.1:5173/` or `http://localhost:5173/`. The backend allows those local development origins.

**Frontend loads but API says ECONNREFUSED**

The backend did not start. Read the terminal error above the Vite output. Confirm `backend/market.js` exists:

```powershell
Test-Path .\backend\market.js
```

It should print `True`.

**No live prices**

Check `.env` exists and contains your API key, then restart `npm run dev`. Never paste the key into chat or commit it to GitHub.

**Port 3002 or 5173 is already in use**

Stop the other process with `Ctrl+C`, then run `npm run dev` again.

## Security / scope

This is an educational local project, not a production brokerage platform. Passwords are hashed, sessions are HTTP-only, mutation requests are origin-checked, and account data is separated in SQLite. Internet deployment would need a separate production security and operations review.
