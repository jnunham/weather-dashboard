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

from __future__ import annotations

from xml.etree import ElementTree

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

from ..cache import cached
from ..config import USER_AGENT
from ..services import nws

router = APIRouter(prefix="/api/radar-products", tags=["radar-products"])

HEADERS = {"User-Agent": USER_AGENT}
GEOSERVER_BASE = "https://opengeo.ncep.noaa.gov/geoserver"

# Single-site NEXRAD Level 3 products via NOAA's own GeoServer WMS — no key,
# CORS-open, and (unlike RainViewer) gives real reflectivity/velocity per
# radar site instead of just a national composite mosaic. Each layer also
# publishes a WMS time dimension (see get_available_times), so these can be
# animated rather than shown as a single static frame.
PRODUCT_LAYERS = {
    "reflectivity": "{site}_sr_bref",
    "velocity": "{site}_sr_bvel",
}


def _layer_name(site: str, product: str) -> str:
    template = PRODUCT_LAYERS.get(product)
    if not template:
        raise HTTPException(400, f"product must be one of {sorted(PRODUCT_LAYERS)}")
    return template.format(site=site)


@router.get("/site")
async def radar_site(lat: float = Query(...), lon: float = Query(...)):
    point = await nws.get_point_meta(lat, lon)
    site = point.get("radarStation")
    if not site:
        raise HTTPException(404, "No radar site found for this location")
    return {"site": site.lower()}


@router.get("/{site}/{product}/times")
async def product_times(site: str, product: str):
    site = site.lower()
    layer_name = _layer_name(site, product)

    async def fetch():
        params = {"service": "WMS", "version": "1.1.1", "request": "GetCapabilities"}
        async with httpx.AsyncClient(headers=HEADERS, timeout=15) as client:
            try:
                resp = await client.get(f"{GEOSERVER_BASE}/{site}/ows", params=params)
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise HTTPException(502, f"Could not reach NOAA radar imagery for {site}") from exc
        return resp.text

    xml_text = await cached(f"radar-caps:{site}", 120, fetch)
    root = ElementTree.fromstring(xml_text)
    for layer in root.iter("Layer"):
        name_el = layer.find("Name")
        if name_el is not None and name_el.text == layer_name:
            dim_el = layer.find("Dimension")
            if dim_el is not None and dim_el.text:
                return {"times": [t.strip() for t in dim_el.text.split(",") if t.strip()]}
    return {"times": []}


@router.get("/{site}/{product}.png")
async def product_image(
    site: str,
    product: str,
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat"),
    width: int = Query(700, le=1600),
    height: int = Query(700, le=1600),
    time: str | None = Query(None),
):
    site = site.lower()
    params = {
        "service": "WMS",
        "version": "1.1.1",  # 1.1.1 keeps EPSG:4326 in lon,lat order, matching `bbox` here
        "request": "GetMap",
        "layers": _layer_name(site, product),
        "bbox": bbox,
        "width": width,
        "height": height,
        "srs": "EPSG:4326",
        "format": "image/png",
        "transparent": "true",
    }
    if time:
        params["time"] = time

    async with httpx.AsyncClient(headers=HEADERS, timeout=15) as client:
        try:
            resp = await client.get(f"{GEOSERVER_BASE}/{site}/ows", params=params)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(502, f"Could not reach NOAA radar imagery for {site}") from exc

    # Specific timestamps are immutable once published; the "current" frame
    # (no time param) is the only one that actually changes.
    max_age = 300 if time else 60
    return Response(content=resp.content, media_type="image/png", headers={"Cache-Control": f"public, max-age={max_age}"})
