# TSLA Day Trading Agent

## Project Overview

Automated intraday trading agent focused exclusively on **Tesla Inc. (TSLA)**.

The system performs continuous market analysis and simulates buy/sell orders multiple times per day based on quantitative strategies. **Phase 1 runs in paper-trading mode with a $5,000 virtual capital account — no real broker connection.** The goal is to maximize short-term profits while strictly controlling risk.

Designed to run **24/7** on Oracle Cloud Infrastructure (OCI), with modular architecture and clear separation of responsibilities.

---

## Core Objectives

- Execute simulated intraday trading on TSLA (paper mode first)
- Detect short-term price movements using technical indicators
- Minimize losses via strict risk management
- Operate autonomously with minimal human intervention
- Log all decisions for audit, review, and strategy improvement

---

## Critical Constraints

- NEVER simulate a trade without passing risk validation
- NEVER override stop-loss rules, even in simulation
- ALWAYS prioritize capital preservation over profit
- DO NOT assume macroeconomic context
- ONLY use price, volume, and derived technical indicators
- NEVER connect to a real broker until Phase 3 is explicitly approved

---

## Paper Trading Parameters (Phase 1)

| Parameter | Value |
|---|---|
| Initial virtual capital | $5,000 USD |
| Max risk per trade | 1% of current capital |
| Max daily loss | 3% of current capital |
| Profit target per trade | +0.5% |
| Stop loss per trade | -0.3% |
| Max concurrent positions | 1 (MVP) |
| Broker connection | None (internal simulator) |

---

## Role of the LLM

The LLM is **NOT** responsible for direct trading decisions.

**Allowed responsibilities:**
- Analyze historical logs to detect patterns
- Suggest parameter tuning (RSI thresholds, EMA periods, etc.)
- Detect anomalies or unexpected behavior
- Assist in strategy optimization
- Generate human-readable performance reports

**Forbidden responsibilities:**
- Directly triggering BUY/SELL orders
- Overriding the risk manager
- Making discretionary trading decisions

---

## System Architecture

### 1. Market Data Collector

- Fetches real-time TSLA price and volume data
- **Free data source: Yahoo Finance (`yfinance`) or Polygon.io free tier**
- Intraday resolution: 1-minute bars
- Storage:
  - **Redis** — latest bars, indicators (low latency)
  - **MySQL 8** — full historical persistence (OCI MySQL HeatWave or self-hosted)

### 2. Strategy Engine

Deterministic logic only. No ML in Phase 1.

**Indicators:**
- EMA (9, 21)
- RSI (14)
- VWAP (intraday reset at market open)
- Volume spike detection (vs. 20-bar rolling average)

**Entry signal (BUY):**
- EMA9 crosses above EMA21
- RSI < 70
- Current volume > 1.5× rolling average

**Exit signal (SELL):**
- Profit target reached (+0.5%)
- Stop loss triggered (−0.3%)
- EMA cross reversal

### 3. Risk Manager — Critical Module

Absolute priority. No module can bypass it.

Rules:
- Max risk per trade: 1% of current capital
- Max daily loss: 3% — trading halts for the session if reached
- Max concurrent positions: 1 (Phase 1)
- Position sizing: `risk_amount / abs(entry_price - stop_loss_price)`
- All rules enforced before any order is placed

### 4. Paper Trading Simulator (replaces Execution Engine in Phase 1)

- Simulates order fills at current market price
- Accounts for:
  - Fixed slippage estimate (0.05% per trade)
  - No partial fills in MVP
- Tracks:
  - Virtual portfolio balance
  - Open/closed positions
  - Realized and unrealized PnL
- Exposes same interface as the real Execution Engine (future broker swap is a config change)

### 5. Logging & Monitoring

All events persisted to MySQL and exported to log files:
- Signals generated (with indicator values at the moment of evaluation)
- Trades executed (entry price, exit price, shares, PnL, reason)
- Risk validations (pass/fail + reason)
- System errors and restarts

### 6. Dashboard (FastAPI + Angular)

Full graphical interface for human oversight. **This is a core deliverable, not optional.**

#### API layer (FastAPI)
- REST endpoints for historical data
- WebSocket channel for live price + indicator updates (1-min push)
- Endpoints:
  - `GET /api/trades` — full trade history with filters
  - `GET /api/signals` — decision log with indicator snapshots
  - `GET /api/portfolio` — current balance, PnL, drawdown
  - `GET /api/parameters` — current strategy parameters
  - `PUT /api/parameters` — update parameters (requires confirmation)
  - `GET /api/performance` — aggregated stats (win rate, profit factor, etc.)
  - `GET /health` — system status

#### Frontend (Vite + React 18)

**Screen 1 — Live Monitor**
- Real-time TSLA candlestick chart (TradingView Lightweight Charts)
- Indicator overlays: EMA9, EMA21, VWAP
- Sub-chart: RSI with overbought/oversold bands
- Sub-chart: Volume bars with spike highlight
- Current open position panel (entry price, unrealized PnL, stop loss, take profit levels)
- Live virtual balance and daily PnL

**Screen 2 — Decision Log**
- Chronological table of every signal evaluated
- Columns: timestamp, signal type (BUY/SELL/HOLD), EMA9, EMA21, RSI, VWAP, volume ratio, risk check (pass/fail), action taken, reason
- Filterable by date range, signal type, outcome
- Click a row → zoom chart to that moment

**Screen 3 — Trade History**
- Table of all completed trades
- Columns: date, entry time, exit time, entry price, exit price, shares, gross PnL, net PnL (after slippage), exit reason (target/stop/reversal)
- Summary stats at top: total trades, win rate, avg win, avg loss, profit factor
- Equity curve chart (cumulative PnL over time)

