"""
Computes EMA, RSI, VWAP, and volume ratio on a DataFrame of 1-min bars.
Also persists the latest indicator values back to the bars table.
"""
import logging
from dataclasses import dataclass

import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator
from ta.volume import VolumeWeightedAveragePrice
from sqlalchemy import update

from db.connection import SessionLocal
from db.models import Bar

logger = logging.getLogger(__name__)


@dataclass
class IndicatorSnapshot:
    ts:        object
    close:     float
    ema9:      float | None
    ema21:     float | None
    rsi14:     float | None
    vwap:      float | None
    vol_ratio: float | None


def compute(df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, IndicatorSnapshot | None]:
    if df.empty or len(df) < 2:
        return df, None

    fast      = int(params.get("ema_fast", 9))
    slow      = int(params.get("ema_slow", 21))
    rsi_p     = int(params.get("rsi_period", 14))
    vol_window = 20

    df["ema9"]  = EMAIndicator(close=df["close"], window=fast).ema_indicator()
    df["ema21"] = EMAIndicator(close=df["close"], window=slow).ema_indicator()
    df["rsi14"] = RSIIndicator(close=df["close"], window=rsi_p).rsi()

    df["vwap"] = VolumeWeightedAveragePrice(
        high=df["high"], low=df["low"], close=df["close"], volume=df["volume"]
    ).volume_weighted_average_price()

    df["vol_avg"]   = df["volume"].rolling(vol_window).mean()
    df["vol_ratio"] = df["volume"] / df["vol_avg"]

    latest = df.iloc[-1]
    snap = IndicatorSnapshot(
        ts        = df.index[-1],
        close     = float(latest["close"]),
        ema9      = _safe(latest.get("ema9")),
        ema21     = _safe(latest.get("ema21")),
        rsi14     = _safe(latest.get("rsi14")),
        vwap      = _safe(latest.get("vwap")),
        vol_ratio = _safe(latest.get("vol_ratio")),
    )
    return df, snap


def persist_indicators(snap: IndicatorSnapshot) -> None:
    if snap is None:
        return
    db = SessionLocal()
    try:
        db.execute(
            update(Bar)
            .where(Bar.ts == snap.ts)
            .values(
                ema9=snap.ema9,
                ema21=snap.ema21,
                rsi14=snap.rsi14,
                vwap=snap.vwap,
                vol_ratio=snap.vol_ratio,
            )
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("persist_indicators failed: %s", exc)
    finally:
        db.close()


def _safe(val) -> float | None:
    try:
        f = float(val)
        return None if pd.isna(f) else f
    except (TypeError, ValueError):
        return None
