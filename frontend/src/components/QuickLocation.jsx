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

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { api } from "../api.js";
import { loadRecentLocations } from "../recentLocations.js";
import { parseLatLon } from "../utils.js";

const SEARCH_DEBOUNCE_MS = 300;

// The touchscreen's "change city" sheet: tap the city name in the kiosk
// header, type a few letters, tap the right match. Recently used places are
// one tap with no typing at all.
export default function QuickLocation({ current, onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const recents = useMemo(() => loadRecentLocations().filter((l) => l.label !== current.label), [current.label]);
  const latestRequest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const id = ++latestRequest.current; // also invalidates any search still in flight
    if (q.length < 2 || parseLatLon(q)) {
      setResults([]);
      setStatus("");
      return undefined;
    }
    setStatus("Searching…");
    const timer = setTimeout(async () => {
      try {
        const found = await api.geocodeSearch(q);
        if (id !== latestRequest.current) return;
        setResults(found);
        setStatus(found.length ? "" : "No matches");
      } catch (err) {
        if (id !== latestRequest.current) return;
        setResults([]);
        setStatus(err.message || "Search failed");
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const direct = parseLatLon(q);
    if (direct) return onSelect({ ...direct, label: q });
    // "Go" takes the best match. If the list hasn't caught up with the typing
    // yet, ask for the best match directly rather than make them wait.
    if (results.length) return onSelect(results[0]);
    try {
      onSelect(await api.geocode(q));
    } catch (err) {
      setStatus(err.message || "Location not found");
    }
  }

  // Four rows is what fits above the keyboard on an 800x480 screen.
  const showRecents = !query.trim() && recents.length > 0;
  const rows = (showRecents ? recents : results).slice(0, 4);

  // In a portal: the kiosk is zoomed and non-interactive-looking (no cursor),
  // and this should be a normal-sized sheet sitting on top of it, not part of it.
  return createPortal(
    <div
      className="modalOverlay quickLoc"
      data-noswipe
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="quickLocSheet">
        <form className="quickLocForm" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Search for a city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button type="button" className="quickLocClose" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </form>
        <div className="quickLocList">
          {rows.map((loc) => (
            <button type="button" className="quickLocRow" key={`${loc.label}:${loc.lat}`} onClick={() => onSelect(loc)}>
              {showRecents && <span className="quickLocRecent">↺</span>}
              {loc.label}
            </button>
          ))}
          {!rows.length && (
            <div className="quickLocHint">{status || (query.trim() ? "" : "Type a city, or lat,lon")}</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
