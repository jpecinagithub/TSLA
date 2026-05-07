# Arquitectura del Sistema — TSLA Day Trading Agent

## Diagrama general

```
┌─────────────────────────────────────────────────────────────────┐
│                        ORACLE CLOUD VPS                          │
│                      Ubuntu 24.04 LTS                           │
│                                                                  │
│  ┌──────────────┐    ┌─────────────────────────────────────┐    │
│  │    Nginx     │    │         tsla-agent (systemd)         │    │
│  │   port 80    │    │                                      │    │
│  │              │    │  ┌─────────────────────────────┐    │    │
│  │ /tsla/       ├───►│  │      FastAPI + Uvicorn       │    │    │
│  │  static      │    │  │         port 3008            │    │    │
│  │              │    │  │                              │    │    │
│  │ /tsla/api/   ├───►│  │  REST API    WebSocket       │    │    │
│  │  proxy_pass  │    │  │  /api/*      /ws/live        │    │    │
│  └──────────────┘    │  └──────────┬──────────────────┘    │    │
│                       │             │                        │    │
│  ┌──────────────┐    │  ┌──────────▼──────────────────┐    │    │
│  │   Browser    │    │  │       APScheduler            │    │    │
│  │  React SPA   │    │  │                              │    │    │
│  │              │    │  │  tick()        → cada 1 min  │    │    │
│  │  TanStack    │    │  │  reset_daily() → 09:30 ET    │    │    │
│  │  Query       │    │  │  daily_report  → 16:05 ET    │    │    │
│  │  ApexCharts  │    │  │  optimizer     → 16:10 ET    │    │    │
│  │  TradingView │    │  │  weekly_learn  → lun 09:00ET │    │    │
│  └──────────────┘    │  └──────────┬──────────────────┘    │    │
│                       │             │                        │    │
│                       │  ┌──────────▼──────────────────┐    │    │
│                       │  │       tick() loop            │    │    │
│                       │  │                              │    │    │
│                       │  │  collect() ──► Alpaca API    │    │    │
│                       │  │       │                      │    │    │
│                       │  │       ▼                      │    │    │
│                       │  │  ┌──────────────────────┐   │    │    │
│                       │  │  │  4 Agentes paralelos  │   │    │    │
│                       │  │  │                       │   │    │    │
│                       │  │  │  EMA Crossover        │   │    │    │
│                       │  │  │  Momentum Breakout    │   │    │    │
│                       │  │  │  VWAP Momentum        │   │    │    │
│                       │  │  │  AdaptiveAgent ◄──────┤   │    │    │
│                       │  │  │    │                  │   │    │    │
│                       │  │  │    ▼                  │   │    │    │
│                       │  │  │  RegimeDetector       │   │    │    │
│                       │  │  │  (ADX + EMA50)        │   │    │    │
│                       │  │  └──────────┬────────────┘   │    │    │
│                       │  │             │                 │    │    │
│                       │  │    RiskManager (valida)       │    │    │
│                       │  │             │                 │    │    │
│                       │  │    PaperBroker (ejecuta)      │    │    │
│                       │  └──────────┬──────────────────┘    │    │
│                       │             │                        │    │
│                       │  ┌──────────▼──────────────────┐    │    │
│                       │  │         MySQL 8              │    │    │
│                       │  │                              │    │    │
│                       │  │  bars          signals       │    │    │
│                       │  │  trades        portfolio     │    │    │
│                       │  │  parameters    param_audit   │    │    │
│                       │  │  daily_reports regime_log    │    │    │
│                       │  │  learning_snapshots          │    │    │
│                       │  │  optimization_runs           │    │    │
│                       │  └─────────────────────────────┘    │    │
│                       └─────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┘
                    ▼
         ┌──────────────────┐
         │   Alpaca API     │
         │  (market data)   │
         │  paper-api.      │
         │  alpaca.markets  │
         └──────────────────┘
```

---

## Flujo de datos en cada tick (cada 60 segundos)

