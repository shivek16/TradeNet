# TradeNet

A full-stack **paper-trading platform** built with React, Vite, Node.js, Express, and SQLite.

TradeNet lets users create a local account, manage virtual funds, track a portfolio, and place simulated buy/sell orders. It can also retrieve current US stock quotes through Twelve Data when an API key is configured.

> **Educational project only.** TradeNet does not execute real brokerage orders, handle real money, or provide investment advice.

---

## Features

- User signup and login
- Password hashing and session-based authentication
- Virtual starting balance
- Paper buy and sell orders
- Holdings and portfolio tracking
- Order history
- Daily positions
- Virtual fund deposits and withdrawals
- Support request system
- SQLite persistence
- Optional current US stock quotes
- Market-data caching and fallback prices
- Responsive React dashboard
- Local development and production-style modes

---

## Tech Stack

### Frontend

- React
- Vite
- JavaScript
- CSS

### Backend

- Node.js
- Express
- SQLite

### Market Data

- Twelve Data API

### Development

- npm
- Git
- GitHub
- VS Code

---

## Screenshots

Screenshots can be added here once they are committed to the repository.

```text
screenshots/
├── home.png
├── dashboard.png
├── holdings.png
└── orders.png
```

Example:

```markdown
![TradeNet Dashboard](screenshots/dashboard.png)
```

---

## Requirements

Make sure you have:

- Node.js 24 or newer
- npm
- Git
- Optional Twelve Data API key

Check your Node version:

```powershell
node --version
```

---

## Installation

Clone the repository:

```powershell
git clone https://github.com/shivek16/TradeNet.git
```

Enter the project:

```powershell
cd TradeNet
```

Install dependencies:

```powershell
npm ci
```

---

## Environment Variables

Create your local environment file:

```powershell
Copy-Item .env.example .env
```

Open it in VS Code:

```powershell
code .env
```

Add your Twelve Data API key:

```env
TWELVE_DATA_API_KEY=YOUR_PRIVATE_API_KEY
MARKET_CACHE_MS=65000
```

Never commit your real `.env` file.

The repository includes `.env.example` so other developers can see which environment variables are required without exposing private credentials.

---

## Run in Development Mode

Start TradeNet:

```powershell
npm run dev
```

The frontend will run at:

```text
http://127.0.0.1:5173/
```

The backend API runs at:

```text
http://127.0.0.1:3002/
```

Vite proxies frontend `/api` requests to the Express backend.

---

## Production-Style Local Run

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

In this mode, Express serves both the frontend build and API from the same origin.

---

## Market Data

TradeNet currently supports these demonstration US symbols:

| Symbol | Company |
|---|---|
| AAPL | Apple |
| MSFT | Microsoft |
| NVDA | NVIDIA |
| AMZN | Amazon |
| GOOGL | Alphabet |
| META | Meta Platforms |
| TSLA | Tesla |

When a Twelve Data API key is configured, the backend requests updated market quotes and caches them to reduce API usage.

The dashboard shows these market-data states:

- `LIVE` — all requested symbols have fresh provider timestamps and are not reported closed
- `PARTIAL` — some symbols are live and others are cached/sample
- `SAMPLE` — no API key is configured; `DELAYED`, `CLOSED` and `UNAVAILABLE` distinguish other states

Buy/sell orders always use the latest quote selected by the **backend**, not a price supplied by the browser. When an API key is configured, new paper orders pause if the quote is stale, unavailable, or the provider reports the market closed. Sample-price trading is only available when no key is configured. Retried completed orders retain their original fill.

Availability and freshness of market data depend on the Twelve Data plan and exchange access.

---

## Paper Trading

Trades are simulated.

When a buy or sell order is placed:

1. The frontend sends the order request to the backend.
2. The backend determines the execution price.
3. The user's virtual cash and holdings are updated.
4. The order is saved in SQLite.
5. The dashboard refreshes the portfolio.

The browser does not directly control the execution price.

Buy/sell orders always use the latest quote selected by the **backend**, not a price supplied by the browser. When an API key is configured, new paper orders pause if the quote is stale, unavailable, or the provider reports the market closed. Sample-price trading is only available when no key is configured. Retried completed orders retain their original fill.

---

## Database

TradeNet uses a local SQLite database:

```text
data/trading.sqlite
```

It is automatically created when the backend starts.

Stored account data includes:

- Users
- Sessions
- Virtual cash
- Holdings
- Orders
- Transactions
- Support requests

The local `data/` directory is excluded from Git.

To completely reset your local TradeNet data, stop the server and delete the `data` directory.

> This permanently removes local accounts and portfolio data.

---

## Project Structure

