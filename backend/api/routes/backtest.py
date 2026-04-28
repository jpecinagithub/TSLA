"""
Backtest API — serves pre-computed backtest results to the dashboard.

GET  /api/backtest/results  → returns cached results (auto-runs if stale)
POST /api/backtest/run      → forces a fresh run and returns new results

Results are cached in memory for 1 hour to avoid re-running on every
page load. The frontend can force a refresh via POST /run.
"""
import logging
import time
from datetime import datetime

from fastapi import APIRouter

import strategy.ema_crossover     as ema_strat
import strategy.momentum_breakout as mom_strat
import strategy.vwap_momentum     as vwap_strat
from backtester.engine   import BacktestEngine
from data.historical     import load_latest

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-memory cache ───────────────────────────────────────────────────────────
_cache: dict | None = None
_cache_ts: float    = 0.0
CACHE_TTL           = 3600   # seconds (1 hour)

STRATEGIES = [
    ("ema_crossover",     ema_strat,  "EMA Crossover"),
    ("momentum_breakout", mom_strat,  "Momentum Breakout"),
    ("vwap_momentum",     vwap_strat, "VWAP Momentum"),
]

DEFAULT_PARAMS = {
    "ema_fast": 9, "ema_slow": 21, "rsi_period": 14,
    "rsi_overbought": 70, "vol_spike_mult": 1.5,
    "profit_target_pct": 0.5, "stop_loss_pct": 0.3,
    "max_risk_pct": 1.0, "max_daily_loss_pct": 3.0,
    "max_trades_day": 10, "slippage_pct": 0.05,
    # momentum_breakout
    "rsi_momentum_min": 50, "rsi_exit_level": 40, "breakout_window": 20,
    # vwap_momentum
    "vwap_exit_buffer": 0.1,
}


def _run_backtest() -> dict:
    """Run all 3 strategies and return serialisable dict."""
    df = load_latest()
    if df.empty:
        return {"error": "No historical data available"}

    strategies_out = []
    for name, module, label in STRATEGIES:
        r = BacktestEngine.run(
            df              = df,
            strategy_module = module,
            params          = DEFAULT_PARAMS.copy(),
            strategy_name   = name,
            initial_capital = 5_000.0,
        )
        # Downsample equity curve to max 500 points to keep payload small
        eq = r.equity_curve
        if len(eq) > 500:
            step = len(eq) // 500
            eq   = eq[::step]

        strategies_out.append({
            "name":              name,
            "label":             label,
            "total_trades":      r.total_trades,
            "winning_trades":    r.winning_trades,
            "losing_trades":     r.losing_trades,
            "win_rate":          round(r.win_rate, 1),
            "profit_factor":     r.profit_factor,
            "avg_win":           round(r.avg_win, 2),
            "avg_loss":          round(r.avg_loss, 2),
            "best_trade":        round(r.best_trade, 2),
            "worst_trade":       round(r.worst_trade, 2),
            "total_pnl":         round(r.total_pnl, 2),
            "expectancy":        round(r.expectancy, 2),
            "max_drawdown":      round(r.max_drawdown, 2),
            "max_drawdown_pct":  round(r.max_drawdown_pct, 1),
            "sharpe_ratio":      r.sharpe_ratio,
            "recovery_factor":   r.recovery_factor,
            "avg_hold_minutes":  round(r.avg_hold_minutes, 0),
            "avg_trades_per_day": round(r.avg_trades_per_day, 2),
            "total_slippage":    round(r.total_slippage, 2),
            "max_consec_losses": r.max_consec_losses,
            "initial_capital":   r.initial_capital,
            "final_capital":     round(r.final_capital, 2),
            "exit_reasons":      r.exit_reasons,
            "monthly_pnl":       r.monthly_pnl,
            "equity_curve":      eq,
        })

    # Data range info
    et_start = df.index[0]
    et_end   = df.index[-1]

    return {
        "computed_at":  datetime.utcnow().isoformat(),
        "data_range": {
            "start":        str(et_start.date()),
            "end":          str(et_end.date()),
            "total_bars":   len(df),
            "trading_days": int(df.index.normalize().nunique()),
        },
        "strategies": strategies_out,
    }


@router.get("/backtest/results")
def get_results():
    global _cache, _cache_ts
    if _cache is None or (time.time() - _cache_ts) > CACHE_TTL:
        logger.info("Backtest cache miss — running backtest …")
        _cache    = _run_backtest()
        _cache_ts = time.time()
    return _cache


@router.post("/backtest/run")
def run_now():
    global _cache, _cache_ts
    logger.info("Forced backtest run requested")
    _cache    = _run_backtest()
    _cache_ts = time.time()
    return _cache
