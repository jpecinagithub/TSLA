"""
Shared in-memory state between the scheduler and the WebSocket endpoint.
Both run in the same process — no Redis needed.
"""
from typing import Any

_live: dict[str, Any] = {}


def set_live(data: dict) -> None:
    global _live
    _live = data


def get_live() -> dict:
    return _live
