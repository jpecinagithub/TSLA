"""
Risk Manager — absolute authority over all trade execution.
No trade may bypass this module.
"""
import logging
import math
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

    slippage_pct = float(params.get("slippage_pct", 0.05)) / 100
    risk_amount = capital * max_risk_pct
    shares = risk_amount / (price * stop_loss_pct)

    # Cap so that total cost (price × shares + slippage) never exceeds capital.
    # Use floor at 6 decimal places (not round) to guarantee total_cost <= capital
    # after floating-point arithmetic inside paper_broker.
    if shares * price * (1 + slippage_pct) > capital:
        shares = math.floor(capital / (price * (1 + slippage_pct)) * 1_000_000) / 1_000_000

    if shares <= 0:
        return RiskDecision(False, "computed shares <= 0")

    return RiskDecision(True, "risk checks passed", round(shares, 6))


def validate_sell(open_position: dict | None) -> RiskDecision:
    if open_position is None:
        return RiskDecision(False, "no open position to sell")
    return RiskDecision(True, "sell approved", open_position["shares"])