```
Alpaca API
    │  1-min OHLCV bars
    ▼
collector.py ──► persist_bars() ──► MySQL [bars]
    │
    │ DataFrame
    ▼
indicators/engine.py
    │  EMA9, EMA21, RSI14, VWAP, vol_ratio
    ▼
┌─────────────────────────────────────────┐
│           4 agentes (paralelo)          │
│                                         │
│  strategy.evaluate(snap, prev, pos)     │
│       │ BUY / SELL / HOLD               │
│       ▼                                 │
│  risk_manager.validate_buy/sell()       │
│       │ approved / blocked              │
│       ▼                                 │
│  paper_broker.open/close_position()     │
│       │                                 │
│       ├──► MySQL [trades]               │
│       ├──► MySQL [portfolio]            │
│       └──► MySQL [signals]              │
└─────────────────────────────────────────┘
    │
    ▼
state.py (in-process dict)
    │
    ▼
WebSocket /ws/live ──► Browser
```

---

## Stack tecnológico

### Backend
| Componente | Tecnología | Versión |
|---|---|---|
| Lenguaje | Python | 3.11 |
| Framework API | FastAPI + Uvicorn | 0.111 |
| ORM | SQLAlchemy | 2.0 |
| Driver MySQL | PyMySQL | 1.1 |
| Scheduler | APScheduler | 3.10 |
| Indicadores técnicos | ta | 0.11 |
| Market data | alpaca-py | ≥0.43 |
| Data processing | pandas + numpy | 2.2 / 1.26 |
| Timezones | pytz | 2024.1 |
| Config | python-dotenv | 1.0 |

### Frontend
| Componente | Tecnología |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| Estilos | Tailwind CSS 3 |
| Fetching | TanStack Query 5 |
| Routing | React Router 6 |
| Charts (OHLCV) | TradingView Lightweight Charts |
| Charts (métricas) | ApexCharts / react-apexcharts |
| WebSocket | reconnecting-websocket |
| Iconos | lucide-react |

### Infraestructura
| Componente | Tecnología |
|---|---|
| Cloud | Oracle Cloud (Ubuntu 24.04) |
| Reverse proxy | Nginx 1.24 |
| Process manager | systemd |
| Base de datos | MySQL 8 |
| Deploy | tar + scp + systemctl restart |

---

## Esquema de base de datos

```
bars                    — OHLCV 1-min + indicadores computados
signals                 — todas las señales BUY/SELL/HOLD de cada agente
trades                  — operaciones abiertas y cerradas con PnL
portfolio               — capital virtual por estrategia
parameters              — parámetros ajustables por estrategia
param_audit             — historial de cambios de parámetros
daily_reports           — análisis post-mercado generado a las 16:05 ET
optimization_runs       — resultados del grid search de parámetros
regime_log              — historial de regímenes de mercado detectados
learning_snapshots      — métricas semanales para evaluar aprendizaje
```

---

## Módulos del backend

