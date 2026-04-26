from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from db.connection import get_db
from db.models import Signal

router = APIRouter(prefix="/api/signals", tags=["signals"])


@router.get("")
def list_signals(limit: int = 200, db: Session = Depends(get_db)):
    rows = db.query(Signal).order_by(desc(Signal.ts)).limit(limit).all()
    return [
        {
            "id":           r.id,
            "ts":           r.ts,
            "signal_type":  r.signal_type,
            "price":        float(r.price),
            "ema9":         float(r.ema9) if r.ema9 else None,
            "ema21":        float(r.ema21) if r.ema21 else None,
            "rsi14":        float(r.rsi14) if r.rsi14 else None,
            "vwap":         float(r.vwap) if r.vwap else None,
            "vol_ratio":    float(r.vol_ratio) if r.vol_ratio else None,
            "risk_pass":    bool(r.risk_pass),
            "risk_reason":  r.risk_reason,
            "action_taken": r.action_taken,
            "reason":       r.reason,
        }
        for r in rows
    ]
