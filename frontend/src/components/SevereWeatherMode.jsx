import { useEffect, useState } from "react";

import { api } from "../api.js";
import { alertClass, bboxesIntersect, computeGeometryBbox } from "../utils.js";
import RadarProductPanel from "./RadarProductPanel.jsx";

const PRODUCTS = [
  { key: "reflectivity", label: "Reflectivity" },
  { key: "velocity", label: "Velocity" },
];

// "Super tight" — roughly a 60-mile radius around the location, storm-scale
// rather than regional. Also defines what counts as "nearby" for the
// warnings list below, so what you see in the panels and what's in the list
// cover the same ground.
const TIGHT_RADIUS_DEG = 0.9;
const ALERTS_REFRESH_MS = 60 * 1000;

export default function SevereWeatherMode({ location }) {
  const [site, setSite] = useState(null);
  const [siteError, setSiteError] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [stateAbbr, setStateAbbr] = useState(null);

  const viewBbox = {
    minLon: location.lon - TIGHT_RADIUS_DEG,
    minLat: location.lat - TIGHT_RADIUS_DEG,
    maxLon: location.lon + TIGHT_RADIUS_DEG,
    maxLat: location.lat + TIGHT_RADIUS_DEG,
  };

  useEffect(() => {
    let cancelled = false;
    api
      .radarSite(location.lat, location.lon)
      .then((d) => !cancelled && setSite(d.site))
      .catch((err) => !cancelled && setSiteError(err.message));
    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon]);

  useEffect(() => {
    let cancelled = false;

    function load() {
      api
        .alerts(location.lat, location.lon)
        .then((d) => {
          if (cancelled) return;
          const nearby = d.alerts.filter(
            (a) => a.is_local || (a.geometry && bboxesIntersect(computeGeometryBbox(a.geometry), viewBbox))
          );
          setAlerts(nearby);
          setStateAbbr(d.state);
        })
        .catch(() => !cancelled && setAlerts([]));
    }

    load();
    const id = setInterval(load, ALERTS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.lat, location.lon]);

  return (
    <div className="severeMode">
      <header className="kioskHeader">
        <div className="kioskLocation">
          {location.label}
          {site ? ` — ${site.toUpperCase()}` : ""}
        </div>
        <a className="kioskExit" href="?">
          Exit
        </a>
      </header>

      <div className="severeModeBody">
        <div className="severeModePanels">
          {siteError && <div className="errorText">{siteError}</div>}
          {!siteError && !site && <div className="kioskLoading">Loading…</div>}
          {!siteError &&
            site &&
            PRODUCTS.map((p) => <RadarProductPanel key={p.key} site={site} product={p.key} label={p.label} bbox={viewBbox} />)}
        </div>

        <aside className="severeModeTicker">
          <h2 className="kioskSceneTitle">Local &amp; Nearby Warnings{stateAbbr ? ` — ${stateAbbr}` : ""}</h2>
          {alerts === null && <div className="kioskLoading">Loading…</div>}
          {alerts && alerts.length === 0 && <div className="kioskEmpty">No active alerts nearby.</div>}
          {alerts &&
            alerts.map((a) => (
              <div className={`kioskAlertCard ${alertClass(a.event)}`} key={a.id}>
                <div className="kioskAlertHeader">
                  <span className="kioskAlertEvent">{a.event}</span>
                  {a.is_local && <span className="badge localBadge">LOCAL</span>}
                </div>
                <div className="kioskAlertArea">{a.area_desc}</div>
                <div className="kioskAlertUntil">Until {a.expires ? new Date(a.expires).toLocaleString() : "—"}</div>
              </div>
            ))}
        </aside>
      </div>
    </div>
  );
}
