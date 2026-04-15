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

// ─── Game model ────────────────────────────────────────────────────────────────

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
  startTime: number;
}

// ─── Team / token model ────────────────────────────────────────────────────────

interface TeamData {
  id: string;
  intelligence: number;
  coins: number;
  streak: number;
  longestStreak: number;
  lastPlayedDate: string; // "YYYY-MM-DD"
  gamesPlayedToday: number;
  lastGameDate: string;
}

const games = new Map<string, Game>();
const teams = new Map<string, TeamData>();

// ─── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function teamId(players: string[]): string {
  return [...players].sort().join("_");
}

function getOrCreateTeam(players: string[]): TeamData {
  const id = teamId(players);
  if (!teams.has(id)) {
    teams.set(id, { id, intelligence: 0, coins: 0, streak: 0, longestStreak: 0, lastPlayedDate: "", gamesPlayedToday: 0, lastGameDate: "" });
  }
  return teams.get(id)!;
}

function calcRewards(game: Game, status: "won" | "lost", elapsedSeconds: number) {
  const guessesUsed = game.rounds.length;

  // Almost-solved: any guess with 4+ green tiles
  let almostBonus = false;
  if (status === "lost") {
    outer: for (const round of game.rounds) {
      if (round.type === "shared") {
        if ((round as SharedRound).result.filter((r) => r === "green").length >= 4) { almostBonus = true; break; }
      } else {
        for (const g of Object.values((round as DualRound).guesses)) {
          if (g.result.filter((r) => r === "green").length >= 4) { almostBonus = true; break outer; }
        }
      }
    }
  }

  // Great teamwork: both players contributed ≥2 rounds in dual mode
  let greatTeamwork = false;
  if (game.mode === "dual" && game.players.length >= 2) {
    const contribs = new Map<string, number>();
    for (const round of game.rounds as DualRound[]) {
      for (const pid of Object.keys(round.guesses)) contribs.set(pid, (contribs.get(pid) ?? 0) + 1);
    }
    greatTeamwork = game.players.slice(0, 2).every((p) => (contribs.get(p) ?? 0) >= 2);
  }

  // Intelligence tokens
  let intelligence = 0;
  let coins = 0;
  if (status === "won") {
    intelligence = 10 + Math.max(0, 6 - guessesUsed) * 3;
    if (elapsedSeconds < 60) intelligence += 5;
    else if (elapsedSeconds < 120) intelligence += 3;
    else if (elapsedSeconds < 180) intelligence += 1;
    intelligence += Math.floor(Math.random() * 6); // 0–5 word difficulty bonus
    if (greatTeamwork) intelligence += 5;           // teamwork bonus
    coins = 5;
  } else {
    intelligence = almostBonus ? 8 : 2;
    coins = 2;
  }

  return { intelligence, coins, almostBonus, greatTeamwork, elapsedSeconds, guessesUsed };
}

function applyTeamRewards(team: TeamData, base: ReturnType<typeof calcRewards>): {
  intelligence: number; coins: number; streakDays: number; dailyBonus: number; streakMultiplier: number;
} {
  const today = todayStr();

  // Streak update
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]!;
  if (team.lastPlayedDate !== today) {
    if (team.lastPlayedDate === yesterday) team.streak++;
    else team.streak = 1;
    team.lastPlayedDate = today;
    if (team.streak > team.longestStreak) team.longestStreak = team.streak;
  }

  // Daily game cap (anti-grind): full rewards for first 5 games/day
  if (team.lastGameDate !== today) { team.gamesPlayedToday = 0; team.lastGameDate = today; }
  team.gamesPlayedToday++;
  const capFactor = team.gamesPlayedToday <= 5 ? 1 : 0.25;

  const streakMultiplier = Math.min(2.0, 1 + (team.streak - 1) * 0.1);
  const dailyBonus = team.lastPlayedDate === today && team.gamesPlayedToday === 1 ? 3 : 0;

  const intelligence = Math.round(base.intelligence * capFactor);
  const coins = Math.round((base.coins + dailyBonus) * streakMultiplier * capFactor);

  team.intelligence += intelligence;
  team.coins += coins;

  return { intelligence, coins, streakDays: team.streak, dailyBonus, streakMultiplier };
}

// ─── Game lifecycle ─────────────────────────────────────────────────────────────

function createGame(gameId: string, mode: "shared" | "dual"): Game {
  const word = pickSecretWord().toUpperCase();
  logger.info({ gameId, word, mode }, "Game created");
  return { id: gameId, word, mode, rounds: [], players: [], usedWords: new Set(), status: "playing", startTime: Date.now() };
}

function resetGame(game: Game): void {
  game.word = pickSecretWord().toUpperCase();
  game.rounds = [];
  game.usedWords = new Set();
  game.status = "playing";
  game.winner = undefined;
  game.startTime = Date.now();
  logger.info({ gameId: game.id, word: game.word }, "New round");
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

function emitGameOver(game: Game, status: "won" | "lost", winner?: string): void {
  const elapsedSeconds = Math.floor((Date.now() - game.startTime) / 1000);
  const base = calcRewards(game, status, elapsedSeconds);
  const team = getOrCreateTeam(game.players);
  const applied = applyTeamRewards(team, base);

  io.to(game.id).emit("gameOver", {
    status,
    winner: winner ?? null,
    word: game.word,
    rewards: {
      intelligence: applied.intelligence,
      coins: applied.coins,
      almostBonus: base.almostBonus,
      greatTeamwork: base.greatTeamwork,
      streakDays: applied.streakDays,
      dailyBonus: applied.dailyBonus,
      streakMultiplier: applied.streakMultiplier,
      elapsedSeconds,
      elapsedFormatted: fmtTime(elapsedSeconds),
      guessesUsed: base.guessesUsed,
      teamTotal: { intelligence: team.intelligence, coins: team.coins },
    },
  });
}

// ─── Guess handlers ─────────────────────────────────────────────────────────────

function handleSharedGuess(game: Game, playerId: string, guess: string): void {
  if (game.status !== "playing") return;
  if (game.usedWords.has(guess)) { io.to(game.id).emit("wordAlreadyUsed", { guess }); return; }

  game.usedWords.add(guess);
  const result = evaluateGuess(game.word.toLowerCase(), guess);
  const won = result.every((r) => r === "green");
  game.rounds.push({ type: "shared", guess, result, player: playerId });

  logger.info({ gameId: game.id, playerId, guess, won }, "Shared guess");
  io.to(game.id).emit("update", { rounds: game.rounds });

  if (won) {
    game.status = "won";
    game.winner = playerId;
    emitGameOver(game, "won", playerId);
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 5000);
  } else if (game.rounds.length >= MAX_GUESSES) {
    game.status = "lost";
    emitGameOver(game, "lost");
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 5000);
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
    emitGameOver(game, "won", winner);
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 5000);
  } else if (game.rounds.length >= MAX_GUESSES) {
    game.status = "lost";
    emitGameOver(game, "lost");
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 5000);
  }
}

// ─── Socket.IO ──────────────────────────────────────────────────────────────────

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

    const team = getOrCreateTeam(game.players);

    socket.emit("gameState", {
      mode: game.mode,
      rounds: playerView(game, player),
      status: game.status,
      winner: game.winner,
      players: game.players,
      teamTotal: { intelligence: team.intelligence, coins: team.coins, streak: team.streak },
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
