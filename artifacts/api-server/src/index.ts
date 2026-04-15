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

interface RoomState {
  word: string;
  guesses: GuessEntry[];
}

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(gameId: string): RoomState {
  if (!rooms.has(gameId)) {
    const word = pickSecretWord().toUpperCase();
    rooms.set(gameId, { word, guesses: [] });
    logger.info({ gameId, word }, "Room created");
  }
  return rooms.get(gameId)!;
}

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "Socket connected");

  let currentRoom: string | null = null;

  socket.on("joinRoom", ({ gameId, player }: { gameId: string; player: string }) => {
    if (currentRoom) socket.leave(currentRoom);
    currentRoom = gameId;
    socket.join(gameId);

    const room = getOrCreateRoom(gameId);
    socket.emit("gameState", { guesses: room.guesses });
    io.to(gameId).emit("playerJoined", { player });

    logger.info({ socketId: socket.id, gameId, player }, "Player joined room");
  });

  socket.on("guess", (data: { guess: string; player: string }) => {
    if (!currentRoom) return;

    const room = getOrCreateRoom(currentRoom);
    const guess = data.guess?.toLowerCase().trim();
    if (!guess) return;

    const result = evaluateGuess(room.word.toLowerCase(), guess);
    const won = result.every((r) => r === "green");
    const player = data.player ?? socket.id;

    const entry: GuessEntry = { guess, result, player, won };
    room.guesses.push(entry);

    logger.info({ socketId: socket.id, gameId: currentRoom, guess, result, won }, "Guess evaluated");

    io.to(currentRoom).emit("guessUpdate", entry);

    if (won) {
      io.to(currentRoom).emit("gameOver", { winner: player, word: room.word });
      rooms.set(currentRoom, { word: pickSecretWord().toUpperCase(), guesses: [] });
      logger.info({ gameId: currentRoom }, "New round started");
      io.to(currentRoom).emit("newRound", { message: "New round started!" });
    }
  });

  socket.on("chat", (msg: { player: string; text: string }) => {
    if (!currentRoom) return;
    io.to(currentRoom).emit("chatMessage", { player: msg.player ?? socket.id, text: msg.text });
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
