const TILE_BG = {
  green: "#538d4e",
  yellow: "#b59f3b",
  gray: "#3a3a3c",
  empty: "#121213",
  pending: "#2a2a2c",
};

/**
 * Tile — a single letter tile on the Co-Ordle board.
 *
 * Props:
 *   letter      {string}  - The letter to display (optional)
 *   color       {string}  - One of: "green" | "yellow" | "gray" | "empty" | "pending"
 *   size        {number}  - Tile size in px (default: 52)
 *   highlighted {boolean} - Whether this tile is the active cursor position (default: false)
 */
export default function Tile({ letter, color = "empty", size = 52, highlighted = false }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        border: highlighted
          ? "2px solid #fff"
          : `2px solid ${color === "empty" ? "#3a3a3c" : TILE_BG[color]}`,
        borderRadius: 4,
        background: TILE_BG[color] ?? TILE_BG.empty,
        color: "#fff",
        textTransform: "uppercase",
        transition: "background 0.3s",
        boxShadow: highlighted
          ? "0 0 0 1px rgba(255,255,255,0.3), inset 0 0 0 1px rgba(255,255,255,0.1)"
          : "none",
      }}
    >
      {letter ?? ""}
    </div>
  );
}
