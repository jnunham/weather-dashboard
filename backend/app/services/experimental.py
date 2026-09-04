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

"""Experimental, model-guidance-derived products — heuristic scores computed
from raw forecast-model fields, in the spirit of the enthusiast "Nice Day
Forecast" / "Tornado Forecast" style products independent weather chasers
publish. These are NOT official NWS/SPC products: they're this app's own
weighted formula over ordinary forecast-model output, and every response
should be labeled as such in the UI.

Data source: Open-Meteo's forecast API (free, keyless, the same provider
already used for geocoding), which exposes daily-aggregated model fields
(temperature, precipitation, wind, sunshine, humidity) that NWS's own API
doesn't surface directly. Docs: https://open-meteo.com/en/docs
"""

from __future__ import annotations

from typing import Optional

import httpx
from fastapi import HTTPException

from ..cache import cached
from ..config import USER_AGENT

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HEADERS = {"User-Agent": USER_AGENT}

DAILY_FIELDS = ",".join(
    [
        "temperature_2m_max",
        "apparent_temperature_max",
        "precipitation_sum",
        "precipitation_probability_max",
        "windspeed_10m_max",
        "windgusts_10m_max",
        "sunshine_duration",
        "daylight_duration",
        "relative_humidity_2m_mean",
    ]
)

# Each factor is scored 0-100 independently, then combined by weight. Comfort
# (temperature) and rain matter most for whether a day is "nice"; sunshine
# matters next; wind and humidity are smaller modifiers. Purely a judgment
# call, not a validated model — tune freely.
WEIGHTS = {"temp": 0.30, "precip": 0.25, "sun": 0.20, "wind": 0.15, "humidity": 0.10}


def _temp_score(apparent_f: float) -> float:
    # Comfort band ~68-80°F scores perfectly; falls off further outside it,
    # bottoming out around 40°F/105°F.
    if 68 <= apparent_f <= 80:
        return 100.0
    if apparent_f < 68:
        return max(0.0, 100 - (68 - apparent_f) * 3.5)
    return max(0.0, 100 - (apparent_f - 80) * 4.0)


def _precip_score(prob_pct: float, sum_in: float) -> float:
    # Probability dominates; a nonzero total amount adds an extra penalty on
    # top, since even a low-probability downpour ruins the day if it hits.
    score = 100 - prob_pct
    if sum_in > 0.1:
        score -= min(30.0, sum_in * 40)
    return max(0.0, score)


def _wind_score(speed_mph: float, gust_mph: float) -> float:
    # Comfortable up to a light breeze; sustained wind past ~5 mph costs
    # steadily, and gusts past 25 mph dock extra on top of that.
    score = 100 - max(0.0, speed_mph - 5) * 4
    if gust_mph > 25:
        score -= min(30.0, (gust_mph - 25) * 2)
    return max(0.0, min(100.0, score))


def _sun_score(sunshine_s: float, daylight_s: float) -> float:
    if not daylight_s:
        return 50.0
    return max(0.0, min(100.0, sunshine_s / daylight_s * 100))


def _humidity_score(rh_pct: float) -> float:
    if rh_pct <= 60:
        return 100.0
    return max(0.0, 100 - (rh_pct - 60) * 2.5)


def _label(score: float) -> str:
    if score >= 85:
        return "Great"
    if score >= 70:
        return "Good"
    if score >= 55:
        return "Fair"
    if score >= 40:
        return "Meh"
    return "Not Great"


def _reasons(apparent_f: float, components: dict) -> list[str]:
    """Short plain-language notes for whichever factors dragged the score
    down, worst first — so the card can say *why*, not just show a number."""
    candidates = []
    if components["temp"] < 60:
        candidates.append((components["temp"], "cold" if apparent_f < 68 else "hot"))
    if components["precip"] < 60:
        candidates.append((components["precip"], "rain likely"))
    if components["sun"] < 45:
        candidates.append((components["sun"], "cloudy"))
    if components["wind"] < 60:
        candidates.append((components["wind"], "windy"))
    if components["humidity"] < 60:
        candidates.append((components["humidity"], "humid"))
    candidates.sort(key=lambda c: c[0])
    return [note for _, note in candidates[:2]]


def _score_day(i: int, daily: dict) -> Optional[dict]:
    try:
        apparent_f = daily["apparent_temperature_max"][i]
        high_f = daily["temperature_2m_max"][i]
        precip_prob = daily["precipitation_probability_max"][i]
        precip_sum = daily["precipitation_sum"][i]
        wind_mph = daily["windspeed_10m_max"][i]
        gust_mph = daily["windgusts_10m_max"][i]
        sunshine_s = daily["sunshine_duration"][i]
        daylight_s = daily["daylight_duration"][i]
        humidity_pct = daily["relative_humidity_2m_mean"][i]
    except (KeyError, IndexError):
        return None
    if apparent_f is None or high_f is None:
        return None

    components = {
        "temp": _temp_score(apparent_f),
        "precip": _precip_score(precip_prob or 0, precip_sum or 0),
        "sun": _sun_score(sunshine_s or 0, daylight_s or 0),
        "wind": _wind_score(wind_mph or 0, gust_mph or 0),
        "humidity": _humidity_score(humidity_pct if humidity_pct is not None else 50),
    }
    score = round(sum(WEIGHTS[k] * v for k, v in components.items()))

    return {
        "date": daily["time"][i],
        "score": score,
        "label": _label(score),
        "reasons": _reasons(apparent_f, components),
        "high_f": round(high_f),
        "precip_probability_pct": round(precip_prob) if precip_prob is not None else None,
        "wind_mph": round(wind_mph) if wind_mph is not None else None,
        "sunshine_pct": round(components["sun"]),
    }


async def get_nice_day_forecast(lat: float, lon: float) -> dict:
    async def fetch():
        async with httpx.AsyncClient(headers=HEADERS, timeout=10) as client:
            try:
                resp = await client.get(
                    FORECAST_URL,
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "daily": DAILY_FIELDS,
                        "temperature_unit": "fahrenheit",
                        "windspeed_unit": "mph",
                        "precipitation_unit": "inch",
                        "timezone": "auto",
                        "forecast_days": 7,
                    },
                )
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise HTTPException(exc.response.status_code, "Model guidance request failed") from exc
            except httpx.HTTPError as exc:
                raise HTTPException(502, "Could not reach the model guidance service") from exc
            return resp.json()

    # 30 min TTL: model runs update every few hours, so this just avoids
    # refetching on every dashboard refresh tick.
    data = await cached(f"nice-day:{lat:.4f},{lon:.4f}", 1800, fetch)
    daily = data.get("daily") or {}
    days = [_score_day(i, daily) for i in range(len(daily.get("time", [])))]
    return {"days": [d for d in days if d is not None]}
