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

export default function OutlookCard({ day, hazard, onDayChange, onHazardChange }) {
  const [legend, setLegend] = useState([]);
  const [error, setError] = useState(null);

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

  function handleDayChange(newDay) {
    onDayChange(newDay);
    const hazards = HAZARDS_BY_DAY[newDay];
    if (!hazards.some((h) => h.value === hazard)) {
      onHazardChange(hazards[0].value);
    }
  }

  return (
    <section className="card">
      <h2>SPC Convective Outlook</h2>
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
      </div>
    </section>
  );
}
