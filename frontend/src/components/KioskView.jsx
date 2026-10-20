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

import { useEffect, useRef, useState } from "react";

import { api } from "../api.js";
import { alertClass, fetchOutlookBreakdown, filterNearbyAlerts, fmt, minutesSince, NICE_DAY_COLORS, topAlert } from "../utils.js";
import MapView from "./MapView.jsx";
import QuickLocation from "./QuickLocation.jsx";

const ALL_SCENES = ["map", "conditions", "days", "mds", "afd"];
const DEFAULT_SCENE_DURATION_MS = 25 * 1000;
const DATA_REFRESH_MS = 5 * 60 * 1000;
const CLOCK_TICK_MS = 1000;

// ?scenes=map,conditions and ?duration=15 (seconds) let a specific wall
// display be tuned without touching code. ?compact=1 switches to the layout
// sized for a small dedicated screen (e.g. a 7" Raspberry Pi display) — an
// explicit flag rather than a screen-size guess, so it only ever applies to
// a display that was set up for it (setup.py --pi-display launches with it).
function readKioskConfig() {
  const params = new URLSearchParams(window.location.search);
  const requested = (params.get("scenes") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ALL_SCENES.includes(s));
  const scenes = requested.length ? requested : ALL_SCENES;

  const durationSec = parseInt(params.get("duration"), 10);
  const sceneDurationMs = Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1000 : DEFAULT_SCENE_DURATION_MS;

  return { scenes, sceneDurationMs, compact: params.get("compact") === "1" };
}

