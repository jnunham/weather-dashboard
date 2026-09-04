import { useEffect, useState } from "react";

import { api } from "../api.js";

const POLL_INTERVAL_MS = 60 * 1000;

function formatAlert(a) {
  const until = a.expires ? new Date(a.expires).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : null;
  const icon = a.is_local ? "⚠" : "↑";
  const scope = a.is_local ? "" : " (upstream)";
  return `${icon} ${a.event.toUpperCase()}${scope} — ${a.area_desc}${until ? ` — until ${until}` : ""}`;
}

export default function Ticker({ location, refreshTick }) {
  const [alerts, setAlerts] = useState([]);
  const [stateAbbr, setStateAbbr] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Reset immediately on a real location change so stale alerts from the
  // previous location can't linger under the new location's label while the
  // fresh fetch (below) is in flight.
  useEffect(() => {
    setLoaded(false);
    setAlerts([]);
  }, [location.lat, location.lon]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api.alerts(location.lat, location.lon);
        if (!cancelled) {
          setAlerts(data.alerts);
          setStateAbbr(data.state);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [location.lat, location.lon, refreshTick]);

  if (!loaded) {
    return <div className="ticker noAlerts" />;
  }

  if (alerts.length === 0) {
    return (
      <div className="ticker noAlerts">
        <div className="ticker__item" style={{ paddingLeft: 16 }}>
          No active watches or warnings{stateAbbr ? ` in ${stateAbbr}` : ` for ${location.label}`}.
        </div>
      </div>
    );
  }

  const items = alerts.map((a) => ({ text: formatAlert(a), isLocal: a.is_local }));

  return (
    <div className="ticker">
      <div className="ticker__track">
        {[0, 1].map((copy) => (
          <div className="ticker__group" key={copy} aria-hidden={copy === 1}>
            {items.map((item, i) => (
              <span className={`ticker__item${item.isLocal ? "" : " ticker__item--upstream"}`} key={`${copy}-${i}`}>
                {item.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
