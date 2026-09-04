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
              <div className="pname">
                {p.name} <span className="ptemp">{p.temperature}°{p.temperature_unit}</span>
              </div>
              <div>{p.short_forecast}</div>
            </div>
          ))}
      </div>
    </section>
  );
}
