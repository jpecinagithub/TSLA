"""
Fetches 1-minute TSLA bars from Alpaca Markets API, persists to MySQL.

Replaces yfinance (which suffered frequent 429 rate-limiting on cloud IPs).
Alpaca provides a stable, official REST API with generous rate limits.

Fallback chain:
  1. Alpaca API  → fresh bars
  2. DB cache    → last 390 bars from MySQL if Alpaca is unavailable
"""
import logging
from datetime import datetime, timedelta, timezone

import pandas as pd
from sqlalchemy.dialects.mysql import insert

from config import ALPACA_API_KEY, ALPACA_SECRET_KEY, TICKER
from db.connection import SessionLocal
from db.models import Bar
from sqlalchemy import text

logger = logging.getLogger(__name__)


def _get_client():
    """Create and return an Alpaca StockHistoricalDataClient."""
    from alpaca.data import StockHistoricalDataClient
    return StockHistoricalDataClient(
        api_key=ALPACA_API_KEY,
        secret_key=ALPACA_SECRET_KEY,
    )


def fetch_latest_bars() -> pd.DataFrame:
    """
    Download the last ~390 1-minute bars for TSLA from Alpaca.
    Returns a DataFrame with columns: open, high, low, close, volume.
    Index is naive UTC datetime.
    """
    try:
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame

        client = _get_client()

        # Request the last 7 hours of 1-minute bars (covers pre/post market + full session)
        end   = datetime.now(timezone.utc)
        start = end - timedelta(hours=7)

        request = StockBarsRequest(
            symbol_or_symbols=TICKER,
            timeframe=TimeFrame.Minute,
            start=start,
            end=end,
            feed="iex",          # IEX feed — free tier, no subscription needed
        )

        bars = client.get_stock_bars(request)
        df   = bars.df

        if df.empty:
            logger.warning("Alpaca returned empty DataFrame")
            return pd.DataFrame()

        # bars.df has a MultiIndex (symbol, timestamp) — drop the symbol level
        if isinstance(df.index, pd.MultiIndex):
            df = df.xs(TICKER, level="symbol")

        # Index is tz-aware UTC — convert to naive UTC
        if df.index.tzinfo is not None:
            df.index = df.index.tz_convert("UTC").tz_localize(None)

        # Rename columns to match the rest of the system
        df = df.rename(columns={
            "open": "open", "high": "high", "low": "low",
            "close": "close", "volume": "volume",
        })
        df = df[["open", "high", "low", "close", "volume"]]

        # Drop the last bar if it's still forming (volume = 0)
        if len(df) > 1 and df["volume"].iloc[-1] == 0:
            df = df.iloc[:-1]

        logger.info("Alpaca: fetched %d bars. Latest close: %.4f",
                    len(df), df["close"].iloc[-1])
        return df

    except Exception as exc:
        logger.error("fetch_latest_bars (Alpaca) failed: %s", exc)
        return pd.DataFrame()


def load_bars_from_db(limit: int = 390) -> pd.DataFrame:
    """
    Fallback: load the most recent bars from MySQL when Alpaca is unavailable.
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

        logger.warning("DB fallback: loaded %d bars (latest close: %.4f)",
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
    Full collection cycle: fetch from Alpaca → persist to DB → return DataFrame.
    Falls back to DB cache if Alpaca is unavailable.
    """
    df = fetch_latest_bars()

    if df.empty:
        logger.warning("Alpaca unavailable — using DB fallback for this tick")
        return load_bars_from_db()

    persist_bars(df)
    return df
