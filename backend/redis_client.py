import json
import redis
from config import REDIS_HOST, REDIS_PORT

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    return _client


def set_json(key: str, value: dict, ex: int | None = None) -> None:
    get_redis().set(key, json.dumps(value), ex=ex)


def get_json(key: str) -> dict | None:
    raw = get_redis().get(key)
    return json.loads(raw) if raw else None
