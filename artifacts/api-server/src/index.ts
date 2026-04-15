import http from "http";
import { Server } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";
import { evaluateGuess, pickSecretWord } from "./game/wordEngine";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const MAX_GUESSES = 6;

interface SharedRound {
  type: "shared";
  guess: string;
  result: string[];
  player: string;
}

interface DualRound {
  type: "dual";
  guesses: Record<string, { word: string; result: string[] }>;
}

type Round = SharedRound | DualRound;

interface Game {
  id: string;
  word: string;
  mode: "shared" | "dual";
  rounds: Round[];
  players: string[];
  usedWords: Set<string>;
  status: "playing" | "won" | "lost";
  winner?: string;
}

const games = new Map<string, Game>();

function createGame(gameId: string, mode: "shared" | "dual"): Game {
  const word = pickSecretWord().toUpperCase();
  logger.info({ gameId, word, mode }, "Game created");
  return { id: gameId, word, mode, rounds: [], players: [], usedWords: new Set(), status: "playing" };
}

function resetGame(game: Game): void {
  game.word = pickSecretWord().toUpperCase();
  game.rounds = [];
  game.usedWords = new Set();
  game.status = "playing";
  game.winner = undefined;
  logger.info({ gameId: game.id, word: game.word }, "New round started");
}

function getOrCreateGame(gameId: string, mode: "shared" | "dual"): Game {
  if (!games.has(gameId)) games.set(gameId, createGame(gameId, mode));
  return games.get(gameId)!;
}

function playerView(game: Game, playerId: string): object[] {
  if (game.mode === "shared") return game.rounds;
  return (game.rounds as DualRound[]).map((round) => {
    const own = round.guesses[playerId] ?? null;
    const partnerEntry = Object.entries(round.guesses).find(([p]) => p !== playerId);
    const partnerResult = partnerEntry ? partnerEntry[1].result : null;
    return { type: "dual", own, partnerResult, waiting: !!own && !partnerResult };
  });
}

function handleSharedGuess(game: Game, playerId: string, guess: string): void {
  if (game.status !== "playing") return;
  if (game.usedWords.has(guess)) { io.to(game.id).emit("wordAlreadyUsed", { guess }); return; }

  game.usedWords.add(guess);
  const result = evaluateGuess(game.word.toLowerCase(), guess);
  const won = result.every((r) => r === "green");
  const round: SharedRound = { type: "shared", guess, result, player: playerId };
  game.rounds.push(round);

  logger.info({ gameId: game.id, playerId, guess, won }, "Shared guess");
  io.to(game.id).emit("update", { rounds: game.rounds });

  if (won) {
    game.status = "won";
    game.winner = playerId;
    io.to(game.id).emit("gameOver", { status: "won", winner: playerId, word: game.word });
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 4000);
  } else if (game.rounds.length >= MAX_GUESSES) {
    game.status = "lost";
    io.to(game.id).emit("gameOver", { status: "lost", word: game.word });
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 4000);
  }
}

function handleDualGuess(game: Game, playerId: string, guess: string): void {
  if (game.status !== "playing") return;
  const key = `${playerId}:${guess}`;
  if (game.usedWords.has(key)) { io.to(game.id).emit("wordAlreadyUsed", { guess, playerId }); return; }

  game.usedWords.add(key);
  const activePlayers = game.players.slice(0, 2);
  let round = game.rounds[game.rounds.length - 1] as DualRound | undefined;

  if (!round || round.type !== "dual" || Object.keys(round.guesses).length >= activePlayers.length) {
    round = { type: "dual", guesses: {} };
    game.rounds.push(round);
  }

  round.guesses[playerId] = { word: guess, result: evaluateGuess(game.word.toLowerCase(), guess) };
  logger.info({ gameId: game.id, playerId, guess }, "Dual guess");
  io.to(game.id).emit("playerSubmitted", { playerId });

  const allSubmitted = activePlayers.length >= 2 && activePlayers.every((p) => round!.guesses[p]);
  if (!allSubmitted) return;

  const [p1, p2] = activePlayers;
  io.to(game.id).emit("roundResult", {
    [p1]: { own: round.guesses[p1], other: { result: round.guesses[p2]?.result ?? [] } },
    [p2]: { own: round.guesses[p2], other: { result: round.guesses[p1]?.result ?? [] } },
  });

  const p1Won = round.guesses[p1]?.result.every((r) => r === "green");
  const p2Won = round.guesses[p2]?.result.every((r) => r === "green");

  if (p1Won || p2Won) {
    const winner = p1Won ? p1 : p2;
    game.status = "won";
    game.winner = winner;
    io.to(game.id).emit("gameOver", { status: "won", winner, word: game.word });
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 4000);
  } else if (game.rounds.length >= MAX_GUESSES) {
    game.status = "lost";
    io.to(game.id).emit("gameOver", { status: "lost", word: game.word });
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 4000);
  }
}

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "Socket connected");
  let currentRoom: string | null = null;
  let currentPlayer: string | null = null;

  socket.on("joinRoom", ({ gameId, player, mode = "shared" }: { gameId: string; player: string; mode?: "shared" | "dual" }) => {
    if (currentRoom) socket.leave(currentRoom);
    currentRoom = gameId;
    currentPlayer = player;
    socket.join(gameId);

    const game = getOrCreateGame(gameId, mode);
    if (!game.players.includes(player)) game.players.push(player);

    socket.emit("gameState", {
      mode: game.mode,
      rounds: playerView(game, player),
      status: game.status,
      winner: game.winner,
      players: game.players,
    });

    io.to(gameId).emit("playerJoined", { player, players: game.players });
    logger.info({ socketId: socket.id, gameId, player, mode: game.mode }, "Player joined");
  });

  socket.on("guess", ({ gameId, playerId, guess }: { gameId: string; playerId: string; guess: string }) => {
    const game = games.get(gameId);
    if (!game) return;
    const g = guess.toLowerCase().trim();
    if (!g || g.length !== 5) return;
    if (game.mode === "shared") handleSharedGuess(game, playerId, g);
    else handleDualGuess(game, playerId, g);
  });

  socket.on("typing", ({ gameId, player }: { gameId: string; player: string }) => {
    socket.to(gameId).emit("playerTyping", { player });
  });

  socket.on("chat", ({ gameId, player, text }: { gameId: string; player: string; text: string }) => {
    io.to(gameId).emit("chatMessage", { player, text });
  });

  socket.on("disconnect", () => {
    logger.info({ socketId: socket.id }, "Socket disconnected");
    if (currentRoom && currentPlayer) socket.to(currentRoom).emit("playerLeft", { player: currentPlayer });
  });
});

server.listen(port, (err?: Error) => {
  if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
  logger.info({ port }, "Server listening");
});
