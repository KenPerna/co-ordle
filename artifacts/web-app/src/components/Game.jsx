import React from "react";
import { GameBoard } from "./GameBoard";
import { Keyboard } from "./Keyboard";

const ROWS = 6;
const COLS = 5;

const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(""));
const emptyEvals = () => Array.from({ length: ROWS }, () => Array(COLS).fill(""));

export function Game() {
  const [board, setBoard] = React.useState(emptyBoard());
  const [evaluations, setEvaluations] = React.useState(emptyEvals());
  const [activeRow, setActiveRow] = React.useState(0);
  const [activeCol, setActiveCol] = React.useState(0);
  const [keyColors, setKeyColors] = React.useState({}); // { A: "correct", B: "absent", ... }

  function handleLetter(label) {
    if (activeCol >= COLS) return;
    setBoard(prev => {
      const next = prev.map(r => [...r]);
      next[activeRow][activeCol] = label;
      return next;
    });
    setActiveCol(col => Math.min(col + 1, COLS - 1));
    // pop animation can be triggered here via tile state
  }

  function handleBackspace() {
    const target = board[activeRow][activeCol] ? activeCol : Math.max(0, activeCol - 1);
    setBoard(prev => {
      const next = prev.map(r => [...r]);
      next[activeRow][target] = "";
      return next;
    });
    setActiveCol(Math.max(0, target));
  }

  function handleSubmitGuess() {
    const guess = board[activeRow].join("");
    if (guess.length < COLS) return;

    // Placeholder: compute evaluations against the secret word here
    // and update evaluations + keyColors accordingly.
    // Example: setEvaluations(...), setKeyColors(prev => ({ ...prev, ...newColors }))
    // Then advance to the next row:
    setActiveRow(row => row + 1);
    setActiveCol(0);
    // flip animation can be triggered here via tile state
  }

  function handleKey(label) {
    if (label === "ENTER") {
      handleSubmitGuess();
      return;
    }
    if (label === "⌫") {
      handleBackspace();
      return;
    }
    if (label.length === 1 && /[A-Z]/.test(label)) {
      handleLetter(label);
    }
  }

  return (
    <>
      <GameBoard
        board={board}
        evaluations={evaluations}
        activeRow={activeRow}
        activeCol={activeCol}
      />
      <Keyboard keyColors={keyColors} onKey={handleKey} />
    </>
  );
}
