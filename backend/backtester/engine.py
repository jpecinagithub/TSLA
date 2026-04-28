"""
Backtesting engine — Phase 2.

Replays historical 5-minute TSLA bars through any strategy module,
simulating the exact same logic used by the live TradingAgent:
  - Same indicator computation (EMA, RSI, vol_ratio)
  - VWAP reset per trading day (critical correctness fix vs. live engine)
  - Same risk manager (validate_buy / validate_sell)
  - Same paper broker math (slippage, PnL)
  - Daily counter reset at 09:30 ET
  - Force-close any open position at 15:55 ET

No database writes — all state is kept in memory. Runs in seconds.

Usage:
    from backtester.engine import BacktestEngine
    from data.historical import load_latest
    import strategy.ema_crossover as strat

    df     = load_latest()
    params = {"rsi_overbought": 70, "vol_spike_mult": 1.5, ...}
    result = BacktestEngine.run(df, strat, params, strategy_name="ema_crossover")
    result.print_summary()
"""
from __future__ import annotations

import logging
import math
import types
from dataclasses import dataclass, field
from datetime import time

import numpy as np
import pandas as pd
import pytz
from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator
from ta.volume import VolumeWeightedAveragePrice

from indicators.engine import IndicatorSnapshot

logger = logging.getLogger(__name__)

ET              = pytz.timezone("America/New_York")
FORCE_CLOSE_ET  = time(15, 55)   # flatten before this time
MARKET_OPEN_ET  = time(9, 30)
SLIPPAGE_PCT    = 0.05 / 100     # default, overridden by params


# ── Result dataclasses ────────────────────────────────────────────────────────

@dataclass
class BacktestTrade:
    entry_ts:    pd.Timestamp
    exit_ts:     pd.Timestamp
    entry_price: float
    exit_price:  float
    shares:      float
    gross_pnl:   float
    slippage:    float
    net_pnl:     float
    exit_reason: str


@dataclass
class BacktestResult:
    strategy:      str
    params:        dict
    trades:        list[BacktestTrade]
    equity_curve:  list[dict]          # [{ts, capital, pnl}]

    # Performance metrics (computed by _compute_metrics)
    total_trades:   int   = 0
    winning_trades: int   = 0
    losing_trades:  int   = 0
    win_rate:       float = 0.0
    profit_factor:  float | None = None
    avg_win:        float = 0.0
    avg_loss:       float = 0.0
    total_pnl:      float = 0.0
    max_drawdown:   float = 0.0        # worst peak-to-trough in $
    max_drawdown_pct: float = 0.0      # same in %
    sharpe_ratio:   float | None = None
    initial_capital: float = 5_000.0
    final_capital:   float = 5_000.0

    def print_summary(self) -> None:
        sep = "=" * 55
        pf  = f"{self.profit_factor:.2f}" if self.profit_factor is not None else "N/A"
        sr  = f"{self.sharpe_ratio:.2f}"  if self.sharpe_ratio  is not None else "N/A"
        print(f"\n{sep}")
        print(f"  Backtest: {self.strategy.upper()}")
        print(sep)
        print(f"  Total trades:    {self.total_trades}")
        print(f"  Win rate:        {self.win_rate:.1f}%  "
              f"({self.winning_trades}W / {self.losing_trades}L)")
        print(f"  Profit factor:   {pf}")
        print(f"  Avg win:         ${self.avg_win:.2f}")
        print(f"  Avg loss:        ${self.avg_loss:.2f}")
        print(f"  Total PnL:       ${self.total_pnl:+.2f}")
        print(f"  Max drawdown:    ${self.max_drawdown:.2f} ({self.max_drawdown_pct:.1f}%)")
        print(f"  Sharpe ratio:    {sr}")
        print(f"  Final capital:   ${self.final_capital:.2f}  "
              f"(start: ${self.initial_capital:.2f})")
        print(sep + "\n")


# ── Indicator computation ─────────────────────────────────────────────────────

