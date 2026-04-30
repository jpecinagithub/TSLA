"""
Market Regime Detector.

Classifies the current TSLA market into one of three states:
  TRENDING_UP   — ADX > 25 and price above EMA50
  TRENDING_DOWN — ADX > 25 and price below EMA50
  RANGING       — ADX <= 25 (no clear trend)

Uses the last 100 bars from the DB (1-min bars → ~100 minutes of data).
ADX is computed with a 14-period window using the `ta` library.
EMA50 uses a 50-period window.

The regime determines which strategy the adaptive agent should use
and is logged to regime_log every time it changes.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import pandas as pd
from ta.trend import ADXIndicator, EMAIndicator

from db.connection import SessionLocal
from db.models     import Bar

logger = logging.getLogger(__name__)

ADX_TREND_THRESHOLD = 25.0   # ADX above this = trending market
EMA_WINDOW          = 50
ADX_WINDOW          = 14
MIN_BARS            = 60      # need at least this many bars to compute


@dataclass
class RegimeSnapshot:
    regime:     str            # TRENDING_UP | TRENDING_DOWN | RANGING
    adx:        float | None
    ema50:      float | None
    price:      float
    confidence: str            # HIGH | MEDIUM | LOW
    ts:         datetime


def detect(df: pd.DataFrame | None = None) -> RegimeSnapshot | None:
    """
    Detect current market regime.
    Accepts an optional DataFrame (for testing); otherwise loads from DB.
    Returns None if insufficient data.
    """
    if df is None:
        df = _load_bars()
    if df is None or len(df) < MIN_BARS:
        logger.warning("Regime detector: insufficient bars (%d)", len(df) if df is not None else 0)
        return None

    try:
        # EMA50
        ema50_series = EMAIndicator(close=df["close"], window=EMA_WINDOW, fillna=False).ema_indicator()
        ema50 = float(ema50_series.iloc[-1]) if not pd.isna(ema50_series.iloc[-1]) else None

        # ADX (requires high, low, close)
        adx_ind = ADXIndicator(
            high=df["high"], low=df["low"], close=df["close"],
            window=ADX_WINDOW, fillna=False
        )
        adx_val = adx_ind.adx().iloc[-1]
        adx = float(adx_val) if not pd.isna(adx_val) else None

        price = float(df["close"].iloc[-1])
        ts    = datetime.now(timezone.utc).replace(tzinfo=None)

        # Classify
        if adx is None or ema50 is None:
            regime = "RANGING"
            confidence = "LOW"
        elif adx > ADX_TREND_THRESHOLD:
            regime     = "TRENDING_UP" if price > ema50 else "TRENDING_DOWN"
            confidence = "HIGH" if adx > 35 else "MEDIUM"
        else:
            regime     = "RANGING"
            confidence = "HIGH" if adx < 15 else "MEDIUM"

        snap = RegimeSnapshot(
            regime=regime, adx=adx, ema50=ema50,
            price=price, confidence=confidence, ts=ts,
        )
        logger.info("Regime: %s | ADX: %.1f | EMA50: %.2f | Price: %.2f | Conf: %s",
                    regime, adx or 0, ema50 or 0, price, confidence)
        return snap

    except Exception as exc:
        logger.error("Regime detection failed: %s", exc)
        return None


def persist(snap: RegimeSnapshot) -> None:
    """Save regime snapshot to regime_log table."""
    db = SessionLocal()
    try:
        db.execute(
            __import__("sqlalchemy").text(
                "INSERT INTO regime_log (ts, regime, adx, ema50, price, confidence) "
                "VALUES (:ts, :regime, :adx, :ema50, :price, :confidence)"
            ),
            {
                "ts":         snap.ts,
                "regime":     snap.regime,
                "adx":        snap.adx,
                "ema50":      snap.ema50,
                "price":      snap.price,
                "confidence": snap.confidence,
            }
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("persist regime failed: %s", exc)
    finally:
        db.close()


def _load_bars(limit: int = 150) -> pd.DataFrame | None:
    """Load recent bars from the DB."""
    db = SessionLocal()
    try:
        rows = db.query(Bar).order_by(Bar.ts.desc()).limit(limit).all()
        if not rows:
            return None
        rows.reverse()
        df = pd.DataFrame([{
            "ts":     r.ts, "open":  float(r.open),
            "high":   float(r.high), "low":   float(r.low),
            "close":  float(r.close), "volume": int(r.volume),
        } for r in rows])
        df.set_index("ts", inplace=True)
        return df
    except Exception as exc:
        logger.error("_load_bars failed: %s", exc)
        return None
    finally:
        db.close()


# ── Strategy recommendation per regime ───────────────────────────────────────

REGIME_STRATEGY: dict[str, str | None] = {
    "TRENDING_UP":   "ema_crossover",    # momentum follows trend
    "TRENDING_DOWN": None,               # no long strategy — sit out
    "RANGING":       "vwap_momentum",    # VWAP works better in tight ranges
}

def recommended_strategy(regime: str) -> str | None:
    return REGIME_STRATEGY.get(regime)
