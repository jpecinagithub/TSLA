# TSLA Day Trading Agent

## Project Overview

Automated intraday trading agent focused exclusively on **Tesla Inc. (TSLA)**.

Runs in **paper-trading mode** with $5,000 virtual capital. No real broker connection until Phase 3 is explicitly approved. The system operates autonomously 24/7 on Oracle Cloud, executing a strategy every 60 seconds during NYSE market hours.

**Status: Phase 1 fully deployed and running on Oracle Cloud.**

---

## Critical Constraints

- NEVER simulate a trade without passing risk validation
- NEVER override stop-loss rules, even in simulation
- ALWAYS prioritize capital preservation over profit
- ONLY use price, volume, and derived technical indicators
- NEVER connect to a real broker until Phase 3 is explicitly approved

---

## Paper Trading Parameters

| Parameter | Value |
|---|---|
| Initial virtual capital | $5,000 USD |
| Max risk per trade | 1% of current capital |
| Max daily loss | 3% of current capital |
| Profit target per trade | +0.5% |
| Stop loss per trade | -0.3% |
| Max concurrent positions | 1 |
| Slippage estimate | 0.05% per fill |
| Max trades per day | 10 |
| Broker connection | None (paper simulator) |

---

## Role of the LLM

The LLM is **NOT** responsible for direct trading decisions.

**Allowed:** analyze logs, suggest parameter tuning, detect anomalies, generate reports.  
**Forbidden:** trigger BUY/SELL orders, override the risk manager, make discretionary decisions.

---

## System Architecture

### 1. Market Data Collector (`data/collector.py`)
- Source: Yahoo Finance via `yfinance` (free, no API key needed)
- Resolution: 1-minute OHLCV bars
- Persists to MySQL table `bars`
- No Redis — in-process state only

### 2. Indicator Engine (`indicators/engine.py`)
- Library: `ta` (stable PyPI package, replaces pandas-ta)
- EMA (9, 21), RSI (14), VWAP, Volume ratio (vs 20-bar avg)
- Writes computed values back to the `bars` row

### 3. Strategy Engine (`strategy/ema_crossover.py`)
- **BUY:** EMA9 crosses above EMA21 + RSI < 70 + vol_ratio ≥ 1.5×
- **SELL:** profit target +0.5%, stop loss −0.3%, or EMA cross reversal
- Deterministic only — no ML in Phase 1

### 4. Risk Manager (`risk/manager.py`)
- Absolute authority — no module bypasses it
- Position sizing: `capital × 1% / (price × stop_loss%)`
- Halts trading for the session if daily loss ≥ 3%

### 5. Paper Trading Simulator (`simulator/paper_broker.py`)
- Fills at current market price + slippage
- Debits/credits virtual portfolio in MySQL
- Same interface as a future real broker (Phase 3 swap = config change)

### 6. Execution Loop (`scheduler/loop.py`)
- APScheduler: runs `tick()` every minute Mon–Fri 09:30–16:00 ET
- Resets daily counters at 09:30 ET
- Force-flattens any open position before 15:55 ET
- Pushes live state to in-process `state.py` dict → WebSocket

### 7. API + Dashboard (`main.py` + `api/`)
- FastAPI on port 3008
- REST: `/api/bars`, `/api/trades`, `/api/signals`, `/api/portfolio`, `/api/parameters`, `/api/performance`
- WebSocket: `/ws/live` — pushes live state every 10 seconds
- Frontend: Vite + React 18, served as static files via Nginx at `/tsla/`

---

## Tech Stack

### Backend
```
Python 3.11
FastAPI 0.111 + uvicorn
SQLAlchemy 2 + PyMySQL      # MySQL 8
ta 0.11                      # technical indicators
yfinance 0.2.40              # market data
APScheduler 3.10             # job scheduler
pandas 2.2 + numpy 1.26
python-dotenv
```

### Frontend
```
Vite 5 + React 18 + TypeScript
TradingView Lightweight Charts  # candlestick + overlays
react-apexcharts 1.9 / apexcharts 4  # equity curve, donut, histogram
Tailwind CSS 3               # styling
TanStack Query 5             # API fetching + caching
React Router 6
reconnecting-websocket       # auto-reconnect WS
lucide-react                 # icons
```

### Infrastructure
```
Oracle Cloud Ubuntu 24.04 LTS — 143.47.63.169
MySQL 8 (shared instance, dedicated DB: tsla_trader, user: tsla)
Nginx 1.24 (shared, location blocks under /tsla/)
systemd service: tsla-agent (enabled, auto-restart)
No Docker, no Redis
```

---

## Oracle Deployment

