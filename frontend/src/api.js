// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Weather Dashboard contributors
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the
// Free Software Foundation, either version 3 of the License, or (at your
// option) any later version. See the LICENSE file for the full text.
//
// This program is distributed WITHOUT ANY WARRANTY and is not a certified
// life-safety system — during severe weather, always follow official
// guidance from the National Weather Service and local emergency
// management, not this app.

// In a production build (`npm run build`, e.g. via `setup.py --lan`), the
// backend serves this same frontend from its own single origin — so API
// calls should be relative ("/api/..."), which always resolves correctly no
// matter what address/port loaded the page, LAN or not.
//
// In dev (`npm run dev`), the frontend and backend are two separate
// processes on two different ports, so a relative URL would hit Vite's own
// port instead of the backend's — this falls back to same-host-different-
// port, since a hardcoded "localhost" would break for any device other than
// the one running the servers. Override via VITE_API_BASE_URL for unusual
// setups (backend on a different host/port than the frontend expects).
export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:8000` : "");

// Backend calls out to NWS/SPC with their own ~15s timeouts, so a genuinely
// slow-but-working request can take a while — but a request that hangs
// outright (network stall, dropped connection) previously left the UI on
// "Loading…" forever with no way out. This bounds every call to a fixed
// worst case: 16s (just past the backend's own timeout) and then a clear
// error instead of an indefinite spinner.
const REQUEST_TIMEOUT_MS = 16000;

async function getJson(path, params = {}) {
  const url = new URL(API_BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `${res.status} ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out — the server took too long to respond.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  conditions: (lat, lon) => getJson("/api/conditions", { lat, lon }),
  forecast: (lat, lon) => getJson("/api/forecast", { lat, lon }),
  afd: (lat, lon) => getJson("/api/afd", { lat, lon }),
  alerts: (lat, lon) => getJson("/api/alerts", { lat, lon }),
  outlook: (day, hazard) => getJson("/api/outlook", { day, hazard }),
  // lat/lon are optional — when given, the backend filters to items that
  // mention that state (SPC's feeds don't carry structured geometry, just
  // text, so "mentions the state by name" is the filter). Omit params
  // entirely rather than passing lat=undefined, which would otherwise be
  // sent as the literal string "undefined".
  mesoscaleDiscussions: (lat, lon) => getJson("/api/mesoscale-discussions", lat != null && lon != null ? { lat, lon } : {}),
  geocode: (q) => getJson("/api/geocode", { q }),
};

// Radar frames (and the tile images themselves, see MapView) are proxied
// through the backend rather than fetched directly by the browser — some
// environments (proxies, firewalls, VPNs) let the backend process reach
// third-party hosts that the browser can't, so routing everything through
// one server-side egress point is the more portable choice.
export async function getRadarFrames() {
  return getJson("/api/radar/frames");
}