def _compute_indicators(df: pd.DataFrame, params: dict) -> pd.DataFrame:
    """
    Compute EMA, RSI, vol_ratio on the full DataFrame (rolling — correct),
    and VWAP grouped by trading day (daily reset — critical for correctness).
    Returns df with added indicator columns.
    """
    df = df.copy()

    fast      = int(params.get("ema_fast",   9))
    slow      = int(params.get("ema_slow",  21))
    rsi_p     = int(params.get("rsi_period", 14))
    vol_win   = 20

    # EMA / RSI — rolling, computed on full dataset (no daily reset needed)
    df["ema9"]  = EMAIndicator(close=df["close"], window=fast, fillna=False).ema_indicator()
    df["ema21"] = EMAIndicator(close=df["close"], window=slow, fillna=False).ema_indicator()
    df["rsi14"] = RSIIndicator(close=df["close"], window=rsi_p, fillna=False).rsi()

    # Volume ratio — rolling 20-bar average
    df["vol_avg"]   = df["volume"].rolling(vol_win).mean()
    df["vol_ratio"] = df["volume"] / df["vol_avg"]

    # VWAP — must reset at start of each trading day (ET date)
    # Convert UTC-naive index to ET to get the correct trading date
    et_index = df.index.tz_localize("UTC").tz_convert(ET)
    df["_et_date"] = et_index.date

    vwap_series = pd.Series(index=df.index, dtype=float)
    for date, day_df in df.groupby("_et_date"):
        vwap = VolumeWeightedAveragePrice(
            high=day_df["high"],
            low=day_df["low"],
            close=day_df["close"],
            volume=day_df["volume"],
            fillna=False,
        ).volume_weighted_average_price()
        vwap_series[day_df.index] = vwap.values

    df["vwap"] = vwap_series
    df.drop(columns=["_et_date", "vol_avg"], inplace=True)

    return df


def _snap(row: pd.Series) -> IndicatorSnapshot:
    """Build an IndicatorSnapshot from a computed DataFrame row."""
    def safe(v):
        try:
            f = float(v)
            return None if (math.isnan(f) or math.isinf(f)) else f
        except (TypeError, ValueError):
            return None

    return IndicatorSnapshot(
        ts        = row.name,
        close     = float(row["close"]),
        ema9      = safe(row.get("ema9")),
        ema21     = safe(row.get("ema21")),
        rsi14     = safe(row.get("rsi14")),
        vwap      = safe(row.get("vwap")),
        vol_ratio = safe(row.get("vol_ratio")),
    )


# ── Core engine ───────────────────────────────────────────────────────────────

class BacktestEngine:

    @staticmethod
    def run(
        df:              pd.DataFrame,
        strategy_module: types.ModuleType,
        params:          dict,
        strategy_name:   str   = "unknown",
        initial_capital: float = 5_000.0,
    ) -> BacktestResult:
        """
        Replay `df` bar-by-bar through `strategy_module`.
        Returns a BacktestResult with full trade log and metrics.
        """
        logger.info("[%s] Starting backtest on %d bars …", strategy_name, len(df))

        # 1. Compute all indicators upfront
        df_ind = _compute_indicators(df, params)

        # ET index for daily boundary detection
        et_index = df_ind.index.tz_localize("UTC").tz_convert(ET)

        # 2. State
        capital      = initial_capital
        daily_pnl    = 0.0
        trades_today = 0
        open_pos: dict | None = None   # {entry_price, shares, entry_slippage, entry_ts}
        prev_snap: IndicatorSnapshot | None = None
        current_date = None

        slippage_pct = float(params.get("slippage_pct", SLIPPAGE_PCT * 100)) / 100

        trades: list[BacktestTrade] = []
        equity: list[dict]          = []

        # 3. Bar-by-bar loop
        for i, (ts, row) in enumerate(df_ind.iterrows()):
            et_ts   = et_index[i]
            et_date = et_ts.date()
            et_time = et_ts.time()

            # ── Daily reset ──────────────────────────────────────────────
            if et_date != current_date:
                current_date = et_date
                daily_pnl    = 0.0
                trades_today = 0
                logger.debug("[%s] New trading day: %s", strategy_name, et_date)

            snap = _snap(row)

            # ── Force-close before 15:55 ET ──────────────────────────────
            if open_pos is not None and et_time >= FORCE_CLOSE_ET:
                trade = _close(open_pos, snap.close, "FORCE_CLOSE",
                               slippage_pct, capital, ts)
                capital      += open_pos["entry_cost"] + trade.net_pnl
                daily_pnl    += trade.net_pnl
                trades.append(trade)
                open_pos  = None
                prev_snap = snap
                equity.append({"ts": str(ts), "capital": round(capital, 4)})
                continue

            # ── Skip bars after force-close window ───────────────────────
            if et_time >= FORCE_CLOSE_ET:
                prev_snap = snap
                continue

            # ── Strategy evaluation ───────────────────────────────────────
            result = strategy_module.evaluate(
                snap, prev_snap, open_pos, params, df_ind.iloc[: i + 1]
            )

            action = "HOLD"

            if result.signal.value == "BUY" and open_pos is None:
                # Risk check
                from risk.manager import validate_buy
                rd = validate_buy(snap.close, capital, daily_pnl, trades_today, params)
                if rd.approved:
                    slippage_cost = snap.close * rd.shares * slippage_pct
                    total_cost    = round(snap.close * rd.shares + slippage_cost, 4)
                    if capital >= total_cost:
                        capital  -= total_cost
                        open_pos  = {
                            "entry_price":    snap.close,
                            "shares":         rd.shares,
                            "entry_slippage": slippage_cost,
                            "entry_cost":     total_cost,   # full deduction incl. slippage
                            "entry_ts":       ts,
                        }
                        trades_today += 1
                        action = "BUY"
                        logger.debug("[%s] BUY %.4f @ %.4f | capital: %.2f",
                                     strategy_name, rd.shares, snap.close, capital)

            elif result.signal.value == "SELL" and open_pos is not None:
                trade = _close(open_pos, snap.close, result.reason,
                               slippage_pct, capital, ts)
                # Restore full entry cost + net pnl  (net_pnl already accounts for slippage)
                capital   += open_pos["entry_cost"] + trade.net_pnl
                daily_pnl += trade.net_pnl
                trades.append(trade)
                open_pos   = None
                action     = "SELL"
                logger.debug("[%s] SELL @ %.4f | net_pnl: %.4f | capital: %.2f",
                             strategy_name, snap.close, trade.net_pnl, capital)

            # Equity = cash + market value of open position (for correct drawdown)
            pos_value = (open_pos["shares"] * snap.close) if open_pos else 0.0
            equity.append({"ts": str(ts), "capital": round(capital + pos_value, 4)})
            prev_snap = snap

        # ── Force-close any residual position at end of data ─────────────
        if open_pos is not None and len(df_ind) > 0:
            last_row  = df_ind.iloc[-1]
            last_snap = _snap(last_row)
            trade = _close(open_pos, last_snap.close, "END_OF_DATA",
                           slippage_pct, capital, df_ind.index[-1])
            capital += open_pos["entry_cost"] + trade.net_pnl
            trades.append(trade)
            equity.append({"ts": str(df_ind.index[-1]), "capital": round(capital, 4)})

        result_obj = BacktestResult(
            strategy        = strategy_name,
            params          = params,
            trades          = trades,
            equity_curve    = equity,
            initial_capital = initial_capital,
            final_capital   = round(capital, 4),
        )
        _compute_metrics(result_obj, initial_capital)

        logger.info("[%s] Backtest done — %d trades | PnL: $%.2f | Win: %.1f%%",
                    strategy_name, result_obj.total_trades,
                    result_obj.total_pnl, result_obj.win_rate)
        return result_obj


