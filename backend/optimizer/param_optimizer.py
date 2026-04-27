"""
Parameter Optimizer — Grid search over strategy parameters.

Runs after daily analysis (16:10 ET). Uses all stored bar history to
backtest parameter combinations and auto-applies the best set if it
improves performance by >= MIN_IMPROVEMENT_PCT.

Walk-forward split: first 75% of bars = training, last 25% = validation.
Score = total_pnl * (win_rate/50) * min(profit_factor, 3.0)
"""
import itertools
import json
import logging
from datetime import datetime, timedelta

import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator

from db.connection import SessionLocal
from db.models import Bar, OptimizationRun, ParamAudit, Parameter

logger = logging.getLogger(__name__)

# ── Search grid ───────────────────────────────────────────────────────────────
# Keep grid small enough to finish in <2 min on the Oracle VM
GRID = {
    "ema_fast":          [7, 9, 11],
    "ema_slow":          [18, 21, 24],
    "rsi_overbought":    [65, 70, 75],
    "vol_spike_mult":    [1.3, 1.5, 1.8],
    "profit_target_pct": [0.4, 0.5, 0.6],
    "stop_loss_pct":     [0.2, 0.3, 0.4],
}

# Fixed params the optimizer must NOT touch
PROTECTED = {"rsi_period", "max_daily_loss_pct", "max_trades_day",
             "max_risk_pct", "slippage_pct"}

MIN_IMPROVEMENT_PCT = 5.0   # auto-apply threshold


# ── Core simulation ───────────────────────────────────────────────────────────

def _simulate(closes: list[float], volumes: list[float], params: dict) -> dict:
    """
    In-memory EMA crossover simulation on raw OHLCV lists.
    Returns performance metrics dict.
    """
    ema_fast = int(params.get("ema_fast", 9))
    ema_slow = int(params.get("ema_slow", 21))
    rsi_ob   = float(params.get("rsi_overbought", 70))
    vol_mult = float(params.get("vol_spike_mult", 1.5))
    prof_t   = float(params.get("profit_target_pct", 0.5)) / 100
    stop_l   = float(params.get("stop_loss_pct", 0.3)) / 100
    slippage = float(params.get("slippage_pct", 0.05)) / 100

    n = len(closes)
    if n < max(ema_fast, ema_slow, 14) + 5:
        return {"total_pnl": 0.0, "trades": 0, "win_rate": 0.0,
                "profit_factor": 0.0, "score": -999.0}

    s_close = pd.Series(closes)
    s_vol   = pd.Series(volumes)

    ef_s  = EMAIndicator(s_close, window=ema_fast).ema_indicator()
    es_s  = EMAIndicator(s_close, window=ema_slow).ema_indicator()
    rsi_s = RSIIndicator(s_close, window=14).rsi()
    vm_s  = s_vol.rolling(20).mean()

    ef  = ef_s.tolist()
    es  = es_s.tolist()
    rsi = rsi_s.tolist()
    vm  = vm_s.tolist()

    capital = 5000.0
    initial = capital
    pos = None
    pnls: list[float] = []
    warmup = max(ema_fast, ema_slow, 14, 20) + 1

    for i in range(warmup, n):
        if ef[i] is None or es[i] is None or pd.isna(ef[i]) or pd.isna(es[i]):
            continue

        price   = closes[i]
        vol_r   = (volumes[i] / vm[i]) if (vm[i] and not pd.isna(vm[i]) and vm[i] > 0) else 0.0
        rsi_val = rsi[i] if (rsi[i] and not pd.isna(rsi[i])) else 50.0

        if pos is not None:
            entry   = pos["entry"]
            pnl_pct = (price - entry) / entry

            exit_now = False
            if pnl_pct >= prof_t:
                exit_now = True
            elif pnl_pct <= -stop_l:
                exit_now = True
            elif ef[i - 1] is not None and es[i - 1] is not None:
                if ef[i - 1] >= es[i - 1] and ef[i] < es[i]:
                    exit_now = True

            if exit_now:
                fill   = price * (1 - slippage)
                net_pnl = pos["shares"] * (fill - entry)
                pnls.append(net_pnl)
                capital += net_pnl
                pos = None

        else:
            prev_ef = ef[i - 1] if ef[i - 1] is not None and not pd.isna(ef[i - 1]) else None
            prev_es = es[i - 1] if es[i - 1] is not None and not pd.isna(es[i - 1]) else None
            cross_up = (prev_ef is not None and prev_es is not None
                        and prev_ef <= prev_es and ef[i] > es[i])

            if cross_up and rsi_val < rsi_ob and vol_r >= vol_mult:
                risk_amount = capital * 0.01
                shares = risk_amount / (price * stop_l) if stop_l > 0 else 0.0
                shares = min(shares, capital / price)
                if shares > 0:
                    fill = price * (1 + slippage)
                    pos = {"entry": fill, "shares": shares}

    # Force-close open position at end
    if pos:
        fill    = closes[-1] * (1 - slippage)
        net_pnl = pos["shares"] * (fill - pos["entry"])
        pnls.append(net_pnl)
        capital += net_pnl

    total_pnl = capital - initial
    n_trades  = len(pnls)
    wins      = [p for p in pnls if p > 0]
    losses    = [p for p in pnls if p <= 0]

    win_rate      = len(wins) / n_trades * 100 if n_trades > 0 else 0.0
    gross_win     = sum(wins)
    gross_loss    = abs(sum(losses))
    profit_factor = (gross_win / gross_loss) if gross_loss > 0 else (99.0 if wins else 0.0)

    # Risk-adjusted score: rewards PnL, win rate, and profit factor
    if total_pnl > 0 and n_trades >= 3:
        score = total_pnl * (win_rate / 50.0) * min(profit_factor, 3.0)
    elif n_trades < 3:
        score = total_pnl * 0.3   # penalise very few trades
    else:
        score = total_pnl          # negative PnL stays negative

    return {
        "total_pnl":     round(total_pnl, 4),
        "trades":        n_trades,
        "win_rate":      round(win_rate, 2),
        "profit_factor": round(min(profit_factor, 99.0), 3),
        "score":         round(score, 4),
    }


