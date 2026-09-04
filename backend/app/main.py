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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGIN_REGEX, CORS_ORIGINS, DEFAULT_LOCATION
from .routers import alerts, geocode, nws_point, outlook, radar, spc_feeds

app = FastAPI(title="Weather Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(nws_point.router)
app.include_router(alerts.router)
app.include_router(outlook.router)
app.include_router(spc_feeds.router)
app.include_router(geocode.router)
app.include_router(radar.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "default_location": DEFAULT_LOCATION}


# If the frontend has been built (`npm run build`, or `setup.py --lan`, which
# does this automatically), serve it from this same process/origin — one
# port, one address, no CORS involved at all since nothing is cross-origin
# anymore. A no-op (and harmless) when frontend/dist doesn't exist, e.g. in
# normal two-server local dev.
from pathlib import Path  # noqa: E402

from fastapi.staticfiles import StaticFiles  # noqa: E402

_frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
