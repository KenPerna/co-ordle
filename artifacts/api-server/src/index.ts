import http from "http";
import { Server } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";
import { evaluateGuess, pickSecretWord } from "./game/wordEngine";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

interface GuessEntry {
  guess: string;
  result: string[];
  player: string;
  won: boolean;
}

let gameState: { word: string; guesses: GuessEntry[] } = {
  word: pickSecretWord().toUpperCase(),
  guesses: [],
};

logger.info({ word: gameState.word }, "New game started");

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "Socket connected");

  socket.emit("gameState", {
    guesses: gameState.guesses,
  });

  socket.on("guess", (data: { guess: string; player: string }) => {
    const guess = data.guess?.toLowerCase().trim();
    if (!guess) return;

    const result = evaluateGuess(gameState.word.toLowerCase(), guess);
    const won = result.every((r) => r === "green");
    const player = data.player ?? socket.id;

    const entry: GuessEntry = { guess, result, player, won };
    gameState.guesses.push(entry);

    logger.info({ socketId: socket.id, guess, result, won }, "Guess evaluated");

    io.emit("guessUpdate", entry);

    if (won) {
      io.emit("gameOver", { winner: player, word: gameState.word });
      gameState = { word: pickSecretWord().toUpperCase(), guesses: [] };
      logger.info({ word: gameState.word }, "New round started");
      io.emit("newRound", { message: "New round started!" });
    }
  });

  socket.on("chat", (msg: { player: string; text: string }) => {
    io.emit("chatMessage", { player: msg.player ?? socket.id, text: msg.text });
  });

  socket.on("disconnect", () => {
    logger.info({ socketId: socket.id }, "Socket disconnected");
  });
});

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
