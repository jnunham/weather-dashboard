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

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// A touchscreen keyboard for a dedicated display with no physical one (the
// Raspberry Pi kiosk). Built into the page on purpose rather than relying on
// an OS keyboard package: those behave differently between Raspberry Pi OS's
// older X11 and newer Wayland desktops, and a browser in kiosk mode often
// doesn't trigger them at all. This works the same everywhere.
//
// It shows itself whenever a text field is focused and hides when focus
// leaves, so nothing else in the app needs to know it exists.

const TEXT_INPUT_TYPES = ["text", "search", "email", "url", "tel"];

function isTextField(el) {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && TEXT_INPUT_TYPES.includes(el.type);
}

// Assigning el.value directly is invisible to React's controlled inputs (it
// tracks the value itself and would just overwrite it on the next render).
// Writing through the native setter and then firing a real "input" event is
// what makes React's onChange see the change like normal typing.
function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// Enough for a place name or a "lat,lon" pair: letters, digits, and the
// punctuation those need.
const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["shift", "z", "x", "c", "v", "b", "n", "m", "backspace"],
  [",", "space", ".", "-", "enter", "hide"],
];

const SPECIAL = {
  shift: { label: "⇧", cls: "oskKey--wide" },
  backspace: { label: "⌫", cls: "oskKey--wide" },
  space: { label: "space", cls: "oskKey--space" },
  enter: { label: "Go", cls: "oskKey--wide oskKey--accent" },
  hide: { label: "⌄", cls: "oskKey--wide" },
};

export default function OnScreenKeyboard() {
  const [visible, setVisible] = useState(false);
  const [shift, setShift] = useState(false);
  const kbRef = useRef(null);
  const targetRef = useRef(null);

  useEffect(() => {
    let showTimer;
    function onFocusIn(e) {
      if (!isTextField(e.target)) return;
      targetRef.current = e.target;
      // Not instant: the app renders the first-run location prompt for one
      // frame before it has read the saved location, and that prompt's field
      // autofocuses — then vanishes. Showing at once would flash (or, worse,
      // strand) a keyboard for a field that was never really there.
      clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        if (isTextField(document.activeElement)) setVisible(true);
      }, 150);
    }
    function onFocusOut(e) {
      // Tapping a key can move focus onto the key itself — not a reason to hide.
      if (kbRef.current && kbRef.current.contains(e.relatedTarget)) return;
      // Deferred: focus is usually mid-move to another field, not leaving.
      setTimeout(() => {
        if (!isTextField(document.activeElement)) setVisible(false);
      }, 0);
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    // A field with autoFocus (the first-run location prompt) is focused
    // before any of this was listening — pick it up now.
    if (isTextField(document.activeElement)) onFocusIn({ target: document.activeElement });
    return () => {
      clearTimeout(showTimer);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // Browsers send no blur/focusout when a focused field is *removed* from the
  // page (a form closing after submit, a screen swapping out), so focus events
  // alone can leave this stuck on screen with nothing to type into. While
  // it's up, keep checking the field is still there and still focused.
  useEffect(() => {
    if (!visible) return undefined;
    const id = setInterval(() => {
      const el = targetRef.current;
      const focusInKeyboard = kbRef.current && kbRef.current.contains(document.activeElement);
      if (!el || !el.isConnected || (!isTextField(document.activeElement) && !focusInKeyboard)) setVisible(false);
    }, 300);
    return () => clearInterval(id);
  }, [visible]);

  // Make room: pad the page by the keyboard's height (see index.css) so the
  // field being typed into isn't hidden behind it.
  useLayoutEffect(() => {
    if (!visible || !kbRef.current) return undefined;
    const root = document.documentElement;
    root.classList.add("kbOpen");
    root.style.setProperty("--kbHeight", `${kbRef.current.offsetHeight}px`);
    return () => {
      root.classList.remove("kbOpen");
      root.style.removeProperty("--kbHeight");
    };
  }, [visible]);

  function insert(text) {
    const el = targetRef.current;
    if (!el) return;
    el.focus();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    setNativeValue(el, el.value.slice(0, start) + text + el.value.slice(end));
    const pos = start + text.length;
    el.setSelectionRange?.(pos, pos);
  }

  function backspace() {
    const el = targetRef.current;
    if (!el) return;
    el.focus();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    // A selection deletes the selection; otherwise just the character before the caret.
    const from = start === end ? Math.max(0, start - 1) : start;
    setNativeValue(el, el.value.slice(0, from) + el.value.slice(end));
    el.setSelectionRange?.(from, from);
  }

  function enter() {
    const el = targetRef.current;
    if (!el) return;
    if (el.form) el.form.requestSubmit();
    else el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    // "Go" is the end of typing, like on a phone: put the keyboard away so the
    // result isn't left half-hidden behind it. (A removed field never blurs,
    // which is why this hides explicitly instead of waiting for focus events.)
    el.blur();
    setVisible(false);
  }

  function press(key) {
    if (key === "shift") setShift((s) => !s);
    else if (key === "backspace") backspace();
    else if (key === "space") insert(" ");
    else if (key === "enter") enter();
    else if (key === "hide") {
      targetRef.current?.blur();
      setVisible(false);
    } else {
      insert(shift ? key.toUpperCase() : key);
      if (shift) setShift(false); // one-shot, like a phone
    }
  }

  if (!visible) return null;

  return (
    // mousedown's default action is moving focus onto what was tapped (taps
    // fire it too) — cancel it, or every keypress would blur the field it types into.
    <div className="osk" ref={kbRef} onMouseDown={(e) => e.preventDefault()}>
      {ROWS.map((row, r) => (
        <div className="oskRow" key={r}>
          {row.map((key) => {
            const special = SPECIAL[key];
            const on = key === "shift" && shift;
            return (
              <button
                type="button"
                tabIndex={-1}
                key={key}
                className={`oskKey${special ? ` ${special.cls}` : ""}${on ? " oskKey--on" : ""}`}
                onClick={() => press(key)}
              >
                {special ? special.label : shift ? key.toUpperCase() : key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
