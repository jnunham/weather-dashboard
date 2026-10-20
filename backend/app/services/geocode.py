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

"""Geocoding via Open-Meteo's free geocoding API.

Nominatim (OpenStreetMap) was tried first, but its public instance polices
request rate and origin IP reputation aggressively — even a single throttled
request can get a 403 from a datacenter/VPS IP, which is exactly where this
app is likely to run. Open-Meteo's geocoder is free, keyless, and explicitly
built for programmatic use (no per-second throttling), which fits better.
Docs: https://open-meteo.com/en/docs/geocoding-api
"""

from __future__ import annotations

import httpx
from fastapi import HTTPException

from ..cache import cached
from ..config import USER_AGENT

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
HEADERS = {"User-Agent": USER_AGENT}


async def _search(query: str, count: int) -> list[dict]:
    async def fetch():
        async with httpx.AsyncClient(headers=HEADERS, timeout=10) as client:
            try:
                resp = await client.get(GEOCODE_URL, params={"name": query, "count": count, "language": "en", "format": "json"})
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise HTTPException(exc.response.status_code, "Location search failed") from exc
            except httpx.HTTPError as exc:
                raise HTTPException(502, "Could not reach the location search service") from exc
            return resp.json()

    data = await cached(f"geocode:{count}:{query.lower()}", 86400, fetch)
    out = []
    for r in data.get("results") or []:
        label_parts = [r.get("name")]
        if r.get("admin1") and r["admin1"] != r.get("name"):
            label_parts.append(r["admin1"])
        if r.get("country") and r["country"] != r.get("admin1"):
            label_parts.append(r["country"])
        out.append({
            "lat": r["latitude"],
            "lon": r["longitude"],
            "label": ", ".join(p for p in label_parts if p),
            "country_code": r.get("country_code"),
        })
    return out


async def geocode(query: str) -> dict:
    results = await _search(query, 1)
    if not results:
        raise HTTPException(404, "Location not found")
    return results[0]


async def search(query: str, count: int = 6) -> list[dict]:
    """Several candidate matches, for a pick-from-a-list UI (the touchscreen
    city switcher) — "Chelsea" alone is Vermont to a one-result lookup, but
    someone may well mean Massachusetts or Michigan.

    Open-Meteo matches on the place *name* only, so "Boston, MA" finds nothing
    as written. Search the part before the first comma, and use anything after
    it (a state or country) just to narrow the list when that leaves something.
    """
    name, _, rest = query.partition(",")
    name, rest = name.strip(), rest.strip().lower()
    if not name:
        return []
    results = await _search(name, 10)
    if rest:
        narrowed = [r for r in results if rest in r["label"].lower().split(", ", 1)[-1]]
        results = narrowed or results
    # The forecast, alert and outlook data here is all US National Weather
    # Service / Storm Prediction Center, so a US match is the useful one —
    # list those first (sorted() is stable: otherwise the order is kept).
    results = sorted(results, key=lambda r: r.get("country_code") != "US")
    return results[:count]
