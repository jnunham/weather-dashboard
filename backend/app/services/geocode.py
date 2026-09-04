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


async def geocode(query: str) -> dict:
    async def fetch():
        async with httpx.AsyncClient(headers=HEADERS, timeout=10) as client:
            try:
                resp = await client.get(GEOCODE_URL, params={"name": query, "count": 1, "language": "en", "format": "json"})
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise HTTPException(exc.response.status_code, "Location search failed") from exc
            except httpx.HTTPError as exc:
                raise HTTPException(502, "Could not reach the location search service") from exc
            return resp.json()

    data = await cached(f"geocode:{query.lower()}", 86400, fetch)
    results = data.get("results") or []
    if not results:
        raise HTTPException(404, "Location not found")

    top = results[0]
    label_parts = [top.get("name")]
    if top.get("admin1") and top["admin1"] != top.get("name"):
        label_parts.append(top["admin1"])
    if top.get("country") and top["country"] != top.get("admin1"):
        label_parts.append(top["country"])

    return {
        "lat": top["latitude"],
        "lon": top["longitude"],
        "label": ", ".join(p for p in label_parts if p),
    }
