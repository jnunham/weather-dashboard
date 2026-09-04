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
