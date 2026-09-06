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

export default function ForecastCard({ location, refreshTick }) {
  const [periods, setPeriods] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPeriods(null);
    api
      .forecast(location.lat, location.lon)
      .then((d) => !cancelled && setPeriods(d.periods))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  return (
    <section className="card">
      <h2>Forecast</h2>
      <div className="cardBody">
        {error && <div className="errorText">{error}</div>}
        {!error && !periods && "Loading…"}
        {periods &&
          periods.slice(0, 4).map((p) => (
            <div className="forecastPeriod" key={p.name}>
              {p.icon && <img className="forecastIcon" src={p.icon} alt="" />}
              <div className="forecastPeriodBody">
                <div className="pname">
                  {p.name} <span className="ptemp">{p.temperature}°{p.temperature_unit}</span>
                </div>
                <div>{p.short_forecast}</div>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
