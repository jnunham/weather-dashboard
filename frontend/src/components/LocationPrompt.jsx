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

const DEFAULT_LOCATION = { lat: 42.7325, lon: -84.5555, label: "Lansing, MI" };

export default function LocationPrompt({ onConfirm }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;

    const direct = parseLatLon(query);
    if (direct) {
      onConfirm({ ...direct, label: query });
      return;
    }

    setBusy(true);
    setStatus("Searching…");
    try {
      const loc = await api.geocode(query);
      onConfirm(loc);
    } catch (err) {
      setStatus(err.message || "Location not found");
      setBusy(false);
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setStatus("Geolocation isn't available in this browser");
      return;
    }
    setBusy(true);
    setStatus("Locating…");
    navigator.geolocation.getCurrentPosition(
      (pos) => onConfirm({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "My location" }),
      () => {
        setStatus("Could not get your location");
        setBusy(false);
      }
    );
  }

  return (
    <div className="modalOverlay">
      <div className="modal">
        <h2>Where should we watch?</h2>
        <p>
          This sets the location for current conditions, the alert ticker, and your local forecast office. You can
          change it anytime from the top bar.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="City, State or lat,lon"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button type="submit" className="primaryButton" disabled={busy}>
            Continue
          </button>
        </form>
        <button type="button" className="secondaryButton" onClick={handleUseMyLocation} disabled={busy}>
          📍 Use my current location
        </button>
        {status && <p className="errorText">{status}</p>}
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
          <button
            type="button"
            onClick={() => onConfirm(DEFAULT_LOCATION)}
            style={{ background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0 }}
          >
            Skip and use {DEFAULT_LOCATION.label}
          </button>
        </p>
      </div>
    </div>
  );
}