# ── Public API ────────────────────────────────────────────────────────────────

def run_optimization(
    auto_apply: bool = True,
    min_improvement_pct: float = MIN_IMPROVEMENT_PCT,
) -> dict:
    """
    1. Load last 45 calendar days of bars (~30 trading days).
    2. Split 75/25 train/validate.
    3. Grid search → score each combo on validation split.
    4. If best improves on current by ≥ min_improvement_pct → auto-apply.
    5. Persist OptimizationRun row.
    """
    logger.info("Starting parameter optimization (auto_apply=%s)...", auto_apply)
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(days=45)
        bars   = db.query(Bar).filter(Bar.ts >= cutoff).order_by(Bar.ts).all()

        if len(bars) < 60:
            logger.warning("Insufficient bars for optimization (%d). Need ≥ 60.", len(bars))
            return {"status": "skipped", "reason": "insufficient_data", "bars": len(bars)}

        closes  = [float(b.close)  for b in bars]
        volumes = [float(b.volume) for b in bars]

        # Walk-forward split
        split   = int(len(bars) * 0.75)
        c_train, v_train = closes[:split],  volumes[:split]
        c_val,   v_val   = closes[split:],  volumes[split:]

        # Current params as baseline (evaluated on validation set)
        params_rows = db.query(Parameter).all()
        current_params = {r.key_name: r.value for r in params_rows}
        baseline_result = _simulate(c_val, v_val, current_params)

        keys   = list(GRID.keys())
        values = [GRID[k] for k in keys]

        best_params = dict(current_params)
        best_result = baseline_result
        combos_tested = 0

        for combo in itertools.product(*values):
            # Validate fast < slow constraint
            test = dict(current_params)
            for k, v in zip(keys, combo):
                test[k] = str(v)

            if int(test["ema_fast"]) >= int(test["ema_slow"]):
                continue
            # profit_target must be > stop_loss
            if float(test["profit_target_pct"]) <= float(test["stop_loss_pct"]):
                continue

            # Train-set check to avoid overfitted duds
            train_res = _simulate(c_train, v_train, test)
            if train_res["score"] <= 0:
                combos_tested += 1
                continue

            # Validate
            val_res = _simulate(c_val, v_val, test)
            combos_tested += 1

            if val_res["score"] > best_result["score"]:
                best_result = val_res
                best_params = dict(test)

        # Improvement vs baseline
        b_pnl    = baseline_result["total_pnl"]
        best_pnl = best_result["total_pnl"]
        improvement = ((best_pnl - b_pnl) / abs(b_pnl) * 100) if b_pnl != 0 else 0.0

        logger.info(
            "Optimization done: %d combos | baseline=%.2f | best=%.2f | improvement=%.1f%%",
            combos_tested, b_pnl, best_pnl, improvement,
        )

        # Auto-apply
        applied      = False
        apply_reason = ""
        now          = datetime.utcnow()

        if (auto_apply
                and improvement >= min_improvement_pct
                and best_pnl > 0
                and best_params != current_params):
            changed = []
            for key in keys:
                new_val = str(best_params.get(key, ""))
                old_val = current_params.get(key, "")
                if new_val and new_val != old_val:
                    param = db.get(Parameter, key)
                    if param:
                        db.add(ParamAudit(
                            key_name=key,
                            old_value=old_val,
                            new_value=new_val,
                            ts=now,
                            changed_by="optimizer",
                        ))
                        param.value      = new_val
                        param.updated_at = now
                        changed.append(f"{key}: {old_val}→{new_val}")

            if changed:
                db.flush()
                applied      = True
                apply_reason = (
                    f"Improved validation PnL by {improvement:.1f}%. "
                    f"Changed: {'; '.join(changed)}"
                )
                logger.info("Auto-applied params: %s", apply_reason)

        # Persist run
        run = OptimizationRun(
            run_ts              = now,
            bars_used           = len(bars),
            combinations_tested = combos_tested,
            best_params_json    = json.dumps({k: best_params.get(k) for k in keys}),
            baseline_pnl        = b_pnl,
            best_pnl            = best_pnl,
            improvement_pct     = round(improvement, 2),
            applied             = int(applied),
            apply_reason        = apply_reason,
        )
        db.add(run)
        db.commit()

        return {
            "status":            "completed",
            "bars_used":         len(bars),
            "combinations_tested": combos_tested,
            "baseline":          baseline_result,
            "best":              best_result,
            "best_params":       {k: best_params.get(k) for k in keys},
            "improvement_pct":   round(improvement, 2),
            "applied":           applied,
            "apply_reason":      apply_reason,
        }

    except Exception as exc:
        db.rollback()
        logger.error("Optimization failed: %s", exc, exc_info=True)
        return {"status": "error", "reason": str(exc)}
    finally:
        db.close()