// Everything about "right now": conditions, forecast, the single
// most-urgent alert + today's outlook category at a glance, and the full
// watches/warnings list — one consolidated scene instead of several thin
// ones. (There's no separate "SPC Watches" list here: SPC-issued
// Tornado/Severe Thunderstorm Watches are distributed through the normal
// NWS alert feed too, so they already show up in Watches & Warnings below —
// a second list of the same watches added nothing but confusion.)
function KioskConditionsScene({ location, refreshTick }) {
  const [conditions, setConditions] = useState(null);
  const [error, setError] = useState(null);
  const [topAlertItem, setTopAlertItem] = useState(undefined); // undefined = loading, null = none
  const [outlook, setOutlook] = useState(undefined);
  const [alerts, setAlerts] = useState(null);
  const [stateAbbr, setStateAbbr] = useState(null);
  const [niceDay, setNiceDay] = useState(undefined); // undefined = loading, null = unavailable

  useEffect(() => {
    let cancelled = false;

    api
      .conditions(location.lat, location.lon)
      .then((d) => !cancelled && setConditions(d))
      .catch((err) => !cancelled && setError(err.message));

    api
      .alerts(location.lat, location.lon)
      .then((d) => {
        if (cancelled) return;
        const nearby = filterNearbyAlerts(d.alerts, location.lat, location.lon);
        setAlerts(nearby);
        setStateAbbr(d.state);
        setTopAlertItem(topAlert(nearby));
      })
      .catch(() => {
        if (cancelled) return;
        setAlerts([]);
        setTopAlertItem(null);
      });

    fetchOutlookBreakdown("1", location.lat, location.lon).then((d) => !cancelled && setOutlook(d));

    api
      .niceDayForecast(location.lat, location.lon)
      .then((d) => !cancelled && setNiceDay(d.days?.[0] || null))
      .catch(() => !cancelled && setNiceDay(null));

    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  return (
    <div className="kioskScene kioskConditionsScene">
      <h2 className="kioskSceneTitle">Current Conditions &amp; Alerts</h2>
      {error && <div className="errorText">{error}</div>}

      <div className="kioskConditionsLayout">
        <div className="kioskConditionsLeft">
          {!error && !conditions && <div className="kioskLoading">Loading…</div>}
          {conditions && (
            <div className="kioskConditionsMain">
              {conditions.icon && <img className="kioskCondIcon" src={conditions.icon} alt="" />}
              <div className="kioskTempBlock">
                <div className="kioskTempBig">{fmt(conditions.temperature_f)}°F</div>
                <div className="kioskCondText">{conditions.text_description}</div>
                <div className="kioskStationText">{conditions.station_name}</div>
                {(() => {
                  const minutesAgo = minutesSince(conditions.observed_at);
                  if (minutesAgo === null) return null;
                  const label =
                    minutesAgo < 1 ? "just now" : minutesAgo < 60 ? `${minutesAgo} min ago` : `${Math.round(minutesAgo / 60)} hr ago`;
                  return (
                    <div className="kioskObsText">
                      Observed {label}
                      {minutesAgo > 90 && <span className="staleBadge"> — may be delayed</span>}
                    </div>
                  );
                })()}
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
              </div>
            </div>
          )}

          <div className="kioskGlanceRow">
            <div className={`kioskGlanceAlert${topAlertItem ? ` ${alertClass(topAlertItem.event)}` : ""}`}>
              {topAlertItem === undefined && <div className="kioskLoading">Loading…</div>}
              {topAlertItem === null && <div className="kioskEmpty">No active alerts</div>}
              {topAlertItem && (
                <>
                  <div className="kioskGlanceAlertLabel">{topAlertItem.is_local ? "ACTIVE NOW" : "UPSTREAM"}</div>
                  <div className="kioskGlanceAlertEvent">{topAlertItem.event}</div>
                  <div className="kioskAlertArea">{topAlertItem.area_desc}</div>
                </>
              )}
            </div>
            <div className="kioskGlanceOutlook">
              <div className="kioskGlanceOutlookLabel">Today's Severe Weather Outlook</div>
              {outlook === undefined && <div className="kioskLoading">Loading…</div>}
              {outlook && (
                <>
                  <span className="kioskOutlookChip" style={{ background: outlook.category?.color || "#888" }}>
                    {outlook.category?.label || "None"}
                  </span>
                  {outlook.category && (
                    <div className="kioskHazardRow">
                      <span className="kioskHazardChip" style={outlook.torn ? { background: outlook.torn.color } : undefined}>
                        {outlook.torn ? outlook.torn.label : "No Tor Risk"}
                      </span>
                      <span className="kioskHazardChip" style={outlook.hail ? { background: outlook.hail.color } : undefined}>
                        {outlook.hail ? outlook.hail.label : "No Hail Risk"}
                      </span>
                      <span className="kioskHazardChip" style={outlook.wind ? { background: outlook.wind.color } : undefined}>
                        {outlook.wind ? outlook.wind.label : "No Wind Risk"}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="kioskGlanceNiceDay">
              <div className="kioskGlanceOutlookLabel">Nice Day Forecast</div>
              {niceDay === undefined && <div className="kioskLoading">Loading…</div>}
              {niceDay === null && <div className="kioskEmpty">Unavailable</div>}
              {niceDay && (
                <>
                  <span className="kioskOutlookChip" style={{ background: NICE_DAY_COLORS[niceDay.label] || "#888" }}>
                    {niceDay.label}
                  </span>
                  <div className="kioskNiceDayNote">
                    {niceDay.reasons.length ? niceDay.reasons.join(", ") : "Comfortable conditions expected"}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="kioskConditionsRight">
          <div className="kioskCompactListBlock">
            <h3>Watches &amp; Warnings{stateAbbr ? ` — ${stateAbbr}` : ""}</h3>
            {alerts === null && <div className="kioskLoading">Loading…</div>}
            {alerts && alerts.length === 0 && <div className="kioskEmpty">No active alerts in or near your county.</div>}
            {alerts &&
              alerts.map((a) => (
                <div className={`kioskCompactCard ${alertClass(a.event)}`} key={a.id}>
                  <div className="kioskCompactHeader">
                    <span>{a.event}</span>
                    {a.is_local && <span className="badge localBadge">LOCAL</span>}
                  </div>
                  <div className="kioskCompactSub">{a.area_desc}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// A week-ahead glance: one card per daytime forecast period, paired by date
// with that same day's Nice Day Forecast score — the home page keeps those
// as two separate cards, but kiosk mode has no scrolling, so combining them
// here is the only way to show both without adding yet another scene.
function KioskDaysScene({ location, refreshTick }) {
  const [periods, setPeriods] = useState(null);
  const [niceDayByDate, setNiceDayByDate] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .forecast(location.lat, location.lon)
      .then((d) => !cancelled && setPeriods(d.periods))
      .catch((err) => !cancelled && setError(err.message));

    api
      .niceDayForecast(location.lat, location.lon)
      .then((d) => {
        if (cancelled) return;
        setNiceDayByDate(Object.fromEntries((d.days || []).map((day) => [day.date, day])));
      })
      .catch(() => !cancelled && setNiceDayByDate({}));

    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  // Keep the first period verbatim (Today, or Tonight if it's already
  // evening) plus whichever immediately follows it — that's the only way
  // "Tonight" survives, since Nice Day Forecast (and every period past this
  // pair) is a daily, daytime-only figure. Everything after that is
  // daytime-only so a whole week fits without one card per night too.
  const dayCards = [...(periods || []).slice(0, 2), ...(periods || []).slice(2).filter((p) => p.is_daytime)].slice(0, 8);

  return (
    <div className="kioskScene kioskDaysScene">
      <h2 className="kioskSceneTitle">Coming Days</h2>
      {error && <div className="errorText">{error}</div>}
      {!error && !periods && <div className="kioskLoading">Loading…</div>}
      {periods && (
        <div className="kioskDaysGrid">
          {dayCards.map((p) => {
            // Nice Day Forecast is scored per calendar date, not per
            // day/night period — Tonight and Today share a date, so Tonight
            // gets the same chip rather than conspicuously having none.
            const date = p.start_time ? p.start_time.slice(0, 10) : null;
            const niceDay = date ? niceDayByDate?.[date] : null;
            return (
              <div className="kioskDayCard" key={p.name}>
                <div className="kioskDayName">{p.name}</div>
                {p.icon && <img className="kioskDayIcon" src={p.icon} alt="" />}
                <div className="kioskDayTemp">
                  {p.temperature}°{p.temperature_unit}
                </div>
                <div className="kioskDayText">{p.short_forecast}</div>
                {niceDay && (
                  <>
                    <span className="kioskDayNiceDayChip" style={{ background: NICE_DAY_COLORS[niceDay.label] || "#888" }}>
                      {niceDay.label}
                    </span>
                    {/* Why it got that label — the forecast text beside it
                        ("Partly Sunny") often doesn't explain a "Meh". */}
                    <div className="kioskDayWhy">{niceDay.reasons?.length ? niceDay.reasons.join(", ") : "comfortable"}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Fetched up in KioskView (not inside the scene) so the rotation can decide
// whether the Mesoscale Discussions scene is worth showing at all — most of
// the time there are none, and a scene that just says "none" is dead air.
// mds stays null until the first answer; a failed fetch counts as "none" and
// is retried well before the normal refresh (see below).
function useMesoscaleDiscussions(location, refreshTick) {
  const [mds, setMds] = useState(null);
  const [stateName, setStateName] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    // Failsafe: an unattended wall display can't afford to sit on
    // "Loading…" forever if something upstream hangs — fall back to the
    // same "nothing to show" state a confirmed-empty feed would render.
    const failsafe = setTimeout(() => {
      if (!cancelled) {
        setMds((current) => current ?? []);
        setFailed(true);
      }
    }, 20000);
    api
      .mesoscaleDiscussions(location.lat, location.lon)
      .then((d) => {
        if (cancelled) return;
        clearTimeout(failsafe);
        setMds(d.items);
        setStateName(d.filtered_to_state);
      })
      .catch(() => {
        if (cancelled) return;
        clearTimeout(failsafe);
        setMds([]);
        setFailed(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(failsafe);
    };
  }, [location.lat, location.lon, refreshTick, retryTick]);

  // Same reasoning as the home-page card: a failure here is usually a
  // transient blip, so retry well before the normal 5-minute cadence rather
  // than leaving an unattended wall display on stale/empty data that long.
  useEffect(() => {
    if (!failed) return undefined;
    const id = setTimeout(() => setRetryTick((t) => t + 1), 30000);
    return () => clearTimeout(id);
  }, [failed]);

  return { mds, stateName };
}

function KioskMdScene({ mds, stateName }) {
  return (
    <div className="kioskScene kioskMdScene">
      <h2 className="kioskSceneTitle">Mesoscale Discussions{stateName ? ` — ${stateName}` : ""}</h2>
      {mds === null && <div className="kioskLoading">Loading…</div>}
      {mds && mds.length === 0 && (
        <div className="kioskEmpty">No active mesoscale discussions{stateName ? ` for ${stateName}` : ""}.</div>
      )}
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

  // AFD text wraps each bullet across several physical lines at ~70-80
  // chars — only a blank line actually starts a new bullet. Splitting on
  // every "\n" (the old bug) fragmented single sentences into several fake
  // bullets; split on blank lines instead, then rejoin each bullet's
  // wrapped lines into one sentence.
  const bullets = afd?.key_messages
    ? afd.key_messages
        .split(/\n\s*\n/)
        .map((para) =>
          para
            .replace(/^-\s*/, "")
            .replace(/\s*\n\s*/g, " ")
            .trim()
        )
        .filter(Boolean)
    : null;

  return (
    <div className="kioskScene kioskAfdScene">
      <div className="kioskAfdHeader">
        <h2 className="kioskSceneTitle">Forecast Discussion</h2>
        {afd && (
          <div className="kioskAfdMeta">
            <span className="kioskAfdOffice">{afd.office_id}</span>
            {afd.issuance_time && (
              <span className="kioskAfdIssued">
                Issued {new Date(afd.issuance_time).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}
      </div>
      {error && <div className="errorText">{error}</div>}
      {!error && !afd && <div className="kioskLoading">Loading…</div>}
      {afd && bullets && (
        <div className="kioskAfdBullets">
          {bullets.map((b, i) => (
            <div className="kioskAfdBulletCard" key={i}>
              <div className="kioskAfdBulletNum">{i + 1}</div>
              <div className="kioskAfdBulletText">{b}</div>
            </div>
          ))}
        </div>
      )}
      {afd && !bullets && <div className="kioskAfdFallback">{afd.text.split("\n\n").slice(1, 4).join("\n\n")}</div>}
    </div>
  );
}

// A horizontal drag at least this far (px), and clearly more horizontal than
// vertical, counts as a swipe between scenes. Vertical drags are left alone
// so a scene that overflows can still be scrolled by touch.
const SWIPE_MIN_PX = 50;

// The scene after (dir = 1) or before (dir = -1) `current` in `rotation`,
// wrapping around. A scene that isn't in the rotation (e.g. Mesoscale
// Discussions just dropped out) is treated as the first entry.
function stepScene(rotation, current, dir) {
  const i = rotation.includes(current) ? rotation.indexOf(current) : 0;
  return rotation[(i + dir + rotation.length) % rotation.length];
}

export default function KioskView({ location, onLocationChange }) {
  const [{ scenes, sceneDurationMs, compact }] = useState(readKioskConfig);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [now, setNow] = useState(new Date());
  const [refreshTick, setRefreshTick] = useState(0);
  const { mds, stateName } = useMesoscaleDiscussions(location, refreshTick);

  // Only rotate through Mesoscale Discussions when there's actually one to
  // read. If that leaves nothing at all (someone configured ?scenes=mds only)
  // fall back to the full list rather than a blank screen.
  const hasMds = mds !== null && mds.length > 0;
  const visibleScenes = scenes.filter((s) => s !== "mds" || hasMds);
  const rotation = visibleScenes.length ? visibleScenes : scenes;
  const rotationKey = rotation.join(",");

  // Tracked by scene *name*, not position, so the scene on screen doesn't
  // jump when the rotation's length changes under it.
  const [sceneName, setSceneName] = useState(scenes[0]);
  const scene = rotation.includes(sceneName) ? sceneName : rotation[0];
  // Bumped on a manual swipe so the auto-advance timer restarts — otherwise
  // a swipe just before the timer fires would skip two scenes at once.
  const [navCount, setNavCount] = useState(0);

  // Held still while the city picker is open — a scene changing under
  // someone mid-search is just annoying.
  useEffect(() => {
    if (pickingLocation) return undefined;
    const id = setInterval(() => setSceneName((cur) => stepScene(rotation, cur, 1)), sceneDurationMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationKey, sceneDurationMs, navCount, pickingLocation]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), DATA_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  function goToScene(dir) {
    setSceneName((cur) => stepScene(rotation, cur, dir));
    setNavCount((n) => n + 1);
  }

  // Swipe detection. Deliberately belt-and-braces, since touchscreens differ
  // in what the browser reports (real touch events, pointer events, or just
  // emulated mouse input) and one that fails silently leaves swiping dead:
  //  - listens to pointer events AND touch events, on window in the capture
  //    phase so nothing inside a scene (the Leaflet map swallows plenty) can
  //    hide the gesture;
  //  - fires as soon as the finger has travelled far enough sideways, rather
  //    than waiting for it to lift — a gesture the browser cancels partway
  //    (pointercancel) still counts.
  // A gesture started on the keyboard or the city picker is not a swipe.
  const goToSceneRef = useRef(goToScene);
  goToSceneRef.current = goToScene;
  useEffect(() => {
    if (!compact) return undefined;
    let start = null;
    let fired = false;

    function begin(target, x, y) {
      fired = false;
      start = target.closest && target.closest(".osk, [data-noswipe], .kioskDots") ? null : { x, y };
    }
    function move(x, y) {
      if (!start || fired) return;
      const dx = x - start.x;
      const dy = y - start.y;
      if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        fired = true;
        // Swiping left (finger moving left) reveals the next scene.
        goToSceneRef.current(dx < 0 ? 1 : -1);
      }
    }
    const end = () => {
      start = null;
    };

    const onPointerDown = (e) => begin(e.target, e.clientX, e.clientY);
    const onPointerMove = (e) => move(e.clientX, e.clientY);
    const onTouchStart = (e) => e.touches[0] && begin(e.target, e.touches[0].clientX, e.touches[0].clientY);
    const onTouchMove = (e) => e.touches[0] && move(e.touches[0].clientX, e.touches[0].clientY);

    const opts = { capture: true, passive: true };
    const handlers = [
      ["pointerdown", onPointerDown],
      ["pointermove", onPointerMove],
      ["pointerup", end],
      ["pointercancel", end],
      ["touchstart", onTouchStart],
      ["touchmove", onTouchMove],
      ["touchend", end],
      ["touchcancel", end],
    ];
    handlers.forEach(([name, fn]) => window.addEventListener(name, fn, opts));
    return () => handlers.forEach(([name, fn]) => window.removeEventListener(name, fn, opts));
  }, [compact]);

  return (
    <div className={`kiosk${compact ? " kioskSmallScreen" : ""}`}>
      <header className="kioskHeader">
        {compact && onLocationChange ? (
          <button type="button" className="kioskLocation kioskLocationButton" onClick={() => setPickingLocation(true)}>
            {location.label} <span className="kioskLocationCaret">▾</span>
          </button>
        ) : (
          <div className="kioskLocation">{location.label}</div>
        )}
        <div className="kioskClock">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} &middot;{" "}
          {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        </div>
        {/* Keep the small-screen flag on exit, so the regular dashboard it
            lands on still gets the on-screen keyboard. */}
        <a className="kioskExit" href={compact ? "?compact=1" : "?"}>
          Exit Kiosk
        </a>
      </header>

      <div className="kioskBody">
        {/* Mounted only while this is the active scene. This used to stay
            permanently mounted (just hidden) so radar tiles would stay warm
            across scene cycles, but keeping a Leaflet instance alive
            indefinitely turned out to cause worse problems — intermittent
            stale/corrupted rendering bleeding into other scenes — than the
            brief re-warmup a fresh mount costs every time this scene comes
            back around. The readiness gate in MapView (see radarReady)
            still keeps that re-warmup from looking janky. */}
        {scene === "map" && (
          <MapView
            location={location}
            onMapClick={() => {}}
            outlookDay="1"
            outlookHazard="cat"
            refreshTick={refreshTick}
            autoPlayRadar
            lockView={compact}
          />
        )}
        {scene === "conditions" && <KioskConditionsScene location={location} refreshTick={refreshTick} />}
        {scene === "days" && <KioskDaysScene location={location} refreshTick={refreshTick} />}
        {scene === "mds" && <KioskMdScene mds={mds} stateName={stateName} />}
        {scene === "afd" && <KioskAfdScene location={location} refreshTick={refreshTick} />}
      </div>

      <div className="kioskDots">
        {/* On a touchscreen these double as the buttons for moving between
            scenes — the sure-fire alternative to swiping. */}
        {compact && (
          <button type="button" className="kioskNavArrow" aria-label="Previous scene" onClick={() => goToScene(-1)}>
            ‹
          </button>
        )}
        {rotation.map((s) =>
          compact ? (
            <button
              type="button"
              key={s}
              className="kioskDotButton"
              aria-label={`Show ${s}`}
              onClick={() => {
                setSceneName(s);
                setNavCount((n) => n + 1);
              }}
            >
              <span className={`kioskDot${s === scene ? " active" : ""}`} />
            </button>
          ) : (
            <span key={s} className={`kioskDot${s === scene ? " active" : ""}`} />
          )
        )}
        {compact && (
          <button type="button" className="kioskNavArrow" aria-label="Next scene" onClick={() => goToScene(1)}>
            ›
          </button>
        )}
      </div>

      {pickingLocation && (
        <QuickLocation
          current={location}
          onClose={() => setPickingLocation(false)}
          onSelect={(loc) => {
            setPickingLocation(false);
            onLocationChange(loc);
          }}
        />
      )}
    </div>
  );
}
