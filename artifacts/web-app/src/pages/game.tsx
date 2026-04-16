import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";

const ROWS = 6;
const COLS = 5;
type TileColor = "green" | "yellow" | "gray" | "empty" | "pending";
type GameStatus = "playing" | "won" | "lost";
type GameMode = "shared" | "dual";

interface SharedRound { type: "shared"; guess: string; result: string[]; player: string; }
interface DualViewRound { own?: { word: string; result: string[] }; partnerResult?: string[]; waiting?: boolean; }
interface ChatMsg { player: string; text: string; system?: boolean; }
interface TeamTotal { intelligence: number; coins: number; streak: number; }
interface RewardInfo {
  intelligence: number;
  coins: number;
  almostBonus: boolean;
  greatTeamwork: boolean;
  bountyApplied: boolean;
  streakDays: number;
  dailyBonus: number;
  streakMultiplier: number;
  elapsedFormatted: string;
  guessesUsed: number;
  teamTotal: { intelligence: number; coins: number };
}
interface PlayerStats {
  displayName: string;
  intelligence: number;
  coins: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
}
interface TeamSessionStats {
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  intelligenceEarned: number;
  coinsEarned: number;
}

// ─── UUID helper ──────────────────────────────────────────────────────────────
function getOrCreatePlayerId(): string {
  const key = "coOrdle_playerId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
function getStoredPlayerName(): string {
  return localStorage.getItem("coOrdle_playerName") ?? "";
}
function savePlayerName(name: string): void {
  localStorage.setItem("coOrdle_playerName", name);
}

const TILE_BG: Record<TileColor, string> = {
  green: "#538d4e", yellow: "#b59f3b", gray: "#3a3a3c", empty: "#121213", pending: "#2a2a2c",
};

const PLAYER_PALETTE = ["#538d4e","#b59f3b","#3b82f6","#f97316","#8b5cf6","#ec4899"];
function playerColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % PLAYER_PALETTE.length;
  return PLAYER_PALETTE[h];
}

function Tile({ letter, color, size = 52 }: { letter?: string; color: TileColor; size?: number }) {
  return (
    <div style={{
      width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: 700, border: `2px solid ${color === "empty" ? "#3a3a3c" : TILE_BG[color]}`,
      borderRadius: 4, background: TILE_BG[color], color: "#fff", textTransform: "uppercase",
      transition: "background 0.3s",
    }}>
      {letter ?? ""}
    </div>
  );
}

