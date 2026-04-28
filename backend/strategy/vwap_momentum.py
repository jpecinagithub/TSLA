"""
VWAP + Momentum Strategy.

BUY  when: close crosses above VWAP (prev bar was at or below VWAP)
           + RSI between rsi_momentum_min (45) and rsi_overbought (65)
           + vol_ratio >= vol_spike_mult (1.5)
SELL when: profit_target_pct reached (+0.5%)
           stop_loss_pct hit (-0.3%)
           close drops more than vwap_exit_buffer% below VWAP (price rejected)

Logic: VWAP is the institutional fair-value anchor. A cross above VWAP with
       rising RSI and above-average volume signals a shift in intraday bias
       from bearish/neutral to bullish. Exit immediately if price is rejected
       back below VWAP — the thesis is invalidated.
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
    df: pd.DataFrame | None = None,   # unused — kept for uniform interface
) -> StrategyResult:
    """
    Returns a StrategyResult.
    prev_snap is used to detect the VWAP cross (prev close ≤ VWAP, current close > VWAP).
    """
    rsi_ob      = float(params.get("rsi_overbought", 65))
    rsi_min     = float(params.get("rsi_momentum_min", 45))
    vol_mult    = float(params.get("vol_spike_mult", 1.5))
    profit_tgt  = float(params.get("profit_target_pct", 0.5)) / 100
    stop_loss   = float(params.get("stop_loss_pct", 0.3)) / 100
    # % below VWAP that triggers an exit (e.g. 0.1 → exit if price < VWAP * 0.999)
    vwap_buf    = float(params.get("vwap_exit_buffer", 0.1)) / 100

    price = snap.close
    vwap  = snap.vwap

    # --- EXIT ---
    if open_position:
        entry   = open_position["entry_price"]
        pnl_pct = (price - entry) / entry

        if pnl_pct >= profit_tgt:
            return StrategyResult(Signal.SELL, "TARGET", snap)
        if pnl_pct <= -stop_loss:
            return StrategyResult(Signal.SELL, "STOP_LOSS", snap)
        # VWAP rejection: price drops below VWAP by buffer amount
        if vwap is not None and price < vwap * (1 - vwap_buf):
            return StrategyResult(Signal.SELL, "REVERSAL", snap)

        return StrategyResult(Signal.HOLD, "position open, no exit condition", snap)

    # --- ENTRY ---
    if not _has_indicators(snap):
        return StrategyResult(Signal.HOLD, "indicators not ready", snap)

    if vwap is None:
        return StrategyResult(Signal.HOLD, "VWAP not available", snap)

    vwap_cross = _vwap_cross_up(snap, prev_snap)

    if (vwap_cross
            and rsi_min <= snap.rsi14 < rsi_ob
            and snap.vol_ratio >= vol_mult):
        return StrategyResult(
            Signal.BUY,
            f"VWAP crossup {vwap:.2f} + RSI {snap.rsi14:.1f} + vol {snap.vol_ratio:.2f}x",
            snap,
        )

    return StrategyResult(Signal.HOLD, "no entry condition met", snap)


# --- helpers ---

def _vwap_cross_up(snap: IndicatorSnapshot, prev: IndicatorSnapshot | None) -> bool:
    """True when price crossed above VWAP this bar (was at/below VWAP last bar)."""
    if prev is None or snap.vwap is None or prev.vwap is None:
        return False
    return prev.close <= prev.vwap and snap.close > snap.vwap


def _has_indicators(snap: IndicatorSnapshot) -> bool:
    return all(v is not None for v in [snap.rsi14, snap.vol_ratio, snap.vwap])
