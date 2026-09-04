import { useEffect, useState } from "react";

import { api } from "../api.js";

export default function AfdCard({ location, refreshTick }) {
  const [afd, setAfd] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setAfd(null);
    api
      .afd(location.lat, location.lon)
      .then((d) => !cancelled && setAfd(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon, refreshTick]);

  return (
    <section className="card">
      <h2>
        Area Forecast Discussion {afd && <span className="muted">({afd.office_id})</span>}
      </h2>
      <details className="cardBody">
        <summary>Show discussion text</summary>
        <pre className="afdText">{error ? error : afd ? afd.text : "Loading…"}</pre>
      </details>
    </section>
  );
}
