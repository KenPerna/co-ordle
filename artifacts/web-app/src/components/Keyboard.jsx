import Tile from "./Tile";

const KB_ROWS = [
  "QWERTYUIOP".split(""),
  "ASDFGHJKL".split(""),
  ["⌫", ..."ZXCVBNM".split(""), "↵"],
];

/**
 * Keyboard — the on-screen QWERTY keyboard for Co-Ordle.
 *
 * Props:
 *   letterStates {Object}   - Map of lowercase letter → color ("green"|"yellow"|"gray"|"empty")
 *   onKey        {Function} - Called with a letter string when a letter key is pressed
 *   onDelete     {Function} - Called when the backspace key (⌫) is pressed
 *   onEnter      {Function} - Called when the enter key (↵) is pressed
 *   disabled     {boolean}  - Disables all keys when true
 */
export default function Keyboard({ letterStates = {}, onKey, onDelete, onEnter, disabled = false }) {
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
