"""
Optimizer API — history and manual trigger for parameter optimization.
"""
import json

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from db.connection import get_db
from db.models import OptimizationRun, ParamAudit

router = APIRouter(prefix="/api/optimizer", tags=["optimizer"])

_running = False   # simple in-process guard


def _serialize_run(r: OptimizationRun) -> dict:
    return {
        "id":                   r.id,
        "run_ts":               r.run_ts.isoformat(),
        "bars_used":            r.bars_used,
        "combinations_tested":  r.combinations_tested,
        "best_params":          json.loads(r.best_params_json) if r.best_params_json else {},
        "baseline_pnl":         float(r.baseline_pnl) if r.baseline_pnl is not None else None,
        "best_pnl":             float(r.best_pnl)     if r.best_pnl     is not None else None,
        "improvement_pct":      float(r.improvement_pct) if r.improvement_pct is not None else None,
        "applied":              bool(r.applied),
        "apply_reason":         r.apply_reason,
    }


@router.get("/history")
def optimizer_history(limit: int = 20, db: Session = Depends(get_db)):
    """Return the N most recent optimization runs."""
    rows = (db.query(OptimizationRun)
            .order_by(OptimizationRun.run_ts.desc())
            .limit(limit)
            .all())
    return [_serialize_run(r) for r in rows]


@router.get("/param-history")
def param_history(limit: int = 50, db: Session = Depends(get_db)):
    """Return recent parameter changes (manual + optimizer)."""
    rows = (db.query(ParamAudit)
            .order_by(ParamAudit.ts.desc())
            .limit(limit)
            .all())
    return [
        {
            "ts":         r.ts.isoformat(),
            "key_name":   r.key_name,
            "old_value":  r.old_value,
            "new_value":  r.new_value,
            "changed_by": getattr(r, "changed_by", "manual"),
        }
        for r in rows
    ]


@router.post("/run")
def trigger_optimization(background_tasks: BackgroundTasks):
    """
    Manually trigger an optimization run in the background.
    Returns immediately — poll /history to see the result.
    """
    global _running
    if _running:
        return {"status": "already_running"}

    def _run():
        global _running
        _running = True
        try:
            from optimizer.param_optimizer import run_optimization
            run_optimization(auto_apply=True)
        finally:
            _running = False

    background_tasks.add_task(_run)
    return {"status": "started"}


@router.get("/status")
def optimizer_status():
    """Quick check whether an optimization run is in progress."""
    return {"running": _running}
