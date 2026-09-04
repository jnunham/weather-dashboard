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
import { fetchOutlookBreakdown } from "../utils.js";

const HAZARDS_BY_DAY = {
  1: [
    { value: "cat", label: "Categorical" },
    { value: "torn", label: "Tornado" },
    { value: "hail", label: "Hail" },
    { value: "wind", label: "Wind" },
  ],
  2: [
    { value: "cat", label: "Categorical" },
    { value: "torn", label: "Tornado" },
    { value: "hail", label: "Hail" },
    { value: "wind", label: "Wind" },
  ],
  3: [
    { value: "cat", label: "Categorical" },
    { value: "prob", label: "Probabilistic" },
  ],
};

export default function OutlookCard({ location, day, hazard, onDayChange, onHazardChange }) {
  const [legend, setLegend] = useState([]);
  const [error, setError] = useState(null);
  const [breakdown, setBreakdown] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .outlook(day, hazard)
      .then((data) => {
        if (cancelled) return;
        const seen = new Map();
        (data.features || []).forEach((f) => {
          const label = f.properties.LABEL2 || f.properties.LABEL;
          if (label && !seen.has(label)) seen.set(label, f.properties.fill || "#888");
        });
        setLegend([...seen.entries()]);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [day, hazard]);

  useEffect(() => {
    if (!location) return undefined;
    let cancelled = false;
    setBreakdown(undefined);
    fetchOutlookBreakdown(String(day), location.lat, location.lon).then((d) => !cancelled && setBreakdown(d));
    return () => {
      cancelled = true;
    };
  }, [day, location?.lat, location?.lon]);

  function handleDayChange(newDay) {
    onDayChange(newDay);
    const hazards = HAZARDS_BY_DAY[newDay];
    if (!hazards.some((h) => h.value === hazard)) {
      onHazardChange(hazards[0].value);
    }
  }

  return (
    <section className="card">
      <h2>SPC Severe Weather Outlook</h2>
      <div className="cardBody">
        <div className="btnRow">
          {[1, 2, 3].map((d) => (
            <button key={d} className={String(d) === String(day) ? "active" : ""} onClick={() => handleDayChange(d)}>
              Day {d}
            </button>
          ))}
        </div>
        <div className="btnRow">
          {HAZARDS_BY_DAY[day].map((h) => (
            <button
              key={h.value}
              className={h.value === hazard ? "active" : ""}
              onClick={() => onHazardChange(h.value)}
            >
              {h.label}
            </button>
          ))}
        </div>
        {error && <div className="errorText">{error}</div>}
        <div className="outlookLegend">
          {legend.map(([label, color]) => (
            <span key={label} style={{ background: color }}>
              {label}
            </span>
          ))}
        </div>

        {location && (
          <div className="outlookBreakdown">
            <div className="outlookBreakdownLabel">At your location</div>
            {breakdown === undefined && <div className="muted">Loading…</div>}
            {breakdown && (
              <div className="outlookBreakdownChips">
                <span style={{ background: breakdown.category?.color || "#888" }}>{breakdown.category?.label || "None"}</span>
                {["torn", "hail", "wind", "prob"]
                  .filter((h) => h in breakdown)
                  .map((h) => (
                    <span key={h} className={breakdown[h] ? "" : "noRisk"} style={breakdown[h] ? { background: breakdown[h].color } : undefined}>
                      {breakdown[h] ? breakdown[h].label : `No ${h === "prob" ? "Severe" : h[0].toUpperCase() + h.slice(1)} Risk`}
                    </span>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
