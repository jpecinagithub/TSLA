"""
Daily Analysis Engine — runs at 16:05 ET after market close.

Analyzes today's trading activity and generates a structured report:
- Summary stats (signals, trades, PnL)
- Error classification (premature stops, false reversals, missed entries)
- Actionable recommendations for parameter tuning
- Saves to `daily_reports` table for dashboard display
"""
import json
import logging
from datetime import date, datetime, timedelta

from db.connection import SessionLocal
from db.models import Bar, DailyReport, Parameter, Portfolio, Signal, Trade

logger = logging.getLogger(__name__)


# ── Error classifiers ─────────────────────────────────────────────────────────

def _classify_trades(closed_trades: list, bars_today: list) -> list:
    """Post-hoc analysis of closed trades to identify recurring errors."""
    errors = []
    bars_by_ts = {b.ts: b for b in bars_today}
    bars_sorted = sorted(bars_today, key=lambda b: b.ts)

    for t in closed_trades:
        if t.net_pnl is None or t.exit_ts is None:
            continue

        entry = float(t.entry_price)
        exit_p = float(t.exit_price)

        # --- PREMATURE_STOP: price recovered above entry within 10 bars after stop
        if t.exit_reason == "STOP_LOSS":
            post_bars = [b for b in bars_sorted if b.ts > t.exit_ts][:10]
            if post_bars:
                max_after = max(float(b.high) for b in post_bars)
                if max_after >= entry:
                    recovery_pct = (max_after - exit_p) / exit_p * 100
                    errors.append({
                        "type": "PREMATURE_STOP",
                        "trade_id": t.id,
                        "severity": "medium",
                        "detail": (
                            f"Stop hit at ${exit_p:.2f}, price recovered to ${max_after:.2f} "
                            f"(+{recovery_pct:.2f}%) within 10 bars. "
                            f"Stop may be too tight."
                        ),
                    })

        # --- FALSE_REVERSAL: EMA reversal exit led to a loss
        if t.exit_reason == "REVERSAL" and float(t.net_pnl) < 0:
            errors.append({
                "type": "FALSE_REVERSAL",
                "trade_id": t.id,
                "severity": "low",
                "detail": (
                    f"REVERSAL exit at ${exit_p:.2f} booked ${float(t.net_pnl):.2f}. "
                    f"EMA cross was a false signal — consider requiring 2 consecutive cross bars."
                ),
            })

        # --- FAST_STOP: position lasted fewer than 3 bars → entered too early
        if t.exit_reason == "STOP_LOSS" and t.entry_ts and t.exit_ts:
            duration_min = (t.exit_ts - t.entry_ts).total_seconds() / 60
            if duration_min < 3:
                errors.append({
                    "type": "FAST_STOP",
                    "trade_id": t.id,
                    "severity": "high",
                    "detail": (
                        f"Trade lasted only {duration_min:.0f} min before stop. "
                        f"Entry at ${entry:.2f} was likely a false EMA cross."
                    ),
                })

    return errors


def _find_missed_entries(signals_today: list, bars_today: list, params: dict) -> list:
    """
    Scan HOLD signals where a filter (vol_ratio or RSI) blocked entry
    but price moved significantly in the expected direction.
    """
    missed = []
    bars_sorted = sorted(bars_today, key=lambda b: b.ts)
    vol_thr = float(params.get("vol_spike_mult", 1.5))
    rsi_max = float(params.get("rsi_overbought", 70))
    tgt_pct = float(params.get("profit_target_pct", 0.5)) / 100

    for s in signals_today:
        if s.signal_type != "HOLD" or s.action_taken != "SKIPPED":
            continue
        if not s.reason or "no entry condition met" not in s.reason:
            continue
        if s.vol_ratio is None or s.rsi14 is None:
            continue

        vol_r = float(s.vol_ratio)
        rsi_v = float(s.rsi14)
        price = float(s.price)

        post = [b for b in bars_sorted if b.ts > s.ts][:8]
        if not post:
            continue

        max_price = max(float(b.high) for b in post)
        potential_pct = (max_price - price) / price * 100

        # Missed due to vol_ratio barely below threshold
        if vol_thr * 0.7 <= vol_r < vol_thr and potential_pct >= tgt_pct * 100:
            missed.append({
                "type": "MISSED_ENTRY_VOL",
                "ts": s.ts.isoformat(),
                "severity": "medium",
                "detail": (
                    f"vol_ratio={vol_r:.2f} (threshold={vol_thr}). "
                    f"Price moved +{potential_pct:.2f}% within 8 bars. "
                    f"Consider lowering vol_spike_mult."
                ),
            })

        # Missed due to RSI barely above threshold
        if rsi_max <= rsi_v < rsi_max + 6 and potential_pct >= tgt_pct * 100:
            missed.append({
                "type": "MISSED_ENTRY_RSI",
                "ts": s.ts.isoformat(),
                "severity": "low",
                "detail": (
                    f"RSI={rsi_v:.1f} (threshold={rsi_max}). "
                    f"Price moved +{potential_pct:.2f}% within 8 bars. "
                    f"RSI filter may be too conservative."
                ),
            })

    return missed


