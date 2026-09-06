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
import { NICE_DAY_COLORS } from "../utils.js";

// One row per upcoming day (daytime periods only — nighttime detail gave way
// to covering the whole week), each paired by date with that day's Nice Day
// Forecast score. Previously two separate cards; folded together since a
// day's forecast and "is it a nice day" are the same question asked twice.
export default function ForecastCard({ location, refreshTick }) {
  const [periods, setPeriods] = useState(null);
  const [niceDayByDate, setNiceDayByDate] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPeriods(null);
    api
      .forecast(location.lat, location.lon)
      .then((d) => !cancelled && setPeriods(d.periods))
      .catch((err) => !cancelled && setError(err.message));

    api
      .niceDayForecast(location.lat, location.lon)
      .then((d) => !cancelled && setNiceDayByDate(Object.fromEntries((d.days || []).map((day) => [day.date, day]))))
      .catch(() => !cancelled && setNiceDayByDate({}));

    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  const days = (periods || []).filter((p) => p.is_daytime).slice(0, 7);

  return (
    <section className="card">
      <h2>Forecast</h2>
      <div className="cardBody">
        {error && <div className="errorText">{error}</div>}
        {!error && !periods && "Loading…"}
        {periods &&
          days.map((p) => {
            const date = p.start_time ? p.start_time.slice(0, 10) : null;
            const niceDay = date ? niceDayByDate?.[date] : null;
            return (
              <div className="forecastPeriod" key={p.name}>
                {p.icon && <img className="forecastIcon" src={p.icon} alt="" />}
                <div className="forecastPeriodBody">
                  <div className="pname">
                    {p.name} <span className="ptemp">{p.temperature}°{p.temperature_unit}</span>
                    {niceDay && (
                      <span className="niceDayLabel forecastNiceDayChip" style={{ background: NICE_DAY_COLORS[niceDay.label] || "#888" }}>
                        {niceDay.label}
                      </span>
                    )}
                  </div>
                  <div>{p.short_forecast}</div>
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
