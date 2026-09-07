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

import { useEffect, useMemo, useState } from "react";

import { api } from "../api.js";
import { bboxesIntersect, computeGeometryBbox, findStateBbox } from "../utils.js";

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

  // Bounding box of whichever state the user is in — wherever that is, not
  // hardcoded to Michigan — so the legend only lists categories actually
  // near them instead of every category present anywhere in the country.
  const stateBbox = useMemo(
    () => (location ? findStateBbox(location.lat, location.lon) : null),
    [location?.lat, location?.lon]
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .outlook(day, hazard)
      .then((data) => {
        if (cancelled) return;
        const seen = new Map();
        (data.features || []).forEach((f) => {
          // No containing state (e.g. a non-US location) or geometry
          // outside it — leave the legend unfiltered rather than guess.
          if (stateBbox && !bboxesIntersect(computeGeometryBbox(f.geometry), stateBbox)) return;
          const label = f.properties.LABEL2 || f.properties.LABEL;
          if (label && !seen.has(label)) seen.set(label, f.properties.fill || "#888");
        });
        setLegend([...seen.entries()]);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [day, hazard, stateBbox]);

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
        <div className="helpText">
          The Storm Prediction Center's outlook map for organized severe thunderstorms. Categories run low to high:
          Marginal, Slight, Enhanced, Moderate, High. "Categorical" is the overall category; the other tabs break out
          the odds of a specific hazard (tornado, hail, wind) within 25 miles of any point in the shaded area. The
          legend below only lists categories present in or near your state — the map itself still shows the whole
          country.
        </div>
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
