"""
Learning Metrics Calculator.

Computes weekly snapshots that answer: "Is the agent getting better?"

Metrics per week:
  - expectancy       $/trade — is it trending up?
  - win_rate         % — is it improving?
  - profit_factor    ratio — consistently > 1?
  - alpha            agent_pnl - buy_and_hold_pnl — are we adding value?

All strategies are aggregated together (combined portfolio view).
Snapshots are persisted to learning_snapshots and served by the API.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

import pytz
from sqlalchemy import text

from db.connection import SessionLocal

logger = logging.getLogger(__name__)
ET = pytz.timezone("America/New_York")


# ── Weekly snapshot computation ───────────────────────────────────────────────

def compute_week(week_start: date, strategy: str | None = None) -> dict | None:
    """
    Compute learning metrics for the 5-day window starting on week_start (Monday).
    Pass strategy="adaptive" (or any strategy name) to filter by strategy.
    Returns dict ready for INSERT, or None if no trades in that window.
    """
    week_end = week_start + timedelta(days=7)
    db = SessionLocal()
    try:
        # ── Trades in this week (optionally filtered by strategy)
        q_params = {"start": week_start, "end": week_end}
        strat_clause = ""
        if strategy:
            strat_clause = "AND strategy = :strategy"
            q_params["strategy"] = strategy

        rows = db.execute(text(f"""
            SELECT net_pnl, entry_ts, exit_ts, entry_price, shares
            FROM trades
            WHERE status = 'CLOSED'
              AND entry_ts >= :start AND entry_ts < :end
              {strat_clause}
        """), q_params).fetchall()

        if not rows:
            return None

        pnls       = [float(r.net_pnl) for r in rows if r.net_pnl is not None]
        wins       = [p for p in pnls if p > 0]
        losses     = [p for p in pnls if p <= 0]
        win_rate   = 100 * len(wins) / len(pnls) if pnls else 0
        gross_win  = sum(wins)
        gross_loss = abs(sum(losses))
        pf         = round(gross_win / gross_loss, 4) if gross_loss > 0 else None
        expectancy = round(sum(pnls) / len(pnls), 4) if pnls else 0

        # Avg hold time
        hold_mins = []
        for r in rows:
            if r.exit_ts and r.entry_ts:
                delta = (r.exit_ts - r.entry_ts).total_seconds() / 60
                hold_mins.append(delta)
        avg_hold = round(sum(hold_mins) / len(hold_mins), 2) if hold_mins else None

        agent_pnl = round(sum(pnls), 4)

        # ── Buy & Hold comparison (TSLA price at start vs end of week)
        bnh_pnl = _bnh_pnl(week_start, week_end, initial_capital=5000.0, db=db)

        alpha = round(agent_pnl - (bnh_pnl or 0), 4) if bnh_pnl is not None else None

        # ── Current regime at end of week
        regime_row = db.execute(text("""
            SELECT regime FROM regime_log
            WHERE ts < :end ORDER BY ts DESC LIMIT 1
        """), {"end": week_end}).fetchone()
        regime = regime_row.regime if regime_row else "UNKNOWN"

        return {
            "week_start":       week_start,
            "strategy":         strategy or "all",
            "total_trades":     len(pnls),
            "win_rate":         round(win_rate, 2),
            "profit_factor":    pf,
            "expectancy":       expectancy,
            "avg_hold_minutes": avg_hold,
            "agent_pnl":        agent_pnl,
            "bnh_pnl":          round(bnh_pnl, 4) if bnh_pnl is not None else None,
            "alpha":            alpha,
            "regime_at_week":   regime,
        }

    except Exception as exc:
        logger.error("compute_week failed for %s: %s", week_start, exc)
        return None
    finally:
        db.close()


def _bnh_pnl(week_start: date, week_end: date, initial_capital: float, db) -> float | None:
    """
    Simulate buy & hold: buy at first bar of the week, sell at last bar.
    Returns PnL in dollars for the same initial_capital.
    """
    try:
        first = db.execute(text("""
            SELECT close FROM bars WHERE ts >= :start ORDER BY ts ASC LIMIT 1
        """), {"start": week_start}).fetchone()
        last = db.execute(text("""
            SELECT close FROM bars WHERE ts < :end ORDER BY ts DESC LIMIT 1
        """), {"end": week_end}).fetchone()

        if not first or not last:
            return None

        entry = float(first.close)
        exit_ = float(last.close)
        shares = initial_capital / entry
        return round((exit_ - entry) * shares, 4)
    except Exception:
        return None


def persist_snapshot(snap: dict) -> None:
    """Upsert a weekly snapshot into learning_snapshots."""
    db = SessionLocal()
    try:
        db.execute(text("""
            INSERT INTO learning_snapshots
              (week_start, total_trades, win_rate, profit_factor, expectancy,
               avg_hold_minutes, agent_pnl, bnh_pnl, alpha, regime_at_week)
            VALUES
              (:week_start, :total_trades, :win_rate, :profit_factor, :expectancy,
               :avg_hold_minutes, :agent_pnl, :bnh_pnl, :alpha, :regime_at_week)
            ON DUPLICATE KEY UPDATE
              total_trades     = VALUES(total_trades),
              win_rate         = VALUES(win_rate),
              profit_factor    = VALUES(profit_factor),
              expectancy       = VALUES(expectancy),
              avg_hold_minutes = VALUES(avg_hold_minutes),
              agent_pnl        = VALUES(agent_pnl),
              bnh_pnl          = VALUES(bnh_pnl),
              alpha            = VALUES(alpha),
              regime_at_week   = VALUES(regime_at_week)
        """), snap)
        db.commit()
        logger.info("Persisted learning snapshot for week %s", snap["week_start"])
    except Exception as exc:
        db.rollback()
        logger.error("persist_snapshot failed: %s", exc)
    finally:
        db.close()


def run_weekly_job() -> None:
    """
    Called by the scheduler every Monday at 09:00 ET.
    Computes the snapshot for the just-finished week and persists it.
    """
    today      = date.today()
    # Last Monday = start of the week that just ended
    last_monday = today - timedelta(days=today.weekday() + 7)
    logger.info("Running weekly learning metrics job for week %s", last_monday)
    snap = compute_week(last_monday)
    if snap:
        persist_snapshot(snap)
    else:
        logger.info("No trades found for week %s — skipping snapshot", last_monday)


def get_all_snapshots() -> list[dict]:
    """Load all learning snapshots from DB, ordered by week."""
    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT week_start, total_trades, win_rate, profit_factor, expectancy,
                   avg_hold_minutes, agent_pnl, bnh_pnl, alpha, regime_at_week
            FROM learning_snapshots
            ORDER BY week_start ASC
        """)).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception as exc:
        logger.error("get_all_snapshots failed: %s", exc)
        return []
    finally:
        db.close()


