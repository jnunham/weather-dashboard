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

import AfdCard from "./components/AfdCard.jsx";
import AlertsCard from "./components/AlertsCard.jsx";
import CurrentConditionsCard from "./components/CurrentConditionsCard.jsx";
import ForecastCard from "./components/ForecastCard.jsx";
import KioskView from "./components/KioskView.jsx";
import LocationPrompt from "./components/LocationPrompt.jsx";
import LocationRiskCard from "./components/LocationRiskCard.jsx";
import MapView from "./components/MapView.jsx";
import MesoscaleDiscussionsCard from "./components/MesoscaleDiscussionsCard.jsx";
import NiceDayCard from "./components/NiceDayCard.jsx";
import OutlookCard from "./components/OutlookCard.jsx";
import Ticker from "./components/Ticker.jsx";
import TopBar from "./components/TopBar.jsx";

const urlParams = new URLSearchParams(window.location.search);
const isKiosk = urlParams.get("kiosk") === "1";

const STORAGE_KEY = "wx_dashboard_location";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export default function App() {
  const [location, setLocation] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [outlookDay, setOutlookDay] = useState("1");
  const [outlookHazard, setOutlookHazard] = useState("cat");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setLocation(JSON.parse(saved));
      } catch {
        setShowPrompt(true);
      }
    } else {
      setShowPrompt(true);
    }
  }, []);

  useEffect(() => {
    if (!location) return undefined;
    const id = setInterval(() => {
      setRefreshTick((t) => t + 1);
      setLastUpdated(new Date());
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [location]);

  useEffect(() => {
    if (location) setLastUpdated(new Date());
  }, [location]);

  function handleLocationChange(loc) {
    setLocation(loc);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    setShowPrompt(false);
  }

  if (showPrompt || !location) {
    return <LocationPrompt onConfirm={handleLocationChange} />;
  }

  if (isKiosk) {
    return <KioskView location={location} />;
  }

  return (
    <div className="app">
      <TopBar location={location} onLocationChange={handleLocationChange} lastUpdated={lastUpdated} />
      <Ticker location={location} refreshTick={refreshTick} />
      <main className="layout">
        <MapView
          location={location}
          onMapClick={(lat, lon) => handleLocationChange({ lat, lon, label: `${lat.toFixed(3)}, ${lon.toFixed(3)}` })}
          outlookDay={outlookDay}
          outlookHazard={outlookHazard}
          refreshTick={refreshTick}
        />
        <aside className="panel">
          <CurrentConditionsCard location={location} refreshTick={refreshTick} />
          <LocationRiskCard location={location} day={outlookDay} />
          <ForecastCard location={location} refreshTick={refreshTick} />
          <NiceDayCard location={location} />
          <AlertsCard location={location} refreshTick={refreshTick} />
          <OutlookCard
            day={outlookDay}
            hazard={outlookHazard}
            onDayChange={setOutlookDay}
            onHazardChange={setOutlookHazard}
          />
          <MesoscaleDiscussionsCard location={location} refreshTick={refreshTick} />
          <AfdCard location={location} refreshTick={refreshTick} />
        </aside>
      </main>
    </div>
  );
}
