# Weather Dashboard

A self-hosted weather dashboard: live radar, current conditions and forecast,
NWS watches/warnings, SPC convective outlooks and mesoscale discussions,
county boundaries, and a kiosk mode for a spare monitor.

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
  configurable via `?scenes=map,conditions&duration=15`. The mesoscale scene
  only appears while there's an active discussion — otherwise it's skipped —
  and each upcoming day's Nice Day rating comes with a short reason
  ("windy", "rain likely", "some clouds"…).
- **Mobile-friendly** — the normal dashboard reflows into a single-column,
  touch-friendly layout on any phone-width screen automatically (no app to
  install, no separate URL — just open it on the phone's browser).
- **LAN-reachable** (`setup.py --lan`) — builds the frontend and serves it
  and the API from one process on a single ordinary web port (80, or 8080
  if 80 needs privileges this machine doesn't have), so any device on your
  home network can load it, not just the machine it's running on.

## Architecture

- `backend/` — FastAPI (Python). Proxies and lightly caches NWS, SPC,
  RainViewer, and Open-Meteo's geocoder, so the frontend never talks to
  third parties directly.
- `frontend/` — React (Vite) + Leaflet.

## Setup

```bash
python3 setup.py
```

This creates a Python virtualenv, installs backend dependencies, installs
Node.js automatically if it's missing, npm-installs the frontend, and then
starts the dev servers (`http://localhost:5173`, backend on `:8000`) —
localhost only. Pass `--setup-only` to install without starting anything.

### Reaching it from other devices on your network

```bash
python3 setup.py --lan
```

This builds the frontend once and serves everything — frontend and API —
from a single process on port 80 (the normal, no-port-number-needed web
port), reachable at `http://<your-LAN-IP>/` from any device on your network.
The script prints the exact address. If port 80 needs elevated privileges
your user doesn't have, it automatically falls back to port 8080 and prints
a one-time command (`setcap`) to grant just that Python binary permission to
bind port 80 directly in the future, without running anything as root.

Since `--lan` serves a static production build rather than the hot-reload
dev server, re-run `python3 setup.py --lan` after pulling code changes to
pick them up.

If you set this up before the LAN-access work landed: delete `frontend/.env`
(it may have an old hardcoded `VITE_API_BASE_URL`) and re-run setup to
regenerate it.

### A dedicated Raspberry Pi display

```bash
python3 setup.py --pi-display
```

Run this on a Raspberry Pi (Raspberry Pi OS with the desktop) with a screen
attached and it turns the Pi into a single-purpose weather display:

- the server runs as a systemd service (`weather-dashboard`), starting on
  boot and restarting itself if it ever crashes;
- Chromium opens full-screen on boot, pointed at the Pi's own server, in the
  compact small-screen layout (built for a 7" 800×480 panel);
- desktop auto-login is turned on and screen blanking turned off via
  `raspi-config`, since an unattended display has to boot straight to the
  dashboard and stay lit.

It asks for your `sudo` password once, and a reboot (`sudo reboot`) starts the
display. After pulling new code, re-run the same command and reboot. The
command prints how to undo everything it installed.

The compact layout is opt-in: it's only used when the kiosk URL has
`compact=1` (which `--pi-display` sets). A normal kiosk screen — a TV, a
monitor — never gets it, whatever its resolution:
`http://<address>/?kiosk=1&compact=1` turns it on for any browser.

`compact=1` is also what makes the display touch-friendly with no keyboard or
mouse attached:

- **Swipe** left or right anywhere on the screen to move between scenes (the
  rotation timer restarts after each swipe). The map scene is locked in place
  in this mode so a swipe over it changes scene instead of panning the map.
  The dots at the bottom are buttons too — tap one to jump to that scene, or
  use the ‹ › arrows beside them.
- **Change city in two taps**: tap the city name in the header, type a few
  letters, and tap the right match from the list (US places are listed first,
  since the data is all US National Weather Service). Places you've used
  recently are listed with no typing at all.
- An **iPhone-style on-screen keyboard** slides up whenever a text field is
  tapped: a pop-up shows each key you press, shift capitalises the next letter
  (and switches itself on at the start of each word; double-tap it for caps
  lock), backspace repeats when held, and **123** switches to numbers and
  punctuation. **Go** submits and puts the keyboard away; the bar across the
  top of it hides it without submitting.
- **Exit Kiosk** goes to the regular dashboard, which has a **🖥 Kiosk**
  button to come straight back (both keep `compact=1`).

If the dashboard doesn't appear on boot, the autostart entry is
`~/.config/autostart/weather-dashboard-kiosk.desktop`; some Raspberry Pi OS
versions run their own autostart file instead
(`~/.config/labwc/autostart` on newer Wayland images,
`~/.config/lxsession/LXDE-pi/autostart` on older X11 ones) — add the line
`~/.config/weather-dashboard/kiosk.sh &` there.

### Configuration

Both `backend/.env.example` and `frontend/.env.example` are copied to
`.env` automatically on first setup. The only thing worth changing before
you deploy this anywhere public is `USER_AGENT` in `backend/.env` — NWS and
SPC ask for a real contact string there.

## Data sources

- [National Weather Service API](https://www.weather.gov/documentation/services-web-api) — conditions, forecast, alerts (including Tornado/Severe Thunderstorm Watches), forecast discussions
- [Storm Prediction Center](https://www.spc.noaa.gov/) — convective outlooks, mesoscale discussions
- [RainViewer](https://www.rainviewer.com/) — composite radar mosaic
- [Open-Meteo](https://open-meteo.com/) — geocoding
- County/state boundaries: US Census Bureau cartographic boundary files; PublicaMundi's public-domain state boundary GeoJSON

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
