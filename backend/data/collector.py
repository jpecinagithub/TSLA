"""
Fetches 1-minute TSLA bars from yfinance, persists to MySQL and Redis.
Keeps the last 390 bars in Redis (one full trading day).
"""
import logging
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf
from sqlalchemy.dialects.mysql import insert

from config import TICKER
from db.connection import SessionLocal
from db.models import Bar

logger = logging.getLogger(__name__)


def _to_utc(ts) -> datetime:
    if hasattr(ts, "tzinfo") and ts.tzinfo is not None:
        return ts.astimezone(timezone.utc).replace(tzinfo=None)
    return ts


def fetch_latest_bars(period: str = "1d") -> pd.DataFrame:
    """Download 1-min bars for today. Returns empty DataFrame on failure."""
    try:
        ticker = yf.Ticker(TICKER)
        df = ticker.history(period=period, interval="1m", auto_adjust=True)
        if df.empty:
            logger.warning("yfinance returned empty DataFrame")
            return df
        df.index = pd.to_datetime(df.index)
        df.index = df.index.map(_to_utc)
        df.rename(columns={
            "Open": "open", "High": "high", "Low": "low",
            "Close": "close", "Volume": "volume"
        }, inplace=True)
        return df[["open", "high", "low", "close", "volume"]]
    except Exception as exc:
        logger.error("fetch_latest_bars failed: %s", exc)
        return pd.DataFrame()


def persist_bars(df: pd.DataFrame) -> None:
    """Upsert bars into MySQL. Skips rows that already exist (ON DUPLICATE KEY)."""
    if df.empty:
        return
    db = SessionLocal()
    try:
        for ts, row in df.iterrows():
            stmt = insert(Bar).values(
                ts=ts,
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=int(row["volume"]),
            ).on_duplicate_key_update(
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=int(row["volume"]),
            )
            db.execute(stmt)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("persist_bars failed: %s", exc)
    finally:
        db.close()


def collect() -> pd.DataFrame:
    """Full collection cycle: fetch → persist. Returns the DataFrame."""
    df = fetch_latest_bars()
    persist_bars(df)
    if not df.empty:
        logger.info("Collected %d bars. Latest close: %.4f", len(df), df["close"].iloc[-1])
    return df