function Board({ rounds, maxRows = ROWS, cols = COLS, showLetters = true, tileSize = 52 }: {
  rounds: { letters: string[]; colors: TileColor[] }[];
  maxRows?: number; cols?: number; showLetters?: boolean; tileSize?: number;
}) {
  const rows = [...rounds, ...Array(Math.max(0, maxRows - rounds.length)).fill({ letters: [], colors: [] })];
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${tileSize}px)`, gap: 5 }}>
      {rows.slice(0, maxRows).map((row, ri) =>
        Array.from({ length: cols }).map((_, ci) => {
          const letter = showLetters ? row.letters?.[ci]?.toUpperCase() : undefined;
          const color: TileColor = (row.colors?.[ci] as TileColor) ?? "empty";
          return <Tile key={`${ri}-${ci}`} letter={letter} color={color} size={tileSize} />;
        })
      )}
    </div>
  );
}

const KB_ROWS = ["QWERTYUIOP".split(""), "ASDFGHJKL".split(""), ["⌫", ..."ZXCVBNM".split(""), "↵"]];

function Keyboard({ letterStates, onKey, onDelete, onEnter, disabled }: {
  letterStates: Record<string, TileColor>;
  onKey: (l: string) => void;
  onDelete: () => void;
  onEnter: () => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", width: "100%", marginTop: 10 }}>
      {KB_ROWS.map((row, ri) => (
        <div key={ri} style={{ display: "flex", gap: 5 }}>
          {row.map((key) => {
            const state: TileColor = letterStates[key.toLowerCase()] ?? "empty";
            const isGray = state === "gray";
            const isWide = key === "⌫" || key === "↵";
            return (
              <button
                key={key}
                disabled={disabled}
                onClick={() => { if (key === "⌫") onDelete(); else if (key === "↵") onEnter(); else onKey(key); }}
                style={{
                  width: isWide ? 46 : 34, height: 46, borderRadius: 6, border: "none",
                  background: state === "green" ? "#538d4e" : state === "yellow" ? "#b59f3b" : isGray ? "#1a1a1b" : "#3a3a3c",
                  color: isGray ? "#555" : "#fff",
                  fontWeight: 700, fontSize: isWide ? 10 : 13,
                  cursor: disabled ? "default" : "pointer",
                  opacity: isGray ? 0.5 : 1,
                  fontFamily: "inherit", flexShrink: 0,
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

function PlayerStatCard({ stats, label }: { stats: PlayerStats; label: string }) {
  return (
    <div style={{ background: "#1a1a1b", borderRadius: 10, padding: "12px 14px", marginTop: 10 }}>
      <div style={{ fontSize: 11, color: "#818384", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        <MiniStat label="Games" value={String(stats.gamesPlayed)} />
        <MiniStat label="Win %" value={`${stats.winRate}%`} accent="#538d4e" />
        <MiniStat label="🧠" value={String(stats.intelligence)} accent="#538d4e" />
        <MiniStat label="🪙" value={String(stats.coins)} accent="#b59f3b" />
        <MiniStat label="Streak" value={`${stats.currentStreak}d`} accent="#f97316" />
        <MiniStat label="Best" value={`${stats.bestStreak}d`} />
        <MiniStat label="Wins" value={String(stats.gamesWon)} accent="#538d4e" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent = "#fff" }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ textAlign: "center", background: "#121213", borderRadius: 6, padding: "6px 4px" }}>
      <div style={{ fontSize: 10, color: "#818384", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: accent, marginTop: 1 }}>{value}</div>
    </div>
  );
}

function TeamSessionCard({ stats, p1Name, p2Name }: { stats: TeamSessionStats; p1Name: string; p2Name: string }) {
  return (
    <div style={{ background: "#1a1a1b", borderRadius: 10, padding: "12px 14px", marginTop: 10 }}>
      <div style={{ fontSize: 11, color: "#818384", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
        Team History · {p1Name} & {p2Name}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        <MiniStat label="Games" value={String(stats.gamesPlayed)} />
        <MiniStat label="Win %" value={`${stats.winRate}%`} accent="#538d4e" />
        <MiniStat label="🧠 Earned" value={String(stats.intelligenceEarned)} accent="#538d4e" />
        <MiniStat label="🪙 Earned" value={String(stats.coinsEarned)} accent="#b59f3b" />
      </div>
    </div>
  );
}

function RewardScreen({ status, revealWord, rewards, playerName, partnerName, playerStats, partnerStats, teamStats, bountyNextRound, onLeave, onDismiss }: {
  status: GameStatus; revealWord: string | null;
  rewards: RewardInfo | null; playerName: string; partnerName: string | null;
  playerStats: PlayerStats | null; partnerStats: PlayerStats | null;
  teamStats: TeamSessionStats | null;
  bountyNextRound: boolean;
  onLeave: () => void; onDismiss: () => void;
}) {
  const won = status === "won";
  const hasPartner = !!partnerName;

  return (
    <div style={s.overlay}>
      <style>{`
        @keyframes rise { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 8px #7c3aed} 50%{box-shadow:0 0 22px #a855f7,0 0 8px #7c3aed} }
        .result-card { animation: rise 0.4s ease; }
        .reward-row { animation: rise 0.5s ease 0.15s both; }
        .bounty-btn { animation: glow 1.8s ease-in-out infinite; }
      `}</style>
      <div style={s.resultCard} className="result-card">
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          {won ? (
            <>
              <div style={{ fontSize: 40, marginBottom: 4 }}>🎉</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#538d4e", animation: "pulse 1.2s ease-in-out infinite" }}>
                Puzzle Solved!
              </div>
              {rewards?.greatTeamwork && (
                <div style={{ fontSize: 18, fontWeight: 700, color: "#93c5fd", marginTop: 6 }}>
                  🤝 Great Teamwork!
                </div>
              )}
              {rewards?.bountyApplied && (
                <div style={{ fontSize: 13, color: "#f97316", fontWeight: 700, marginTop: 4, letterSpacing: 1 }}>
                  🎯 BOUNTY CASHED — 2× REWARDS EARNED!
                </div>
              )}
              <div style={{ fontSize: 14, color: "#818384", marginTop: 6 }}>
                {hasPartner ? "You solved it together — incredible!" : "You cracked it — well done!"}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 40, marginBottom: 4 }}>💪</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#fff" }}>
                So Close!
              </div>
              <div style={{ fontSize: 14, color: "#818384", marginTop: 6 }}>
                {rewards?.greatTeamwork
                  ? "Amazing effort from both of you — keep it up!"
                  : "You'll crack the next one — don't give up!"}
              </div>
            </>
          )}
          {/* Always show the secret word */}
          <div style={{ marginTop: 10, fontSize: 14, color: "#818384" }}>
            The word was{" "}
            <span style={{ color: "#b59f3b", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
              {revealWord}
            </span>
          </div>
        </div>

        {/* Stats row */}
        {rewards && (
          <div style={s.statsRow} className="reward-row">
            <StatBox label="Time" value={rewards.elapsedFormatted} />
            <StatBox label="Guesses" value={`${rewards.guessesUsed} / ${ROWS}`} />
            {rewards.streakDays > 0 && (
              <StatBox label="Streak" value={`${rewards.streakDays}d`} accent="#f97316" />
            )}
          </div>
        )}

        {/* Bonus banners */}
        {rewards?.almostBonus && (
          <div style={s.bonusBanner}>
            🔥 One letter away! <span style={{ color: "#538d4e" }}>+8 Intelligence bonus</span>
          </div>
        )}
        {rewards?.greatTeamwork && won && (
          <div style={{ ...s.bonusBanner, borderColor: "#3b82f6", color: "#93c5fd" }}>
            🤝 Both players contributed <span style={{ color: "#93c5fd", fontWeight: 700 }}>+5 Intelligence & +3 Coins</span> teamwork bonus!
          </div>
        )}
        {rewards?.dailyBonus ? (
          <div style={{ ...s.bonusBanner, borderColor: "#f97316", color: "#fdba74" }}>
            ☀️ Daily bonus: <span style={{ fontWeight: 700 }}>+{rewards.dailyBonus} coins</span> for playing today!
          </div>
        ) : null}

        {/* Token rewards */}
        {rewards && (
          <div style={s.tokenSection} className="reward-row">
            <TokenRow icon="🧠" label="Intelligence" earned={rewards.intelligence} total={rewards.teamTotal.intelligence} color="#538d4e" />
            <TokenRow icon="🪙" label="Coins" earned={rewards.coins} total={rewards.teamTotal.coins} color="#b59f3b" />
            {rewards.streakMultiplier > 1 && (
              <div style={{ fontSize: 12, color: "#818384", textAlign: "center", marginTop: 4 }}>
                {rewards.streakMultiplier.toFixed(1)}× streak multiplier applied
              </div>
            )}
          </div>
        )}

        {/* Bounty teaser on loss */}
        {!won && bountyNextRound && (
          <div style={{ background: "linear-gradient(135deg,#3b1e6e,#1e1240)", border: "1px solid #7c3aed", borderRadius: 10, padding: "12px 14px", marginTop: 10, textAlign: "center" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>🎯 Bounty Activated!</div>
            <div style={{ fontSize: 13, color: "#c4b5fd" }}>Win the next round to earn <strong style={{ color: "#e9d5ff" }}>2× Intelligence & Coins</strong>.</div>
            <div style={{ fontSize: 12, color: "#7c3aed", marginTop: 4 }}>Bounty stays active until you win.</div>
          </div>
        )}

        {/* Player career stats */}
        {playerStats && <PlayerStatCard stats={playerStats} label="Your Career Stats" />}

        {/* Partner career stats */}
        {partnerStats && <PlayerStatCard stats={partnerStats} label={`${partnerStats.displayName}'s Career Stats`} />}

        {/* Team session history */}
        {teamStats && partnerStats && (
          <TeamSessionCard stats={teamStats} p1Name={playerName} p2Name={partnerStats.displayName} />
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <div style={{ ...s.btn, flex: 1, textAlign: "center", background: "#1a1a1b", border: "1px solid #3a3a3c", cursor: "pointer", color: "#818384", fontSize: 14 }}
            onClick={onLeave}>
            Leave Room
          </div>
          {!won && bountyNextRound ? (
            <div
              style={{ ...s.btn, flex: 1, textAlign: "center", cursor: "pointer", fontSize: 13, background: "#4c1d95", border: "1px solid #7c3aed", borderRadius: 10, padding: "14px 8px", fontWeight: 700 }}
              className="bounty-btn"
              onClick={onDismiss}
            >
              Play Next Round<br />
              <span style={{ fontSize: 11, color: "#c4b5fd", fontWeight: 400 }}>🎯 2× Bonus if you win!</span>
            </div>
          ) : (
            <div style={{ ...s.btn, flex: 1, textAlign: "center", cursor: "pointer", fontSize: 15 }}
              onClick={onDismiss}>
              Play Next Round
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, accent = "#fff" }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center", background: "#1a1a1b", borderRadius: 8, padding: "10px 4px" }}>
      <div style={{ fontSize: 11, color: "#818384", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function TokenRow({ icon, label, earned, total, color }: { icon: string; label: string; earned: number; total: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #2a2a2c" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 14, color: "#ccc" }}>{label}</span>
      </div>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontSize: 20, fontWeight: 800, color }}>+{earned}</span>
        <span style={{ fontSize: 11, color: "#818384", marginLeft: 8 }}>Total: {total}</span>
      </div>
    </div>
  );
}

export default function Game() {
  // ── Persistent identity ──────────────────────────────────────────────────────
  const [playerId] = useState(() => getOrCreatePlayerId());
  const [nameInput, setNameInput] = useState(() => getStoredPlayerName());
  const [playerName, setPlayerName] = useState(() => getStoredPlayerName() || `Player${Math.floor(Math.random() * 900 + 100)}`);

  const [roomInput, setRoomInput] = useState("");
  const [modeInput, setModeInput] = useState<GameMode>("shared");
  const [inRoom, setInRoom] = useState(false);
  const [gameId, setGameId] = useState("");
  const [gameMode, setGameMode] = useState<GameMode>("shared");
  const [players, setPlayers] = useState<string[]>([]);
  const [teamTotal, setTeamTotal] = useState<TeamTotal>({ intelligence: 0, coins: 0, streak: 0 });

  const [sharedRounds, setSharedRounds] = useState<SharedRound[]>([]);
  const [dualRounds, setDualRounds] = useState<DualViewRound[]>([]);
  const [waitingForPartner, setWaitingForPartner] = useState(false);
  const [partnerReady, setPartnerReady] = useState(false);

  const [gameStatus, setGameStatus] = useState<GameStatus>("playing");
  const [winner, setWinner] = useState<string | null>(null);
  const [revealWord, setRevealWord] = useState<string | null>(null);
  const [rewards, setRewards] = useState<RewardInfo | null>(null);
  const [showRewardScreen, setShowRewardScreen] = useState(false);

  // ── Player / team stats from DB ──────────────────────────────────────────────
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [partnerStats, setPartnerStats] = useState<PlayerStats | null>(null);
  const [teamStats, setTeamStats] = useState<TeamSessionStats | null>(null);
  const [bountyNextRound, setBountyNextRound] = useState(false);

  const [currentGuess, setCurrentGuess] = useState("");
  const [wordError, setWordError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [typingPlayers, setTypingPlayers] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const addSystem = (text: string) =>
    setChatMessages((prev) => [...prev, { player: "System", text, system: true }]);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("gameState", ({ mode, rounds, status, winner: w, players: ps, teamTotal: tt, playerStats: ps2 }: any) => {
      setGameMode(mode);
      setPlayers(ps ?? []);
      setGameStatus(status ?? "playing");
      setWinner(w ?? null);
      if (tt) setTeamTotal(tt);
      if (ps2) setPlayerStats(ps2);
      if (mode === "shared") setSharedRounds(rounds ?? []);
      else setDualRounds(rounds ?? []);
    });

    socket.on("update", ({ rounds }: { rounds: SharedRound[] }) => {
      setSharedRounds(rounds);
    });

    socket.on("roundResult", (data: { own: { word: string; result: string[] }; other: { result: string[] } }) => {
      // DEBUG: confirm we only received our own data (no partner word should be present)
      console.log("[Dual] roundResult received — own word:", data.own.word, "| partner colors:", data.other.result);
      setWaitingForPartner(false);
      setPartnerReady(false);
      setDualRounds((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.waiting) {
          next[next.length - 1] = { own: data.own, partnerResult: data.other.result };
        } else {
          next.push({ own: data.own, partnerResult: data.other.result });
        }
        return next;
      });
    });

    socket.on("playerSubmitted", ({ playerId }: { playerId: string }) => {
      if (playerId === playerName) {
        setWaitingForPartner(true);
      } else {
        setPartnerReady(true);
        addSystem(`${playerId} submitted their guess`);
      }
    });

    socket.on("playerJoined", ({ player, players: ps }: { player: string; players: string[] }) => {
      setPlayers(ps);
      addSystem(`${player} joined the room`);
    });

    socket.on("playerLeft", ({ player }: { player: string }) => {
      addSystem(`${player} left the room`);
    });

    socket.on("playerTyping", ({ player }: { player: string }) => {
      setTypingPlayers((prev) => prev.includes(player) ? prev : [...prev, player]);
      setTimeout(() => setTypingPlayers((prev) => prev.filter((p) => p !== player)), 2000);
    });

    socket.on("wordAlreadyUsed", ({ guess }: { guess: string }) => {
      setWordError(`"${guess.toUpperCase()}" was already guessed`);
      setTimeout(() => setWordError(null), 3000);
    });

    socket.on("gameOver", ({ status, winner: w, word, rewards: r, bountyNextRound: bnr, playerStats: ps, partnerStats: pts, teamStats: ts }: {
      status: GameStatus; winner?: string; word: string; rewards?: RewardInfo;
      bountyNextRound?: boolean;
      playerStats?: PlayerStats; partnerStats?: PlayerStats; teamStats?: TeamSessionStats;
    }) => {
      setGameStatus(status);
      setWinner(w ?? null);
      setRevealWord(word);
      setRewards(r ?? null);
      setShowRewardScreen(true);
      setBountyNextRound(bnr ?? false);
      if (r?.teamTotal) setTeamTotal((prev) => ({ ...prev, intelligence: r.teamTotal.intelligence, coins: r.teamTotal.coins }));
      if (ps) setPlayerStats(ps);
      if (pts) setPartnerStats(pts);
      if (ts) setTeamStats(ts);
    });

    socket.on("newRound", () => {
      // Reset board state for the new round, but intentionally leave
      // revealWord, rewards, and showRewardScreen untouched so the end-game
      // screen stays fully intact until the player dismisses it themselves.
      setSharedRounds([]);
      setDualRounds([]);
      setGameStatus("playing");
      setWinner(null);
      setCurrentGuess("");
      setWaitingForPartner(false);
      setPartnerReady(false);
      addSystem("New round started!");
    });

    socket.on("chatMessage", (msg: ChatMsg) => setChatMessages((prev) => [...prev, msg]));

    return () => { socket.disconnect(); };
  }, [playerName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, typingPlayers]);

  // Load career stats on mount so lobby shows them immediately
  useEffect(() => {
    const name = encodeURIComponent(playerName);
    fetch(`${import.meta.env.BASE_URL}api/players/${playerId}?name=${name}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setPlayerStats(data); })
      .catch(() => {});
  }, [playerId, playerName]);

  const joinRoom = useCallback(() => {
    const id = roomInput.trim();
    if (!id || !socketRef.current) return;
    setGameId(id);
    setGameMode(modeInput);
    setInRoom(true);
    setSharedRounds([]);
    setDualRounds([]);
    setChatMessages([]);
    setGameStatus("playing");
    setWinner(null);
    setRevealWord(null);
    setRewards(null);
    setPartnerStats(null);
    setTeamStats(null);
    const confirmedName = nameInput.trim() || playerName;
    if (confirmedName !== playerName) {
      savePlayerName(confirmedName);
      setPlayerName(confirmedName);
    }
    socketRef.current.emit("joinRoom", { gameId: id, player: confirmedName, playerId, mode: modeInput });
  }, [roomInput, modeInput, nameInput, playerName, playerId]);

  const leaveRoom = useCallback(() => {
    setInRoom(false);
    setSharedRounds([]);
    setDualRounds([]);
    setChatMessages([]);
    setWaitingForPartner(false);
    setPartnerReady(false);
    setRewards(null);
    setGameStatus("playing");
    setShowRewardScreen(false);
  }, []);

  const submitGuess = useCallback(() => {
    const guess = currentGuess.trim().toLowerCase();
    if (guess.length !== COLS || !socketRef.current || gameStatus !== "playing") return;
    if (gameMode === "dual" && waitingForPartner) return;

    if (gameMode === "dual") {
      setDualRounds((prev) => [...prev, { own: { word: guess, result: [] }, waiting: true }]);
    }

    socketRef.current.emit("guess", { gameId, playerId: playerName, guess });
    setCurrentGuess("");
  }, [currentGuess, gameId, playerName, gameMode, gameStatus, waitingForPartner]);

  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit("chat", { gameId, player: playerName, text });
    setChatInput("");
  }, [chatInput, gameId, playerName]);

  const handleTyping = useCallback((val: string) => {
    setCurrentGuess(val);
    if (!socketRef.current) return;
    socketRef.current.emit("typing", { gameId, player: playerName });
  }, [gameId, playerName]);

  const sharedBoardRows = sharedRounds.map((r) => ({ letters: r.guess.split(""), colors: r.result as TileColor[] }));
  const myBoardRows = dualRounds.map((r) => ({ letters: r.own ? r.own.word.split("") : [], colors: (r.own?.result ?? []) as TileColor[] }));
  const partnerBoardRows = dualRounds.map((r) => ({ letters: [], colors: (r.partnerResult ?? []) as TileColor[] }));

  const guessCount = gameMode === "shared" ? sharedRounds.length : dualRounds.length;
  const isInputDisabled = gameStatus !== "playing" || (gameMode === "dual" && waitingForPartner);

  // Letter color states for on-screen keyboard: green > yellow > gray
  const letterStates = useMemo<Record<string, TileColor>>(() => {
    const rows = gameMode === "shared" ? sharedBoardRows : myBoardRows;
    const states: Record<string, TileColor> = {};
    for (const row of rows) {
      row.letters.forEach((letter, i) => {
        const l = letter.toLowerCase();
        const color = row.colors[i] ?? "empty";
        const cur = states[l];
        if (!cur || color === "green" || (color === "yellow" && cur === "gray")) states[l] = color;
      });
    }
    return states;
  }, [sharedBoardRows, myBoardRows, gameMode]);

  const handleKeyPress = useCallback((letter: string) => {
    if (isInputDisabled) return;
    setCurrentGuess((prev) => prev.length < COLS ? prev + letter.toLowerCase() : prev);
  }, [isInputDisabled]);

  const handleBackspace = useCallback(() => {
    setCurrentGuess((prev) => prev.slice(0, -1));
  }, []);

  let statusText = "Guess the 5-letter word!";
  if (gameMode === "dual" && waitingForPartner) statusText = "Waiting for partner...";
  else if (gameMode === "dual" && partnerReady && !waitingForPartner) statusText = "Partner is ready — make your guess!";
  else if (guessCount > 0) statusText = `${ROWS - guessCount} guess${ROWS - guessCount === 1 ? "" : "es"} remaining`;

  // ─── Lobby ──────────────────────────────────────────────────────────────────
  if (!inRoom) {
    return (
      <div style={s.page}>
        <header style={s.header}>
          <h1 style={s.title}>Co-Ordle</h1>
          <span style={{ ...s.dot, background: connected ? "#538d4e" : "#3a3a3c" }} />
        </header>
        <div style={s.lobby}>
          <h2 style={s.lobbyTitle}>Join a Game Room</h2>

          {/* Player name */}
          <div style={{ width: "100%", maxWidth: 340, marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "#818384", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>
              Your Name
            </label>
            <input
              style={{ ...s.input, width: "100%" }}
              value={nameInput}
              placeholder="Enter your display name"
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={() => { if (nameInput.trim()) { savePlayerName(nameInput.trim()); setPlayerName(nameInput.trim()); }}}
              data-testid="input-name"
            />
          </div>

          {/* Room name */}
          <div style={{ width: "100%", maxWidth: 340, marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "#818384", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>
              Room Name
            </label>
            <input
              style={{ ...s.input, width: "100%" }}
              value={roomInput}
              placeholder="Share with your partner to play together"
              onChange={(e) => setRoomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              data-testid="input-room"
              autoFocus
            />
          </div>

          <select
            style={{ ...s.input, width: "100%", maxWidth: 340, marginBottom: 8, cursor: "pointer" }}
            value={modeInput}
            onChange={(e) => setModeInput(e.target.value as GameMode)}
            data-testid="select-mode"
          >
            <option value="shared">Shared Mode — everyone sees all guesses</option>
            <option value="dual">Dual Brain Mode — see only your partner's colors</option>
          </select>
          {modeInput === "dual" && (
            <p style={{ color: "#b59f3b", fontSize: 13, maxWidth: 340, textAlign: "center", margin: "0 0 12px" }}>
              You'll only see your partner's color clues — not their guesses. Talk it out.
            </p>
          )}
          <button style={{ ...s.btn, width: "100%", maxWidth: 340, fontSize: 17, padding: "14px 0" }} onClick={joinRoom} data-testid="button-join">
            Join Room
          </button>

          {/* Career stats preview */}
          {playerStats && (
            <div style={{ width: "100%", maxWidth: 340, marginTop: 20 }}>
              <PlayerStatCard stats={playerStats} label="Your Career Stats" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Game ────────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {showRewardScreen && (
        <RewardScreen
          status={gameStatus}
          revealWord={revealWord}
          rewards={rewards}
          playerName={playerName}
          partnerName={players.find((p) => p !== playerName) ?? null}
          playerStats={playerStats}
          partnerStats={partnerStats}
          teamStats={teamStats}
          bountyNextRound={bountyNextRound}
          onLeave={leaveRoom}
          onDismiss={() => {
            setShowRewardScreen(false);
            setSharedRounds([]);
            setDualRounds([]);
            setGameStatus("playing");
            setWinner(null);
            setRevealWord(null);
            setRewards(null);
            setCurrentGuess("");
            setWaitingForPartner(false);
            setPartnerReady(false);
          }}
        />
      )}

      <header style={s.header}>
        <h1 style={s.title}>Co-Ordle</h1>
        <span style={{ ...s.dot, background: connected ? "#538d4e" : "#3a3a3c" }} />
        <span style={{ ...s.roomTag, userSelect: "all", cursor: "text" }} title="Tap to copy room name">{gameId}</span>
        <span style={{ fontSize: 11, color: "#818384" }}>{gameMode === "dual" ? "DUAL" : "SHARED"}</span>
        {/* Token display */}
        <div style={s.tokenBadge} title="Intelligence tokens">
          <span style={{ color: "#538d4e" }}>🧠</span>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{teamTotal.intelligence}</span>
        </div>
        <div style={s.tokenBadge} title="Coins">
          <span style={{ color: "#b59f3b" }}>🪙</span>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{teamTotal.coins}</span>
        </div>
        {teamTotal.streak > 0 && (
          <div style={{ ...s.tokenBadge, color: "#f97316" }} title="Day streak">
            <span>🔥</span>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{teamTotal.streak}</span>
          </div>
        )}
        <button style={s.leaveBtn} onClick={leaveRoom} data-testid="button-leave">Leave</button>
        <span style={{ ...s.playerTag, color: playerColor(playerName) }}>{playerName}</span>
      </header>

      <div style={s.main}>
        <section style={s.gameSection}>
          {wordError && <div style={s.wordError}>{wordError}</div>}
          <p style={s.statusText}>{statusText}</p>

          {gameMode === "shared" ? (
            <Board rounds={sharedBoardRows} />
          ) : (
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
              <div>
                <p style={s.boardLabel}>Your Board</p>
                <Board rounds={myBoardRows} showLetters={true} tileSize={48} />
              </div>
              <div>
                <p style={s.boardLabel}>Partner Insight</p>
                <Board rounds={partnerBoardRows} showLetters={false} tileSize={48} />
              </div>
            </div>
          )}

          <div style={{ ...s.inputRow, marginTop: 16 }}>
            <input
              style={{ ...s.input, flex: 1, minWidth: 0, opacity: isInputDisabled ? 0.5 : 1, textTransform: "uppercase", letterSpacing: 4, fontWeight: 700 }}
              value={currentGuess.toUpperCase()}
              maxLength={COLS}
              placeholder={isInputDisabled ? (waitingForPartner ? "Waiting for partner..." : "Game over") : "_ _ _ _ _"}
              disabled={isInputDisabled}
              onChange={(e) => handleTyping(e.target.value.toLowerCase().replace(/[^a-z]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submitGuess()}
              data-testid="input-guess"
            />
            <button
              style={{ ...s.btn, opacity: isInputDisabled ? 0.5 : 1 }}
              onClick={submitGuess}
              disabled={isInputDisabled}
              data-testid="button-guess"
            >
              Guess
            </button>
          </div>

          <Keyboard
            letterStates={letterStates}
            onKey={handleKeyPress}
            onDelete={handleBackspace}
            onEnter={submitGuess}
            disabled={isInputDisabled}
          />
        </section>

        <section style={s.chatSection}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <h2 style={s.chatTitle}>Chat</h2>
            <div style={{ display: "flex", gap: 6 }}>
              {players.map((p) => (
                <span key={p} style={{ fontSize: 11, color: playerColor(p), fontWeight: 700 }}>{p}</span>
              ))}
            </div>
          </div>
          <div style={s.chatBox}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ ...s.chatMsg, animation: "fadeIn 0.2s ease" }}>
                <span style={{ fontWeight: 700, color: msg.system ? "#818384" : playerColor(msg.player), fontStyle: msg.system ? "italic" : "normal" }}>
                  {msg.player}:{" "}
                </span>
                <span style={{ color: msg.system ? "#818384" : "#ddd" }}>{msg.text}</span>
              </div>
            ))}
            {typingPlayers.length > 0 && (
              <div style={{ color: "#818384", fontSize: 12, fontStyle: "italic" }}>
                {typingPlayers.join(", ")} typing...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div style={s.inputRow}>
            <input
              style={{ ...s.input, flex: 1, minWidth: 0 }}
              value={chatInput}
              placeholder="Say something..."
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              data-testid="input-chat"
            />
            <button style={s.btn} onClick={sendChat} data-testid="button-chat">Send</button>
          </div>
        </section>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#121213", color: "#fff", fontFamily: "'Inter', 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" },
  header: { display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid #2a2a2c", flexWrap: "wrap" },
  title: { margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase" },
  dot: { width: 9, height: 9, borderRadius: "50%", display: "inline-block", flexShrink: 0 },
  roomTag: { fontSize: 13, color: "#538d4e", fontWeight: 700 },
  tokenBadge: { display: "flex", alignItems: "center", gap: 4, background: "#1a1a1b", border: "1px solid #2a2a2c", borderRadius: 20, padding: "3px 9px", fontSize: 12, color: "#ccc" },
  leaveBtn: { marginLeft: "auto", padding: "6px 12px", borderRadius: 8, border: "1px solid #3a3a3c", background: "transparent", color: "#818384", fontSize: 13, cursor: "pointer" },
  playerTag: { fontSize: 13, fontWeight: 700 },
  lobby: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 },
  lobbyTitle: { margin: "0 0 24px", fontSize: 26, fontWeight: 800 },
  main: { display: "flex", flex: 1, gap: 20, padding: 16, flexWrap: "wrap" },
  gameSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1, minWidth: 280 },
  statusText: { fontSize: 14, color: "#818384", margin: 0, textAlign: "center" },
  boardLabel: { fontSize: 12, color: "#818384", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px", textAlign: "center" },
  inputRow: { display: "flex", gap: 8, width: "100%", maxWidth: 360 },
  input: { padding: "13px 14px", borderRadius: 10, border: "1px solid #3a3a3c", background: "#1a1a1b", color: "#fff", fontSize: 16, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  btn: { padding: "13px 18px", borderRadius: 10, border: "none", background: "#538d4e", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", whiteSpace: "nowrap" },
  chatSection: { display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 260, maxWidth: 380 },
  chatTitle: { margin: 0, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#818384" },
  chatBox: { flex: 1, minHeight: 260, maxHeight: 400, overflowY: "auto", background: "#1a1a1b", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 5, border: "1px solid #2a2a2c" },
  chatMsg: { fontSize: 14, lineHeight: 1.5, wordBreak: "break-word" },
  wordError: { background: "#2a1a1a", border: "1px solid #b59f3b", color: "#b59f3b", borderRadius: 8, padding: "7px 12px", fontSize: 13, animation: "fadeIn 0.2s ease" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  resultCard: { background: "#1a1a1b", border: "1px solid #2a2a2c", borderRadius: 16, padding: "28px 24px", width: "100%", maxWidth: 420 },
  statsRow: { display: "flex", gap: 8, marginBottom: 14 },
  bonusBanner: { border: "1px solid #538d4e", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#86efac", marginBottom: 10, textAlign: "center" },
  tokenSection: { background: "#121213", borderRadius: 10, padding: "0 12px", marginBottom: 4 },
};
