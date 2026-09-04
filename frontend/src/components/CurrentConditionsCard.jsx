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
import { fmt } from "../utils.js";

export default function CurrentConditionsCard({ location, refreshTick }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    api
      .conditions(location.lat, location.lon)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  return (
    <section className="card">
      <h2>Current Conditions</h2>
      <div className="cardBody">
        {error && <div className="errorText">{error}</div>}
        {!error && !data && "Loading…"}
        {data && (
          <>
            <div className="tempRow">{fmt(data.temperature_f)}°F</div>
            <div className="condRow">
              {data.text_description || ""} &middot; {data.station_name}
            </div>
            <div className="metaGrid">
              <div>
                <span>Feels like</span> {fmt(data.feels_like_f)}°F
              </div>
              <div>
                <span>Humidity</span> {fmt(data.humidity_pct)}%
              </div>
              <div>
                <span>Wind</span> {data.wind_direction ? `${data.wind_direction} ` : ""}
                {fmt(data.wind_mph)} mph
              </div>
              <div>
                <span>Gusts</span> {data.wind_gust_mph != null ? `${fmt(data.wind_gust_mph)} mph` : "—"}
              </div>
              <div>
                <span>Pressure</span> {data.pressure_inhg != null ? `${fmt(data.pressure_inhg, 2)} inHg` : "—"}
              </div>
              <div>
                <span>Visibility</span> {data.visibility_mi != null ? `${fmt(data.visibility_mi, 1)} mi` : "—"}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