# ── Helpers ───────────────────────────────────────────────────────────────────

def _close(
    open_pos:     dict,
    price:        float,
    reason:       str,
    slippage_pct: float,
    capital:      float,
    ts:           pd.Timestamp,
) -> BacktestTrade:
    """Simulate a SELL fill and return a BacktestTrade (no DB writes)."""
    shares        = open_pos["shares"]
    entry_price   = open_pos["entry_price"]
    exit_slip     = price * shares * slippage_pct
    gross_pnl     = (price - entry_price) * shares
    net_pnl       = gross_pnl - exit_slip - open_pos.get("entry_slippage", 0.0)

    return BacktestTrade(
        entry_ts    = open_pos["entry_ts"],
        exit_ts     = ts,
        entry_price = entry_price,
        exit_price  = price,
        shares      = shares,
        gross_pnl   = gross_pnl,
        slippage    = open_pos.get("entry_slippage", 0.0) + exit_slip,
        net_pnl     = net_pnl,
        exit_reason = reason,
    )


def _compute_metrics(r: BacktestResult, initial_capital: float) -> None:
    """Compute all performance metrics in-place on a BacktestResult."""
    r.total_trades = len(r.trades)
    if r.total_trades == 0:
        return

    pnls = [t.net_pnl for t in r.trades]
    wins = [p for p in pnls if p > 0]
    loss = [p for p in pnls if p <= 0]

    r.winning_trades = len(wins)
    r.losing_trades  = len(loss)
    r.win_rate       = 100 * r.winning_trades / r.total_trades
    r.avg_win        = float(np.mean(wins))  if wins else 0.0
    r.avg_loss       = float(np.mean(loss))  if loss else 0.0
    r.total_pnl      = sum(pnls)

    gross_win  = sum(wins)
    gross_loss = abs(sum(loss))
    r.profit_factor = (gross_win / gross_loss) if gross_loss > 0 else None

    # Max drawdown from equity curve
    if r.equity_curve:
        caps    = [e["capital"] for e in r.equity_curve]
        peak    = initial_capital
        max_dd  = 0.0
        for c in caps:
            peak   = max(peak, c)
            max_dd = max(max_dd, peak - c)
        r.max_drawdown     = round(max_dd, 4)
        r.max_drawdown_pct = round(100 * max_dd / initial_capital, 2) if initial_capital > 0 else 0.0

    # Annualised Sharpe (daily PnL, 252 trading days/year)
    if len(pnls) >= 2:
        arr = np.array(pnls)
        mu  = arr.mean()
        sd  = arr.std(ddof=1)
        if sd > 0:
            # Scale to daily: assume ~4 trades per day on average
            daily_factor  = math.sqrt(252)
            r.sharpe_ratio = round(float((mu / sd) * daily_factor), 2)
