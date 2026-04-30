"""
Main execution loop — runs every 60 seconds during market hours.
Orchestrates 3 independent TradingAgent instances (one per strategy).
All agents share the same bar data; each has its own portfolio + parameters.
"""
import logging
from datetime import datetime, time

import pytz

from config import MARKET_OPEN_ET, MARKET_CLOSE_ET
from agents.trading_agent import TradingAgent
import strategy.ema_crossover    as ema_strategy
import strategy.momentum_breakout as momentum_strategy
import strategy.vwap_momentum     as vwap_strategy
from data.collector import collect
from state import set_live
from db.connection import SessionLocal
from db.models import Portfolio

logger = logging.getLogger(__name__)

ET = pytz.timezone("America/New_York")

# One agent per strategy — instantiated once at startup
_agents = [
    TradingAgent("ema_crossover",      ema_strategy),
    TradingAgent("momentum_breakout",  momentum_strategy),
    TradingAgent("vwap_momentum",      vwap_strategy),
]


def _market_open() -> bool:
    now_et  = datetime.now(ET).time()
    open_t  = time(*map(int, MARKET_OPEN_ET.split(":")))
    close_t = time(*map(int, MARKET_CLOSE_ET.split(":")))
    return open_t <= now_et <= close_t


def tick() -> None:
    """Single execution cycle. Called every 60 seconds by APScheduler."""
    if not _market_open():
        return

    # Collect market data once — all agents share the same bars
    df = collect()
    if df.empty:
        logger.warning("No bars available, skipping tick")
        return

    # Run each agent on a copy of the DataFrame
    for agent in _agents:
        try:
            agent.tick(df.copy())
        except Exception as exc:
            logger.error("[%s] agent tick failed: %s", agent.strategy, exc, exc_info=True)

    # Push live state from the primary (ema_crossover) agent to the WebSocket
    _push_live_state(df)


def _push_live_state(df) -> None:
    """Broadcast current market snapshot + portfolio state to the WebSocket."""
    try:
        from indicators.engine import compute
        primary = _agents[0]                     # ema_crossover drives the live display
        params  = primary._load_params()
        _, snap = compute(df.copy(), params)
        if snap is None:
            return
        portfolio = primary._load_portfolio()
        set_live({
            "ts":        snap.ts.isoformat(),
            "close":     snap.close,
            "ema9":      snap.ema9,
            "ema21":     snap.ema21,
            "rsi14":     snap.rsi14,
            "vwap":      snap.vwap,
            "vol_ratio": snap.vol_ratio,
            "capital":   portfolio["capital"],
            "daily_pnl": portfolio["daily_pnl"],
            "position":  primary._open_position,
        })
    except Exception as exc:
        logger.error("_push_live_state failed: %s", exc)


def reset_daily_counters() -> None:
    """Called at market open (09:30 ET) by APScheduler — resets all agents."""
    for agent in _agents:
        try:
            agent.reset_daily()
        except Exception as exc:
            logger.error("[%s] reset_daily failed: %s", agent.strategy, exc)
    logger.info("Daily counters reset for all %d strategies", len(_agents))


def run_daily_analysis_job() -> None:
    """Called at 16:05 ET — generates the end-of-day analysis report."""
    logger.info("Running end-of-day analysis...")
    try:
        from analysis.daily_analyzer import run_daily_analysis
        report = run_daily_analysis()
        logger.info(
            "Daily analysis done: PnL=%.2f | errors=%d | missed=%d",
            report.get("pnl", {}).get("daily_pnl", 0),
            len(report.get("errors", [])),
            len(report.get("missed_opportunities", [])),
        )
    except Exception as exc:
        logger.error("Daily analysis job failed: %s", exc, exc_info=True)


def run_optimizer_job() -> None:
    """Called at 16:10 ET — runs parameter grid search for ema_crossover (Phase 2)."""
    logger.info("Running parameter optimizer...")
    try:
        from optimizer.param_optimizer import run_optimization
        result = run_optimization(auto_apply=True)
        if result.get("status") == "completed":
            logger.info(
                "Optimizer done: %d combos | improvement=%.1f%% | applied=%s",
                result.get("combinations_tested", 0),
                result.get("improvement_pct", 0),
                result.get("applied", False),
            )
        else:
            logger.info("Optimizer skipped/errored: %s", result.get("reason", "unknown"))
    except Exception as exc:
        logger.error("Optimizer job failed: %s", exc, exc_info=True)


def run_weekly_learning_job() -> None:
    """Called every Monday at 09:00 ET — persists last week's learning snapshot."""
    logger.info("Running weekly learning metrics job...")
    try:
        from learning.metrics import run_weekly_job
        run_weekly_job()
    except Exception as exc:
        logger.error("Weekly learning job failed: %s", exc, exc_info=True)
