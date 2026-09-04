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

import os
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env explicitly — uvicorn is typically run from the repo root
# (see setup.py's printed instructions), so relying on load_dotenv()'s cwd
# search would miss it.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Contact info sent to NWS/SPC per their API etiquette guidelines.
USER_AGENT = os.getenv("USER_AGENT", "weather-dashboard (set USER_AGENT env var to your contact email)")

# Comma-separated list of allowed CORS origins for local dev (Vite) and prod frontend.
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")

DEFAULT_LOCATION = {
    "lat": float(os.getenv("DEFAULT_LAT", "42.7325")),
    "lon": float(os.getenv("DEFAULT_LON", "-84.5555")),
    "label": os.getenv("DEFAULT_LABEL", "Lansing, MI"),
}
