import { useEffect, useState } from "react";

import AfdCard from "./components/AfdCard.jsx";
import AlertsCard from "./components/AlertsCard.jsx";
import CurrentConditionsCard from "./components/CurrentConditionsCard.jsx";
import ForecastCard from "./components/ForecastCard.jsx";
import KioskView from "./components/KioskView.jsx";
import LocationPrompt from "./components/LocationPrompt.jsx";
import MapView from "./components/MapView.jsx";
import MesoscaleDiscussionsCard from "./components/MesoscaleDiscussionsCard.jsx";
import OutlookCard from "./components/OutlookCard.jsx";
import SevereWeatherMode from "./components/SevereWeatherMode.jsx";
import SpcWatchesCard from "./components/SpcWatchesCard.jsx";
import Ticker from "./components/Ticker.jsx";
import TopBar from "./components/TopBar.jsx";

const urlParams = new URLSearchParams(window.location.search);
const isKiosk = urlParams.get("kiosk") === "1";
const isSevereMode = urlParams.get("severe") === "1";

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

  if (isSevereMode) {
    return <SevereWeatherMode location={location} />;
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
          <ForecastCard location={location} refreshTick={refreshTick} />
          <AlertsCard location={location} refreshTick={refreshTick} />
          <OutlookCard
            day={outlookDay}
            hazard={outlookHazard}
            onDayChange={setOutlookDay}
            onHazardChange={setOutlookHazard}
          />
          <MesoscaleDiscussionsCard refreshTick={refreshTick} />
          <SpcWatchesCard refreshTick={refreshTick} />
          <AfdCard location={location} refreshTick={refreshTick} />
        </aside>
      </main>
    </div>
  );
}
