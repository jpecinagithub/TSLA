from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db.connection import get_db
from db.models import Portfolio, Trade
from sqlalchemy import func

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("")
def get_portfolio(db: Session = Depends(get_db)):
    p = db.get(Portfolio, 1)
    total_trades  = db.query(func.count(Trade.id)).filter(Trade.status == "CLOSED").scalar()
    winning       = db.query(func.count(Trade.id)).filter(Trade.status == "CLOSED", Trade.net_pnl > 0).scalar()
    win_rate      = round(winning / total_trades * 100, 1) if total_trades else 0

    return {
        "capital":          float(p.capital),
        "initial_capital":  float(p.initial_capital),
        "realized_pnl":     float(p.realized_pnl),
        "daily_pnl":        float(p.daily_pnl),
        "daily_loss_halt":  bool(p.daily_loss_halt),
        "pnl_pct":          round((float(p.capital) - float(p.initial_capital)) / float(p.initial_capital) * 100, 2),
        "total_trades":     total_trades,
        "win_rate":         win_rate,
        "last_updated":     p.last_updated,
    }