**Screen 4 — Strategy Parameters**
- Read/write panel for all configurable parameters:
  - EMA periods (fast, slow)
  - RSI period and thresholds (oversold, overbought)
  - Volume spike multiplier
  - Profit target %, stop loss %
  - Max daily loss %, max risk per trade %
  - Max trades per day
- Each parameter shows current value + last-modified timestamp
- Changes are logged to the audit trail
- "Apply" button pushes new config to the engine (takes effect on next bar)

**Screen 5 — Performance Analysis**
- Heatmap: PnL by hour of day and day of week
- Distribution chart: trade PnL histogram
- Drawdown chart: peak-to-trough over time
- Rolling win rate (20-trade window)
- Comparison: strategy PnL vs. TSLA buy-and-hold baseline

#### Charts library
- **TradingView Lightweight Charts** — candlestick + indicator overlays (free, purpose-built for financial data)
- **ApexCharts** — equity curve, heatmap, histograms (easier Angular integration)

#### Real-time updates
- WebSocket from FastAPI → Angular service → all live components
- Fallback: 30-second polling if WebSocket drops

---

## Execution Loop

Runs every 60 seconds during market hours (09:30–16:00 ET, Mon–Fri):

1. Fetch latest TSLA 1-min bar
2. Update EMA, RSI, VWAP, volume indicators
3. Evaluate strategy signals
4. Validate risk constraints
5. Execute simulated trade if valid
6. Log all actions and state

Outside market hours: sleep, run maintenance tasks (log rotation, daily summary).

---

## Tech Stack

### Backend (Python)
```
Python 3.11+
pandas
numpy
ta-lib or pandas-ta       # technical indicators
yfinance                  # free market data (Phase 1)
redis-py                  # in-memory state
PyMySQL / SQLAlchemy      # MySQL 8
APScheduler               # job scheduling
FastAPI                   # monitoring API (Phase 2)
```

### Infrastructure — Oracle Cloud (OCI)
```
Compute:   OCI Free Tier VM (VM.Standard.E2.1.Micro) or paid shape
OS:        Oracle Linux 8 / Ubuntu 22.04
Container: Docker + Docker Compose
Database:  MySQL 8 (self-hosted in Docker) or OCI MySQL HeatWave
Cache:     Redis 7 (Docker)
Process:   systemd service or Docker restart policy
Reverse proxy: Nginx (Phase 2, for dashboard)
```

### Frontend
```
Vite + React 18 + TypeScript
TradingView Lightweight Charts   # candlestick + indicator overlays
ApexCharts (react-apexcharts)    # equity curve, heatmap, histogram
Tailwind CSS                     # utility-first styling
shadcn/ui                        # component library (built on Radix UI)
TanStack Query                   # API data fetching + caching
React Router v6                  # client-side routing
reconnecting-websocket           # live data stream with auto-reconnect
```

---

## Oracle Deployment Notes

- All services run inside Docker Compose on a single OCI VM (Phase 1)
- Persistent volumes mapped to OCI Block Storage
- Secrets (API keys, DB passwords) via `.env` file, never committed
- OCI security list: open port 443 (dashboard), all others closed
- Timezone: UTC on server; ET conversion handled in code for market hours
- Log rotation via `logrotate` or Python `RotatingFileHandler`
- Monitoring: OCI Monitoring + custom `/health` endpoint

---

## Backtesting Requirements

Before any strategy runs on the live simulator:

- Validate on ≥ 6 months of TSLA 1-min historical data
- Minimum acceptance criteria:
  - Win rate > 50%
  - Profit factor > 1.3
  - Max drawdown < 10%
- Reject any strategy showing overfitting (divergence between in-sample and out-of-sample)

---

## Development Phases

### Phase 1 — Paper Trading (current)
- [x] Project scaffold, Docker Compose, MySQL, Redis
- [ ] Market data collector (yfinance 1-min bars)
- [ ] Indicator engine (EMA, RSI, VWAP, volume)
- [ ] Strategy engine (EMA crossover MVP)
- [ ] Risk manager
- [ ] Paper trading simulator ($5,000 virtual)
- [ ] Logging to MySQL
- [ ] Backtesting harness

### Phase 2 — Dashboard & Monitoring
- [ ] FastAPI REST + WebSocket API
- [ ] Angular app scaffold (routing, Angular Material layout)
- [ ] Screen 1: Live Monitor (candlestick + EMA/RSI/VWAP overlays, live position)
- [ ] Screen 2: Decision Log (signal table with indicator snapshot per row)
- [ ] Screen 3: Trade History (trade table + equity curve)
- [ ] Screen 4: Strategy Parameters (read/write config panel)
- [ ] Screen 5: Performance Analysis (heatmap, histogram, drawdown, win rate)
- [ ] Nginx reverse proxy on OCI (serve Angular + proxy API)
- [ ] LLM-assisted strategy analysis and parameter tuning
- [ ] Multi-strategy support

### Phase 3 — Live Trading (requires explicit approval)
- [ ] Broker integration (Alpaca or IBKR)
- [ ] Real capital deployment (small size)
- [ ] Performance benchmarking vs. paper results

---

## Risk & Safety Principles

- Capital preservation > Profit, always
- Avoid overtrading (max 10 round-trips/day in Phase 1)
- Account for slippage and latency in all PnL calculations
- System must fail safely: if data feed fails, halt trading (do not guess)
- All state must survive a process restart (persisted to DB/Redis)
- No open positions left overnight (flatten before 15:55 ET)

---

## Guiding Principle

This system is not designed to predict the market.

It is designed to:
→ React fast  
→ Manage risk strictly  
→ Execute consistently  

Consistency and discipline beat prediction accuracy.