| Resource | Value |
|---|---|
| Server IP | 143.47.63.169 |
| SSH | `ssh oracle` (alias in ~/.ssh/config) |
| SSH key | `~/.ssh/ssh-key-2026-03-17.key` |
| SSH user | ubuntu |
| Backend dir | `/home/ubuntu/PROYECTOS/tsla/backend/` |
| Frontend dir | `/var/www/projects/tsla/` |
| Backend port | 3008 |
| Dashboard URL | http://143.47.63.169/tsla/ |
| API URL | http://143.47.63.169/tsla/api/ |
| WebSocket | ws://143.47.63.169/tsla/ws/live |
| MySQL DB | `tsla_trader` / user `tsla` |
| Nginx config | `/etc/nginx/sites-enabled/proyectos` |
| Systemd service | `tsla-agent` |

### Deploy workflow
```bash
# 1. Build frontend
cd frontend && npm run build

# 2. Pack and upload
tar --exclude='backend/.venv' --exclude='backend/__pycache__' -czf /tmp/tsla_backend.tar.gz backend/
tar -czf /tmp/tsla_frontend.tar.gz -C frontend dist/
scp -i ~/.ssh/ssh-key-2026-03-17.key /tmp/tsla_*.tar.gz ubuntu@143.47.63.169:/tmp/

# 3. On server
ssh oracle "
  tar -xzf /tmp/tsla_backend.tar.gz -C /home/ubuntu/PROYECTOS/tsla/
  sudo tar -xzf /tmp/tsla_frontend.tar.gz -C /var/www/projects/tsla/ --strip-components=1
  sudo chown -R www-data:www-data /var/www/projects/tsla/
  cd /home/ubuntu/PROYECTOS/tsla/backend && .venv/bin/pip install -r requirements.txt -q
  sudo systemctl restart tsla-agent
"
```

### Useful commands
```bash
# Logs en vivo
ssh oracle "sudo journalctl -u tsla-agent -f"

# Reiniciar agente
ssh oracle "sudo systemctl restart tsla-agent"

# Estado
ssh oracle "sudo systemctl status tsla-agent"

# MySQL
ssh oracle "mysql -u tsla -pTslaAgent2026! tsla_trader"
```

---

## Project File Structure

```
TSLA/
├── CLAUDE.md
├── AGENT.md               # architecture + decision rationale
├── .env                   # local dev (never commit)
├── .env.example
├── docker-compose.yml     # kept for reference, not used in prod
├── db/
│   └── init.sql           # MySQL schema + seed parameters
├── backend/
│   ├── main.py            # FastAPI app + APScheduler lifespan
│   ├── config.py          # env vars
│   ├── state.py           # in-process live state (replaces Redis)
│   ├── data/collector.py
│   ├── indicators/engine.py
│   ├── strategy/ema_crossover.py
│   ├── risk/manager.py
│   ├── simulator/paper_broker.py
│   ├── scheduler/loop.py
│   ├── db/{connection,models}.py
│   └── api/routes/{bars,trades,signals,portfolio,parameters,performance}.py
│       api/websocket.py
└── frontend/
    ├── src/
    │   ├── App.tsx          # top nav + routes
    │   ├── pages/{LiveMonitor,DecisionLog,TradeHistory,Parameters,Performance}.tsx
    │   ├── components/{CandleChart,StatCard,Badge,PageHeader}.tsx
    │   └── lib/{api.ts,useLive.ts}
    ├── .env.development
    ├── .env.production
    └── vite.config.ts
```

---

## Development Phases

### Phase 1 — Paper Trading ✅ COMPLETE
- [x] MySQL schema + seed data
- [x] Market data collector (yfinance)
- [x] Indicator engine (EMA, RSI, VWAP, volume) using `ta`
- [x] Strategy engine (EMA crossover)
- [x] Risk manager
- [x] Paper trading simulator ($5,000 virtual)
- [x] FastAPI + WebSocket API
- [x] React dashboard (5 screens)
- [x] Deployed on Oracle Cloud, running 24/7

### Phase 2 — Optimization (next)
- [ ] Backtesting harness on historical TSLA data
- [ ] LLM-assisted parameter analysis
- [ ] Multi-strategy support
- [ ] Dashboard improvements (RSI sub-chart, volume bars)

### Phase 3 — Live Trading (requires explicit approval)
- [ ] Broker integration (Alpaca or IBKR)
- [ ] Real capital (small size)
- [ ] Performance benchmarking vs. paper results

---

## Risk & Safety Principles

- Capital preservation > Profit, always
- System must fail safely — if data feed fails, halt (do not guess)
- All state survives process restart (persisted to MySQL)
- No open positions left overnight (flatten before 15:55 ET)
- Parameters editable via dashboard; all changes logged to `param_audit`

---

## Guiding Principle

This system is not designed to predict the market.  
It is designed to: **React fast · Manage risk strictly · Execute consistently.**
