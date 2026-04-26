"""
WebSocket endpoint — pushes live state to the dashboard every 10 seconds.
Falls back to Redis key tsla:live written by the execution loop.
"""
import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from state import get_live

router = APIRouter()
logger = logging.getLogger(__name__)

PUSH_INTERVAL = 10  # seconds


@router.websocket("/ws/live")
async def live_feed(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket client connected")
    try:
        while True:
            data = get_live()
            if data:
                await websocket.send_text(json.dumps(data))
            await asyncio.sleep(PUSH_INTERVAL)
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as exc:
        logger.error("WebSocket error: %s", exc)
