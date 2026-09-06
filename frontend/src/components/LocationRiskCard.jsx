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

import { fetchOutlookBreakdown, HAZARD_SHORT_LABELS } from "../utils.js";

// Split out of OutlookCard and placed right under Current Conditions: "is
// there a risk where I actually am" is a more urgent question than the SPC
// outlook map controls below it, so it shouldn't require scrolling past the
// forecast to see.
export default function LocationRiskCard({ location, day }) {
  const [breakdown, setBreakdown] = useState(undefined);

  useEffect(() => {
    if (!location) return undefined;
    let cancelled = false;
    setBreakdown(undefined);
    fetchOutlookBreakdown(String(day), location.lat, location.lon).then((d) => !cancelled && setBreakdown(d));
    return () => {
      cancelled = true;
    };
  }, [day, location?.lat, location?.lon]);

  if (!location) return null;

  return (
    <section className="card">
      <h2>Risk At Your Location</h2>
      <div className="cardBody">
        <div className="helpText">
          The Storm Prediction Center's Day {day} outlook, evaluated at your exact point: an overall category (how
          organized severe storms are expected to be, from Marginal up through High) plus the odds of a tornado,
          damaging hail, or damaging wind within 25 miles.
        </div>
        {breakdown === undefined && <div className="muted">Loading…</div>}
        {breakdown && (
          <div className="outlookBreakdownChips">
            <span style={{ background: breakdown.category?.color || "#888" }}>{breakdown.category?.label || "None"}</span>
            {breakdown.category &&
              ["torn", "hail", "wind", "prob"]
                .filter((h) => h in breakdown)
                .map((h) => (
                  <span key={h} className={breakdown[h] ? "" : "noRisk"} style={breakdown[h] ? { background: breakdown[h].color } : undefined}>
                    {breakdown[h] ? breakdown[h].label : `No ${h === "prob" ? "Severe" : HAZARD_SHORT_LABELS[h] || h} Risk`}
                  </span>
                ))}
          </div>
        )}
      </div>
    </section>
  );
}
