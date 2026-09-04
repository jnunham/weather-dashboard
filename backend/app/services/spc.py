"""Wrappers around spc.noaa.gov (Storm Prediction Center): convective outlooks
(GeoJSON) and the Mesoscale Discussion / Watch RSS feeds."""

from __future__ import annotations

import re

import feedparser
import httpx
from fastapi import HTTPException

from ..cache import cached
from ..config import USER_AGENT

SPC_BASE = "https://www.spc.noaa.gov"
HEADERS = {"User-Agent": USER_AGENT}

VALID_DAYS = {"1", "2", "3"}
VALID_HAZARDS = {"cat", "torn", "hail", "wind", "prob"}

_IMG_RE = re.compile(r'<img[^>]*src="([^"]+)"', re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]*>")


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


def _extract_image(html: str) -> str | None:
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


async def get_mesoscale_discussions() -> dict:
    async def fetch():
        return await _fetch_rss_items(f"{SPC_BASE}/products/spcmdrss.xml")

    return {"items": await cached("spc-mds", 60, fetch)}


async def get_watches() -> dict:
    async def fetch():
        return await _fetch_rss_items(f"{SPC_BASE}/products/spcwwrss.xml")

    return {"items": await cached("spc-watches", 60, fetch)}
