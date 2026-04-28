"""
Historical data downloader for backtesting.

Downloads up to 60 days of 5-minute TSLA bars from yfinance (free, no API key).
Filters to NYSE market hours only (09:30–16:00 ET).
Saves to CSV in backend/data/historical/ for offline reuse.

Usage:
    python -m data.historical              # download and save
    python -m data.historical --show       # download, save, and print summary
"""
import argparse
import logging
import os
from datetime import datetime, timedelta, timezone

import pandas as pd
import pytz
import yfinance as yf

logger = logging.getLogger(__name__)

TICKER      = "TSLA"
INTERVAL    = "5m"          # 5-minute bars (60-day max on yfinance free tier)
DAYS_BACK   = 60            # maximum available for 5m interval
MARKET_OPEN = "09:30"
MARKET_CLOSE= "16:00"
ET          = pytz.timezone("America/New_York")

# Directory where CSVs are saved (relative to this file)
DATA_DIR = os.path.join(os.path.dirname(__file__), "historical")


def download_bars(days_back: int = DAYS_BACK) -> pd.DataFrame:
    """
    Download 5-minute OHLCV bars for TSLA going back `days_back` days.
    Returns a DataFrame with columns [open, high, low, close, volume]
    and a UTC-naive DatetimeIndex, filtered to market hours only.
    """
    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=days_back)

    logger.info("Downloading %s %s bars (last %d days) …",
                TICKER, INTERVAL, days_back)

    try:
        ticker = yf.Ticker(TICKER)
        # Use period= instead of start/end — yfinance 5m data requires this
        # to stay within the rolling 60-day window it enforces
        df = ticker.history(
            period=f"{days_back}d",
            interval=INTERVAL,
            auto_adjust=True,
        )
    except Exception as exc:
        logger.error("yfinance download failed: %s", exc)
        return pd.DataFrame()

    if df.empty:
        logger.warning("yfinance returned empty DataFrame")
        return pd.DataFrame()

    # Normalize index to UTC-naive
    df.index = pd.to_datetime(df.index)
    if df.index.tzinfo is not None:
        df.index = df.index.tz_convert("UTC").tz_localize(None)

    # Rename columns to lowercase
    df.rename(columns={
        "Open": "open", "High": "high", "Low": "low",
        "Close": "close", "Volume": "volume",
    }, inplace=True)
    df = df[["open", "high", "low", "close", "volume"]]

    # Drop bars with zero volume (still-forming bars)
    df = df[df["volume"] > 0]

    # Filter to market hours only (09:30–16:00 ET, Mon–Fri)
    df = _filter_market_hours(df)

    logger.info("Downloaded %d bars over %d trading days",
                len(df), df.index.normalize().nunique())
    return df


def _filter_market_hours(df: pd.DataFrame) -> pd.DataFrame:
    """Keep only bars that fall within 09:30–16:00 ET on weekdays."""
    if df.empty:
        return df

    # Convert UTC-naive index → ET for filtering, then back
    utc_index  = df.index.tz_localize("UTC")
    et_index   = utc_index.tz_convert(ET)

    time_mask  = (
        (et_index.time >= pd.Timestamp(MARKET_OPEN).time()) &
        (et_index.time <  pd.Timestamp(MARKET_CLOSE).time())
    )
    weekday_mask = et_index.weekday < 5   # Mon=0 … Fri=4

    return df[time_mask & weekday_mask]


def save_csv(df: pd.DataFrame, path: str | None = None) -> str:
    """Save DataFrame to CSV. Returns the file path used."""
    os.makedirs(DATA_DIR, exist_ok=True)
    if path is None:
        today = datetime.now().strftime("%Y%m%d")
        path  = os.path.join(DATA_DIR, f"tsla_5m_{today}.csv")

    df.to_csv(path, index=True, index_label="ts")
    logger.info("Saved %d bars to %s", len(df), path)
    return path


def load_csv(path: str) -> pd.DataFrame:
    """Load a previously saved CSV back into a DataFrame."""
    df = pd.read_csv(path, index_col="ts", parse_dates=["ts"])
    df.index = pd.to_datetime(df.index)
    # Ensure UTC-naive index
    if df.index.tzinfo is not None:
        df.index = df.index.tz_convert("UTC").tz_localize(None)
    return df


def load_latest() -> pd.DataFrame:
    """
    Load the most recently saved historical CSV.
    Downloads fresh data if no CSV exists yet.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    csvs = sorted([
        f for f in os.listdir(DATA_DIR) if f.endswith(".csv")
    ])
    if not csvs:
        logger.info("No cached CSV found — downloading fresh data")
        df = download_bars()
        save_csv(df)
        return df

    latest = os.path.join(DATA_DIR, csvs[-1])
    logger.info("Loading cached data from %s", latest)
    return load_csv(latest)


def print_summary(df: pd.DataFrame) -> None:
    """Print a human-readable summary of the downloaded data."""
    if df.empty:
        print("No data available.")
        return

    et_index   = df.index.tz_localize("UTC").tz_convert(ET)
    days       = df.index.normalize().nunique()
    first_bar  = et_index[0].strftime("%Y-%m-%d %H:%M ET")
    last_bar   = et_index[-1].strftime("%Y-%m-%d %H:%M ET")
    bars_day   = len(df) / days if days > 0 else 0

    print("\n" + "=" * 55)
    print(f"  TSLA historical data — {INTERVAL} bars")
    print("=" * 55)
    print(f"  Period:        {first_bar}  →  {last_bar}")
    print(f"  Trading days:  {days}")
    print(f"  Total bars:    {len(df):,}  (~{bars_day:.0f} per day)")
    print(f"  Price range:   ${df['close'].min():.2f}  –  ${df['close'].max():.2f}")
    print(f"  Avg volume:    {df['volume'].mean():,.0f} shares/bar")
    print("=" * 55 + "\n")


# ── CLI entry point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Download historical TSLA bars")
    parser.add_argument("--days",  type=int, default=DAYS_BACK,
                        help=f"Days of history to download (max {DAYS_BACK})")
    parser.add_argument("--show",  action="store_true",
                        help="Print summary after downloading")
    parser.add_argument("--force", action="store_true",
                        help="Re-download even if a CSV already exists today")
    args = parser.parse_args()

    # Check if today's CSV already exists (unless --force)
    today_file = os.path.join(DATA_DIR, f"tsla_5m_{datetime.now().strftime('%Y%m%d')}.csv")
    if not args.force and os.path.exists(today_file):
        print(f"Today's CSV already exists: {today_file}")
        print("Use --force to re-download.")
        df = load_csv(today_file)
    else:
        df = download_bars(days_back=args.days)
        if not df.empty:
            save_csv(df, today_file)

    if args.show:
        print_summary(df)
