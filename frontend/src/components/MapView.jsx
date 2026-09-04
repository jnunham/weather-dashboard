import L from "leaflet";
// Bundled locally rather than a CDN <link> in index.html — this app's whole
// history of map breakage traces back to direct browser-to-third-party
// fetches being unreliable in this environment. Without this stylesheet,
// Leaflet has no `overflow: hidden` on its container, so tiles render
// wherever their position math says to, spilling out into the rest of the
// page. Bundling it means it can never fail to load independently of the
// rest of the app.
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useEffect, useRef, useState } from "react";

import { API_BASE, api, getRadarFrames } from "../api.js";
import usCounties from "../data/us-counties.json";
import usStates from "../data/us-states.json";

// Leaflet's default marker icon computes its image URLs relative to the CSS
// file's location, which breaks under a bundler (shows as a broken-image box
// with "Marker" alt text). Point it at the bundled assets explicitly.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// County boundaries are ~3,200 features (3.4MB) — too many to render (or
// label) all at once without either killing performance or turning the map
// into unreadable text soup at low zoom. Precompute each county's bounding
// box once at module load, then at render time only draw counties whose
// bbox intersects the current viewport (see the "counties" effect below).
// This runs once per app load, not per pan/zoom.
function computeBbox(geometry) {
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

const COUNTIES_WITH_BBOX = usCounties.features.map((feature) => ({
  feature,
  bbox: computeBbox(feature.geometry),
}));

function bboxIntersectsBounds(bbox, bounds) {
  return !(
    bbox.maxLon < bounds.getWest() ||
    bbox.minLon > bounds.getEast() ||
    bbox.maxLat < bounds.getSouth() ||
    bbox.minLat > bounds.getNorth()
  );
}

// Below this zoom, a viewport can span many states — labeling every county
// in it would be unreadable clutter, so counties simply don't render yet.
const COUNTY_MIN_ZOOM = 7;

export default function MapView({ location, onMapClick, outlookDay, outlookHazard, refreshTick, autoPlayRadar = false }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const alertsLayerRef = useRef(null);
  const outlookLayerRef = useRef(null);
  const countiesLayerRef = useRef(null);
  const radarRef = useRef({ frames: [], layers: [], currentLayer: null, index: 0 });

  const [radarFrameCount, setRadarFrameCount] = useState(0);
  const [radarIndex, setRadarIndex] = useState(0);
  const [radarTimeLabel, setRadarTimeLabel] = useState("—");
  const [radarPlaying, setRadarPlaying] = useState(false);
  const [showRadar, setShowRadar] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showOutlook, setShowOutlook] = useState(true);
  const [showCounties, setShowCounties] = useState(true);

  // For kiosk/severe-weather displays: start the radar loop automatically
  // instead of waiting for a click that will never come.
  useEffect(() => {
    if (autoPlayRadar) setRadarPlaying(true);
  }, [autoPlayRadar]);

  // Init map once.
  useEffect(() => {
    const map = L.map(mapElRef.current, { zoomControl: true }).setView([location.lat, location.lon], 7);
    mapRef.current = map;

    // Base map is a bundled, offline US state-boundary outline — not live
    // tile imagery from a third-party server. Every raster tile provider
    // tried (OSM's own servers, Esri, Stadia) hit some form of network or
    // policy block that varied by environment; this has zero runtime network
    // dependency, so there's nothing left that can fail this way. It lives in
    // its own low pane so radar/alert/outlook layers always draw above it.
    map.createPane("base");
    map.getPane("base").style.zIndex = 150;
    L.geoJSON(usStates, {
      pane: "base",
      style: { color: "#3a4a5e", weight: 1, fillColor: "#141b26", fillOpacity: 1 },
    }).addTo(map);

    // Separate panes (rather than both sharing Leaflet's default overlayPane)
    // so stacking order — and hit-testing for hover/click — is deliberate:
    // a specific, local NWS alert should always win over the broad regional
    // SPC outlook category when their shapes overlap, both visually and for
    // which popup a hover picks up.
    map.createPane("outlook");
    map.getPane("outlook").style.zIndex = 350;
    map.createPane("alerts");
    map.getPane("alerts").style.zIndex = 450;
    // Above radar (default tilePane, 200) so county lines stay readable over
    // the imagery, but below outlook/alerts so those still take priority.
    map.createPane("counties");
    map.getPane("counties").style.zIndex = 250;

    markerRef.current = L.marker([location.lat, location.lon]).addTo(map);
    alertsLayerRef.current = L.layerGroup().addTo(map);
    outlookLayerRef.current = L.layerGroup().addTo(map);
    countiesLayerRef.current = L.layerGroup().addTo(map);

    map.on("click", (e) => onMapClick(e.latlng.lat, e.latlng.lng));

    // Leaflet measures its container once at creation and caches that size;
    // if the flex layout hasn't finished settling yet (or the sidebar's
    // cards change height as their data loads), tiles get positioned against
    // a stale size and can render outside the actual container bounds. Nudge
    // it to re-measure after mount and on every window resize.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(mapElRef.current);
    const raf = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter on location change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current.setLatLng([location.lat, location.lon]);
    map.setView([location.lat, location.lon], Math.max(map.getZoom(), 7));
  }, [location.lat, location.lon]);

  // County boundaries + name labels: redraw whenever the view moves, showing
  // only counties whose (precomputed) bbox intersects the current viewport.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function refreshCounties() {
      const group = countiesLayerRef.current;
      group.clearLayers();
      if (map.getZoom() < COUNTY_MIN_ZOOM) return;

      const bounds = map.getBounds().pad(0.25);
      COUNTIES_WITH_BBOX.forEach(({ feature, bbox }) => {
        if (!bboxIntersectsBounds(bbox, bounds)) return;
        const layer = L.geoJSON(feature, {
          pane: "counties",
          interactive: false,
          style: { color: "#4a5a6e", weight: 1, fillOpacity: 0 },
        }).addTo(group);
        const center = layer.getBounds().getCenter();
        L.marker(center, {
          pane: "counties",
          interactive: false,
          icon: L.divIcon({
            className: "countyLabel",
            html: feature.properties.NAME,
            iconSize: [120, 14],
            iconAnchor: [60, 7],
          }),
        }).addTo(group);
      });
    }

    refreshCounties();
    map.on("moveend zoomend", refreshCounties);
    return () => map.off("moveend zoomend", refreshCounties);
  }, []);

  // Alert polygons.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api.alerts(location.lat, location.lon);
        if (cancelled) return;
        const group = alertsLayerRef.current;
        group.clearLayers();
        data.alerts.forEach((a) => {
          if (!a.geometry) return;
          const color = a.severity === "Extreme" || a.severity === "Severe" ? "#ff6b6b" : "#ffd166";
          // Alerts now cover the whole state (see AlertsCard/Ticker), so
          // local ones are drawn bold/opaque and upstream ones lighter —
          // still visible for "what's headed my way" awareness without
          // drowning out what's actually overhead right now.
          const style = a.is_local
            ? { color, weight: 2, fillOpacity: 0.15 }
            : { color, weight: 1, dashArray: "4 3", fillOpacity: 0.04, opacity: 0.55 };
          const layer = L.geoJSON(a.geometry, { pane: "alerts", style });
          layer.bindPopup(`<b>${a.event}</b>${a.is_local ? "" : " <i>(upstream)</i>"}<br>${a.headline || ""}`);
          layer.addTo(group);
        });
      } catch {
        // Non-fatal: the AlertsCard panel will show the same failure.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  // SPC outlook polygons.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api.outlook(outlookDay, outlookHazard);
        if (cancelled) return;
        const group = outlookLayerRef.current;
        group.clearLayers();
        L.geoJSON(data, {
          pane: "outlook",
          style: (feature) => ({
            color: feature.properties.stroke || "#888",
            weight: 1,
            fillColor: feature.properties.fill || "#888",
            fillOpacity: 0.35,
          }),
          onEachFeature: (feature, layer) => {
            const label = feature.properties.LABEL2 || feature.properties.LABEL || "";
            layer.bindPopup(`<b>${label}</b>`);
          },
        }).addTo(group);
      } catch {
        // Non-fatal: the OutlookCard panel surfaces load errors.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [outlookDay, outlookHazard]);

  function showRadarFrame(index) {
    const rs = radarRef.current;
    const frame = rs.frames[index];
    const layer = rs.layers[index];
    const map = mapRef.current;
    if (!frame || !layer || !map) return;

    // Frame layers are pre-created (see below) and left on the map at
    // opacity 0 so their tiles load in the background ahead of time —
    // "showing" a frame is just an opacity swap, not add/remove, so once a
    // frame has loaded once, replaying it (or looping the animation) never
    // re-fetches anything and never has to wait mid-animation.
    if (rs.currentLayer && rs.currentLayer !== layer) rs.currentLayer.setOpacity(0);
    if (!map.hasLayer(layer)) layer.addTo(map);
    layer.setOpacity(showRadar ? 0.6 : 0);
    rs.currentLayer = layer;
    rs.index = index;
    setRadarIndex(index);
    setRadarTimeLabel(
      new Date(frame.time * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    );
  }

  // Radar frame list.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getRadarFrames();
        if (cancelled) return;
        const map = mapRef.current;

        // Drop any previously prefetched layers before replacing them.
        (radarRef.current.layers || []).forEach((l) => map && map.hasLayer(l) && map.removeLayer(l));

        const frames = [...data.radar.past, ...(data.radar.nowcast || [])];
        radarRef.current.frames = frames;
        radarRef.current.currentLayer = null;
        radarRef.current.layers = frames.map((frame) => {
          const url = `${API_BASE}/api/radar/tile${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
          const layer = L.tileLayer(url, {
            opacity: 0,
            zIndex: 5,
            // RainViewer's radar mosaic only actually renders up to zoom 7 —
            // past that it serves a literal "Zoom Level Not Supported"
            // placeholder image instead of a 404. maxNativeZoom keeps
            // Leaflet from requesting those non-existent tiles: it just
            // scales up the zoom-7 tiles instead when the map zooms in
            // further, which is exactly what maxZoom on the map itself needs
            // to keep working for the state-outline/alert/outlook layers.
            maxNativeZoom: 7,
            maxZoom: 19,
          });
          // Pre-add every frame now (hidden) so its tiles fetch in the
          // background immediately, rather than on first display during
          // playback.
          layer.addTo(map);
          return layer;
        });

        setRadarFrameCount(frames.length);
        showRadarFrame(data.radar.past.length - 1);
      } catch {
        setRadarTimeLabel("Radar unavailable");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  // Radar play/pause loop.
  useEffect(() => {
    if (!radarPlaying) return undefined;
    const id = setInterval(() => {
      const rs = radarRef.current;
      if (!rs.frames.length) return;
      showRadarFrame((rs.index + 1) % rs.frames.length);
    }, 600);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radarPlaying]);

  // Layer visibility toggles.
  useEffect(() => {
    const layer = radarRef.current.currentLayer;
    if (!layer) return;
    layer.setOpacity(showRadar ? 0.6 : 0);
  }, [showRadar]);

  useEffect(() => {
    const map = mapRef.current;
    const group = alertsLayerRef.current;
    if (!map || !group) return;
    if (showAlerts && !map.hasLayer(group)) group.addTo(map);
    if (!showAlerts && map.hasLayer(group)) map.removeLayer(group);
  }, [showAlerts]);

  useEffect(() => {
    const map = mapRef.current;
    const group = outlookLayerRef.current;
    if (!map || !group) return;
    if (showOutlook && !map.hasLayer(group)) group.addTo(map);
    if (!showOutlook && map.hasLayer(group)) map.removeLayer(group);
  }, [showOutlook]);

  useEffect(() => {
    const map = mapRef.current;
    const group = countiesLayerRef.current;
    if (!map || !group) return;
    if (showCounties && !map.hasLayer(group)) group.addTo(map);
    if (!showCounties && map.hasLayer(group)) map.removeLayer(group);
  }, [showCounties]);

  return (
    <div className="mapColumn">
      <div id="map" ref={mapElRef} />
      <div className="radarControls">
        <button className="playPause" onClick={() => setRadarPlaying((p) => !p)}>
          {radarPlaying ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(radarFrameCount - 1, 0)}
          value={radarIndex}
          onChange={(e) => {
            setRadarPlaying(false);
            showRadarFrame(parseInt(e.target.value, 10));
          }}
        />
        <span className="radarTime">{radarTimeLabel}</span>
        <label className="toggle">
          <input type="checkbox" checked={showRadar} onChange={(e) => setShowRadar(e.target.checked)} /> Radar
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showAlerts} onChange={(e) => setShowAlerts(e.target.checked)} /> Alerts
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showOutlook} onChange={(e) => setShowOutlook(e.target.checked)} /> Outlook
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showCounties} onChange={(e) => setShowCounties(e.target.checked)} /> Counties
        </label>
      </div>
    </div>
  );
}
