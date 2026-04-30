"""
Fetches 1-minute TSLA bars from yfinance, persists to MySQL.

Rate-limit resilience:
  - Random User-Agent headers to avoid fingerprinting
  - Exponential backoff on 429 / empty responses (up to 3 retries)
  - DB fallback: if yfinance fails entirely, load last 390 bars from DB
    so agents keep running on cached data rather than skipping the tick.
"""
import logging
import random
import time
from datetime import datetime, timezone

import pandas as pd
import requests
import yfinance as yf
from sqlalchemy import text
from sqlalchemy.dialects.mysql import insert

from config import TICKER
from db.connection import SessionLocal
from db.models import Bar

logger = logging.getLogger(__name__)

# Rotate User-Agents to reduce chance of server-side fingerprinting/blocking
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
]


def _make_session() -> requests.Session:
    """Create a requests session with a random browser User-Agent."""
    s = requests.Session()
    s.headers.update({"User-Agent": random.choice(_USER_AGENTS)})
    return s


def fetch_latest_bars(period: str = "1d", retries: int = 3) -> pd.DataFrame:
    """
    Download 1-min bars from Yahoo Finance.
    Retries up to `retries` times with exponential backoff on failure.
    Returns empty DataFrame only if all attempts fail.
    """
    delay = 5  # seconds — doubles each retry
    for attempt in range(1, retries + 1):
        try:
            session = _make_session()
            ticker  = yf.Ticker(TICKER, session=session)
            df = ticker.history(period=period, interval="1m", auto_adjust=True)

            if df.empty:
                logger.warning("yfinance returned empty DataFrame (attempt %d/%d)", attempt, retries)
                if attempt < retries:
                    time.sleep(delay)
                    delay *= 2
                continue

            df.index = pd.to_datetime(df.index)
            if df.index.tzinfo is not None:
                df.index = df.index.tz_convert("UTC").tz_localize(None)
            df.rename(columns={
                "Open": "open", "High": "high", "Low": "low",
                "Close": "close", "Volume": "volume"
            }, inplace=True)
            df = df[["open", "high", "low", "close", "volume"]]
            # Drop the last bar if still forming (volume = 0)
            if len(df) > 1 and df["volume"].iloc[-1] == 0:
                df = df.iloc[:-1]
            return df

        except Exception as exc:
            logger.warning("fetch_latest_bars attempt %d/%d failed: %s", attempt, retries, exc)
            if attempt < retries:
                time.sleep(delay)
                delay *= 2

    logger.error("fetch_latest_bars: all %d attempts failed", retries)
    return pd.DataFrame()


def load_bars_from_db(limit: int = 390) -> pd.DataFrame:
    """
    Fallback: load the most recent bars from MySQL when yfinance is unavailable.
    Returns a DataFrame in the same format as fetch_latest_bars().
    """
    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT ts, open, high, low, close, volume
            FROM bars ORDER BY ts DESC LIMIT :limit
        """), {"limit": limit}).fetchall()
        if not rows:
            return pd.DataFrame()
        rows = list(reversed(rows))
        df = pd.DataFrame([{
            "open":   float(r.open),  "high":  float(r.high),
            "low":    float(r.low),   "close": float(r.close),
            "volume": int(r.volume),
        } for r in rows], index=[r.ts for r in rows])
        df.index.name = None
        logger.info("DB fallback: loaded %d bars (latest close: %.4f)",
                    len(df), df["close"].iloc[-1])
        return df
    except Exception as exc:
        logger.error("load_bars_from_db failed: %s", exc)
        return pd.DataFrame()
    finally:
        db.close()


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
    """
    Full collection cycle: fetch from yfinance → persist to DB → return DataFrame.
    Falls back to DB data if yfinance is unavailable (rate-limited, network issue, etc.)
    """
    df = fetch_latest_bars()

    if df.empty:
        # Yahoo Finance unavailable — use cached DB bars so agents keep running
        logger.warning("yfinance unavailable — using DB fallback for this tick")
        df = load_bars_from_db()
        # Don't persist (data is already in DB)
        return df

    persist_bars(df)
    logger.info("Collected %d bars. Latest close: %.4f", len(df), df["close"].iloc[-1])
    return df
