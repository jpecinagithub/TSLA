"""
Run backtests for all three strategies and compare results.

Usage (from backend/):
    .venv/bin/python -m backtester.run
    .venv/bin/python -m backtester.run --strategy ema_crossover
    .venv/bin/python -m backtester.run --capital 10000
"""
import argparse
import logging
import sys

from data.historical import load_latest
from backtester.engine import BacktestEngine

import strategy.ema_crossover     as ema_strat
import strategy.momentum_breakout as mom_strat
import strategy.vwap_momentum     as vwap_strat

logging.basicConfig(
    level=logging.WARNING,       # suppress DEBUG/INFO noise during run
    format="%(levelname)s %(message)s",
)

# Default parameters — same as live DB seeds
DEFAULT_PARAMS = {
    "ema_fast":          9,
    "ema_slow":         21,
    "rsi_period":       14,
    "rsi_overbought":   70,
    "vol_spike_mult":   1.5,
    "profit_target_pct": 0.5,
    "stop_loss_pct":    0.3,
    "max_risk_pct":     1.0,
    "max_daily_loss_pct": 3.0,
    "max_trades_day":   10,
    "slippage_pct":     0.05,
    # momentum_breakout specific
    "rsi_momentum_min": 50,
    "rsi_exit_level":   40,
    "breakout_window":  20,
    # vwap_momentum specific
    "rsi_overbought":   65,
    "rsi_momentum_min": 45,
    "vwap_exit_buffer": 0.1,
}

STRATEGIES = {
    "ema_crossover":     (ema_strat,  "EMA Crossover"),
    "momentum_breakout": (mom_strat,  "Momentum Breakout"),
    "vwap_momentum":     (vwap_strat, "VWAP Momentum"),
}


def main():
    parser = argparse.ArgumentParser(description="Run TSLA backtests")
    parser.add_argument("--strategy", choices=list(STRATEGIES.keys()) + ["all"],
                        default="all", help="Which strategy to backtest")
    parser.add_argument("--capital", type=float, default=5_000.0,
                        help="Initial virtual capital (default: 5000)")
    parser.add_argument("--verbose", action="store_true",
                        help="Show individual trades")
    args = parser.parse_args()

    # Load historical data
    print("\nLoading historical data …")
    df = load_latest()
    if df.empty:
        print("ERROR: No historical data available. Run data.historical first.")
        sys.exit(1)

    et_index = df.index.copy()
    print(f"Loaded {len(df):,} bars  |  "
          f"{df.index[0].date()} → {df.index[-1].date()}\n")

    # Select strategies to run
    to_run = (
        list(STRATEGIES.items())
        if args.strategy == "all"
        else [(args.strategy, STRATEGIES[args.strategy])]
    )

    results = []
    for name, (module, label) in to_run:
        print(f"Running {label} …", end=" ", flush=True)
        r = BacktestEngine.run(
            df             = df,
            strategy_module= module,
            params         = DEFAULT_PARAMS.copy(),
            strategy_name  = name,
            initial_capital= args.capital,
        )
        results.append((label, r))
        print("done")

    # Print individual summaries
    for label, r in results:
        r.print_summary()

    # Comparison table if running all
    if len(results) > 1:
        _print_comparison(results, args.capital)

    # Individual trades if requested
    if args.verbose:
        for label, r in results:
            _print_trades(label, r)


def _print_comparison(results, initial_capital):
    sep = "=" * 90
    print(f"\n{sep}")
    print(f"  STRATEGY COMPARISON  (capital: ${initial_capital:,.0f})")
    print(sep)
    header = (f"  {'Strategy':<22} {'Trades':>6} {'Win%':>6} {'PF':>6} "
              f"{'Expect':>8} {'PnL':>9} {'MaxDD':>8} {'Hold':>6} {'Sharpe':>7}")
    print(header)
    print("-" * 90)
    for label, r in results:
        pf  = f"{r.profit_factor:.2f}" if r.profit_factor is not None else "  N/A"
        sr  = f"{r.sharpe_ratio:.2f}"  if r.sharpe_ratio  is not None else "  N/A"
        exp = f"${r.expectancy:+.2f}"
        pnl = f"{'+'if r.total_pnl>=0 else ''}${r.total_pnl:.2f}"
        print(
            f"  {label:<22} {r.total_trades:>6} {r.win_rate:>5.1f}% "
            f"{pf:>6} {exp:>8} {pnl:>9} "
            f"${r.max_drawdown:>6.2f} {r.avg_hold_minutes:>4.0f}m {sr:>7}"
        )
    print(sep + "\n")


def _print_trades(label, r):
    if not r.trades:
        return
    print(f"\n── {label} — individual trades ──")
    for i, t in enumerate(r.trades, 1):
        sign = "+" if t.net_pnl >= 0 else ""
        print(f"  #{i:>3}  {str(t.entry_ts)[:16]} → {str(t.exit_ts)[:16]}"
              f"  @ ${t.entry_price:.2f}→${t.exit_price:.2f}"
              f"  {sign}${t.net_pnl:.2f}  [{t.exit_reason}]")


if __name__ == "__main__":
    main()
