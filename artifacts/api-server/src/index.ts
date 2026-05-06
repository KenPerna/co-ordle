import http from "http";
import { Server, type Socket } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";
import { evaluateGuess, isValidGuessWord, pickSecretWord } from "./game/wordEngine";
import { upsertPlayer, getPlayer, updatePlayerStats, upsertTeamSession, getTeamSession } from "./db";

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
  players: string[];              // display names
  playerIds: Map<string, string>; // displayName → UUID
  playerSockets: Map<string, string>; // displayName → socketId
  usedWords: Set<string>;
  status: "playing" | "won" | "lost";
  winner?: string;
  startTime: number;
  bountyActive: boolean; // true after a loss — next win earns 2× rewards
}

// ─── Team / token model (in-memory, source of truth is DB) ────────────────────

interface TeamData {
  id: string;
  intelligence: number;
  coins: number;
  streak: number;
  longestStreak: number;
  lastPlayedDate: string;
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

  // True if both players contributed at least one guess (works for both modes)
  let greatTeamwork = false;
  if (game.players.length >= 2) {
    const contributors = new Set<string>();
    for (const round of game.rounds) {
      if (round.type === "shared") {
        contributors.add((round as SharedRound).player);
      } else {
        for (const pid of Object.keys((round as DualRound).guesses)) contributors.add(pid);
      }
    }
    greatTeamwork = contributors.size >= 2;
  }

  let intelligence = 0;
  let coins = 0;
  if (status === "won") {
    intelligence = 10 + Math.max(0, 6 - guessesUsed) * 3;
    if (elapsedSeconds < 60) intelligence += 5;
    else if (elapsedSeconds < 120) intelligence += 3;
    else if (elapsedSeconds < 180) intelligence += 1;
    intelligence += Math.floor(Math.random() * 6);
    if (greatTeamwork) { intelligence += 5; coins = 8; } else { coins = 5; }
  } else {
    intelligence = almostBonus ? 8 : 2;
    coins = almostBonus ? 4 : 2;
  }

  return { intelligence, coins, almostBonus, greatTeamwork, elapsedSeconds, guessesUsed };
}

function applyTeamRewards(team: TeamData, base: ReturnType<typeof calcRewards>): {
  intelligence: number; coins: number; streakDays: number; dailyBonus: number; streakMultiplier: number;
} {
  const today = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]!;
  if (team.lastPlayedDate !== today) {
    if (team.lastPlayedDate === yesterday) team.streak++;
    else team.streak = 1;
    team.lastPlayedDate = today;
    if (team.streak > team.longestStreak) team.longestStreak = team.streak;
  }

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
  return { id: gameId, word, mode, rounds: [], players: [], playerIds: new Map(), playerSockets: new Map(), usedWords: new Set(), status: "playing", startTime: Date.now(), bountyActive: false };
}

function resetGame(game: Game): void {
  game.word = pickSecretWord().toUpperCase();
  game.rounds = [];
  game.usedWords = new Set();
  // playerIds + playerSockets intentionally kept — valid between rounds
  // bountyActive intentionally kept — persists until a win cashes it
  game.status = "playing";
  game.winner = undefined;
  game.startTime = Date.now();
  logger.info({ gameId: game.id, word: game.word, bountyActive: game.bountyActive }, "New round");
}

function getOrCreateGame(gameId: string, mode: "shared" | "dual"): Game {
  if (!games.has(gameId)) games.set(gameId, createGame(gameId, mode));
  return games.get(gameId)!;
}

function getPlayerNameById(game: Game, playerId: string): string | undefined {
  for (const [name, id] of game.playerIds.entries()) {
    if (id === playerId) return name;
  }
  return undefined;
}

/** Emit to the socket for the player who submitted this guess key (UUID or display name). */
function emitToGuessPlayer(game: Game, guessPlayerKey: string, event: string, payload: object): void {
  const displayName = getPlayerNameById(game, guessPlayerKey) ?? guessPlayerKey;
  const sid = game.playerSockets.get(displayName);
  if (sid) io.to(sid).emit(event, payload);
}

