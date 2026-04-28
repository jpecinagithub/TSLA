"""
Walk-Forward Validation — Phase 2 / Etapa 4.

Answers two questions:
  1. CONSISTENCY — Is the strategy profitable month by month,
     or did it get lucky in just one period?
  2. OVERFITTING — If we find the "best" parameters in-sample (train),
     do they still work on unseen data (test)?

Two methods:
  - by_month()     → splits data by calendar month, runs each independently
  - train_test()   → param sweep on train window, validate on test window

Usage (from backend/):
    .venv/bin/python -m backtester.walkforward
    .venv/bin/python -m backtester.walkforward --strategy ema_crossover
"""
from __future__ import annotations

import argparse
import itertools
import logging
import sys
from dataclasses import dataclass

import pandas as pd
import pytz

from backtester.engine import BacktestEngine, BacktestResult
from backtester.run   import DEFAULT_PARAMS, STRATEGIES
from data.historical  import load_latest

logger = logging.getLogger(__name__)
ET     = pytz.timezone("America/New_York")


# ── Result containers ─────────────────────────────────────────────────────────

@dataclass
class MonthlyResult:
    month:  str
    result: BacktestResult

@dataclass
class ParamSweepEntry:
    params:  dict
    result:  BacktestResult
    score:   float          # expectancy * win_rate (avoids PF=None edge cases)

@dataclass
class WalkForwardReport:
    strategy:       str
    monthly:        list[MonthlyResult]
    best_params:    dict
    train_result:   BacktestResult
    test_result:    BacktestResult
    param_sweep:    list[ParamSweepEntry]   # top-10 in-sample results


# ── Parameter grids (per strategy) ───────────────────────────────────────────

PARAM_GRIDS = {
    "ema_crossover": {
        "rsi_overbought":    [60, 65, 70, 75],
        "vol_spike_mult":    [1.0, 1.5, 2.0],
        "profit_target_pct": [0.3, 0.5, 0.8],
        "stop_loss_pct":     [0.2, 0.3, 0.5],
    },
    "momentum_breakout": {
        "rsi_momentum_min":  [45, 50, 55],
        "vol_spike_mult":    [1.5, 2.0, 2.5],
        "profit_target_pct": [0.3, 0.5, 0.8],
        "stop_loss_pct":     [0.2, 0.3, 0.5],
        "breakout_window":   [10, 20],
    },
    "vwap_momentum": {
        "rsi_momentum_min":  [40, 45, 50],
        "vol_spike_mult":    [1.0, 1.5, 2.0],
        "profit_target_pct": [0.3, 0.5, 0.8],
        "stop_loss_pct":     [0.2, 0.3, 0.5],
        "vwap_exit_buffer":  [0.05, 0.1, 0.2],
    },
}


# ── Core methods ──────────────────────────────────────────────────────────────

def by_month(
    df:              pd.DataFrame,
    strategy_module,
    params:          dict,
    strategy_name:   str,
    initial_capital: float = 5_000.0,
) -> list[MonthlyResult]:
    """
    Split df by calendar month (ET) and run an independent backtest on each.
    Returns list of MonthlyResult sorted by month.
    """
    et_index = df.index.tz_localize("UTC").tz_convert(ET)
    months   = sorted(set(et_index.strftime("%Y-%m")))

    results = []
    for month in months:
        mask    = et_index.strftime("%Y-%m") == month
        df_month = df[mask]
        if len(df_month) < 30:          # skip tiny windows
            continue
        r = BacktestEngine.run(
            df              = df_month,
            strategy_module = strategy_module,
            params          = params,
            strategy_name   = strategy_name,
            initial_capital = initial_capital,
        )
        results.append(MonthlyResult(month=month, result=r))

    return results


