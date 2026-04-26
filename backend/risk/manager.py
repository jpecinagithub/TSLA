"""
Risk Manager — absolute authority over all trade execution.
No trade may bypass this module.
"""
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class RiskDecision:
    approved:  bool
    reason:    str
    shares:    float = 0.0


def validate_buy(
    price: float,
    capital: float,
    daily_pnl: float,
    trades_today: int,
    params: dict,
) -> RiskDecision:
    """
    Returns RiskDecision for a proposed BUY.
    shares = risk_amount / (price * stop_loss_pct)  — position sizing formula.
    """
    max_risk_pct      = float(params.get("max_risk_pct", 1.0)) / 100
    max_daily_loss    = float(params.get("max_daily_loss_pct", 3.0)) / 100
    stop_loss_pct     = float(params.get("stop_loss_pct", 0.3)) / 100
    max_trades_day    = int(params.get("max_trades_day", 10))

    if daily_pnl <= -(capital * max_daily_loss):
        return RiskDecision(False, f"daily loss limit reached ({daily_pnl:.2f})")

    if trades_today >= max_trades_day:
        return RiskDecision(False, f"max trades/day reached ({trades_today})")

    if capital <= 0:
        return RiskDecision(False, "no capital available")

    risk_amount = capital * max_risk_pct
    shares = risk_amount / (price * stop_loss_pct)

    if shares * price > capital:
        shares = capital / price

    if shares <= 0:
        return RiskDecision(False, "computed shares <= 0")

    return RiskDecision(True, "risk checks passed", round(shares, 6))


def validate_sell(open_position: dict | None) -> RiskDecision:
    if open_position is None:
        return RiskDecision(False, "no open position to sell")
    return RiskDecision(True, "sell approved", open_position["shares"])
