"""
Momentum Breakout Strategy.

BUY  when: close breaks above the highest close of the last N bars
           + RSI between rsi_momentum_min (50) and rsi_overbought (70)
           + vol_ratio >= vol_spike_mult (2.0 — requires strong volume surge)
SELL when: profit_target_pct reached (+0.5%)
           stop_loss_pct hit (-0.3%)
           RSI drops below rsi_exit_level (40) — momentum exhausted

Logic: Catches explosive moves when price clears a recent consolidation range
       backed by above-average volume. Avoids chasing already-overbought moves.
"""
import logging
from dataclasses import dataclass
from enum import Enum

import pandas as pd

from indicators.engine import IndicatorSnapshot

logger = logging.getLogger(__name__)


class Signal(str, Enum):
    BUY  = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


@dataclass
class StrategyResult:
    signal: Signal
    reason: str
    snap:   IndicatorSnapshot


def evaluate(
    snap: IndicatorSnapshot,
    prev_snap: IndicatorSnapshot | None,
    open_position: dict | None,
    params: dict,
    df: pd.DataFrame | None = None,
) -> StrategyResult:
    """
    Returns a StrategyResult.
    df: full bar DataFrame — used to compute the N-bar breakout level.
    """
    rsi_ob      = float(params.get("rsi_overbought", 70))
    rsi_min     = float(params.get("rsi_momentum_min", 50))
    rsi_exit    = float(params.get("rsi_exit_level", 40))
    vol_mult    = float(params.get("vol_spike_mult", 2.0))
    profit_tgt  = float(params.get("profit_target_pct", 0.5)) / 100
    stop_loss   = float(params.get("stop_loss_pct", 0.3)) / 100
    win         = int(params.get("breakout_window", 20))

    price = snap.close

    # --- EXIT (evaluated first when position is open) ---
    if open_position:
        entry   = open_position["entry_price"]
        pnl_pct = (price - entry) / entry

        if pnl_pct >= profit_tgt:
            return StrategyResult(Signal.SELL, "TARGET", snap)
        if pnl_pct <= -stop_loss:
            return StrategyResult(Signal.SELL, "STOP_LOSS", snap)
        if snap.rsi14 is not None and snap.rsi14 < rsi_exit:
            return StrategyResult(Signal.SELL, "REVERSAL", snap)

        return StrategyResult(Signal.HOLD, "position open, no exit condition", snap)

    # --- ENTRY ---
    if not _has_indicators(snap):
        return StrategyResult(Signal.HOLD, "indicators not ready", snap)

    # Compute the N-bar high from the df (excluding the current bar)
    breakout_level = None
    if df is not None and len(df) > win:
        # Take the window bars before the last one
        recent_closes = df["close"].iloc[-(win + 1):-1]
        breakout_level = float(recent_closes.max())

    if breakout_level is None:
        return StrategyResult(Signal.HOLD, "not enough bars for breakout level", snap)

    if (price > breakout_level
            and rsi_min <= snap.rsi14 < rsi_ob
            and snap.vol_ratio >= vol_mult):
        return StrategyResult(
            Signal.BUY,
            f"breakout above {breakout_level:.2f} + RSI {snap.rsi14:.1f} + vol {snap.vol_ratio:.2f}x",
            snap,
        )

    return StrategyResult(Signal.HOLD, "no entry condition met", snap)


def _has_indicators(snap: IndicatorSnapshot) -> bool:
    return all(v is not None for v in [snap.rsi14, snap.vol_ratio])
