export function parseLatLon(str) {
  const m = str.trim().match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lon: parseFloat(m[3]) };
}

export function fmt(n, digits = 0) {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : n.toFixed(digits);
}

export function alertClass(event) {
  if (/warning/i.test(event)) return "severe";
  if (/watch/i.test(event)) return "watch";
  return "advisory";
}

// Rough bounding box of a GeoJSON geometry — good enough for "is this alert
// anywhere near this viewport" checks, not for precise geometry work.
export function computeGeometryBbox(geometry) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const visit = (coords) => {
    if (typeof coords[0] === "number") {
      const [lon, lat] = coords;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      coords.forEach(visit);
    }
  };
  visit(geometry.coordinates);
  return { minLon, minLat, maxLon, maxLat };
}

export function bboxesIntersect(a, b) {
  return !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);
}

const SEVERITY_RANK = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };

// Pick the single most attention-worthy alert: local beats upstream, then
// higher NWS-reported severity wins.
export function topAlert(alerts) {
  if (!alerts || alerts.length === 0) return null;
  return [...alerts].sort((a, b) => {
    if (a.is_local !== b.is_local) return a.is_local ? -1 : 1;
    return (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
  })[0];
}

// Standard ray-casting point-in-polygon test (handles holes: an even number
// of hole-ring crossings means still inside the outer ring).
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon, lat, coordinates) {
  if (!pointInRing(lon, lat, coordinates[0])) return false;
  for (let k = 1; k < coordinates.length; k++) {
    if (pointInRing(lon, lat, coordinates[k])) return false; // inside a hole
  }
  return true;
}

function pointInGeometry(lon, lat, geometry) {
  if (geometry.type === "Polygon") return pointInPolygon(lon, lat, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((poly) => pointInPolygon(lon, lat, poly));
  return false;
}

// SPC's "nolyr" outlook GeoJSON draws each risk band as its own non-
// overlapping polygon (not cumulative), so at most one feature should
// contain a given point — but if that assumption is ever wrong, prefer the
// highest-severity (DN) match rather than whichever came first.
export function findOutlookCategory(lat, lon, outlookGeoJson) {
  let best = null;
  for (const f of outlookGeoJson.features || []) {
    if (!pointInGeometry(lon, lat, f.geometry)) continue;
    if (!best || (f.properties.DN || 0) > (best.properties.DN || 0)) best = f;
  }
  if (!best) return null;
  return { label: best.properties.LABEL2 || best.properties.LABEL, color: best.properties.fill || "#888" };
}