function getActiveDualPlayerIds(game: Game): string[] {
  return game.players
    .map((name) => game.playerIds.get(name))
    .filter((id): id is string => Boolean(id))
    .slice(0, 2);
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

async function emitGameOver(game: Game, status: "won" | "lost", winner?: string): Promise<void> {
  const elapsedSeconds = Math.floor((Date.now() - game.startTime) / 1000);
  const base = calcRewards(game, status, elapsedSeconds);

  // Apply bounty (2×) to base rewards BEFORE streak/daily multipliers
  let bountyApplied = false;
  if (status === "won" && game.bountyActive) {
    base.intelligence = Math.round(base.intelligence * 2);
    base.coins = Math.round(base.coins * 2);
    bountyApplied = true;
    game.bountyActive = false;
  } else if (status === "lost") {
    game.bountyActive = true; // arms bounty for next win
  } else {
    game.bountyActive = false;
  }

  const team = getOrCreateTeam(game.players);
  const applied = applyTeamRewards(team, base);
  const won = status === "won";

  // Persist stats to DB for each player + team session
  const [p1Name, p2Name] = game.players.slice(0, 2);
  const p1Id = p1Name ? game.playerIds.get(p1Name) : undefined;
  const p2Id = p2Name ? game.playerIds.get(p2Name) : undefined;

  // Update both players in DB (fire & forget, non-blocking)
  const dbUpdates: Promise<unknown>[] = [];
  if (p1Id) dbUpdates.push(updatePlayerStats(p1Id, applied.intelligence, applied.coins, won).catch((e) => logger.error({ e }, "DB update p1 failed")));
  if (p2Id) dbUpdates.push(updatePlayerStats(p2Id, applied.intelligence, applied.coins, won).catch((e) => logger.error({ e }, "DB update p2 failed")));
  if (p1Id && p2Id) dbUpdates.push(upsertTeamSession(p1Id, p2Id, applied.intelligence, applied.coins, won).catch((e) => logger.error({ e }, "DB team session failed")));

  // Wait for DB writes so we can include fresh totals in the payload
  await Promise.allSettled(dbUpdates);

  // Fetch updated stats for both players and the team session
  const [p1Row, p2Row, teamSession] = await Promise.all([
    p1Id ? getPlayer(p1Id).catch(() => null) : null,
    p2Id ? getPlayer(p2Id).catch(() => null) : null,
    (p1Id && p2Id) ? getTeamSession(p1Id, p2Id).catch(() => null) : null,
  ]);

  const makePlayerStats = (row: typeof p1Row, name: string | undefined) => row ? {
    displayName: row.display_name,
    intelligence: row.intelligence,
    coins: row.coins,
    gamesPlayed: row.games_played,
    gamesWon: row.games_won,
    winRate: row.games_played > 0 ? Math.round((row.games_won / row.games_played) * 100) : 0,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
  } : null;

  const teamStats = teamSession ? {
    gamesPlayed: teamSession.games_played,
    gamesWon: teamSession.games_won,
    winRate: teamSession.games_played > 0 ? Math.round((teamSession.games_won / teamSession.games_played) * 100) : 0,
    intelligenceEarned: teamSession.intelligence_earned,
    coinsEarned: teamSession.coins_earned,
  } : null;

  const basePayload = {
    status,
    winner: winner ?? null,
    word: game.word,
    bountyNextRound: status === "lost",   // tells client to show 2× bonus offer
    rewards: {
      intelligence: applied.intelligence,
      coins: applied.coins,
      almostBonus: base.almostBonus,
      greatTeamwork: base.greatTeamwork,
      bountyApplied,                       // true when 2× was earned this round
      streakDays: applied.streakDays,
      dailyBonus: applied.dailyBonus,
      streakMultiplier: applied.streakMultiplier,
      elapsedSeconds,
      elapsedFormatted: fmtTime(elapsedSeconds),
      guessesUsed: base.guessesUsed,
      teamTotal: { intelligence: team.intelligence, coins: team.coins },
    },
    teamStats,
  };

  // Send each player their own stats + partner's name (no sensitive partner data)
  const s1 = p1Name ? game.playerSockets.get(p1Name) : undefined;
  const s2 = p2Name ? game.playerSockets.get(p2Name) : undefined;

  const p1Stats = makePlayerStats(p1Row, p1Name);
  const p2Stats = makePlayerStats(p2Row, p2Name);

  if (s1) io.to(s1).emit("gameOver", { ...basePayload, playerStats: p1Stats, partnerStats: p2Stats });
  if (s2) io.to(s2).emit("gameOver", { ...basePayload, playerStats: p2Stats, partnerStats: p1Stats });

  // Fallback: broadcast to anyone not in playerSockets (e.g. spectators or single player)
  const knownSockets = [s1, s2].filter((socketId): socketId is string => Boolean(socketId));
  io.to(game.id).except(knownSockets).emit("gameOver", basePayload);
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
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 15000);
  } else if (game.rounds.length >= MAX_GUESSES) {
    game.status = "lost";
    emitGameOver(game, "lost");
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 15000);
  }
}

