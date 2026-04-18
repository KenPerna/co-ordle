import React from "react";
import { Tile } from "./Tile";
import "./GameBoard.css";

/**
 * GameBoard — renders the full 6×5 Co-Ordle board using the class-based Tile.
 *
 * Props:
 *   board       {string[][]}  - 2D array of letters, e.g. [["H","E","L","L","O"], ...]
 *   evaluations {string[][]}  - 2D array of states: "correct" | "present" | "absent" | ""
 *   animations  {string[][]}  - 2D array of animation classes: "flip" | "pop" | ""
 *   activeRow   {number}      - Index of the row currently being typed
 *   activeCol   {number}      - Index of the highlighted column in the active row
 */
export function GameBoard({ board, evaluations, animations = [], activeRow, activeCol }) {
  return (
    <div className="board">
      {board.map((row, rowIndex) => (
        <div className="row" key={rowIndex}>
          {row.map((letter, colIndex) => {
            const state = evaluations[rowIndex]?.[colIndex] || "";
            const isActive = rowIndex === activeRow && colIndex === activeCol;
            const animate = animations[rowIndex]?.[colIndex] || "";

            return (
              <Tile
                key={colIndex}
                letter={letter}
                state={state}
                isActive={isActive}
                animate={animate}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
