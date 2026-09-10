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

function formatHour(startTime) {
  return new Date(startTime).toLocaleTimeString([], { hour: "numeric" });
}

// One row per upcoming day (daytime periods only — nighttime detail gave way
// to covering the whole week), each paired by date with that day's Nice Day
// Forecast score. Previously two separate cards; folded together since a
// day's forecast and "is it a nice day" are the same question asked twice.
export default function ForecastCard({ location, refreshTick }) {
  const [periods, setPeriods] = useState(null);
  const [niceDayByDate, setNiceDayByDate] = useState(null);
  const [error, setError] = useState(null);
  // Accordion, not a flat 48-row list: only one day's hours open at a time,
  // shown right under that day instead of in one long undifferentiated
  // block at the bottom.
  const [expandedDate, setExpandedDate] = useState(null);
  const [hourlyByDate, setHourlyByDate] = useState(null);
  const [hourlyError, setHourlyError] = useState(null);

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

  // Fetched lazily, once, the first time any day is expanded — not on every
  // page load — then grouped by date client-side so opening a second or
  // third day never needs another request.
  useEffect(() => {
    if (!expandedDate || hourlyByDate) return undefined;
    let cancelled = false;
    setHourlyError(null);
    api
      .hourlyForecast(location.lat, location.lon)
      .then((d) => {
        if (cancelled) return;
        const byDate = {};
        (d.periods || []).forEach((h) => {
          const date = h.start_time ? h.start_time.slice(0, 10) : null;
          if (!date) return;
          (byDate[date] ||= []).push(h);
        });
        setHourlyByDate(byDate);
      })
      .catch((err) => !cancelled && setHourlyError(err.message));
    return () => {
      cancelled = true;
    };
  }, [expandedDate, hourlyByDate, location.lat, location.lon]);

  const days = (periods || []).filter((p) => p.is_daytime).slice(0, 7);

  function toggleDay(date) {
    setExpandedDate((current) => (current === date ? null : date));
  }

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
            const isOpen = date && date === expandedDate;
            const hours = date ? hourlyByDate?.[date] : null;
            return (
              <div className="forecastDay" key={p.name}>
                <button type="button" className="forecastPeriod forecastPeriodToggle" onClick={() => date && toggleDay(date)}>
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
                  <span className="forecastChevron">{isOpen ? "▾" : "▸"}</span>
                </button>

                {isOpen && (
                  <div className="hourlyForecast">
                    {hourlyError && <div className="errorText">{hourlyError}</div>}
                    {!hourlyError && !hourlyByDate && <div className="muted">Loading…</div>}
                    {hourlyByDate && (!hours || hours.length === 0) && (
                      <div className="muted">Hourly detail isn't available for this day yet.</div>
                    )}
                    {hours && hours.length > 0 && (
                      <div className="hourlyList">
                        {hours.map((h) => (
                          <div className="hourlyRow" key={h.start_time}>
                            <div className="hourlyTime">{formatHour(h.start_time)}</div>
                            {h.icon && <img className="hourlyIcon" src={h.icon} alt="" />}
                            <div className="hourlyTemp">
                              {h.temperature}°{h.temperature_unit}
                            </div>
                            <div className="hourlyPrecip">
                              {h.precip_probability_pct != null && h.precip_probability_pct > 0
                                ? `💧${h.precip_probability_pct}%`
                                : ""}
                            </div>
                            <div className="hourlyText">{h.short_forecast}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
}
