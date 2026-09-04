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
import { alertClass } from "../utils.js";

export default function AlertsCard({ location, refreshTick }) {
  const [alerts, setAlerts] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setAlerts(null);
    api
      .alerts(location.lat, location.lon)
      .then((d) => {
        if (cancelled) return;
        setAlerts(d.alerts);
        setState(d.state);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  return (
    <section className="card">
      <h2>
        Watches &amp; Warnings{state ? ` — ${state}` : ""} <span className="badge">{alerts ? alerts.length : 0}</span>
      </h2>
      <div className="cardBody">
        {error && <div className="errorText">{error}</div>}
        {!error && !alerts && "Loading…"}
        {alerts && alerts.length === 0 && <div className="muted">No active alerts{state ? ` in ${state}` : ""}.</div>}
        {alerts &&
          alerts.map((a) => (
            <div className={`listItem ${alertClass(a.event)}`} key={a.id}>
              <div className="title">
                {a.event}
                {a.is_local && <span className="badge localBadge">LOCAL</span>}
              </div>
              <div className="sub">{a.area_desc}</div>
              <div className="sub">Until {a.expires ? new Date(a.expires).toLocaleString() : "—"}</div>
            </div>
          ))}
      </div>
    </section>
  );
}
