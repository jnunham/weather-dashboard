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

from fastapi import APIRouter, Query

from ..services import geocode as geocode_service

router = APIRouter(prefix="/api", tags=["geocode"])


@router.get("/geocode")
async def geocode(q: str = Query(..., min_length=1)):
    return await geocode_service.geocode(q)