def _generate_recommendations(
    errors: list,
    missed: list,
    closed_trades: list,
    params: dict,
) -> list:
    recs = []

    premature = sum(1 for e in errors if e["type"] == "PREMATURE_STOP")
    fast_stops = sum(1 for e in errors if e["type"] == "FAST_STOP")
    false_rev  = sum(1 for e in errors if e["type"] == "FALSE_REVERSAL")
    missed_vol = sum(1 for m in missed if m["type"] == "MISSED_ENTRY_VOL")
    missed_rsi = sum(1 for m in missed if m["type"] == "MISSED_ENTRY_RSI")

    if premature >= 2:
        cur = float(params.get("stop_loss_pct", 0.3))
        recs.append({
            "priority": "high",
            "param": "stop_loss_pct",
            "current": str(cur),
            "suggested": str(round(cur + 0.05, 2)),
            "reason": f"Stop triggered prematurely {premature}x — price recovered after exit.",
        })

    if fast_stops >= 2:
        cur = float(params.get("vol_spike_mult", 1.5))
        recs.append({
            "priority": "high",
            "param": "vol_spike_mult",
            "current": str(cur),
            "suggested": str(round(cur + 0.2, 1)),
            "reason": f"{fast_stops} trades stopped out in <3 min — entries too early. Stronger volume filter needed.",
        })

    if missed_vol >= 2:
        cur = float(params.get("vol_spike_mult", 1.5))
        recs.append({
            "priority": "medium",
            "param": "vol_spike_mult",
            "current": str(cur),
            "suggested": str(round(cur - 0.1, 1)),
            "reason": f"{missed_vol} entries missed due to vol_ratio just below threshold.",
        })

    if missed_rsi >= 2:
        cur = float(params.get("rsi_overbought", 70))
        recs.append({
            "priority": "low",
            "param": "rsi_overbought",
            "current": str(cur),
            "suggested": str(round(cur + 3, 0)),
            "reason": f"{missed_rsi} entries blocked by RSI filter that would have been profitable.",
        })

    if false_rev >= 2:
        recs.append({
            "priority": "medium",
            "param": "strategy",
            "current": "single-bar cross",
            "suggested": "confirm 2 bars",
            "reason": f"EMA reversal triggered prematurely {false_rev}x. Optimizer may tighten EMA periods.",
        })

    wins  = [t for t in closed_trades if t.net_pnl and float(t.net_pnl) > 0]
    losses = [t for t in closed_trades if t.net_pnl and float(t.net_pnl) <= 0]
    if len(closed_trades) >= 3:
        wr = len(wins) / len(closed_trades) * 100
        if wr < 40:
            recs.append({
                "priority": "high",
                "param": "strategy",
                "current": f"win_rate={wr:.0f}%",
                "suggested": "run optimizer",
                "reason": f"Win rate {wr:.0f}% is below 40%. Run parameter optimizer to find better settings.",
            })

    if not recs:
        recs.append({
            "priority": "info",
            "param": "none",
            "current": "—",
            "suggested": "—",
            "reason": "No significant issues today. Strategy is within expected parameters.",
        })

    return recs


# ── Main entry point ──────────────────────────────────────────────────────────

