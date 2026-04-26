from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from db.connection import get_db
from db.models import Bar

router = APIRouter(prefix="/api/bars", tags=["bars"])


@router.get("")
def list_bars(limit: int = 390, db: Session = Depends(get_db)):
    rows = db.query(Bar).order_by(desc(Bar.ts)).limit(limit).all()
    rows.reverse()
    return [
        {
            "ts":        r.ts,
            "open":      float(r.open),
            "high":      float(r.high),
            "low":       float(r.low),
            "close":     float(r.close),
            "volume":    r.volume,
            "ema9":      float(r.ema9)      if r.ema9      else None,
            "ema21":     float(r.ema21)     if r.ema21     else None,
            "rsi14":     float(r.rsi14)     if r.rsi14     else None,
            "vwap":      float(r.vwap)      if r.vwap      else None,
            "vol_ratio": float(r.vol_ratio) if r.vol_ratio else None,
        }
        for r in rows
    ]