```text
TradeNet/
│
├── backend/
│   ├── market.js
│   ├── seed.json
│   └── server.js
│
├── dashboard/
│   └── src/
│       └── Dashboard.jsx
│
├── frontend/
│   └── src/
│       ├── api.js
│       ├── main.jsx
│       └── styles.css
│
├── scripts/
│   └── dev.js
│
├── tests/
│   └── api.test.js
│
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
```

---

## Available Commands

### Development

```powershell
npm run dev
```

### Production Build

```powershell
npm run build
```

### Start Backend

```powershell
npm start
```

### Tests

```powershell
npm test
```

### Full Check

```powershell
npm run check
```

`npm run check` runs the project tests and production build.

---

## Troubleshooting

### `Cross-origin request rejected`

Run:

```powershell
npm run dev
```

Then use one of these addresses:

```text
http://127.0.0.1:5173/
```

or

```text
http://localhost:5173/
```

---

### `ECONNREFUSED 127.0.0.1:3002`

The backend probably failed to start.

Check the terminal for the actual backend error.

You can also verify that the market service exists:

```powershell
Test-Path .\backend\market.js
```

Expected:

```text
True
```

---

### No updated market quotes

Make sure `.env` exists:

```powershell
Get-ChildItem -Force .env
```

Then check that your Twelve Data key has been added.

Restart TradeNet after changing `.env`:

```powershell
npm run dev
```

---

### Port already in use

Stop the running development process with:

```text
Ctrl + C
```

Then start it again:

```powershell
npm run dev
```

---

## Security

TradeNet includes several protections appropriate for a local educational project:

- Password hashing
- HTTP-only sessions
- Origin validation for mutation requests
- Backend-controlled trade execution prices
- Private `.env` configuration
- SQLite account separation

This project has **not** been designed or audited for real-money brokerage use or public financial infrastructure.

---

## Disclaimer

TradeNet is an independent educational project.

It is not affiliated with Zerodha, Twelve Data, NASDAQ, NYSE, or any brokerage or exchange.

Stock prices may be delayed, cached, simulated, or unavailable depending on API configuration.

Nothing in this project should be considered financial or investment advice.

---

## Author

**Shivek**

GitHub: [@shivek16](https://github.com/shivek16)

---

## License

This project can be licensed under the MIT License for educational and portfolio use.

---

## Version 1.2 — Interactive market chart

The Overview dashboard now includes a candlestick chart and separate volume bars, a stock selector, 1m/5m/15m/1H/1D timeframes, hover OHLC readout, zoom, history navigation and buy/sell shortcuts. No additional dependencies are required.

History is fetched server-side from Twelve Data `/time_series`, in UTC, and displayed in Eastern Time for intraday bars. The server caches each symbol/interval for 65 seconds and shares requests between clients. History contains up to 200 provider bars. New ticks update the active candle and selected stock valuation. Stream-built candles are provisional, based on ticks actually received; history refresh reconciles them. Missing intervals are not invented. Volume is refreshed from provider history, not manufactured from price ticks; a new streaming candle shows volume as pending until supplied by history.

One server-side Twelve Data WebSocket is shared across viewers. An authenticated EventSource connection relays only the selected symbol to each browser. Keys never appear in client JavaScript or events. Idle subscriptions are removed. Reconnects are automatic. Symbols not covered by the streaming subscription continue to use periodic history requests. A connection alone is not labeled STREAMING: a recent timestamped tick must actually arrive.

Your provider plan controls symbol coverage, history access, latency, and API/WebSocket credits. The app does not unlock access the plan does not include. Seven watchlist quotes plus a new chart request can consume a basic plan's minute allowance. Rapidly switching timeframes can trigger rate limits; the UI displays the failure and retries later. No automatic paid upgrade is performed. Free/limited plans may not provide tick streaming for the chosen stock.

Official provider documentation:

- https://support.twelvedata.com/en/articles/5620516-how-to-stream-the-data
- https://support.twelvedata.com/en/articles/5194610-websocket-faq

### Upgrade existing installation

Stop the old server first. Copy the updated source into the project directory while keeping your existing `.env` and `data` directory. Neither is included in the distributable ZIP. Then run `npm ci` followed by `npm run dev`, and open http://127.0.0.1:5173/ . The separate `dist` build can also be served with `npm start`.

Previously owned symbols remain supported when loading an existing database even if removed from the default watchlist. Quote cache freshness is tracked per symbol, and concurrent quote requests wait on their shared provider request.

### Validation

`npm run check` includes market-specific tests for concurrent quotes, stale/partial responses, missing keys, history parsing/caching, candle aggregation, stream routing and cleanup, authenticated chart endpoints and blocking stale-price orders. Tests use controlled provider fixtures, not your real API account.