def learning_verdict(snapshots: list[dict]) -> dict:
    """
    Analyse the snapshot history and return a human-readable verdict.
    Needs at least 4 weeks of data for a meaningful conclusion.
    """
    n = len(snapshots)
    if n == 0:
        return {
            "verdict":    "NO_DATA",
            "label":      "Sin datos aún",
            "detail":     "El agente acaba de arrancar. Vuelve en 4 semanas.",
            "color":      "gray",
            "weeks_data": 0,
        }
    if n < 4:
        return {
            "verdict":    "TOO_EARLY",
            "label":      "Demasiado pronto",
            "detail":     f"Solo {n} semana(s) de datos. Necesitamos al menos 4 para detectar tendencia.",
            "color":      "amber",
            "weeks_data": n,
        }

    # Check expectancy trend (linear regression slope)
    exps = [s["expectancy"] for s in snapshots if s["expectancy"] is not None]
    alphas = [s["alpha"] for s in snapshots if s["alpha"] is not None]

    exp_slope  = _slope(exps)
    alpha_mean = sum(alphas) / len(alphas) if alphas else 0
    latest_pf  = next((s["profit_factor"] for s in reversed(snapshots)
                       if s["profit_factor"] is not None), None)

    signals_positive = sum([
        exp_slope  > 0,
        alpha_mean > 0,
        (latest_pf or 0) > 1.0,
    ])

    if signals_positive == 3:
        return {
            "verdict": "LEARNING",
            "label":   "Señales de aprendizaje",
            "detail":  f"Expectativa en tendencia alcista, alpha positivo (${alpha_mean:+.2f}/semana), PF > 1.",
            "color":   "emerald",
            "weeks_data": n,
        }
    elif signals_positive == 2:
        return {
            "verdict": "WEAK_SIGNAL",
            "label":   "Señal débil",
            "detail":  f"Algunos indicadores positivos pero inconsistentes. Necesita más semanas.",
            "color":   "amber",
            "weeks_data": n,
        }
    else:
        return {
            "verdict": "NO_LEARNING",
            "label":   "Sin aprendizaje detectado",
            "detail":  f"Expectativa estancada o bajando. Alpha negativo. Revisar estrategia.",
            "color":   "rose",
            "weeks_data": n,
        }


def _slope(values: list[float]) -> float:
    """Simple linear regression slope — positive means upward trend."""
    n = len(values)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2
    y_mean = sum(values) / n
    num    = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    den    = sum((i - x_mean) ** 2 for i in range(n))
    return num / den if den != 0 else 0.0
