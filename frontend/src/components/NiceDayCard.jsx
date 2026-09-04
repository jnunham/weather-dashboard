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

import { useEffect, useState } from "react";

import { api } from "../api.js";

const LABEL_COLORS = {
  Great: "#34c759",
  Good: "#4fa3ff",
  Fair: "#f5c542",
  Meh: "#ff9f43",
  "Not Great": "#ff6b6b",
};

function weekday(dateStr) {
  // Append a midday time so this parses as local noon, not UTC midnight —
  // otherwise negative UTC-offset zones would display the wrong weekday.
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString([], { weekday: "short" });
}

// First of this app's "experimental" products: a heuristic, model-guidance-
// derived score of how pleasant each of the next several days looks, in the
// spirit of enthusiast "Nice Day Forecast" products — explicitly NOT an
// official NWS/SPC forecast, just this app's own formula (see
// backend/app/services/experimental.py).
export default function NiceDayCard({ location }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!location) return undefined;
    let cancelled = false;
    setError(null);
    setData(null);
    api
      .niceDayForecast(location.lat, location.lon)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [location?.lat, location?.lon]);

  if (!location) return null;

  return (
    <section className="card">
      <h2>
        Nice Day Forecast <span className="experimentalBadge">Experimental</span>
      </h2>
      <div className="cardBody">
        <div className="helpText">
          Not an official NWS/SPC product — this app's own weighted score over raw forecast-model guidance
          (temperature, rain chance, sunshine, wind, humidity), for a rough "which day looks nicest" read at a
          glance.
        </div>
        {error && <div className="errorText">{error}</div>}
        {!error && !data && "Loading…"}
        {data && (
          <div className="niceDayList">
            {data.days.map((d) => (
              <div className="niceDayRow" key={d.date}>
                <div className="niceDayDay">{weekday(d.date)}</div>
                <span className="niceDayLabel" style={{ background: LABEL_COLORS[d.label] || "#888" }}>
                  {d.label}
                </span>
                <div className="niceDayTemp">{d.high_f}°F</div>
                <div className="niceDayNote">{d.reasons.length ? d.reasons.join(", ") : "comfortable"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
