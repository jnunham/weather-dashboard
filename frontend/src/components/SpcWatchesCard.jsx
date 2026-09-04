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

import { api } from "../api.js";

export default function SpcWatchesCard({ refreshTick }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .watches()
      .then((d) => !cancelled && setItems(d.items))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return (
    <section className="card">
      <h2>
        SPC Watches <span className="badge">{items ? items.length : 0}</span>
      </h2>
      <div className="cardBody">
        {error && <div className="errorText">{error}</div>}
        {!error && !items && "Loading…"}
        {items && items.length === 0 && <div className="muted">No active SPC watches.</div>}
        {items &&
          items.map((it) => (
            <div className="listItem" key={it.link}>
              <div className="title">
                <a href={it.link} target="_blank" rel="noopener noreferrer">
                  {it.title}
                </a>
              </div>
              <div className="sub">{it.text}…</div>
            </div>
          ))}
      </div>
    </section>
  );
}
