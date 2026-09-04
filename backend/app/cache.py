# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Weather Dashboard contributors
#
# This program is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the
# Free Software Foundation, either version 3 of the License, or (at your
# option) any later version. See the LICENSE file for the full text.
#
# This program is distributed WITHOUT ANY WARRANTY and is not a certified
# life-safety system — during severe weather, always follow official
# guidance from the National Weather Service and local emergency
# management, not this app.

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
