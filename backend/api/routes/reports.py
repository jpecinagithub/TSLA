"""
Daily Reports API — read-only access to daily analysis reports.
"""
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from analysis.daily_analyzer import run_daily_analysis
from db.connection import get_db
from db.models import DailyReport

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _serialize(r: DailyReport) -> dict:
    return {
        "id":            r.id,
        "date":          r.report_date.isoformat(),
        "generated_at":  r.generated_at.isoformat(),
        "total_signals": r.total_signals,
        "buy_signals":   r.buy_signals,
        "sell_signals":  r.sell_signals,
        "trades_closed": r.trades_closed,
        "daily_pnl":     float(r.daily_pnl),
        "win_count":     r.win_count,
        "loss_count":    r.loss_count,
        "win_rate":      float(r.win_rate),
        "recommendations": json.loads(r.recommendations_json) if r.recommendations_json else [],
        "analysis":      json.loads(r.analysis_json) if r.analysis_json else {},
    }


@router.get("")
def list_reports(limit: int = 30, db: Session = Depends(get_db)):
    """List the N most recent daily reports (newest first)."""
    rows = (db.query(DailyReport)
            .order_by(DailyReport.report_date.desc())
            .limit(limit)
            .all())
    return [_serialize(r) for r in rows]


@router.get("/today")
def today_report(db: Session = Depends(get_db)):
    """Return today's report, generating it on-demand if missing."""
    today = date.today()
    row   = db.query(DailyReport).filter(DailyReport.report_date == today).first()
    if row:
        return _serialize(row)
    # Generate on demand
    report = run_daily_analysis(today)
    if "error" in report:
        raise HTTPException(500, report["error"])
    row = db.query(DailyReport).filter(DailyReport.report_date == today).first()
    return _serialize(row) if row else report


@router.get("/{report_date}")
def get_report(report_date: str, db: Session = Depends(get_db)):
    """Return a specific day's report by date (YYYY-MM-DD)."""
    try:
        d = date.fromisoformat(report_date)
    except ValueError:
        raise HTTPException(400, "Invalid date format, use YYYY-MM-DD")

    row = db.query(DailyReport).filter(DailyReport.report_date == d).first()
    if not row:
        raise HTTPException(404, f"No report found for {report_date}")
    return _serialize(row)


@router.post("/generate")
def generate_report(report_date: str | None = None):
    """Manually trigger report generation for a given date (or today)."""
    target = date.fromisoformat(report_date) if report_date else date.today()
    result = run_daily_analysis(target)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return {"status": "generated", "date": target.isoformat(), "summary": result.get("summary")}
