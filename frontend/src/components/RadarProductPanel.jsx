import L from "leaflet";
import { useEffect, useRef, useState } from "react";

import { API_BASE } from "../api.js";
import usStates from "../data/us-states.json";

const PLAYBACK_INTERVAL_MS = 500;
const FRAMES_TO_KEEP = 12; // ~35 min of loop at this layer's ~3 min cadence

export default function RadarProductPanel({ site, product, label, bbox }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const stateRef = useRef({ layers: [], times: [], current: null, index: 0 });
  const [timeLabel, setTimeLabel] = useState("—");
  const [error, setError] = useState(null);

  // Small, non-interactive map — just a rendering surface with our existing
  // dark state outline underneath so the radar overlay has real geographic
  // context instead of floating on blank white, like the static-image
  // version did.
  useEffect(() => {
    const map = L.map(elRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      tap: false,
    });
    mapRef.current = map;

    map.createPane("base");
    map.getPane("base").style.zIndex = 150;
    L.geoJSON(usStates, {
      pane: "base",
      style: { color: "#3a4a5e", weight: 1, fillColor: "#141b26", fillOpacity: 1 },
    }).addTo(map);

    map.fitBounds([
      [bbox.minLat, bbox.minLon],
      [bbox.maxLat, bbox.maxLon],
    ]);

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(elRef.current);
    const raf = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showFrame(index) {
    const s = stateRef.current;
    const layer = s.layers[index];
    if (!layer) return;
    if (s.current && s.current !== layer) s.current.setOpacity(0);
    layer.setOpacity(1);
    s.current = layer;
    s.index = index;
    setTimeLabel(new Date(s.times[index]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }

  // Load the available animation frames and prefetch every one (hidden) up
  // front, same technique as the main radar layer — playback is then just an
  // opacity swap with no network requests mid-loop.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/radar-products/${site}/${product}/times`);
        if (!res.ok) throw new Error(`Failed to load ${label} animation`);
        const data = await res.json();
        if (cancelled || !data.times.length) return;

        const map = mapRef.current;
        const bounds = [
          [bbox.minLat, bbox.minLon],
          [bbox.maxLat, bbox.maxLon],
        ];

        stateRef.current.layers.forEach((l) => map.hasLayer(l) && map.removeLayer(l));

        const times = data.times.slice(-FRAMES_TO_KEEP);
        const layers = times.map((t) => {
          const url = `${API_BASE}/api/radar-products/${site}/${product}.png?bbox=${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}&width=500&height=500&time=${encodeURIComponent(t)}`;
          const overlay = L.imageOverlay(url, bounds, { opacity: 0 });
          overlay.addTo(map);
          return overlay;
        });

        stateRef.current = { layers, times, current: null, index: 0 };
        showFrame(layers.length - 1);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, product]);

  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current;
      if (!s.layers.length) return;
      showFrame((s.index + 1) % s.layers.length);
    }, PLAYBACK_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="severeModePanel">
      <div className="severeModePanelTitle">
        {label} <span className="radarTime">{timeLabel}</span>
      </div>
      {error ? <div className="errorText">{error}</div> : <div className="radarProductMap" ref={elRef} />}
    </div>
  );
}
