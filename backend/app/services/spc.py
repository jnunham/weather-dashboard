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

"""Wrappers around spc.noaa.gov (Storm Prediction Center): convective outlooks
(GeoJSON) and the Mesoscale Discussion / Watch RSS feeds."""

from __future__ import annotations

import asyncio
import re
from typing import Optional

import feedparser
import httpx
from fastapi import HTTPException

from ..cache import cached
from ..config import USER_AGENT
from .nws import get_state_abbr

SPC_BASE = "https://www.spc.noaa.gov"
HEADERS = {"User-Agent": USER_AGENT}

VALID_DAYS = {"1", "2", "3"}
VALID_HAZARDS = {"cat", "torn", "hail", "wind", "prob"}

_IMG_RE = re.compile(r'<img[^>]*src="([^"]+)"', re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]*>")

# The RSS feeds don't carry structured geometry, just free text — MDs and
# watches reliably spell out full state names in caps ("...SOUTHERN LOWER
# MICHIGAN...NORTHERN OHIO..."), so matching the state's full name against
# that text is a simple, honest way to filter to "relevant to here" without
# pretending to a precision (exact polygon geometry) these feeds don't offer.
STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois",
    "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon",
    "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia",
    "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
    "PR": "Puerto Rico",
}


async def get_outlook(day: str, hazard: str) -> dict:
    if day not in VALID_DAYS:
        raise HTTPException(400, f"day must be one of {sorted(VALID_DAYS)}")
    if hazard not in VALID_HAZARDS:
        raise HTTPException(400, f"hazard must be one of {sorted(VALID_HAZARDS)}")

    url = f"{SPC_BASE}/products/outlook/day{day}otlk_{hazard}.nolyr.geojson"

    async def fetch():
        async with httpx.AsyncClient(headers=HEADERS, timeout=15) as client:
            try:
                resp = await client.get(url)
                if resp.status_code == 404:
                    # e.g. day 3 has no torn/hail/wind hazard layers
                    raise HTTPException(404, f"No outlook layer for day={day} hazard={hazard}")
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise HTTPException(exc.response.status_code, "spc.noaa.gov outlook request failed") from exc
            except httpx.HTTPError as exc:
                raise HTTPException(502, "Could not reach spc.noaa.gov") from exc
            return resp.json()

    return await cached(f"outlook:{day}:{hazard}", 300, fetch)


def _strip_html(html: str) -> str:
    return re.sub(r"\s+", " ", _TAG_RE.sub(" ", html)).strip()


def _extract_image(html: str) -> Optional[str]:
    m = _IMG_RE.search(html)
    return m.group(1) if m else None


async def _fetch_rss_items(url: str) -> list[dict]:
    async with httpx.AsyncClient(headers=HEADERS, timeout=15) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(exc.response.status_code, "spc.noaa.gov feed request failed") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(502, "Could not reach spc.noaa.gov") from exc
        text = resp.text

    parsed = feedparser.parse(text)
    items = []
    for entry in parsed.entries:
        description = entry.get("summary", "") or entry.get("description", "")
        items.append({
            "title": entry.get("title", ""),
            "link": entry.get("link", ""),
            "text": _strip_html(description)[:400],
            "image_url": _extract_image(description),
            "published": entry.get("published"),
        })
    return items


async def _state_name_for(lat: Optional[float], lon: Optional[float]) -> Optional[str]:
    if lat is None or lon is None:
        return None
    try:
        abbr = await get_state_abbr(lat, lon)
    except HTTPException:
        # State filtering is a nice-to-have on top of the feed, not a
        # requirement — if NWS's point lookup fails for any reason, fall
        # back to the unfiltered list instead of failing the whole request.
        return None
    return STATE_NAMES.get(abbr) if abbr else None


def _mentions_state(item: dict, state_name: str) -> bool:
    haystack = f"{item['title']} {item['text']}".upper()
    return state_name.upper() in haystack


async def get_mesoscale_discussions(lat: Optional[float] = None, lon: Optional[float] = None) -> dict:
    async def fetch():
        return await _fetch_rss_items(f"{SPC_BASE}/products/spcmdrss.xml")

    # Run the RSS fetch and the state lookup concurrently rather than one
    # after the other — they're independent, and awaiting them in sequence
    # was needlessly doubling the wait (each can take a few seconds on its
    # own, which was likely presenting as the scene getting stuck loading).
    items, state_name = await asyncio.gather(
        cached("spc-mds", 60, fetch),
        _state_name_for(lat, lon),
    )
    if state_name:
        items = [it for it in items if _mentions_state(it, state_name)]

    return {"items": items, "filtered_to_state": state_name}
