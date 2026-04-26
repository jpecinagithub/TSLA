from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from db.connection import get_db
from db.models import Trade, Portfolio

router = APIRouter(prefix="/api/performance", tags=["performance"])


@router.get("")
def get_performance(db: Session = Depends(get_db)):
    closed = db.query(Trade).filter(Trade.status == "CLOSED").all()
    if not closed:
        return {"message": "No closed trades yet"}

    net_pnls   = [float(t.net_pnl) for t in closed if t.net_pnl is not None]
    wins       = [p for p in net_pnls if p > 0]
    losses     = [p for p in net_pnls if p <= 0]
    gross_wins = sum(wins)
    gross_loss = abs(sum(losses))

    portfolio  = db.get(Portfolio, 1)

    # Equity curve: cumulative PnL per trade sorted by exit time
    equity = []
    cumulative = 0.0
    for t in sorted(closed, key=lambda x: x.exit_ts):
        if t.net_pnl:
            cumulative += float(t.net_pnl)
            equity.append({"ts": t.exit_ts, "cumulative_pnl": round(cumulative, 4)})

    return {
        "total_trades":   len(closed),
        "win_rate":       round(len(wins) / len(net_pnls) * 100, 2) if net_pnls else 0,
        "profit_factor":  round(gross_wins / gross_loss, 3) if gross_loss > 0 else None,
        "avg_win":        round(sum(wins) / len(wins), 4) if wins else 0,
        "avg_loss":       round(sum(losses) / len(losses), 4) if losses else 0,
        "total_pnl":      round(sum(net_pnls), 4),
        "max_drawdown":   _max_drawdown(equity),
        "equity_curve":   equity,
    }


def _max_drawdown(equity: list[dict]) -> float:
    if not equity:
        return 0.0
    peak = float("-inf")
    max_dd = 0.0
    for point in equity:
        val = point["cumulative_pnl"]
        if val > peak:
            peak = val
        dd = peak - val
        if dd > max_dd:
            max_dd = dd
    return round(max_dd, 4)