```
backend/
├── main.py                  # FastAPI app, routers, scheduler lifespan
├── config.py                # Variables de entorno centralizadas
├── state.py                 # Estado in-process compartido (sin Redis)
│
├── data/
│   └── collector.py         # Fetch Alpaca → persist MySQL → fallback DB
│
├── indicators/
│   └── engine.py            # EMA, RSI, VWAP, vol_ratio
│
├── strategy/
│   ├── ema_crossover.py     # EMA9 cruza EMA21 + RSI + vol
│   ├── momentum_breakout.py # Breakout con volumen
│   └── vwap_momentum.py     # Precio cruza VWAP + vol spike
│
├── agents/
│   ├── trading_agent.py     # Agente genérico (1 estrategia, 1 portfolio)
│   └── adaptive_agent.py    # Agente adaptativo (elige estrategia por régimen)
│
├── learning/
│   ├── regime.py            # Detector ADX+EMA50: TRENDING_UP/DOWN/RANGING
│   └── metrics.py           # Snapshots semanales, alpha vs B&H, learning verdict
│
├── risk/
│   └── manager.py           # Validación absoluta: position size, daily loss halt
│
├── simulator/
│   └── paper_broker.py      # Fills virtuales con slippage, debita capital
│
├── scheduler/
│   └── loop.py              # tick() cada minuto + jobs diarios/semanales
│
├── optimizer/
│   └── param_optimizer.py   # Grid search + walk-forward validation
│
├── analysis/
│   └── daily_analyzer.py    # Clasificación de errores, recomendaciones
│
├── backtester/
│   ├── engine.py            # Backtesting bar-by-bar con equity curve
│   ├── walkforward.py       # Train/test split temporal
│   └── run.py               # Runner con comparación de estrategias
│
├── api/routes/
│   ├── bars.py              # GET /api/bars
│   ├── trades.py            # GET /api/trades
│   ├── signals.py           # GET /api/signals
│   ├── portfolio.py         # GET /api/portfolio
│   ├── performance.py       # GET /api/performance
│   ├── parameters.py        # GET/PUT /api/parameters
│   ├── backtest.py          # GET/POST /api/backtest
│   ├── learning.py          # GET /api/learning/status|regime|history
│   └── live_decisions.py    # GET /api/live/decisions
│
└── db/
    ├── connection.py        # Engine SQLAlchemy + SessionLocal
    └── models.py            # ORM models: Bar, Signal, Trade, Portfolio...
```

---

## Lógica del AdaptiveAgent

```
Cada tick:
│
├─ detect_regime(df)
│    ├─ ADX > 25 + precio > EMA50  →  TRENDING_UP
│    ├─ ADX > 25 + precio < EMA50  →  TRENDING_DOWN
│    └─ ADX ≤ 25                   →  RANGING
│
├─ TRENDING_UP    →  delega a  ema_crossover   (trend-following)
├─ RANGING        →  delega a  vwap_momentum   (mean-reversion)
├─ TRENDING_DOWN  →  cierra posición + espera  (capital preservation)
└─ UNKNOWN        →  espera                    (datos insuficientes)

Cambio de régimen con posición abierta:
  → cierra la posición actual antes de cambiar de estrategia
  → registra exit_reason = FLATTEN con contexto [REGIME_SWITCH]
```

---

## Parámetros de paper trading

| Parámetro | Valor |
|---|---|
| Capital inicial por estrategia | $5,000 USD |
| Riesgo máximo por trade | 1% del capital |
| Pérdida diaria máxima | 3% del capital |
| Profit target por trade | +0.5% |
| Stop loss por trade | -0.3% |
| Máximo de trades/día | 10 |
| Slippage estimado | 0.05% por fill |
| Posiciones simultáneas | 1 por estrategia |
| Posiciones overnight | No (flatten antes 15:55 ET) |

---

## Principios de diseño

**1. Capital preservation > Profit**
El RiskManager tiene autoridad absoluta. Ningún módulo puede bypasearlo.

**2. Fail safely**
Si el feed de datos falla → fallback a DB cache → agentes siguen corriendo.
Si un agente falla → los otros siguen. Los errores se loggean, no propagan.

**3. Todo el estado sobrevive reinicios**
No hay estado en memoria crítico que no esté en MySQL.
El único estado in-process (`_open_position`, `_prev_snap`) se reconstruye en el siguiente tick.

**4. Módulos intercambiables**
Cada estrategia implementa la misma interfaz (`evaluate()` → Signal).
El AdaptiveAgent puede delegar a cualquiera sin conocer sus internos.
En Phase 3, `paper_broker.py` se reemplaza por `alpaca_broker.py` — misma interfaz.

**5. Auditoría completa**
Cada señal, trade, cambio de parámetro y resultado de optimización queda registrado.

---

## Conocimientos necesarios para implementar este proyecto

