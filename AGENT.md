# TSLA Agent — Architecture & Decision Log

This document explains the WHY behind key architectural decisions. Keep it updated as the system evolves.

---

## Core Loop — How the Agent Thinks Each Minute

```
tick() every 60s (Mon–Fri 09:30–16:00 ET)
    │
    ├── collect()           → fetch yfinance 1m bars → persist to MySQL
    ├── compute()           → EMA9/21, RSI14, VWAP, vol_ratio
    ├── persist_indicators()→ write back to bars table
    ├── set_live()          → update in-process state for WebSocket
    │
    ├── if flatten_time     → close any open position (FLATTEN)
    │
    ├── evaluate()          → strategy signal: BUY / SELL / HOLD
    │
    ├── if BUY:
    │     validate_buy()    → risk manager (daily loss, trade count, sizing)
    │     open_position()   → deduct from capital, insert Trade row
    │
    ├── if SELL:
    │     validate_sell()   → confirm position exists
    │     close_position()  → credit capital, compute net PnL
    │
    └── _log_signal()       → insert Signal row (always, even HOLD)
```

---

## Strategy — EMA Crossover (Phase 1 MVP)

**Why EMA crossover?**
Simple, well-understood, no curve fitting. Serves as a baseline to measure against before introducing more complex strategies.

**Entry conditions (all three must be true):**
1. `EMA9 > EMA21` AND previous bar had `EMA9 ≤ EMA21` — fresh cross, not a continuation
2. `RSI14 < 70` — avoid buying into overbought momentum
3. `vol_ratio ≥ 1.5×` — confirm genuine move, filter noise

**Exit conditions (first match wins):**
1. Price ≥ entry × (1 + 0.5%) → TARGET
2. Price ≤ entry × (1 − 0.3%) → STOP_LOSS
3. EMA cross reversal (EMA9 crosses back below EMA21) → REVERSAL
4. Time ≥ 15:55 ET → FLATTEN (never hold overnight)

**Asymmetric target/stop (0.5% / 0.3%):**
Profit factor > 1 only requires win rate > 37.5% — achievable with a decent signal.

---

## Risk Manager — Non-Negotiable Rules

```python
# Position sizing
risk_amount = capital * 0.01          # 1% of capital
shares = risk_amount / (price * 0.003) # stop_loss = 0.3%

# Session halt
if daily_pnl <= -(capital * 0.03):
    halt trading for rest of session
```

**Why absolute priority?**
Any system that allows strategy to override risk is one bad trade away from ruin. The risk manager has veto power even if the signal looks perfect.

---

## Key Design Decisions

### No Redis
**Decision:** Use in-process Python dict (`state.py`) instead of Redis.  
**Why:** FastAPI and APScheduler run in the same process. Redis would add a dependency and a network hop for no benefit at this scale. Redis becomes relevant only if we split into multiple workers or processes.

### No Docker in production
**Decision:** systemd service + virtualenv directly on the Ubuntu VM.  
**Why:** Server already has other projects running without Docker. Consistent with existing deployment pattern. Simpler to debug and manage.

### `ta` library instead of `pandas-ta`
**Decision:** Switched to `ta==0.11.0` after `pandas-ta` failed to install on PyPI.  
**Why:** `ta` is stable, well-maintained, available on PyPI without pre-release flags. All required indicators (EMA, RSI, VWAP) are available.

### yfinance as data source
**Decision:** Yahoo Finance free tier via `yfinance`.  
**Why:** No API key, no cost, 1-min historical bars available for the current day. Limitation: data may lag ~15 minutes and is not tick-level. Acceptable for a 1-min bar strategy. Upgrade path: Polygon.io or Alpaca data feed in Phase 3.

### MySQL user isolation
**Decision:** Dedicated `tsla` MySQL user with access only to `tsla_trader` database.  
**Why:** Server hosts multiple projects sharing the same MySQL instance. User isolation prevents accidental cross-contamination.

### Vite base path `/tsla/`
**Decision:** Frontend built with `base: '/tsla/'` and env-based API URLs.  
**Why:** Server serves multiple projects under the same IP/port via Nginx location blocks. Each project gets its own path prefix.

---

## Database Schema Summary

| Table | Purpose |
|---|---|
| `bars` | 1-min OHLCV + computed indicators. Unique on `ts`. |
| `signals` | Every strategy evaluation (BUY/SELL/HOLD) with full indicator snapshot |
| `trades` | Open and closed positions with PnL |
| `portfolio` | Single row (id=1) — current capital, daily PnL, halt flag |
| `parameters` | Strategy config (editable via dashboard) |
| `param_audit` | Immutable log of every parameter change |

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `MYSQL_HOST` | DB host (127.0.0.1 in prod) |
| `MYSQL_USER` | `tsla` |
| `MYSQL_PASSWORD` | `TslaAgent2026!` |
| `MYSQL_DATABASE` | `tsla_trader` |
| `INITIAL_CAPITAL` | Starting virtual balance (5000.0) |
| `MARKET_OPEN_ET` | `09:30` |
| `MARKET_CLOSE_ET` | `16:00` |
| `FLATTEN_BEFORE_ET` | `15:55` — force close before EOD |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | System + DB status |
| GET | `/api/bars?limit=390` | 1-min OHLCV + indicators |
| GET | `/api/signals?limit=500` | Decision log |
| GET | `/api/trades?limit=200` | Trade history |
| GET | `/api/portfolio` | Balance, PnL, win rate |
| GET | `/api/parameters` | Current strategy config |
| PUT | `/api/parameters/{key}` | Update a parameter |
| GET | `/api/performance` | Stats + equity curve |
| WS  | `/ws/live` | Live push every 10s |

---

## Dashboard Screens

| Screen | Route | Key content |
|---|---|---|
| Live Monitor | `/` | Candlestick + EMA/VWAP overlays, RSI bar, vol ratio, open position |
| Decision Log | `/decisions` | All signals with indicator values, filterable by BUY/SELL/HOLD |
| Trade History | `/trades` | All closed trades + equity curve |
| Parameters | `/parameters` | Grouped editable config, unsaved badge, single Save button |
| Performance | `/performance` | Win rate, profit factor, drawdown, win/loss donut, PnL histogram |

---

## Upgrade Path to Phase 3 (Live Trading)

1. Replace `simulator/paper_broker.py` with `broker/alpaca_client.py` (same interface)
2. Add Alpaca API key + secret to `.env`
3. Change `INITIAL_CAPITAL` to real funded amount
4. Test with 1 share per trade maximum for 2 weeks
5. Only after: release position sizing formula

**Never skip the 2-week minimum on real capital before increasing size.**

---

## Known Limitations (Phase 1)

| Limitation | Impact | Fix in Phase |
|---|---|---|
| yfinance 15-min data lag | Entry/exit prices slightly stale | Phase 3 (real data feed) |
| No backtesting yet | Strategy unvalidated on historical data | Phase 2 |
| Single strategy | No diversification | Phase 2 |
| No RSI sub-chart in dashboard | Indicator visible only as number | Phase 2 |
| WebSocket pushes every 10s | Not tick-level | Acceptable for 1-min strategy |