function handleDualGuess(game: Game, playerId: string, guess: string, submitter: Socket): void {
  if (game.status !== "playing") return;
  const key = `${playerId}:${guess}`;
  if (game.usedWords.has(key)) {
    emitToGuessPlayer(game, playerId, "wordAlreadyUsed", { guess, playerId });
    return;
  }

  game.usedWords.add(key);
  const activePlayerIds = getActiveDualPlayerIds(game);
  let round = game.rounds[game.rounds.length - 1] as DualRound | undefined;

  if (!round || round.type !== "dual" || Object.keys(round.guesses).length >= activePlayerIds.length) {
    round = { type: "dual", guesses: {} };
    game.rounds.push(round);
  }

  round.guesses[playerId] = { word: guess, result: evaluateGuess(game.word.toLowerCase(), guess) };
  const playerName = getPlayerNameById(game, playerId);
  logger.info({ gameId: game.id, playerId, guess }, "Dual guess");
  // Partner-only: submitter already has optimistic UI; others see "partner submitted".
  submitter.to(game.id).emit("playerSubmitted", { playerId, playerName });

  const allSubmitted = activePlayerIds.length >= 2 && activePlayerIds.every((id) => round!.guesses[id]);
  if (!allSubmitted) return;

  const [p1Id, p2Id] = activePlayerIds;
  if (!p1Id || !p2Id) return;
  const p1Name = getPlayerNameById(game, p1Id) ?? p1Id;
  const p2Name = getPlayerNameById(game, p2Id) ?? p2Id;

  logger.info({ gameId: game.id, [p1Name]: round.guesses[p1Id].word, [p2Name]: round.guesses[p2Id].word }, "Dual round resolved");

  const s1 = game.playerSockets.get(p1Name);
  const s2 = game.playerSockets.get(p2Name);
  if (s1) io.to(s1).emit("roundResult", { own: round.guesses[p1Id], other: { result: round.guesses[p2Id].result } });
  if (s2) io.to(s2).emit("roundResult", { own: round.guesses[p2Id], other: { result: round.guesses[p1Id].result } });

  const p1Won = round.guesses[p1Id]?.result.every((r) => r === "green");
  const p2Won = round.guesses[p2Id]?.result.every((r) => r === "green");

  if (p1Won || p2Won) {
    const winnerId = p1Won ? p1Id : p2Id;
    const winner = getPlayerNameById(game, winnerId) ?? winnerId;
    game.status = "won";
    game.winner = winner;
    emitGameOver(game, "won", winner);
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 15000);
  } else if (game.rounds.length >= MAX_GUESSES) {
    game.status = "lost";
    emitGameOver(game, "lost");
    setTimeout(() => { resetGame(game); io.to(game.id).emit("newRound", { mode: game.mode }); }, 15000);
  }
}

// ─── Socket.IO ──────────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "Socket connected");
  let currentRoom: string | null = null;
  let currentPlayer: string | null = null;

  socket.on("joinRoom", async ({ gameId, player, playerId, mode = "shared" }: {
    gameId: string; player: string; playerId?: string; mode?: "shared" | "dual";
  }) => {
    if (currentRoom) socket.leave(currentRoom);
    currentRoom = gameId;
    currentPlayer = player;
    socket.join(gameId);

    const game = getOrCreateGame(gameId, mode);
    if (!game.players.includes(player)) game.players.push(player);
    game.playerSockets.set(player, socket.id);
    if (playerId) game.playerIds.set(player, playerId);

    const team = getOrCreateTeam(game.players);

    // Upsert player in DB and fetch their stats
    let playerStats = null;
    if (playerId) {
      try {
        await upsertPlayer(playerId, player);
        const row = await getPlayer(playerId);
        if (row) {
          playerStats = {
            displayName: row.display_name,
            intelligence: row.intelligence,
            coins: row.coins,
            gamesPlayed: row.games_played,
            gamesWon: row.games_won,
            winRate: row.games_played > 0 ? Math.round((row.games_won / row.games_played) * 100) : 0,
            currentStreak: row.current_streak,
            bestStreak: row.best_streak,
          };
        }
      } catch (e) {
        logger.error({ e }, "Failed to load player stats from DB");
      }
    }

    socket.emit("gameState", {
      mode: game.mode,
      rounds: playerView(game, playerId ?? player),
      status: game.status,
      winner: game.winner,
      players: game.players,
      teamTotal: { intelligence: team.intelligence, coins: team.coins, streak: team.streak },
      playerStats,
    });

    io.to(gameId).emit("playerJoined", { player, players: game.players });
    logger.info({ socketId: socket.id, gameId, player, playerId, mode: game.mode }, "Player joined");
  });

  socket.on("guess", ({ gameId, playerId, guess }: { gameId: string; playerId: string; guess: string }) => {
    const game = games.get(gameId);
    if (!game) return;
    const g = guess.toLowerCase().trim();
    if (!g || g.length !== 5) return;
    if (!isValidGuessWord(g)) {
      socket.emit("invalidWord", { guess: g });
      return;
    }
    if (game.mode === "shared") handleSharedGuess(game, playerId, g);
    else handleDualGuess(game, playerId, g, socket);
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

server.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening");
});
server.on("error", (err: Error) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
