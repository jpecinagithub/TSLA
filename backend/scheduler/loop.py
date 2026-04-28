"""
Main execution loop — runs every 60 seconds during market hours.
Orchestrates: collect → indicators → strategy → risk → simulate → log.
"""
import logging
from datetime import datetime, time

import pytz

from config import MARKET_OPEN_ET, MARKET_CLOSE_ET, FLATTEN_BEFORE
from data.collector import collect
from db.connection import SessionLocal
from db.models import Parameter, Portfolio, Signal
from indicators.engine import compute, persist_indicators, IndicatorSnapshot
from state import set_live
from risk.manager import validate_buy, validate_sell
from simulator.paper_broker import close_position, open_position
from strategy.ema_crossover import Signal as Sig, evaluate

logger = logging.getLogger(__name__)

ET = pytz.timezone("America/New_York")

_open_position: dict | None = None
_prev_snap: IndicatorSnapshot | None = None
_trades_today: int = 0


def _market_open() -> bool:
    now_et = datetime.now(ET).time()
    open_t  = time(*map(int, MARKET_OPEN_ET.split(":")))
    close_t = time(*map(int, MARKET_CLOSE_ET.split(":")))
    return open_t <= now_et <= close_t


def _should_flatten() -> bool:
    now_et   = datetime.now(ET).time()
    flatten_t = time(*map(int, FLATTEN_BEFORE.split(":")))
    return now_et >= flatten_t


def _load_params(strategy: str = "ema_crossover") -> dict:
    db = SessionLocal()
    try:
        rows = db.query(Parameter).filter(Parameter.strategy == strategy).all()
        return {r.key_name: r.value for r in rows}
    finally:
        db.close()


def _load_portfolio() -> dict:
    db = SessionLocal()
    try:
        p = db.get(Portfolio, 1)
        return {
            "capital":          float(p.capital),
            "daily_pnl":        float(p.daily_pnl),
            "daily_loss_halt":  bool(p.daily_loss_halt),
        }
    finally:
        db.close()


def _log_signal(result, risk_pass: bool, risk_reason: str, action: str) -> None:
    snap = result.snap
    db = SessionLocal()
    try:
        db.add(Signal(
            ts           = snap.ts,
            signal_type  = result.signal.value,
            price        = snap.close,
            ema9         = snap.ema9,
            ema21        = snap.ema21,
            rsi14        = snap.rsi14,
            vwap         = snap.vwap,
            vol_ratio    = snap.vol_ratio,
            risk_pass    = int(risk_pass),
            risk_reason  = risk_reason,
            action_taken = action,
            reason       = result.reason,
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("_log_signal failed: %s", exc)
    finally:
        db.close()


def tick() -> None:
    """Single execution cycle. Called every 60 seconds by APScheduler."""
    global _open_position, _prev_snap, _trades_today

    if not _market_open():
        return

    params    = _load_params()
    portfolio = _load_portfolio()

    if portfolio["daily_loss_halt"]:
        logger.warning("Trading halted: daily loss limit reached")
        return

    # 1. Collect market data
    df = collect()
    if df.empty:
        logger.warning("No bars available, skipping tick")
        return

    # 2. Compute indicators
    df, snap = compute(df, params)
    if snap is None:
        return
    persist_indicators(snap)

    # Push live state for dashboard WebSocket
    set_live({
        "ts": snap.ts.isoformat(),
        "close": snap.close, "ema9": snap.ema9, "ema21": snap.ema21,
        "rsi14": snap.rsi14, "vwap": snap.vwap, "vol_ratio": snap.vol_ratio,
        "capital": portfolio["capital"], "daily_pnl": portfolio["daily_pnl"],
        "position": _open_position,
    })

    # 3. Force-flatten before end of session
    if _should_flatten() and _open_position:
        risk = validate_sell(_open_position)
        close_position(_open_position, snap.close, "FLATTEN", params)
        _log_signal(
            type("R", (), {"signal": Sig.SELL, "reason": "FLATTEN", "snap": snap})(),
            risk.approved, risk.reason, "EXECUTED",
        )
        _open_position = None
        _prev_snap = snap
        return

    # 4. Strategy evaluation
    result = evaluate(snap, _prev_snap, _open_position, params)
    _prev_snap = snap

    # 5. Risk validation + execution
    if result.signal == Sig.BUY:
        risk = validate_buy(
            snap.close, portfolio["capital"], portfolio["daily_pnl"],
            _trades_today, params,
        )
        if risk.approved:
            pos = open_position(snap.close, risk.shares, params)
            if pos:
                _open_position = pos
                _trades_today += 1
                _log_signal(result, True, risk.reason, "EXECUTED")
            else:
                _log_signal(result, True, risk.reason, "SKIPPED")
        else:
            _log_signal(result, False, risk.reason, "BLOCKED")

    elif result.signal == Sig.SELL:
        risk = validate_sell(_open_position)
        if risk.approved:
            close_position(_open_position, snap.close, result.reason, params)
            _open_position = None
            _log_signal(result, True, risk.reason, "EXECUTED")
        else:
            _log_signal(result, False, risk.reason, "BLOCKED")

    else:  # HOLD
        _log_signal(result, True, "no trade", "SKIPPED")


def reset_daily_counters() -> None:
    """Called at market open (09:30 ET) by APScheduler."""
    global _trades_today
    _trades_today = 0
    db = SessionLocal()
    try:
        p = db.get(Portfolio, 1)
        p.daily_pnl       = 0
        p.daily_loss_halt = 0
        from datetime import timezone
        p.last_updated = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
    finally:
        db.close()
    logger.info("Daily counters reset")


def run_daily_analysis_job() -> None:
    """Called at 16:05 ET — generates the end-of-day analysis report."""
    logger.info("Running end-of-day analysis...")
    try:
        from analysis.daily_analyzer import run_daily_analysis
        report = run_daily_analysis()
        n_errors = len(report.get("errors", []))
        n_missed = len(report.get("missed_opportunities", []))
        logger.info(
            "Daily analysis done: PnL=%.2f | errors=%d | missed=%d",
            report.get("pnl", {}).get("daily_pnl", 0), n_errors, n_missed,
        )
    except Exception as exc:
        logger.error("Daily analysis job failed: %s", exc, exc_info=True)


def run_optimizer_job() -> None:
    """Called at 16:10 ET — runs parameter grid search and auto-applies if improved."""
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
