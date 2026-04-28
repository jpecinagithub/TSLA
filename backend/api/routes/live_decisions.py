"""
GET /api/live/decisions

Returns the real-time decision state of each agent:
  - Which conditions are passing / failing right now
  - Current signal (BUY / SELL / HOLD)
  - Open position for that strategy (if any)

Used by the Live Monitor dashboard section.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc

from db.connection import get_db
from db.models import Bar, Parameter, Trade

router = APIRouter(prefix="/api/live/decisions", tags=["live"])

STRATEGIES = [
    {"value": "ema_crossover",     "label": "EMA Crossover"},
    {"value": "momentum_breakout", "label": "Momentum Breakout"},
    {"value": "vwap_momentum",     "label": "VWAP Momentum"},
]


def _load_params(db: Session, strategy: str) -> dict:
    rows = db.query(Parameter).filter(Parameter.strategy == strategy).all()
    return {r.key_name: r.value for r in rows}


def _open_position(db: Session, strategy: str) -> dict | None:
    trade = db.query(Trade).filter(
        Trade.strategy == strategy,
        Trade.status == "OPEN",
    ).order_by(desc(Trade.entry_ts)).first()
    if trade is None:
        return None
    return {
        "trade_id":    trade.id,
        "entry_price": float(trade.entry_price),
        "shares":      float(trade.shares),
    }


def _conditions_ema(curr, prev, params: dict, pos: dict | None) -> list[dict]:
    rsi_ob     = float(params.get("rsi_overbought", 70))
    vol_mult   = float(params.get("vol_spike_mult", 1.2))
    profit_tgt = float(params.get("profit_target_pct", 0.5)) / 100
    stop_loss  = float(params.get("stop_loss_pct", 0.3)) / 100

    if pos:
        pnl_pct = (curr.close - pos["entry_price"]) / pos["entry_price"] * 100
        cross_down = (
            prev is not None
            and prev.ema9 is not None and prev.ema21 is not None
            and curr.ema9 is not None and curr.ema21 is not None
            and float(prev.ema9) >= float(prev.ema21)
            and float(curr.ema9) < float(curr.ema21)
        )
        return [
            {
                "name":    f"Profit target +{profit_tgt*100:.1f}%",
                "passing": pnl_pct >= profit_tgt * 100,
                "detail":  f"Current PnL: {pnl_pct:+.2f}%",
                "role":    "exit",
            },
            {
                "name":    f"Stop loss −{stop_loss*100:.1f}%",
                "passing": pnl_pct <= -stop_loss * 100,
                "detail":  f"Current PnL: {pnl_pct:+.2f}%",
                "role":    "exit",
            },
            {
                "name":    "EMA cross reversal (EMA9 < EMA21)",
                "passing": cross_down,
                "detail":  f"EMA9 {_f(curr.ema9)} vs EMA21 {_f(curr.ema21)}",
                "role":    "exit",
            },
        ]

    # Entry conditions
    cross_up = (
        prev is not None
        and prev.ema9 is not None and prev.ema21 is not None
        and curr.ema9 is not None and curr.ema21 is not None
        and float(prev.ema9) <= float(prev.ema21)
        and float(curr.ema9) > float(curr.ema21)
    )
    rsi_ok  = curr.rsi14 is not None and float(curr.rsi14) < rsi_ob
    vol_ok  = curr.vol_ratio is not None and float(curr.vol_ratio) >= vol_mult

    return [
        {
            "name":    "EMA9 crosses above EMA21",
            "passing": cross_up,
            "detail":  f"EMA9 {_f(curr.ema9)} vs EMA21 {_f(curr.ema21)} (prev: {_f(prev.ema9 if prev else None)} vs {_f(prev.ema21 if prev else None)})",
            "role":    "entry",
        },
        {
            "name":    f"RSI < {rsi_ob:.0f}",
            "passing": rsi_ok,
            "detail":  f"RSI {_f(curr.rsi14, 1)}",
            "role":    "entry",
        },
        {
            "name":    f"Vol ratio ≥ {vol_mult:.1f}×",
            "passing": vol_ok,
            "detail":  f"Vol ratio {_f(curr.vol_ratio, 2)}×",
            "role":    "entry",
        },
    ]


def _conditions_momentum(curr, prev, bars_window: list, params: dict, pos: dict | None) -> list[dict]:
    rsi_ob    = float(params.get("rsi_overbought", 70))
    rsi_min   = float(params.get("rsi_momentum_min", 50))
    vol_mult  = float(params.get("vol_spike_mult", 2.0))
    rsi_exit  = float(params.get("rsi_exit_level", 40))
    win       = int(params.get("breakout_window", 20))
    profit_tgt = float(params.get("profit_target_pct", 0.5)) / 100
    stop_loss  = float(params.get("stop_loss_pct", 0.3)) / 100

    if pos:
        pnl_pct = (curr.close - pos["entry_price"]) / pos["entry_price"] * 100
        rsi_exit_hit = curr.rsi14 is not None and float(curr.rsi14) < rsi_exit
        return [
            {
                "name":    f"Profit target +{profit_tgt*100:.1f}%",
                "passing": pnl_pct >= profit_tgt * 100,
                "detail":  f"Current PnL: {pnl_pct:+.2f}%",
                "role":    "exit",
            },
            {
                "name":    f"Stop loss −{stop_loss*100:.1f}%",
                "passing": pnl_pct <= -stop_loss * 100,
                "detail":  f"Current PnL: {pnl_pct:+.2f}%",
                "role":    "exit",
            },
            {
                "name":    f"RSI < {rsi_exit:.0f} (momentum lost)",
                "passing": rsi_exit_hit,
                "detail":  f"RSI {_f(curr.rsi14, 1)}",
                "role":    "exit",
            },
        ]

    # Breakout level from window bars
    breakout_level = None
    if len(bars_window) >= win:
        recent = [float(b.close) for b in bars_window[-win - 1:-1]]
        if recent:
            breakout_level = max(recent)

    price_ok  = breakout_level is not None and float(curr.close) > breakout_level
    rsi_ok    = (curr.rsi14 is not None
                 and rsi_min <= float(curr.rsi14) < rsi_ob)
    vol_ok    = curr.vol_ratio is not None and float(curr.vol_ratio) >= vol_mult

    bl_str = f"${breakout_level:.2f}" if breakout_level else "not enough bars"
    return [
        {
            "name":    f"Price > {win}-bar high",
            "passing": price_ok,
            "detail":  f"Price ${_f(curr.close)} vs high {bl_str}",
            "role":    "entry",
        },
        {
            "name":    f"RSI {rsi_min:.0f}–{rsi_ob:.0f}",
            "passing": rsi_ok,
            "detail":  f"RSI {_f(curr.rsi14, 1)}",
            "role":    "entry",
        },
        {
            "name":    f"Vol ratio ≥ {vol_mult:.1f}×",
            "passing": vol_ok,
            "detail":  f"Vol ratio {_f(curr.vol_ratio, 2)}×",
            "role":    "entry",
        },
    ]


def _conditions_vwap(curr, prev, params: dict, pos: dict | None) -> list[dict]:
    rsi_ob     = float(params.get("rsi_overbought", 65))
    rsi_min    = float(params.get("rsi_momentum_min", 45))
    vol_mult   = float(params.get("vol_spike_mult", 1.5))
    vwap_buf   = float(params.get("vwap_exit_buffer", 0.1)) / 100
    profit_tgt = float(params.get("profit_target_pct", 0.5)) / 100
    stop_loss  = float(params.get("stop_loss_pct", 0.3)) / 100

    if pos:
        pnl_pct = (curr.close - pos["entry_price"]) / pos["entry_price"] * 100
        vwap_reject = (
            curr.vwap is not None
            and float(curr.close) < float(curr.vwap) * (1 - vwap_buf)
        )
        return [
            {
                "name":    f"Profit target +{profit_tgt*100:.1f}%",
                "passing": pnl_pct >= profit_tgt * 100,
                "detail":  f"Current PnL: {pnl_pct:+.2f}%",
                "role":    "exit",
            },
            {
                "name":    f"Stop loss −{stop_loss*100:.1f}%",
                "passing": pnl_pct <= -stop_loss * 100,
                "detail":  f"Current PnL: {pnl_pct:+.2f}%",
                "role":    "exit",
            },
            {
                "name":    f"Price drops {vwap_buf*100:.2f}% below VWAP",
                "passing": vwap_reject,
                "detail":  f"Price ${_f(curr.close)} vs VWAP ${_f(curr.vwap)}",
                "role":    "exit",
            },
        ]

    vwap_cross = (
        prev is not None
        and prev.vwap is not None and curr.vwap is not None
        and float(prev.close) <= float(prev.vwap)
        and float(curr.close) > float(curr.vwap)
    )
    rsi_ok = (curr.rsi14 is not None
              and rsi_min <= float(curr.rsi14) < rsi_ob)
    vol_ok = curr.vol_ratio is not None and float(curr.vol_ratio) >= vol_mult

    prev_pos = f"${_f(prev.close)} vs VWAP ${_f(prev.vwap)}" if prev else "no prev bar"
    return [
        {
            "name":    "Price crosses above VWAP",
            "passing": vwap_cross,
            "detail":  f"Prev: {prev_pos} → Now: ${_f(curr.close)} vs VWAP ${_f(curr.vwap)}",
            "role":    "entry",
        },
        {
            "name":    f"RSI {rsi_min:.0f}–{rsi_ob:.0f}",
            "passing": rsi_ok,
            "detail":  f"RSI {_f(curr.rsi14, 1)}",
            "role":    "entry",
        },
        {
            "name":    f"Vol ratio ≥ {vol_mult:.1f}×",
            "passing": vol_ok,
            "detail":  f"Vol ratio {_f(curr.vol_ratio, 2)}×",
            "role":    "entry",
        },
    ]


def _signal_from_conditions(conditions: list[dict], pos: dict | None) -> str:
    if pos:
        # In a position: any exit condition triggers SELL
        if any(c["passing"] for c in conditions):
            return "SELL"
        return "HOLD"
    else:
        # No position: all entry conditions must pass
        if all(c["passing"] for c in conditions):
            return "BUY"
        return "HOLD"


def _f(val, d: int = 2) -> str:
    if val is None:
        return "—"
    try:
        return f"{float(val):.{d}f}"
    except (TypeError, ValueError):
        return "—"


@router.get("")
def get_live_decisions(db: Session = Depends(get_db)):
    # Fetch last 35 bars (need 20+ for breakout window + 2 for cross detection)
    bars = (
        db.query(Bar)
        .filter(Bar.ema9.isnot(None))   # only bars with computed indicators
        .order_by(desc(Bar.ts))
        .limit(35)
        .all()
    )
    bars = list(reversed(bars))   # oldest → newest

    if len(bars) < 2:
        return {"error": "Not enough bars with indicators yet", "agents": []}

    curr = bars[-1]
    prev = bars[-2]

    result = []
    for strat in STRATEGIES:
        name   = strat["value"]
        params = _load_params(db, name)
        pos    = _open_position(db, name)

        if name == "ema_crossover":
            conditions = _conditions_ema(curr, prev, params, pos)
        elif name == "momentum_breakout":
            conditions = _conditions_momentum(curr, prev, bars, params, pos)
        else:
            conditions = _conditions_vwap(curr, prev, params, pos)

        signal = _signal_from_conditions(conditions, pos)
        mode   = "exit" if pos else "entry"

        result.append({
            "strategy":     name,
            "label":        strat["label"],
            "signal":       signal,
            "mode":         mode,
            "open_position": {
                "entry_price": pos["entry_price"],
                "shares":      pos["shares"],
                "pnl_pct":     round(
                    (float(curr.close) - pos["entry_price"]) / pos["entry_price"] * 100, 2
                ),
            } if pos else None,
            "conditions":   conditions,
        })

    return {
        "ts":     curr.ts,
        "close":  float(curr.close),
        "agents": result,
    }
