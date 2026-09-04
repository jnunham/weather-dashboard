# Weather Dashboard

A self-hosted weather dashboard: live radar, current conditions and forecast,
NWS watches/warnings, SPC convective outlooks and mesoscale discussions,
county boundaries, a kiosk mode for a spare monitor, and a tight-zoom
"severe weather mode" with animated single-site NEXRAD reflectivity and
velocity.

This was vibe coded by a weather enthusiast, with a lot of back-and-forth
against real weather APIs to get the data actually right — it's a hobby
project, not an official product.

## ⚠️ Not a substitute for official warnings

This tool is for situational awareness and enthusiast use only. **It is not
a certified life-safety system.** During severe weather, always follow
official guidance from the National Weather Service (weather.gov), your
local emergency management agency, and NOAA Weather Radio — not this app.
Data here can lag, drop out, or be misread by the code same as any other
software; do not use it as your sole source for decisions that affect
safety.

## Features

- Live radar (RainViewer), current conditions, and forecast for any US
  location
- Statewide NWS watches/warnings, with a flag for whether an alert covers
  your exact county or is further upstream
- SPC convective outlooks (Day 1-3) and active mesoscale discussions
- County boundaries and labels on the map
- **Kiosk mode** (`?kiosk=1`) — full-screen, auto-rotating display for a
  spare monitor: map, current conditions + alerts, mesoscale discussions,
  and the local forecast discussion's key messages. Scenes and timing are
  configurable via `?scenes=map,conditions&duration=15`.
- **Severe weather mode** (`?severe=1`) — tight-zoom, animated single-site
  NEXRAD reflectivity and velocity for your nearest radar site, plus a list
  of warnings covering your area and immediate surroundings

## Architecture

- `backend/` — FastAPI (Python). Proxies and lightly caches NWS, SPC,
  RainViewer, NOAA's radar GeoServer, and Open-Meteo's geocoder, so the
  frontend never talks to third parties directly.
- `frontend/` — React (Vite) + Leaflet.

## Setup

```bash
python3 setup.py
```

This creates a Python virtualenv, installs backend dependencies, installs
Node.js automatically if it's missing, npm-installs the frontend, and then
starts both dev servers. Pass `--setup-only` to install without starting
anything.

Open `http://localhost:5173`.

### Configuration

Both `backend/.env.example` and `frontend/.env.example` are copied to
`.env` automatically on first setup. The only thing worth changing before
you deploy this anywhere public is `USER_AGENT` in `backend/.env` — NWS and
SPC ask for a real contact string there.

## Data sources

- [National Weather Service API](https://www.weather.gov/documentation/services-web-api) — conditions, forecast, alerts, forecast discussions
- [Storm Prediction Center](https://www.spc.noaa.gov/) — convective outlooks, mesoscale discussions, watches
- [RainViewer](https://www.rainviewer.com/) — composite radar mosaic
- [NOAA GeoServer](https://opengeo.ncep.noaa.gov/geoserver/) — single-site NEXRAD Level 3 reflectivity/velocity
- [Open-Meteo](https://open-meteo.com/) — geocoding
- County/state boundaries: US Census Bureau cartographic boundary files; PublicaMundi's public-domain state boundary GeoJSON

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
