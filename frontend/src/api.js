export const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function getJson(path, params = {}) {
  const url = new URL(API_BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  conditions: (lat, lon) => getJson("/api/conditions", { lat, lon }),
  forecast: (lat, lon) => getJson("/api/forecast", { lat, lon }),
  afd: (lat, lon) => getJson("/api/afd", { lat, lon }),
  alerts: (lat, lon) => getJson("/api/alerts", { lat, lon }),
  outlook: (day, hazard) => getJson("/api/outlook", { day, hazard }),
  mesoscaleDiscussions: () => getJson("/api/mesoscale-discussions"),
  watches: () => getJson("/api/watches"),
  geocode: (q) => getJson("/api/geocode", { q }),
  radarSite: (lat, lon) => getJson("/api/radar-products/site", { lat, lon }),
};

// Radar frames (and the tile images themselves, see MapView) are proxied
// through the backend rather than fetched directly by the browser — some
// environments (proxies, firewalls, VPNs) let the backend process reach
// third-party hosts that the browser can't, so routing everything through
// one server-side egress point is the more portable choice.
export async function getRadarFrames() {
  return getJson("/api/radar/frames");
}
