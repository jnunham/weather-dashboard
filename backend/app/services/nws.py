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

"""Wrappers around api.weather.gov (National Weather Service API).

No API key required; NWS just asks for a descriptive User-Agent. Docs:
https://www.weather.gov/documentation/services-web-api
"""

from __future__ import annotations

import re

import httpx
from fastapi import HTTPException

from ..cache import cached
from ..config import USER_AGENT

NWS_BASE = "https://api.weather.gov"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/geo+json"}


async def _get_json(url: str, params: dict | None = None) -> dict:
    """GET JSON from NWS, converting any failure into a clean HTTPException
    instead of letting httpx exceptions escape as raw 500s."""

    async with httpx.AsyncClient(headers=HEADERS, timeout=15) as client:
        try:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            # NWS returns 404 for an unknown point and 400 for a point outside
            # its coverage area (varies by endpoint) — both mean "can't serve
            # this location" as far as callers are concerned.
            raise HTTPException(exc.response.status_code, f"api.weather.gov returned {exc.response.status_code}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(502, "Could not reach api.weather.gov") from exc
        return resp.json()


def _point_key(lat: float, lon: float) -> str:
    return f"{lat:.4f},{lon:.4f}"


async def get_state_abbr(lat: float, lon: float) -> str | None:
    """Two-letter state/territory abbreviation for a point, e.g. "MI"."""
    point = await get_point_meta(lat, lon)
    return (point.get("relativeLocation") or {}).get("properties", {}).get("state")


async def get_point_meta(lat: float, lon: float) -> dict:
    """Resolve a lat/lon to forecast office, forecast URLs, and observation stations URL."""

    async def fetch():
        try:
            data = await _get_json(f"{NWS_BASE}/points/{_point_key(lat, lon)}")
        except HTTPException as exc:
            if exc.status_code == 404:
                raise HTTPException(
                    404,
                    "This location is outside NWS coverage (the National Weather Service only covers the "
                    "US and its territories).",
                ) from exc
            raise
        return data["properties"]

    return await cached(f"point:{_point_key(lat, lon)}", 3600, fetch)


def c_to_f(c):
    return None if c is None else round(c * 9 / 5 + 32, 1)


def kmh_to_mph(kmh):
    return None if kmh is None else round(kmh * 0.621371, 1)


def pa_to_inhg(pa):
    return None if pa is None else round(pa / 3386.39, 2)


def m_to_mi(m):
    return None if m is None else round(m / 1609.34, 1)


def deg_to_compass(deg):
    if deg is None:
        return None
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return dirs[round(deg / 22.5) % 16]


async def get_current_conditions(lat: float, lon: float) -> dict:
    point = await get_point_meta(lat, lon)

    async def fetch_stations():
        return await _get_json(point["observationStations"])

    stations = await cached(f"stations:{point['observationStations']}", 3600, fetch_stations)
    features = stations.get("features", [])
    if not features:
        raise HTTPException(404, "No observation stations found near this location")
    station = features[0]
    station_id_url = station["id"]
    station_name = station["properties"]["name"]

    async def fetch_obs():
        return await _get_json(f"{station_id_url}/observations/latest")

    # Short TTL: this is the most time-sensitive endpoint.
    obs = await cached(f"obs:{station_id_url}", 60, fetch_obs)
    p = obs["properties"]

    temp_f = c_to_f(p["temperature"]["value"])
    wind_chill_f = c_to_f((p.get("windChill") or {}).get("value"))
    heat_index_f = c_to_f((p.get("heatIndex") or {}).get("value"))

    return {
        "station_name": station_name,
        "observed_at": p.get("timestamp"),
        "text_description": p.get("textDescription"),
        "temperature_f": temp_f,
        "feels_like_f": wind_chill_f or heat_index_f or temp_f,
        "humidity_pct": round(p["relativeHumidity"]["value"], 0) if p.get("relativeHumidity", {}).get("value") is not None else None,
        "wind_mph": kmh_to_mph(p["windSpeed"]["value"]),
        "wind_gust_mph": kmh_to_mph(p["windGust"]["value"]),
        "wind_direction": deg_to_compass(p["windDirection"]["value"]),
        "pressure_inhg": pa_to_inhg(p["barometricPressure"]["value"]),
        "visibility_mi": m_to_mi(p["visibility"]["value"]),
    }


async def get_forecast(lat: float, lon: float) -> dict:
    point = await get_point_meta(lat, lon)

    async def fetch():
        return await _get_json(point["forecast"])

    data = await cached(f"forecast:{point['forecast']}", 900, fetch)
    periods = data["properties"]["periods"][:6]
    return {
        "periods": [
            {
                "name": p["name"],
                "temperature": p["temperature"],
                "temperature_unit": p["temperatureUnit"],
                "short_forecast": p["shortForecast"],
                "wind_speed": p.get("windSpeed"),
                "wind_direction": p.get("windDirection"),
            }
            for p in periods
        ]
    }


async def get_afd(lat: float, lon: float) -> dict:
    point = await get_point_meta(lat, lon)
    office_id = point["forecastOffice"].rstrip("/").split("/")[-1]

    async def fetch_list():
        return await _get_json(f"{NWS_BASE}/products/types/AFD/locations/{office_id}")

    listing = await cached(f"afd-list:{office_id}", 900, fetch_list)
    graph = listing.get("@graph", [])
    if not graph:
        raise HTTPException(404, f"No Area Forecast Discussion found for office {office_id}")
    latest_id = graph[0]["id"]

    async def fetch_product():
        return await _get_json(f"{NWS_BASE}/products/{latest_id}")

    product = await cached(f"afd-product:{latest_id}", 900, fetch_product)
    text = product.get("productText") or ""
    return {
        "office_id": office_id,
        "issuance_time": product.get("issuanceTime"),
        "text": text,
        "key_messages": _extract_key_messages(text),
    }


def _extract_key_messages(text: str) -> str | None:
    """Pull the .KEY MESSAGES... section AFD text usually leads with — not
    every office's template includes one, hence the Optional return."""
    match = re.search(r"\.KEY MESSAGES\.\.\.\s*\n(.*?)\n&&", text, re.IGNORECASE | re.DOTALL)
    return match.group(1).strip() if match else None


async def get_alerts(lat: float, lon: float) -> dict:
    """Active alerts for the point's entire state, not just its exact zone.

    A point-only query misses a storm bearing down from a neighboring county
    — statewide gives situational awareness of what's coming, with each
    alert flagged `is_local` (true UGC match against the point's own county,
    via NWS's own zone codes — not a guess) so the UI can prioritize what's
    actually overhead vs. what's still upstream.
    """
    point = await get_point_meta(lat, lon)
    state = await get_state_abbr(lat, lon)
    county_ugc = point["county"].rstrip("/").split("/")[-1] if point.get("county") else None

    async def fetch():
        try:
            if state:
                return await _get_json(f"{NWS_BASE}/alerts/active", params={"area": state})
            return await _get_json(f"{NWS_BASE}/alerts/active", params={"point": _point_key(lat, lon)})
        except HTTPException as exc:
            # NWS rejects points/areas outside its coverage with a 400 here
            # (rather than the 404 /points/ uses) — treat it as "no alerts"
            # rather than an error, since the other cards already surface a
            # clear "outside NWS coverage" message for the same location.
            if exc.status_code in (400, 404):
                return {"features": []}
            raise

    data = await cached(f"alerts:{state or _point_key(lat, lon)}", 60, fetch)
    alerts = []
    for f in data.get("features", []):
        p = f["properties"]
        ugc_list = (p.get("geocode") or {}).get("UGC", [])
        alerts.append({
            "id": p.get("id"),
            "event": p.get("event"),
            "headline": p.get("headline"),
            "severity": p.get("severity"),
            "urgency": p.get("urgency"),
            "area_desc": p.get("areaDesc"),
            "effective": p.get("effective"),
            "expires": p.get("expires"),
            "geometry": f.get("geometry"),
            "is_local": bool(county_ugc and county_ugc in ugc_list),
        })
    # Local alerts first; NWS's own ordering (roughly severity/recency) is
    # otherwise preserved within each group since sort() is stable.
    alerts.sort(key=lambda a: not a["is_local"])
    return {"alerts": alerts, "state": state}