def train_test(
    df:              pd.DataFrame,
    strategy_module,
    strategy_name:   str,
    train_pct:       float = 0.67,      # ~Feb+Mar as train, Apr as test
    initial_capital: float = 5_000.0,
    top_n:           int   = 10,
) -> WalkForwardReport:
    """
    1. Split df into train (first train_pct) and test (remainder).
    2. Sweep parameter grid on TRAIN only — find best params.
    3. Run the best params on TEST (out-of-sample).
    4. Compare: does the in-sample winner still win out-of-sample?
    """
    # ── Split
    split_idx  = int(len(df) * train_pct)
    df_train   = df.iloc[:split_idx]
    df_test    = df.iloc[split_idx:]

    et_train   = df_train.index.tz_localize("UTC").tz_convert(ET)
    et_test    = df_test.index.tz_localize("UTC").tz_convert(ET)
    logger.info("[%s] Train: %s → %s | Test: %s → %s",
                strategy_name,
                et_train[0].strftime("%Y-%m-%d"), et_train[-1].strftime("%Y-%m-%d"),
                et_test[0].strftime("%Y-%m-%d"),  et_test[-1].strftime("%Y-%m-%d"))

    # ── Parameter sweep on TRAIN
    grid    = PARAM_GRIDS.get(strategy_name, {})
    combos  = _expand_grid(DEFAULT_PARAMS.copy(), grid)
    logger.info("[%s] Sweeping %d parameter combinations on train set …",
                strategy_name, len(combos))

    sweep_entries: list[ParamSweepEntry] = []
    for combo in combos:
        r     = BacktestEngine.run(df_train, strategy_module, combo,
                                   strategy_name, initial_capital)
        score = _score(r)
        sweep_entries.append(ParamSweepEntry(params=combo, result=r, score=score))

    sweep_entries.sort(key=lambda e: -e.score)
    best_params = sweep_entries[0].params

    # ── Validate best params on TEST (out-of-sample)
    train_result = sweep_entries[0].result
    test_result  = BacktestEngine.run(df_test, strategy_module, best_params,
                                      strategy_name, initial_capital)

    return WalkForwardReport(
        strategy     = strategy_name,
        monthly      = by_month(df, strategy_module, DEFAULT_PARAMS.copy(),
                                strategy_name, initial_capital),
        best_params  = best_params,
        train_result = train_result,
        test_result  = test_result,
        param_sweep  = sweep_entries[:top_n],
    )


# ── Scoring & printing ────────────────────────────────────────────────────────

def _score(r: BacktestResult) -> float:
    """Single number to rank parameter combinations: expectancy × sqrt(trades)."""
    if r.total_trades == 0:
        return -999.0
    return r.expectancy * (r.total_trades ** 0.5)


def _expand_grid(base: dict, grid: dict) -> list[dict]:
    """Cartesian product of grid values merged on top of base params."""
    keys   = list(grid.keys())
    values = list(grid.values())
    combos = []
    for combo in itertools.product(*values):
        p = base.copy()
        p.update(dict(zip(keys, combo)))
        combos.append(p)
    return combos if combos else [base]


