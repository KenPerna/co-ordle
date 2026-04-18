import React from "react";
import { GameBoard } from "./GameBoard";
import { Keyboard } from "./Keyboard";

const ROWS = 6;
const COLS = 5;

const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(""));
const emptyEvals = () => Array.from({ length: ROWS }, () => Array(COLS).fill(""));
const emptyAnims = () => Array.from({ length: ROWS }, () => Array(COLS).fill(""));

/**
 * Evaluate a guess against a secret word.
 * Returns an array of: "correct" | "present" | "absent"
 */
function evaluateGuess(guess, secretWord) {
  const secret = secretWord.toUpperCase().split("");
  const result = Array(COLS).fill("absent");

  // First pass — correct positions
  guess.split("").forEach((char, i) => {
    if (char === secret[i]) {
      result[i] = "correct";
      secret[i] = null;
    }
  });

  // Second pass — present but wrong position
  guess.split("").forEach((char, i) => {
    if (result[i] === "absent" && secret.includes(char)) {
      result[i] = "present";
      secret[secret.indexOf(char)] = null;
    }
  });

  return result;
}

/**
 * Merge new evaluation results into the existing keyboard color map.
 * "correct" always wins over "present" which always wins over "absent".
 */
function computeKeyColors(rowEvals, guess) {
  const priority = { correct: 3, present: 2, absent: 1 };
  const newColors = {};
  guess.split("").forEach((char, i) => {
    const incoming = rowEvals[i];
    const existing = newColors[char];
    if (!existing || priority[incoming] > priority[existing]) {
      newColors[char] = incoming;
    }
  });
  return newColors;
}

export function Game({ secretWord = "CRANE" }) {
  const [board, setBoard] = React.useState(emptyBoard());
  const [evaluations, setEvaluations] = React.useState(emptyEvals());
  const [animations, setAnimations] = React.useState(emptyAnims());
  const [activeRow, setActiveRow] = React.useState(0);
  const [activeCol, setActiveCol] = React.useState(0);
  const [keyColors, setKeyColors] = React.useState({});
  const [gameOver, setGameOver] = React.useState(false);

  function triggerAnim(row, col, type, duration) {
    setAnimations(prev => {
      const next = prev.map(r => [...r]);
      next[row][col] = type;
      return next;
    });
    setTimeout(() => {
      setAnimations(prev => {
        const next = prev.map(r => [...r]);
        next[row][col] = "";
        return next;
      });
    }, duration);
  }

  function handleLetter(label) {
    if (gameOver || activeCol >= COLS || board[activeRow][activeCol] !== "") return;
    setBoard(prev => {
      const next = prev.map(r => [...r]);
      next[activeRow][activeCol] = label;
      return next;
    });
    triggerAnim(activeRow, activeCol, "pop", 120);
    setActiveCol(col => Math.min(col + 1, COLS - 1));
  }

  function handleBackspace() {
    if (gameOver) return;
    const target = board[activeRow][activeCol] ? activeCol : Math.max(0, activeCol - 1);
    setBoard(prev => {
      const next = prev.map(r => [...r]);
      next[activeRow][target] = "";
      return next;
    });
    setActiveCol(Math.max(0, target));
  }

  function handleSubmitGuess() {
    if (gameOver) return;
    const guess = board[activeRow].join("");
    if (guess.length < COLS) return;

    // 1. Compute evaluations against the secret word
    const rowEvals = evaluateGuess(guess, secretWord);

    // 2. Trigger tile flip animations + color updates
    setEvaluations(prev => {
      const next = prev.map(r => [...r]);
      next[activeRow] = rowEvals;
      return next;
    });

    // Stagger flip animations across the row
    for (let col = 0; col < COLS; col++) {
      setTimeout(() => triggerAnim(activeRow, col, "flip", 600), col * 80);
    }

    // 3. Update keyboard colors based on the new info
    setKeyColors(prev => ({
      ...prev,
      ...computeKeyColors(rowEvals, guess),
    }));

    // 4. Advance to next row (after flip animations finish)
    const won = rowEvals.every(s => s === "correct");
    const lost = !won && activeRow >= ROWS - 1;

    setTimeout(() => {
      if (won || lost) {
        setGameOver(true);
      } else {
        setActiveRow(row => row + 1);
        setActiveCol(0);
      }
    }, COLS * 80 + 600);
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
        animations={animations}
        activeRow={activeRow}
        activeCol={activeCol}
      />
      <Keyboard keyColors={keyColors} onKey={handleKey} />
    </>
  );
}
