import { useEffect, useState } from "react";

import { api } from "../api.js";
import { alertClass, findOutlookCategory, fmt, topAlert } from "../utils.js";
import MapView from "./MapView.jsx";

const ALL_SCENES = ["map", "glance", "conditions", "alerts", "watches", "mds", "afd"];
const DEFAULT_SCENE_DURATION_MS = 25 * 1000;
const DATA_REFRESH_MS = 5 * 60 * 1000;
const CLOCK_TICK_MS = 1000;

// ?scenes=map,glance,alerts and ?duration=15 (seconds) let a specific wall
// display be tuned without touching code — e.g. a display that only ever
// needs to show the map and current alerts.
function readKioskConfig() {
  const params = new URLSearchParams(window.location.search);
  const requested = (params.get("scenes") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ALL_SCENES.includes(s));
  const scenes = requested.length ? requested : ALL_SCENES;

  const durationSec = parseInt(params.get("duration"), 10);
  const sceneDurationMs = Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1000 : DEFAULT_SCENE_DURATION_MS;

  return { scenes, sceneDurationMs };
}

function KioskGlanceScene({ location, refreshTick }) {
  const [conditions, setConditions] = useState(null);
  const [alert, setAlert] = useState(undefined); // undefined = loading, null = none
  const [outlookCat, setOutlookCat] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .conditions(location.lat, location.lon)
      .then((d) => !cancelled && setConditions(d))
      .catch(() => {});
    api
      .alerts(location.lat, location.lon)
      .then((d) => !cancelled && setAlert(topAlert(d.alerts)))
      .catch(() => !cancelled && setAlert(null));
    api
      .outlook("1", "cat")
      .then((d) => !cancelled && setOutlookCat(findOutlookCategory(location.lat, location.lon, d)))
      .catch(() => !cancelled && setOutlookCat(null));
    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  return (
    <div className="kioskScene kioskGlanceScene">
      <h2 className="kioskSceneTitle">At a Glance</h2>
      <div className="kioskGlanceGrid">
        <div className="kioskGlanceTemp">
          {conditions ? (
            <>
              <div className="kioskTempBig">{fmt(conditions.temperature_f)}°F</div>
              <div className="kioskCondText">{conditions.text_description}</div>
            </>
          ) : (
            <div className="kioskLoading">Loading…</div>
          )}
        </div>

        <div className={`kioskGlanceAlert${alert ? ` ${alertClass(alert.event)}` : ""}`}>
          {alert === undefined && <div className="kioskLoading">Loading…</div>}
          {alert === null && <div className="kioskEmpty">No active alerts</div>}
          {alert && (
            <>
              <div className="kioskGlanceAlertLabel">{alert.is_local ? "ACTIVE NOW" : "UPSTREAM"}</div>
              <div className="kioskGlanceAlertEvent">{alert.event}</div>
              <div className="kioskAlertArea">{alert.area_desc}</div>
            </>
          )}
        </div>

        <div className="kioskGlanceOutlook">
          <div className="kioskGlanceOutlookLabel">Today's Outlook</div>
          {outlookCat === undefined && <div className="kioskLoading">Loading…</div>}
          {outlookCat === null && <span className="kioskOutlookChip" style={{ background: "#888" }}>None</span>}
          {outlookCat && (
            <span className="kioskOutlookChip" style={{ background: outlookCat.color }}>
              {outlookCat.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function KioskConditionsScene({ location, refreshTick }) {
  const [conditions, setConditions] = useState(null);
  const [periods, setPeriods] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .conditions(location.lat, location.lon)
      .then((d) => !cancelled && setConditions(d))
      .catch((err) => !cancelled && setError(err.message));
    api
      .forecast(location.lat, location.lon)
      .then((d) => !cancelled && setPeriods(d.periods))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  return (
    <div className="kioskScene kioskConditionsScene">
      <h2 className="kioskSceneTitle">Current Conditions</h2>
      {error && <div className="errorText">{error}</div>}
      {!error && !conditions && <div className="kioskLoading">Loading…</div>}
      {conditions && (
        <div className="kioskConditionsMain">
          <div className="kioskTempBlock">
            <div className="kioskTempBig">{fmt(conditions.temperature_f)}°F</div>
            <div className="kioskCondText">{conditions.text_description}</div>
            <div className="kioskStationText">{conditions.station_name}</div>
          </div>
          <div className="kioskConditionsStats">
            <div>
              <span>Feels like</span>
              <strong>{fmt(conditions.feels_like_f)}°F</strong>
            </div>
            <div>
              <span>Humidity</span>
              <strong>{fmt(conditions.humidity_pct)}%</strong>
            </div>
            <div>
              <span>Wind</span>
              <strong>
                {conditions.wind_direction ? `${conditions.wind_direction} ` : ""}
                {fmt(conditions.wind_mph)} mph
              </strong>
            </div>
            <div>
              <span>Pressure</span>
              <strong>{conditions.pressure_inhg != null ? `${fmt(conditions.pressure_inhg, 2)} inHg` : "—"}</strong>
            </div>
            <div>
              <span>Visibility</span>
              <strong>{conditions.visibility_mi != null ? `${fmt(conditions.visibility_mi, 1)} mi` : "—"}</strong>
            </div>
          </div>
        </div>
      )}
      {periods && (
        <div className="kioskForecastRow">
          {periods.slice(0, 4).map((p) => (
            <div className="kioskForecastCard" key={p.name}>
              <div className="kioskForecastName">{p.name}</div>
              <div className="kioskForecastTemp">
                {p.temperature}°{p.temperature_unit}
              </div>
              <div className="kioskForecastText">{p.short_forecast}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KioskAlertsScene({ location, refreshTick }) {
  const [alerts, setAlerts] = useState(null);
  const [stateAbbr, setStateAbbr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .alerts(location.lat, location.lon)
      .then((d) => {
        if (cancelled) return;
        setAlerts(d.alerts);
        setStateAbbr(d.state);
      })
      .catch(() => !cancelled && setAlerts([]));
    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  return (
    <div className="kioskScene kioskAlertsScene">
      <h2 className="kioskSceneTitle">Watches &amp; Warnings{stateAbbr ? ` — ${stateAbbr}` : ""}</h2>
      {alerts === null && <div className="kioskLoading">Loading…</div>}
      {alerts && alerts.length === 0 && <div className="kioskEmpty">No active alerts{stateAbbr ? ` in ${stateAbbr}` : ""}.</div>}
      <div className="kioskAlertGrid">
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
      </div>
    </div>
  );
}

function KioskWatchesScene({ refreshTick }) {
  const [watches, setWatches] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .watches()
      .then((d) => !cancelled && setWatches(d.items))
      .catch(() => !cancelled && setWatches([]));
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return (
    <div className="kioskScene kioskWatchesScene">
      <h2 className="kioskSceneTitle">SPC Watches</h2>
      {watches === null && <div className="kioskLoading">Loading…</div>}
      {watches && watches.length === 0 && <div className="kioskEmpty">No active SPC watches.</div>}
      <div className="kioskMdGrid">
        {watches &&
          watches.map((it) => (
            <div className="kioskMdCard" key={it.link}>
              <div className="kioskMdTitle">{it.title}</div>
              <div className="kioskMdText">{it.text}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

function KioskMdScene({ refreshTick }) {
  const [mds, setMds] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .mesoscaleDiscussions()
      .then((d) => !cancelled && setMds(d.items))
      .catch(() => !cancelled && setMds([]));
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return (
    <div className="kioskScene kioskMdScene">
      <h2 className="kioskSceneTitle">Mesoscale Discussions</h2>
      {mds === null && <div className="kioskLoading">Loading…</div>}
      {mds && mds.length === 0 && <div className="kioskEmpty">No active mesoscale discussions.</div>}
      <div className="kioskMdGrid">
        {mds &&
          mds.map((it) => (
            <div className="kioskMdCard" key={it.link}>
              <div className="kioskMdTitle">{it.title}</div>
              {it.image_url && <img src={it.image_url} alt={it.title} />}
              <div className="kioskMdText">{it.text}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

function KioskAfdScene({ location, refreshTick }) {
  const [afd, setAfd] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .afd(location.lat, location.lon)
      .then((d) => !cancelled && setAfd(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  const bullets = afd?.key_messages
    ? afd.key_messages
        .split("\n")
        .map((line) => line.replace(/^-\s*/, "").trim())
        .filter(Boolean)
    : null;

  return (
    <div className="kioskScene kioskAfdScene">
      <h2 className="kioskSceneTitle">Forecast Discussion{afd ? ` — ${afd.office_id}` : ""}</h2>
      {error && <div className="errorText">{error}</div>}
      {!error && !afd && <div className="kioskLoading">Loading…</div>}
      {afd && bullets && (
        <ul className="kioskAfdBullets">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {afd && !bullets && <div className="kioskAfdFallback">{afd.text.split("\n\n").slice(1, 4).join("\n\n")}</div>}
    </div>
  );
}

export default function KioskView({ location }) {
  const [{ scenes, sceneDurationMs }] = useState(readKioskConfig);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [now, setNow] = useState(new Date());
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSceneIndex((i) => (i + 1) % scenes.length), sceneDurationMs);
    return () => clearInterval(id);
  }, [scenes.length, sceneDurationMs]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), DATA_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const scene = scenes[sceneIndex];

  return (
    <div className="kiosk">
      <header className="kioskHeader">
        <div className="kioskLocation">{location.label}</div>
        <div className="kioskClock">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} &middot;{" "}
          {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <a className="kioskExit" href="?">
          Exit Kiosk
        </a>
      </header>

      <div className="kioskBody">
        {scene === "map" && (
          <MapView
            location={location}
            onMapClick={() => {}}
            outlookDay="1"
            outlookHazard="cat"
            refreshTick={refreshTick}
            autoPlayRadar
          />
        )}
        {scene === "glance" && <KioskGlanceScene location={location} refreshTick={refreshTick} />}
        {scene === "conditions" && <KioskConditionsScene location={location} refreshTick={refreshTick} />}
        {scene === "alerts" && <KioskAlertsScene location={location} refreshTick={refreshTick} />}
        {scene === "watches" && <KioskWatchesScene refreshTick={refreshTick} />}
        {scene === "mds" && <KioskMdScene refreshTick={refreshTick} />}
        {scene === "afd" && <KioskAfdScene location={location} refreshTick={refreshTick} />}
      </div>

      <div className="kioskDots">
        {scenes.map((s, i) => (
          <span key={s} className={`kioskDot${i === sceneIndex ? " active" : ""}`} />
        ))}
      </div>
    </div>
  );
}