### 1. Backend / Python
- FastAPI — routing, dependency injection, lifespan events, middleware
- SQLAlchemy 2 — ORM, sessions, text queries, upserts (ON DUPLICATE KEY)
- APScheduler — cron jobs, job stores, timezone-aware scheduling
- Diseño de agentes — state machines, tick loops, event-driven patterns
- Async vs sync — cuándo usar cada uno con uvicorn

### 2. Mercados financieros y trading
- Indicadores técnicos — EMA, RSI, VWAP, ADX, vol_ratio
- Gestión de riesgo — position sizing, stop-loss, daily loss limits
- Market microstructure — slippage, fills, bar formation, market hours
- Regímenes de mercado — trending vs ranging, interpretación ADX
- Paper trading — simulación realista con slippage modeling
- Métricas de performance — expectancy, profit factor, alpha vs B&H, Sharpe, max drawdown
- Walk-forward validation — train/test split temporal, lookahead bias

### 3. Arquitectura de sistemas
- Diseño modular desacoplado — cada estrategia es intercambiable
- Fallback patterns — cache local cuando la API externa falla
- State management sin Redis — in-process state compartido
- Event sourcing ligero — audit trails completos
- API caching con TTL — evitar recómputo en endpoints costosos

### 4. Bases de datos
- MySQL 8 — schema design, índices, constraints, enums
- SQLAlchemy sessions — manejo correcto (finally: db.close())
- Tipos numéricos críticos — DECIMAL vs FLOAT, decimal.Decimal vs float en Python
- Query optimization — date range queries, índices en timestamps

### 5. Frontend
- React 18 — hooks, context, componentes funcionales
- TanStack Query — fetching, caching, refetchInterval, mutations
- ApexCharts — series, annotations, formatters personalizados
- TradingView Lightweight Charts — candlestick con overlays EMA/VWAP
- WebSocket — reconnecting-websocket, gestión de estado live
- Tailwind CSS — utility-first, dark mode

### 6. DevOps / Infraestructura
- Linux / systemd — services, journalctl, auto-restart, permisos
- Nginx — reverse proxy, location blocks, static files, proxy_pass
- SSH — key-based auth, remote commands, scp
- Deploy sin Docker — tar + scp + systemctl restart
- Gestión de secretos — .env, .gitignore, separación local/producción

### 7. APIs externas
- Alpaca Markets API — autenticación, StockBarsRequest, feeds IEX vs SIP
- Rate limiting — retry con backoff exponencial, fallback a cache
- OpenAI-compatible APIs — integración de LLMs (NVIDIA NIM, etc.)

### 8. Matemáticas y estadística
- Regresión lineal simple — slope para detectar tendencia en expectancy
- Walk-forward validation — train/test split temporal
- Scoring de parámetros — `expectancy × sqrt(trades)` penaliza bajo volumen
- Detección de overfitting — params óptimos in-sample que fallan out-of-sample

---

## Lo que diferencia este proyecto de un CRUD convencional

La mayoría de proyectos web son **request → response**.
Este proyecto tiene además:

- **Loop autónomo 24/7** corriendo independiente de las requests HTTP
- **Estado temporal crítico** — posición abierta, indicador previo, trades del día
- **Restricciones de tiempo real** — decisiones en menos de 60 segundos o se pierden
- **Corrección de tipos financieros** — el bug `Decimal vs float` causó trades perdidos en producción
- **Múltiples agentes concurrentes** con portfolios independientes compartiendo el mismo DataFrame
- **Decisiones irreversibles** — un BUY mal ejecutado consume capital real (o virtual con consecuencias)

---

## Roadmap de fases

| Fase | Estado | Descripción |
|---|---|---|
| **Phase 1** | ✅ Completo | Paper trading, 3 estrategias, dashboard, Oracle Cloud |
| **Phase 2** | 🔄 En curso | Backtesting, optimizer, adaptive agent, learning module |
| **Phase 3** | ⏳ Pendiente | Live trading con Alpaca broker (requiere aprobación explícita) |
