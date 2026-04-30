"""
Learning API — serves regime and learning metrics to the dashboard.

GET /api/learning/status   → current regime + learning verdict + latest snapshot
GET /api/learning/history  → all weekly snapshots
GET /api/learning/regime   → current regime only (live)
"""
import logging
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Query

from learning.regime  import detect as detect_regime, recommended_strategy
from learning.metrics import get_all_snapshots, learning_verdict, compute_week

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/learning", tags=["learning"])


@router.get("/regime")
def get_regime():
    """Detect and return current market regime."""
    snap = detect_regime()
    if snap is None:
        return {"regime": "UNKNOWN", "confidence": "LOW", "adx": None,
                "ema50": None, "price": None, "recommended_strategy": None}
    return {
        "regime":               snap.regime,
        "confidence":           snap.confidence,
        "adx":                  round(snap.adx, 2) if snap.adx else None,
        "ema50":                round(snap.ema50, 2) if snap.ema50 else None,
        "price":                round(snap.price, 2),
        "recommended_strategy": recommended_strategy(snap.regime),
        "ts":                   snap.ts.isoformat(),
    }


@router.get("/history")
def get_history():
    """Return all weekly learning snapshots."""
    snapshots = get_all_snapshots()
    return {
        "snapshots": [_format_snap(s) for s in snapshots],
        "verdict":   learning_verdict(snapshots),
    }


@router.get("/status")
def get_status(strategy: Optional[str] = Query(default=None, description="Filter by strategy (e.g. 'adaptive'). Omit for all combined.")):
    """Full status: regime + verdict + current week preview + history.

    Pass ?strategy=adaptive to get metrics filtered to the adaptive agent only.
    """
    # Current regime (always global — regime is market state, not strategy)
    regime_snap = detect_regime()

    # Historical snapshots + verdict (from persisted learning_snapshots table)
    snapshots   = get_all_snapshots()
    verdict     = learning_verdict(snapshots)

    # Current week (live preview, filtered by strategy if requested)
    today       = date.today()
    week_start  = today - timedelta(days=today.weekday())
    current_wk  = compute_week(week_start, strategy=strategy)

    return {
        "regime":       _format_regime(regime_snap),
        "verdict":      verdict,
        "current_week": _format_snap(current_wk) if current_wk else None,
        "snapshots":    [_format_snap(s) for s in snapshots],
        "strategy_filter": strategy or "all",
    }


# ── Formatters ────────────────────────────────────────────────────────────────

def _format_regime(snap) -> dict:
    if snap is None:
        return {"regime": "UNKNOWN", "confidence": "LOW"}
    return {
        "regime":               snap.regime,
        "confidence":           snap.confidence,
        "adx":                  round(snap.adx, 2) if snap.adx else None,
        "ema50":                round(snap.ema50, 2) if snap.ema50 else None,
        "price":                round(snap.price, 2),
        "recommended_strategy": recommended_strategy(snap.regime),
        "ts":                   snap.ts.isoformat(),
    }


def _format_snap(s: dict | None) -> dict | None:
    if s is None:
        return None
    return {
        "week_start":       str(s["week_start"]),
        "total_trades":     s["total_trades"],
        "win_rate":         float(s["win_rate"]) if s["win_rate"] is not None else None,
        "profit_factor":    float(s["profit_factor"]) if s["profit_factor"] is not None else None,
        "expectancy":       float(s["expectancy"]) if s["expectancy"] is not None else None,
        "avg_hold_minutes": float(s["avg_hold_minutes"]) if s["avg_hold_minutes"] is not None else None,
        "agent_pnl":        float(s["agent_pnl"]) if s["agent_pnl"] is not None else None,
        "bnh_pnl":          float(s["bnh_pnl"]) if s["bnh_pnl"] is not None else None,
        "alpha":            float(s["alpha"]) if s["alpha"] is not None else None,
        "regime_at_week":   s["regime_at_week"],
    }
