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

// The last few places this display was pointed at, so switching back to one
// is a single tap instead of typing it out again on a touchscreen.

const KEY = "wx_recent_locations";
const MAX_RECENT = 6;

function isLocation(v) {
  return v && typeof v.label === "string" && Number.isFinite(v.lat) && Number.isFinite(v.lon);
}

export function loadRecentLocations() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list.filter(isLocation) : [];
  } catch {
    return [];
  }
}

export function rememberLocation(loc) {
  if (!isLocation(loc)) return;
  const rest = loadRecentLocations().filter((l) => l.label !== loc.label);
  try {
    localStorage.setItem(KEY, JSON.stringify([loc, ...rest].slice(0, MAX_RECENT)));
  } catch {
    // Storage full or blocked — recents are a convenience, not worth surfacing.
  }
}
