import React, { useState } from "react";

const KB_ROWS = [
  "QWERTYUIOP".split(""),
  "ASDFGHJKL".split(""),
  ["⌫", ..."ZXCVBNM".split(""), "↵"],
];

/**
 * KeyboardInline — on-screen QWERTY keyboard (inline-style version).
 *
 * Props:
 *   letterStates {Object}   - Map of lowercase letter → color ("green"|"yellow"|"gray"|"empty")
 *   onKey        {Function} - Called with a letter string when a letter key is pressed
 *   onDelete     {Function} - Called when the backspace key (⌫) is pressed
 *   onEnter      {Function} - Called when the enter key (↵) is pressed
 *   disabled     {boolean}  - Disables all keys when true
 */
export default function KeyboardInline({ letterStates = {}, onKey, onDelete, onEnter, disabled = false }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "center",
        width: "100%",
        marginTop: 10,
      }}
    >
      {KB_ROWS.map((row, ri) => (
        <div key={ri} style={{ display: "flex", gap: 5 }}>
          {row.map((key) => {
            const state = letterStates[key.toLowerCase()] ?? "empty";
            const isGray = state === "gray";
            const isWide = key === "⌫" || key === "↵";
            return (
              <button
                key={key}
                disabled={disabled}
                onClick={() => {
                  if (key === "⌫") onDelete?.();
                  else if (key === "↵") onEnter?.();
                  else onKey?.(key);
                }}
                style={{
                  width: isWide ? 46 : 34,
                  height: 46,
                  borderRadius: 6,
                  border: "none",
                  background:
                    state === "green"
                      ? "#538d4e"
                      : state === "yellow"
                      ? "#b59f3b"
                      : isGray
                      ? "#1a1a1b"
                      : "#3a3a3c",
                  color: isGray ? "#555" : "#fff",
                  fontWeight: 700,
                  fontSize: isWide ? 10 : 13,
                  cursor: disabled ? "default" : "pointer",
                  opacity: isGray ? 0.5 : 1,
                  fontFamily: "inherit",
                  flexShrink: 0,
                  transition: "background 0.25s",
                }}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const ROW_1 = ["Q","W","E","R","T","Y","U","I","O","P"];
const ROW_2 = ["A","S","D","F","G","H","J","K","L"];
const ROW_3 = ["ENTER","Z","X","C","V","B","N","M","⌫"];

function Key({ label, color = "", onPress }) {
  const [pressed, setPressed] = useState(false);

  function handleClick() {
    setPressed(true);
    onPress(label);
    setTimeout(() => setPressed(false), 90);
  }

  const classNames = [
    "key",
    color,                 // "correct" | "present" | "absent" | ""
    pressed ? "press" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classNames} onClick={handleClick}>
      {label}
    </button>
  );
}

export function Keyboard({ keyColors = {}, onKey }) {
  // keyColors: { [letter: string]: "correct" | "present" | "absent" }

  function handlePress(label) {
    onKey(label);
  }

  return (
    <div className="keyboard">
      <div className="keyboard-row">
        {ROW_1.map(k => (
          <Key
            key={k}
            label={k}
            color={keyColors[k]}
            onPress={handlePress}
          />
        ))}
      </div>
      <div className="keyboard-row">
        {ROW_2.map(k => (
          <Key
            key={k}
            label={k}
            color={keyColors[k]}
            onPress={handlePress}
          />
        ))}
      </div>
      <div className="keyboard-row">
        {ROW_3.map(k => (
          <Key
            key={k}
            label={k}
            color={keyColors[k]}
            onPress={handlePress}
          />
        ))}
      </div>
    </div>
  );
}
