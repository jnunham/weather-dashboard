import { useState } from "react";

import { api } from "../api.js";
import { parseLatLon } from "../utils.js";

export default function TopBar({ location, onLocationChange, lastUpdated }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;

    const direct = parseLatLon(query);
    if (direct) {
      onLocationChange({ ...direct, label: query });
      setQuery("");
      return;
    }

    setStatus("Searching…");
    try {
      const loc = await api.geocode(query);
      onLocationChange(loc);
      setQuery("");
      setStatus("");
    } catch (err) {
      setStatus(err.message || "Location not found");
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) return;
    setStatus("Locating…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocationChange({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "My location" });
        setStatus("");
      },
      () => setStatus("Could not get your location")
    );
  }

  return (
    <header className="topbar">
      <h1>Weather Dashboard</h1>
      <form className="locationForm" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="City, State or lat,lon"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">Go</button>
        <button type="button" className="iconButton" onClick={handleUseMyLocation} title="Use my current location">
          📍
        </button>
      </form>
      <div className="locationLabel">{status || location.label}</div>
      <a className="iconButton kioskLink" href="?severe=1" title="Severe weather mode — tight-zoom animated reflectivity/velocity panels">
        ⛈️ Severe
      </a>
      <a className="iconButton kioskLink" href="?kiosk=1" title="Kiosk mode — full-screen, auto-rotating display">
        🖥️ Kiosk
      </a>
      <div className="lastUpdated">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ""}</div>
    </header>
  );
}
