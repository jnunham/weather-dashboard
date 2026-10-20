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
// Raspberry Pi kiosk), modelled on the iPhone's so it needs no explaining:
// keys type on touch-down with a magnified pop-up, shift capitalises the next
// letter (double-tap for caps lock) and switches itself on at the start of
// each word, backspace repeats when held, and 123 swaps to numbers.
//
// Built into the page on purpose rather than relying on an OS keyboard
// package: those behave differently between Raspberry Pi OS's older X11 and
// newer Wayland desktops, and a browser in kiosk mode often doesn't trigger
// them at all. This works the same everywhere.
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

// Enough for a place name or a "lat,lon" pair. Each row is a list of keys;
// "gap:N" is empty space (N key-widths) that centres iOS's short middle row.
const LETTERS = [
  "q w e r t y u i o p".split(" "),
  ["gap:0.5", ..."asdfghjkl".split(""), "gap:0.5"],
  ["shift", ..."zxcvbnm".split(""), "backspace"],
  ["layer", "space", "enter"],
];
const NUMBERS = [
  "1 2 3 4 5 6 7 8 9 0".split(" "),
  ["-", "/", ":", ";", "(", ")", "$", "&", "@", '"'],
  ["gap:2", ".", ",", "?", "!", "'", "gap:1.5", "backspace"],
  ["layer", "space", "enter"],
];

const SPECIAL = {
  shift: { cls: "oskKey--mod oskKey--w15" },
  backspace: { label: "⌫", cls: "oskKey--mod oskKey--w15" },
  layer: { cls: "oskKey--mod oskKey--w125" },
  space: { label: "space", cls: "oskKey--space" },
  enter: { label: "Go", cls: "oskKey--accent oskKey--w2" },
};

const DOUBLE_TAP_MS = 350;
const REPEAT_DELAY_MS = 400;
const REPEAT_EVERY_MS = 70;

// "once" = capitalise the next letter, "lock" = caps lock, "off" = lowercase.
// On an empty field or just after a space, the next letter is a word's first.
function autoShiftFor(el) {
  const caret = el.selectionStart ?? el.value.length;
  const before = el.value.slice(0, caret);
  return before === "" || /\s$/.test(before) ? "once" : "off";
}

export default function OnScreenKeyboard() {
  const [visible, setVisible] = useState(false);
  const [shift, setShift] = useState("off");
  const [layer, setLayer] = useState("letters");
  const [down, setDown] = useState(null); // key currently under a finger, for the pop-up
  const kbRef = useRef(null);
  const targetRef = useRef(null);
  const lastShiftTap = useRef(0);
  const repeatTimers = useRef({});

  useEffect(() => {
    let showTimer;
    function onFocusIn(e) {
      if (!isTextField(e.target)) return;
      targetRef.current = e.target;
      // This keyboard is the input method here. Without this, a desktop
      // environment's own on-screen keyboard (some Raspberry Pi OS images
      // ship one) can pop up over the top of it for the same field.
      e.target.setAttribute("inputmode", "none");
      setShift((s) => (s === "lock" ? s : autoShiftFor(e.target)));
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

  // A key held when the keyboard goes away (or the page does) must not keep repeating.
  useEffect(() => () => Object.values(repeatTimers.current).forEach(clearTimeout), []);

  function replaceRange(text, backspaceOnly) {
    const el = targetRef.current;
    if (!el) return;
    el.focus();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    // Backspace over a selection deletes the selection; otherwise one character.
    const from = backspaceOnly && start === end ? Math.max(0, start - 1) : start;
    setNativeValue(el, el.value.slice(0, from) + text + el.value.slice(end));
    const pos = from + text.length;
    el.setSelectionRange?.(pos, pos);
    setShift((s) => (s === "lock" ? s : autoShiftFor(el)));
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

  function pressShift() {
    const now = Date.now();
    const doubleTap = now - lastShiftTap.current < DOUBLE_TAP_MS;
    lastShiftTap.current = now;
    setShift((s) => (doubleTap ? "lock" : s === "off" ? "once" : "off"));
  }

  function press(key) {
    if (key === "shift") pressShift();
    else if (key === "backspace") replaceRange("", true);
    else if (key === "layer") setLayer((l) => (l === "letters" ? "numbers" : "letters"));
    else if (key === "space") replaceRange(" ");
    else if (key === "enter") enter();
    else replaceRange(shift !== "off" && layer === "letters" ? key.toUpperCase() : key);
  }

  function stopRepeat(key) {
    clearTimeout(repeatTimers.current[key]);
    delete repeatTimers.current[key];
  }

  // Keys fire on touch-down, not on release, which is what makes a keyboard
  // feel quick. Backspace additionally keeps going while it's held.
  function handleDown(e, key) {
    e.preventDefault(); // keep focus in the text field
    setDown(key);
    press(key);
    if (key === "backspace") {
      const step = () => {
        replaceRange("", true);
        repeatTimers.current[key] = setTimeout(step, REPEAT_EVERY_MS);
      };
      repeatTimers.current[key] = setTimeout(step, REPEAT_DELAY_MS);
    }
  }
  function handleUp(key) {
    stopRepeat(key);
    setDown((d) => (d === key ? null : d));
  }

  if (!visible) return null;

  const rows = layer === "letters" ? LETTERS : NUMBERS;
  const upper = shift !== "off" && layer === "letters";

  function labelFor(key) {
    if (key === "shift") return shift === "lock" ? "⇪" : "⇧";
    if (key === "layer") return layer === "letters" ? "123" : "ABC";
    if (SPECIAL[key]) return SPECIAL[key].label;
    return upper ? key.toUpperCase() : key;
  }

  return (
    // mousedown's default action is moving focus onto what was tapped (taps
    // fire it too) — cancel it, or every keypress would blur the field it types into.
    <div className="osk" ref={kbRef} onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        tabIndex={-1}
        className="oskHide"
        aria-label="Hide keyboard"
        onPointerDown={(e) => {
          e.preventDefault();
          targetRef.current?.blur();
          setVisible(false);
        }}
      >
        <span />
      </button>
      {rows.map((row, r) => (
        <div className="oskRow" key={r}>
          {row.map((key, i) => {
            if (key.startsWith("gap:")) {
              return <span key={`gap${i}`} className="oskGap" style={{ flex: `${key.slice(4)} 1 0` }} />;
            }
            const special = SPECIAL[key];
            const isChar = !special;
            return (
              <button
                type="button"
                tabIndex={-1}
                key={key}
                className={[
                  "oskKey",
                  special ? special.cls : "",
                  key === "shift" && shift !== "off" ? "oskKey--on" : "",
                  down === key ? "oskKey--down" : "",
                ].join(" ")}
                onPointerDown={(e) => handleDown(e, key)}
                onPointerUp={() => handleUp(key)}
                onPointerCancel={() => handleUp(key)}
                onPointerLeave={() => handleUp(key)}
              >
                {labelFor(key)}
                {isChar && down === key && <span className="oskPop">{labelFor(key)}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
