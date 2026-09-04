"""Tiny in-memory async TTL cache.

Good enough for a low-traffic personal dashboard: avoids hammering NWS/SPC on
every browser refresh and collapses concurrent requests for the same key into
a single upstream fetch. Swap for Redis if this ever needs multiple worker
processes.
"""

from __future__ import annotations

import asyncio
import time
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")

_store: dict[str, dict] = {}
_locks: dict[str, asyncio.Lock] = {}


async def cached(key: str, ttl_seconds: float, fetch_fn: Callable[[], Awaitable[T]]) -> T:
    entry = _store.get(key)
    now = time.time()
    if entry and now - entry["ts"] < ttl_seconds:
        return entry["value"]

    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        entry = _store.get(key)
        if entry and time.time() - entry["ts"] < ttl_seconds:
            return entry["value"]
        value = await fetch_fn()
        _store[key] = {"value": value, "ts": time.time()}
        return value
