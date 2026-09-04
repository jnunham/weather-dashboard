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
      <a className="iconButton kioskLink" href="?kiosk=1" title="Kiosk mode — full-screen, auto-rotating display">
        🖥️ Kiosk
      </a>
      <div className="lastUpdated">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ""}</div>
    </header>
  );
}
