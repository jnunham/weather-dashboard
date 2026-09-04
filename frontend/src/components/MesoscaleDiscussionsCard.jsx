import { useEffect, useState } from "react";

import { api } from "../api.js";

export default function MesoscaleDiscussionsCard({ refreshTick }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .mesoscaleDiscussions()
      .then((d) => !cancelled && setItems(d.items))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return (
    <section className="card">
      <h2>
        Mesoscale Discussions <span className="badge">{items ? items.length : 0}</span>
      </h2>
      <div className="cardBody">
        {error && <div className="errorText">{error}</div>}
        {!error && !items && "Loading…"}
        {items && items.length === 0 && <div className="muted">No active mesoscale discussions.</div>}
        {items &&
          items.map((it) => (
            <div className="listItem" key={it.link}>
              <div className="title">
                <a href={it.link} target="_blank" rel="noopener noreferrer">
                  {it.title}
                </a>
              </div>
              <div className="sub">{it.text}…</div>
              {it.image_url && (
                <a href={it.link} target="_blank" rel="noopener noreferrer">
                  <img src={it.image_url} alt={it.title} />
                </a>
              )}
            </div>
          ))}
      </div>
    </section>
  );
}
