"""
EMA Crossover Strategy (Phase 1 MVP).

BUY  when: EMA9 crosses above EMA21, RSI < overbought, volume spike
SELL when: profit target, stop loss, or EMA cross reversal
"""
import logging
from dataclasses import dataclass
from enum import Enum

from indicators.engine import IndicatorSnapshot

logger = logging.getLogger(__name__)


class Signal(str, Enum):
    BUY  = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


@dataclass
class StrategyResult:
    signal:    Signal
    reason:    str
    snap:      IndicatorSnapshot


def evaluate(
    snap: IndicatorSnapshot,
    prev_snap: IndicatorSnapshot | None,
    open_position: dict | None,
    params: dict,
    df=None,          # unused — kept for uniform interface with other strategies
) -> StrategyResult:
    """
    Returns a StrategyResult.
    open_position: {"entry_price": float, "shares": float} or None
    """
    rsi_ob      = float(params.get("rsi_overbought", 70))
    vol_mult    = float(params.get("vol_spike_mult", 1.5))
    profit_tgt  = float(params.get("profit_target_pct", 0.5)) / 100
    stop_loss   = float(params.get("stop_loss_pct", 0.3)) / 100

    price = snap.close

    # --- EXIT logic (evaluated first if position is open) ---
    if open_position:
        entry = open_position["entry_price"]
        pnl_pct = (price - entry) / entry

        if pnl_pct >= profit_tgt:
            return StrategyResult(Signal.SELL, "TARGET", snap)

        if pnl_pct <= -stop_loss:
            return StrategyResult(Signal.SELL, "STOP_LOSS", snap)

        # EMA reversal: fast crosses back below slow
        if _ema_cross_down(snap, prev_snap):
            return StrategyResult(Signal.SELL, "REVERSAL", snap)

        return StrategyResult(Signal.HOLD, "position open, no exit condition", snap)

    # --- ENTRY logic (no open position) ---
    if not _has_indicators(snap):
        return StrategyResult(Signal.HOLD, "indicators not ready", snap)

    if _ema_cross_up(snap, prev_snap) \
            and snap.rsi14 < rsi_ob \
            and snap.vol_ratio is not None \
            and snap.vol_ratio >= vol_mult:
        return StrategyResult(Signal.BUY, "EMA crossup + RSI ok + volume spike", snap)

    return StrategyResult(Signal.HOLD, "no entry condition met", snap)


# --- helpers ---

def _ema_cross_up(snap: IndicatorSnapshot, prev: IndicatorSnapshot | None) -> bool:
    if prev is None or snap.ema9 is None or snap.ema21 is None:
        return False
    if prev.ema9 is None or prev.ema21 is None:
        return False
    return prev.ema9 <= prev.ema21 and snap.ema9 > snap.ema21


def _ema_cross_down(snap: IndicatorSnapshot, prev: IndicatorSnapshot | None) -> bool:
    if prev is None or snap.ema9 is None or snap.ema21 is None:
        return False
    if prev.ema9 is None or prev.ema21 is None:
        return False
    return prev.ema9 >= prev.ema21 and snap.ema9 < snap.ema21


def _has_indicators(snap: IndicatorSnapshot) -> bool:
    return all(v is not None for v in [snap.ema9, snap.ema21, snap.rsi14, snap.vol_ratio])