def run_daily_analysis(target_date: date | None = None) -> dict:
    """
    Generate + persist a full daily report.
    Called by the scheduler at 16:05 ET, or on-demand via API.
    Returns the report dict.
    """
    today = target_date or date.today()
    logger.info("Running daily analysis for %s", today)

    db = SessionLocal()
    try:
        day_start = datetime(today.year, today.month, today.day, 9, 30, 0)
        day_end   = datetime(today.year, today.month, today.day, 16, 5, 0)

        bars_today     = (db.query(Bar)
                          .filter(Bar.ts >= day_start, Bar.ts <= day_end)
                          .order_by(Bar.ts).all())
        signals_today  = (db.query(Signal)
                          .filter(Signal.ts >= day_start, Signal.ts <= day_end)
                          .order_by(Signal.ts).all())
        trades_today   = (db.query(Trade)
                          .filter(Trade.entry_ts >= day_start, Trade.entry_ts <= day_end)
                          .all())

        params_rows = db.query(Parameter).all()
        params      = {r.key_name: r.value for r in params_rows}
        portfolio   = db.get(Portfolio, 1)

        # Counts
        buy_signals  = sum(1 for s in signals_today if s.signal_type == "BUY")
        sell_signals = sum(1 for s in signals_today if s.signal_type == "SELL")

        closed = [t for t in trades_today if t.status == "CLOSED"]
        wins   = [t for t in closed if t.net_pnl and float(t.net_pnl) > 0]
        losses = [t for t in closed if t.net_pnl and float(t.net_pnl) <= 0]

        daily_pnl = round(sum(float(t.net_pnl) for t in closed if t.net_pnl), 4)
        win_rate  = round(len(wins) / len(closed) * 100, 2) if closed else 0.0

        # Analysis
        errors = _classify_trades(closed, bars_today)
        missed = _find_missed_entries(signals_today, bars_today, params)
        recs   = _generate_recommendations(errors, missed, closed, params)

        best_trade  = max(closed, key=lambda t: float(t.net_pnl or 0), default=None)
        worst_trade = min(closed, key=lambda t: float(t.net_pnl or 0), default=None)

        exit_counts = {}
        for t in closed:
            k = t.exit_reason or "UNKNOWN"
            exit_counts[k] = exit_counts.get(k, 0) + 1

        report = {
            "date": today.isoformat(),
            "generated_at": datetime.utcnow().isoformat(),
            "summary": {
                "total_signals":  len(signals_today),
                "buy_signals":    buy_signals,
                "sell_signals":   sell_signals,
                "hold_signals":   len(signals_today) - buy_signals - sell_signals,
                "trades_opened":  len(trades_today),
                "trades_closed":  len(closed),
                "bars_collected": len(bars_today),
            },
            "pnl": {
                "daily_pnl":  daily_pnl,
                "capital_end": float(portfolio.capital) if portfolio else None,
            },
            "performance": {
                "win_count":   len(wins),
                "loss_count":  len(losses),
                "win_rate":    win_rate,
                "avg_win":     round(sum(float(t.net_pnl) for t in wins) / len(wins), 4) if wins else 0.0,
                "avg_loss":    round(sum(float(t.net_pnl) for t in losses) / len(losses), 4) if losses else 0.0,
                "best_trade":  {"id": best_trade.id,  "pnl": float(best_trade.net_pnl)}  if best_trade  else None,
                "worst_trade": {"id": worst_trade.id, "pnl": float(worst_trade.net_pnl)} if worst_trade else None,
                "exit_reasons": exit_counts,
            },
            "errors":               errors,
            "missed_opportunities": missed,
            "recommendations":      recs,
            "param_snapshot":       params,
        }

        # Upsert daily_reports row
        existing = db.query(DailyReport).filter(DailyReport.report_date == today).first()
        now = datetime.utcnow()
        if existing:
            existing.generated_at         = now
            existing.total_signals        = len(signals_today)
            existing.buy_signals          = buy_signals
            existing.sell_signals         = sell_signals
            existing.trades_opened        = len(trades_today)
            existing.trades_closed        = len(closed)
            existing.daily_pnl            = daily_pnl
            existing.win_count            = len(wins)
            existing.loss_count           = len(losses)
            existing.win_rate             = win_rate
            existing.analysis_json        = json.dumps(report)
            existing.recommendations_json = json.dumps(recs)
            existing.param_snapshot_json  = json.dumps(params)
        else:
            db.add(DailyReport(
                report_date          = today,
                generated_at         = now,
                total_signals        = len(signals_today),
                buy_signals          = buy_signals,
                sell_signals         = sell_signals,
                trades_opened        = len(trades_today),
                trades_closed        = len(closed),
                daily_pnl            = daily_pnl,
                win_count            = len(wins),
                loss_count           = len(losses),
                win_rate             = win_rate,
                analysis_json        = json.dumps(report),
                recommendations_json = json.dumps(recs),
                param_snapshot_json  = json.dumps(params),
            ))
        db.commit()
        logger.info("Daily report saved for %s | PnL=%.2f | trades=%d | errors=%d",
                    today, daily_pnl, len(closed), len(errors))
        return report

    except Exception as exc:
        db.rollback()
        logger.error("Daily analysis failed: %s", exc, exc_info=True)
        return {"error": str(exc)}
    finally:
        db.close()