def print_report(report: WalkForwardReport) -> None:
    sep  = "=" * 65
    sep2 = "-" * 65

    print(f"\n{'#' * 65}")
    print(f"  WALK-FORWARD REPORT: {report.strategy.upper()}")
    print(f"{'#' * 65}")

    # ── 1. Monthly consistency
    print(f"\n  1. MONTHLY CONSISTENCY (default params)")
    print(sep2)
    print(f"  {'Month':<10} {'Trades':>6} {'Win%':>6} {'PnL':>10} {'Expect':>8} {'Verdict'}")
    print(sep2)
    for mr in report.monthly:
        r = mr.result
        pnl   = f"{'+'if r.total_pnl>=0 else ''}${r.total_pnl:.2f}"
        exp   = f"${r.expectancy:+.2f}"
        color = "✅ positive" if r.total_pnl > 0 else ("⚠️  breakeven" if abs(r.total_pnl) < 5 else "❌ negative")
        print(f"  {mr.month:<10} {r.total_trades:>6} {r.win_rate:>5.1f}% {pnl:>10} {exp:>8}  {color}")
    print()

    # ── 2. Train / Test split
    tr = report.train_result
    te = report.test_result
    print(f"  2. TRAIN → TEST  (best in-sample params on out-of-sample data)")
    print(sep2)

    def row(label, r):
        pf  = f"{r.profit_factor:.2f}" if r.profit_factor is not None else " N/A"
        exp = f"${r.expectancy:+.2f}"
        pnl = f"{'+'if r.total_pnl>=0 else ''}${r.total_pnl:.2f}"
        print(f"  {label:<8} {r.total_trades:>6} trades | Win {r.win_rate:>4.1f}% | "
              f"PF {pf} | Expect {exp:>7} | PnL {pnl:>9}")

    row("TRAIN", tr)
    row("TEST ",  te)
    print()

    # Overfitting verdict
    if te.total_trades == 0:
        verdict = "⚠️  NO TRADES on test set — insufficient signal frequency"
    elif te.expectancy > 0 and te.profit_factor is not None and te.profit_factor > 1.0:
        verdict = "✅ EDGE CONFIRMED — best params remain profitable out-of-sample"
    elif te.expectancy > 0:
        verdict = "🟡 WEAK EDGE — positive expectancy but PF < 1, needs more data"
    elif te.expectancy > -2.0:
        verdict = "⚠️  INCONCLUSIVE — small sample, not enough trades to decide"
    else:
        verdict = "❌ OVERFITTING — params only worked in-sample, not out-of-sample"
    print(f"  Verdict: {verdict}")
    print()

    # ── 3. Best params found
    print(f"  3. BEST PARAMS  (optimised on train set)")
    print(sep2)
    grid_keys = set(PARAM_GRIDS.get(report.strategy, {}).keys())
    for k, v in report.best_params.items():
        if k in grid_keys:
            default = DEFAULT_PARAMS.get(k, "—")
            flag    = "  ←" if v != default else ""
            print(f"  {k:<24} {v:>8}   (default: {default}){flag}")
    print()

    # ── 4. Top-10 param sweep (in-sample)
    print(f"  4. TOP 10 PARAMETER COMBINATIONS  (in-sample train only)")
    print(sep2)
    grid_keys_list = list(PARAM_GRIDS.get(report.strategy, {}).keys())
    header_params  = "  ".join(f"{k[:12]:>12}" for k in grid_keys_list)
    print(f"  {'Score':>7}  {'Trades':>6}  {'PnL':>9}  {'Expect':>8}  {header_params}")
    print(sep2)
    for e in report.param_sweep:
        r      = e.result
        pnl    = f"{'+'if r.total_pnl>=0 else ''}${r.total_pnl:.2f}"
        exp    = f"${r.expectancy:+.2f}"
        params = "  ".join(f"{e.params.get(k,'?'):>12}" for k in grid_keys_list)
        print(f"  {e.score:>7.2f}  {r.total_trades:>6}  {pnl:>9}  {exp:>8}  {params}")
    print(sep + "\n")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Walk-forward validation")
    parser.add_argument("--strategy", choices=list(STRATEGIES.keys()) + ["all"],
                        default="all")
    parser.add_argument("--capital",   type=float, default=5_000.0)
    parser.add_argument("--train-pct", type=float, default=0.67,
                        help="Fraction of data used for training (default 0.67)")
    args = parser.parse_args()

    print("\nLoading historical data …")
    df = load_latest()
    if df.empty:
        print("ERROR: No data. Run data.historical first.")
        sys.exit(1)

    et = df.index.tz_localize("UTC").tz_convert(ET)
    print(f"Loaded {len(df):,} bars  |  "
          f"{et[0].strftime('%Y-%m-%d')} → {et[-1].strftime('%Y-%m-%d')}\n")

    to_run = (
        list(STRATEGIES.items())
        if args.strategy == "all"
        else [(args.strategy, STRATEGIES[args.strategy])]
    )

    for name, (module, label) in to_run:
        print(f"Running walk-forward for {label} …", end=" ", flush=True)
        report = train_test(
            df              = df,
            strategy_module = module,
            strategy_name   = name,
            train_pct       = args.train_pct,
            initial_capital = args.capital,
        )
        print("done")
        print_report(report)


if __name__ == "__main__":
    main()
