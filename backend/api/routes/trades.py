from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from db.connection import get_db
from db.models import Trade

router = APIRouter(prefix="/api/trades", tags=["trades"])


@router.get("")
def list_trades(
    limit: int = 100,
    strategy: str = Query(default="ema_crossover"),
    db: Session = Depends(get_db),
):
    rows = db.query(Trade).filter(Trade.strategy == strategy).order_by(desc(Trade.entry_ts)).limit(limit).all()
    return [
        {
            "id":          r.id,
            "strategy":    r.strategy,
            "entry_ts":    r.entry_ts,
            "exit_ts":     r.exit_ts,
            "entry_price": float(r.entry_price),
            "exit_price":  float(r.exit_price) if r.exit_price else None,
            "shares":      float(r.shares),
            "gross_pnl":   float(r.gross_pnl) if r.gross_pnl else None,
            "net_pnl":     float(r.net_pnl) if r.net_pnl else None,
            "exit_reason": r.exit_reason,
            "status":      r.status,
        }
        for r in rows
    ]
