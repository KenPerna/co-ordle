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


const ADJECTIVES = ["TIGER","COBRA","STORM","BLAZE","FROST","LUNAR","SOLAR","SWIFT","BRAVE","NOBLE","CHAOS","CRISP","DIZZY","EAGER","FANCY","QUIRKY","RAPID","SHINY","ULTRA","VIVID"];
const NOUNS = ["ACE","BAT","CAT","DOG","ELK","FOX","GNU","HEN","IMP","JAY","KOI","LAB","MOB","NAP","OWL","PIG","RAT","SOW","TAN","URN"];

function generateRoomCode(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  const num = Math.floor(Math.random() * 90 + 10);
  return `${adj}-${noun}-${num}`;
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

function Tile({ letter, color, size = 52, highlighted = false }: { letter?: string; color: TileColor; size?: number; highlighted?: boolean }) {
  return (
    <div style={{
      width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: 700,
      border: highlighted ? `2px solid #fff` : `2px solid ${color === "empty" ? "#3a3a3c" : TILE_BG[color]}`,
      borderRadius: 4, background: TILE_BG[color], color: "#fff", textTransform: "uppercase",
      transition: "background 0.3s",
      boxShadow: highlighted ? "0 0 0 1px rgba(255,255,255,0.3), inset 0 0 0 1px rgba(255,255,255,0.1)" : "none",
    }}>
      {letter ?? ""}
    </div>
  );
}

function Board({ rounds, maxRows = ROWS, cols = COLS, showLetters = true, tileSize = 52,
  activeGuess, selectedCol, onTileClick }: {
  rounds: { letters: string[]; colors: TileColor[] }[];
  maxRows?: number; cols?: number; showLetters?: boolean; tileSize?: number;
  activeGuess?: string[]; selectedCol?: number; onTileClick?: (col: number) => void;
}) {
  const activeRowIndex = rounds.length;
  const rows = [...rounds, ...Array(Math.max(0, maxRows - rounds.length)).fill({ letters: [], colors: [] })];
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${tileSize}px)`, gap: "clamp(3px, 0.8vw, 5px)" }}>
      {rows.slice(0, maxRows).map((row, ri) =>
        Array.from({ length: cols }).map((_, ci) => {
          const isActiveRow = ri === activeRowIndex && activeGuess != null;
          const letter = isActiveRow
            ? (activeGuess![ci]?.trim() || undefined)
            : (showLetters ? row.letters?.[ci]?.toUpperCase() : undefined);
          const color: TileColor = isActiveRow
            ? (activeGuess![ci]?.trim() ? "pending" : "empty")
            : ((row.colors?.[ci] as TileColor) ?? "empty");
          const highlighted = isActiveRow && ci === selectedCol;
          return (
            <div key={`${ri}-${ci}`} onClick={() => isActiveRow && onTileClick?.(ci)}
              style={{ cursor: isActiveRow ? "pointer" : "default" }}>
              <Tile letter={letter?.toUpperCase()} color={color} size={tileSize} highlighted={highlighted} />
            </div>
          );
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
    <div style={{ display: "flex", flexDirection: "column", gap: "min(1vw, 4px)", alignItems: "center", width: "100%", marginTop: 4, padding: "0 4px", boxSizing: "border-box" }}>
      {KB_ROWS.map((row, ri) => (
        <div key={ri} style={{ display: "flex", gap: "min(1vw, 4px)", width: "100%", justifyContent: "center" }}>
          {row.map((key) => {
            const state: TileColor = letterStates[key.toLowerCase()] ?? "empty";
            const isGray = state === "gray";
            const isEnter = key === "↵";
            const isBackspace = key === "⌫";
            const isWide = isEnter || isBackspace;
            return (
              <button
                key={key}
                disabled={disabled}
                onClick={() => { if (isBackspace) onDelete(); else if (isEnter) onEnter(); else onKey(key); }}
                style={{
                  flex: isWide ? 1.6 : 1,
                  maxWidth: isEnter ? "14vw" : isBackspace ? "10vw" : "9vw",
                  minWidth: isEnter ? 48 : isBackspace ? 36 : 28,
                  height: "clamp(32px, 4vw, 38px)",
                  borderRadius: 6,
                  border: "none",
                  background: isEnter ? "#3b82f6" : state === "green" ? "#538d4e" : state === "yellow" ? "#b59f3b" : isGray ? "#1a1a1b" : "#3a3a3c",
                  color: isGray && !isEnter ? "#555" : "#fff",
                  fontWeight: 700,
                  //fontSize: "clamp(9px, 1.8vw, 14px)",
                  fontSize: "clamp(11px, 2.2vw, 16px)",
                  cursor: disabled ? "default" : "pointer",
                  opacity: isGray && !isEnter ? 0.5 : 1,
                  fontFamily: "inherit",
                  flexShrink: 0,
                  transition: "background 0.25s",
                  padding: 0,
                  touchAction: "manipulation",
                }}
              >
                {isEnter ? "GUESS" : key}
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
              <div style={{ fontSize: 28, marginBottom: 2 }}>🎉</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#538d4e", animation: "pulse 1.2s ease-in-out infinite" }}>
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
              <div style={{ fontSize: 12, color: "#818384", marginTop: 3 }}>
                {hasPartner ? "You solved it together — incredible!" : "You cracked it — well done!"}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, marginBottom: 2 }}>💪</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>
                So Close!
              </div>
              <div style={{ fontSize: 12, color: "#818384", marginTop: 3 }}>
                {rewards?.greatTeamwork
                  ? "Amazing effort from both of you — keep it up!"
                  : "You'll crack the next one — don't give up!"}
              </div>
            </>
          )}
          {/* Always show the secret word */}
          <div style={{ marginTop: 6, fontSize: 13, color: "#818384" }}>
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

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <div style={{ ...s.btn, flex: 1, textAlign: "center", background: "#1a1a1b", border: "1px solid #3a3a3c", cursor: "pointer", color: "#818384", fontSize: 14 }}
            onClick={onLeave}>
              {/* Actions */}
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
    <div style={{ flex: 1, textAlign: "center", background: "#1a1a1b", borderRadius: 8, padding: "6px 4px" }}>
      <div style={{ fontSize: 10, color: "#818384", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: accent, marginTop: 1, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function TokenRow({ icon, label, earned, total, color }: { icon: string; label: string; earned: number; total: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #2a2a2c" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 13, color: "#ccc" }}>{label}</span>
      </div>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontSize: 16, fontWeight: 800, color }}>+{earned}</span>
        <span style={{ fontSize: 11, color: "#818384", marginLeft: 6 }}>Total: {total}</span>
      </div>
    </div>
  );
}
export default function Game() {
  // ── Persistent identity ──────────────────────────────────────────────────────
  const [playerId] = useState(() => getOrCreatePlayerId());
  const [nameInput, setNameInput] = useState(() => getStoredPlayerName());
  const [playerName, setPlayerName] = useState(() => getStoredPlayerName() || `Player${Math.floor(Math.random() * 900 + 100)}`);

  const [lobbyMode, setLobbyMode] = useState<"pick" | "create" | "join">("pick");
  const [roomInput, setRoomInput] = useState("");
  const [generatedCode, setGeneratedCode] = useState(() => generateRoomCode());
  const [modeInput, setModeInput] = useState<GameMode>("shared");
  const [difficultyInput, setDifficultyInput] = useState<"easy" | "regular" | "advanced">("regular");
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

  // Frozen snapshot of the result captured at gameOver — never mutated by newRound
  const [endGameSnapshot, setEndGameSnapshot] = useState<{
    status: GameStatus; revealWord: string | null; rewards: RewardInfo | null;
    playerStats: PlayerStats | null; partnerStats: PlayerStats | null;
    teamStats: TeamSessionStats | null; bountyNextRound: boolean;
  } | null>(null);

  // ── Player / team stats from DB ──────────────────────────────────────────────
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [partnerStats, setPartnerStats] = useState<PlayerStats | null>(null);
  const [teamStats, setTeamStats] = useState<TeamSessionStats | null>(null);
  const [bountyNextRound, setBountyNextRound] = useState(false);

  const EMPTY_GUESS = "     "; // 5 spaces — one slot per column
  const [currentGuess, setCurrentGuess] = useState(EMPTY_GUESS);
  const [selectedCol, setSelectedCol] = useState(0);
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
    //old const socket = io();
    const socket = io(import.meta.env.VITE_API_URL);
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

    socket.on("playerSubmitted", ({ playerId: submittedPlayerId, playerName: submittedPlayerName }: { playerId: string; playerName?: string }) => {
      if (submittedPlayerId === playerId) {
        setWaitingForPartner(true);
      } else {
        setPartnerReady(true);
        addSystem(`${submittedPlayerName ?? "Partner"} submitted their guess`);
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
      setWaitingForPartner(false);
      setDualRounds((prev) => {
        const last = prev[prev.length - 1];
        if (last?.waiting && last.own?.word === guess) return prev.slice(0, -1);
        return prev;
      });
      const chars = Array.from({ length: COLS }, (_, i) => (guess[i] ?? " "));
      setCurrentGuess(chars.join(""));
      setSelectedCol(Math.min(guess.length, COLS - 1));
    });
    socket.on("invalidWord", ({ guess }: { guess: string }) => {
      setWordError(`"${guess.toUpperCase()}" is not in the word list`);
      setTimeout(() => setWordError(null), 3000);
      setWaitingForPartner(false);
      setDualRounds((prev) => {
        const last = prev[prev.length - 1];
        if (last?.waiting && last.own?.word === guess) return prev.slice(0, -1);
        return prev;
      });
      const chars = Array.from({ length: COLS }, (_, i) => (guess[i] ?? " "));
      setCurrentGuess(chars.join(""));
      setSelectedCol(Math.min(guess.length, COLS - 1));
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
      // Freeze a snapshot — this is what the end-game screen always shows,
      // regardless of background resets from newRound events.
      setEndGameSnapshot({
        status,
        revealWord: word,
        rewards: r ?? null,
        playerStats: ps ?? null,
        partnerStats: pts ?? null,
        teamStats: ts ?? null,
        bountyNextRound: bnr ?? false,
      });
    });

    socket.on("newRound", () => {
      // Reset board state for the new round, but intentionally leave
      // revealWord, rewards, and showRewardScreen untouched so the end-game
      // screen stays fully intact until the player dismisses it themselves.
      setSharedRounds([]);
      setDualRounds([]);
      setGameStatus("playing");
      setWinner(null);
      setCurrentGuess("     ");
      setSelectedCol(0);
      setWaitingForPartner(false);
      setPartnerReady(false);
      addSystem("New round started!");
    });

    socket.on("chatMessage", (msg: ChatMsg) => setChatMessages((prev) => [...prev, msg]));

    return () => { socket.disconnect(); };
  }, [playerId, playerName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Load career stats on mount so lobby shows them immediately
  useEffect(() => {
    const name = encodeURIComponent(playerName);
    //fetch(`${import.meta.env.BASE_URL}api/players/${playerId}?name=${name}`)
    fetch(`${import.meta.env.VITE_API_URL}/api/players/${playerId}?name=${name}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setPlayerStats(data); })
      .catch(() => {});
  }, [playerId, playerName]);


  const joinRoom = useCallback(() => {
    const id = lobbyMode === "create" ? generatedCode : roomInput.trim();
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
    socketRef.current.emit("joinRoom", { gameId: id, player: confirmedName, playerId, mode: modeInput, difficulty: difficultyInput });
  }, [roomInput, modeInput, nameInput, playerName, playerId, lobbyMode, generatedCode, difficultyInput]);

  const leaveRoom = useCallback(() => {
    setInRoom(false);
    setSharedRounds([]);
    setDualRounds([]);
    setChatMessages([]);
    setWaitingForPartner(false);
    setPartnerReady(false);
    setRewards(null);
    setEndGameSnapshot(null);
    setGameStatus("playing");
    setShowRewardScreen(false);
    setLobbyMode("pick");
  }, []);

  const submitGuess = useCallback(() => {
    const guess = currentGuess.replace(/ /g, "").toLowerCase();
    if (guess.length !== COLS || !socketRef.current || gameStatus !== "playing") return;
    if (gameMode === "dual" && waitingForPartner) return;
    if (gameMode === "dual") {
      setDualRounds((prev) => [...prev, { own: { word: guess, result: [] }, waiting: true }]);
      setWaitingForPartner(true);
    }

    socketRef.current.emit("guess", { gameId, playerId, guess });
    setCurrentGuess("     ");
    setSelectedCol(0);
  }, [currentGuess, gameId, playerId, gameMode, gameStatus, waitingForPartner]);

  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit("chat", { gameId, player: playerName, text });
    setChatInput("");
  }, [chatInput, gameId, playerName]);

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
    setCurrentGuess((prev) => {
      const chars = prev.padEnd(COLS, " ").split("");
      chars[selectedCol] = letter.toLowerCase();
      return chars.join("");
    });
    setSelectedCol((prev) => Math.min(prev + 1, COLS - 1));
    socketRef.current?.emit("typing", { gameId, player: playerName });
  }, [isInputDisabled, selectedCol, gameId, playerName]);

  const handleBackspace = useCallback(() => {
    if (isInputDisabled) return;
    setCurrentGuess((prev) => {
      const chars = prev.padEnd(COLS, " ").split("");
      if (chars[selectedCol]?.trim()) {
        chars[selectedCol] = " "; // clear current; cursor stays
      } else {
        const target = Math.max(0, selectedCol - 1);
        chars[target] = " "; // clear previous
        setSelectedCol(target);
      }
      return chars.join("");
    });
  }, [isInputDisabled, selectedCol]);

  // Physical keyboard input — routes to grid-based handlers
  useEffect(() => {
    if (!inRoom || isInputDisabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Enter") { e.preventDefault(); submitGuess(); }
      else if (e.key === "Backspace") { e.preventDefault(); handleBackspace(); }
      else if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) handleKeyPress(e.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inRoom, isInputDisabled, submitGuess, handleBackspace, handleKeyPress]);

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

          {/* Player name — always visible */}
          <div style={{ width: "100%", maxWidth: 340, marginBottom: 20 }}>
            <label style={s.lobbyLabel}>Your Name</label>
            <input
              style={{ ...s.input, width: "100%", boxSizing: "border-box" }}
              value={nameInput}
              placeholder="Enter your display name"
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={() => { if (nameInput.trim()) { savePlayerName(nameInput.trim()); setPlayerName(nameInput.trim()); }}}
            />
          </div>

          {/* Create / Join toggle */}
          {lobbyMode === "pick" && (
            <>
              <h2 style={s.lobbyTitle}>What would you like to do?</h2>
              <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 340 }}>
                <button
                  style={{ ...s.btn, flex: 1, fontSize: 15, padding: "16px 0", background: "#538d4e" }}
                  onClick={() => { setGeneratedCode(generateRoomCode()); setLobbyMode("create"); }}
                >
                  🎮 Create Game
                </button>
                <button
                  style={{ ...s.btn, flex: 1, fontSize: 15, padding: "16px 0", background: "#3b82f6" }}
                  onClick={() => setLobbyMode("join")}
                >
                  🔗 Join Game
                </button>
              </div>
            </>
          )}

          {/* Create flow */}
          {lobbyMode === "create" && (
            <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={s.lobbyTitle}>Create a Game</h2>

              {/* Room code display */}
              <div>
                <label style={s.lobbyLabel}>Your Room Code</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ ...s.input, flex: 1, fontWeight: 800, letterSpacing: 2, fontSize: 17, color: "#538d4e", boxSizing: "border-box" }}>
                    {generatedCode}
                  </div>
                  <button
                    style={{ ...s.btn, padding: "12px 14px", background: "#2a2a2c", fontSize: 18 }}
                    title="Generate new code"
                    onClick={() => setGeneratedCode(generateRoomCode())}
                  >
                    🔄
                  </button>
                </div>
                <p style={{ fontSize: 12, color: "#818384", margin: "6px 0 0" }}>
                  Share this code with your partner so they can join.
                </p>
              </div>

              {/* Game mode */}
              <div>
                <label style={s.lobbyLabel}>Game Mode</label>
                <select
                  style={{ ...s.input, width: "100%", boxSizing: "border-box", cursor: "pointer" }}
                  value={modeInput}
                  onChange={(e) => setModeInput(e.target.value as GameMode)}
                >
                  <option value="shared">Shared — everyone sees all guesses</option>
                  <option value="dual">Dual Brain — see only your partner's colors</option>
                </select>
                {modeInput === "dual" && (
                  <p style={{ fontSize: 12, color: "#b59f3b", margin: "6px 0 0" }}>
                    You'll only see your partner's color clues — not their letters. Talk it out!
                  </p>
                )}
              </div>

              {/* Difficulty */}
              <div>
                <label style={s.lobbyLabel}>Difficulty</label>
                <select
                  style={{ ...s.input, width: "100%", boxSizing: "border-box", cursor: "pointer" }}
                  value={difficultyInput}
                  onChange={(e) => setDifficultyInput(e.target.value as "easy" | "regular" | "advanced")}
                >
                  <option value="easy">Easy — common everyday words</option>
                  <option value="regular">Regular — standard Wordle difficulty</option>
                  <option value="advanced">Advanced — uncommon and tricky words</option>
                </select>
              </div>

              <button
                style={{ ...s.btn, width: "100%", fontSize: 17, padding: "14px 0", marginTop: 4 }}
                onClick={joinRoom}
              >
                Launch Game
              </button>
              <button
                style={{ background: "none", border: "none", color: "#818384", fontSize: 13, cursor: "pointer", textAlign: "center", padding: "4px 0" }}
                onClick={() => setLobbyMode("pick")}
              >
                ← Back
              </button>
            </div>
          )}

          {/* Join flow */}
          {lobbyMode === "join" && (
            <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={s.lobbyTitle}>Join a Game</h2>

              <div>
                <label style={s.lobbyLabel}>Room Code</label>
                <input
                  style={{ ...s.input, width: "100%", boxSizing: "border-box", letterSpacing: 2, fontWeight: 700 }}
                  value={roomInput}
                  placeholder="e.g. TIGER-ACE-42"
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                  autoFocus
                />
                <p style={{ fontSize: 12, color: "#818384", margin: "6px 0 0" }}>
                  Ask the game creator for their room code.
                </p>
              </div>

              <button
                style={{ ...s.btn, width: "100%", fontSize: 17, padding: "14px 0", background: "#3b82f6" }}
                onClick={joinRoom}
              >
                Join Room
              </button>
              <button
                style={{ background: "none", border: "none", color: "#818384", fontSize: 13, cursor: "pointer", textAlign: "center", padding: "4px 0" }}
                onClick={() => setLobbyMode("pick")}
              >
                ← Back
              </button>

              {/* Career stats */}
              {playerStats && (
                <div style={{ marginTop: 8 }}>
                  <PlayerStatCard stats={playerStats} label="Your Career Stats" />
                </div>
              )}
            </div>
          )}

          {/* Career stats on pick screen */}
          {lobbyMode === "pick" && playerStats && (
            <div style={{ width: "100%", maxWidth: 340, marginTop: 20 }}>
              <PlayerStatCard stats={playerStats} label="Your Career Stats" />
            </div>
          )}

        </div>
      </div>
    );
  }

  // ─── Game ────────────────────────────────────────────────────────────────────
  const partnerName = players.find((p) => p !== playerName) ?? null;

  return (
    <div style={s.page}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {showRewardScreen && endGameSnapshot && (
        <RewardScreen
          status={endGameSnapshot.status}
          revealWord={endGameSnapshot.revealWord}
          rewards={endGameSnapshot.rewards}
          playerName={playerName}
          partnerName={partnerName}
          playerStats={endGameSnapshot.playerStats}
          partnerStats={endGameSnapshot.partnerStats}
          teamStats={endGameSnapshot.teamStats}
          bountyNextRound={endGameSnapshot.bountyNextRound}
          onLeave={leaveRoom}
          onDismiss={() => {
            setShowRewardScreen(false);
            setSharedRounds([]);
            setDualRounds([]);
            setGameStatus("playing");
            setWinner(null);
            setRevealWord(null);
            setRewards(null);
            setEndGameSnapshot(null);
            setCurrentGuess("     ");
            setSelectedCol(0);
            setWaitingForPartner(false);
            setPartnerReady(false);
          }}
        />
      )}

      {/* ── Header ── */}
      <header style={s.header}>
        <h1 style={s.title}>Co-Ordle</h1>
        <span style={{ ...s.dot, background: connected ? "#538d4e" : "#3a3a3c" }} />
        <span style={s.roomTag}>{gameId}</span>
        <span style={{ fontSize: 10, color: "#818384", flexShrink: 0 }}>{gameMode === "dual" ? "DUAL" : "SHARED"}</span>
        <div style={s.tokenBadge}><span style={{ color: "#538d4e" }}>🧠</span><span style={{ fontWeight: 700 }}>{teamTotal.intelligence}</span></div>
        <div style={s.tokenBadge}><span style={{ color: "#b59f3b" }}>🪙</span><span style={{ fontWeight: 700 }}>{teamTotal.coins}</span></div>
        {teamTotal.streak > 0 && <div style={{ ...s.tokenBadge, color: "#f97316" }}><span>🔥</span><span style={{ fontWeight: 700 }}>{teamTotal.streak}</span></div>}
        <button style={s.leaveBtn} onClick={leaveRoom}>Leave</button>
      </header>

      {/* ── Game area ── */}
      <div style={s.main}>
        <section style={s.gameSection}>
          {wordError && <div style={s.wordError}>{wordError}</div>}
          <p style={s.statusText}>{statusText}</p>

          {gameMode === "shared" ? (
            <Board
              rounds={sharedBoardRows}
              activeGuess={isInputDisabled ? undefined : currentGuess.split("")}
              selectedCol={selectedCol}
              onTileClick={setSelectedCol}
              tileSize={Math.min(
                Math.floor((window.innerWidth - 48) / 5),
                Math.floor((window.innerHeight * 0.38) / 6)
              )}
            />
          ) : (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
              <div>
                <p style={s.boardLabel}>Your Board</p>
                <Board
                  rounds={myBoardRows}
                  showLetters={true}
                  tileSize={Math.min(
                    Math.floor((window.innerWidth - 80) / 10),
                    Math.floor((window.innerHeight * 0.38) / 6)
                  )}
                  activeGuess={isInputDisabled ? undefined : currentGuess.split("")}
                  selectedCol={selectedCol}
                  onTileClick={setSelectedCol}
                />
              </div>
              <div>
                <p style={s.boardLabel}>Partner Insight</p>
                <Board
                  rounds={partnerBoardRows}
                  showLetters={false}
                  tileSize={Math.min(
                    Math.floor((window.innerWidth - 80) / 10),
                    Math.floor((window.innerHeight * 0.38) / 6)
                  )}
                />
              </div>
            </div>
          )}

          <Keyboard
            letterStates={letterStates}
            onKey={handleKeyPress}
            onDelete={handleBackspace}
            onEnter={submitGuess}
            disabled={isInputDisabled}
          />
        </section>

        {/* ── Chat strip ── */}
        <div style={s.chatStrip}>
          <div style={s.chatHeader}>
            <h2 style={s.chatTitle}>
              Chat
              {typingPlayers.length > 0 && (
                <span style={{ color: "#538d4e", marginLeft: 6, fontStyle: "italic", textTransform: "none", letterSpacing: 0 }}>
                  {typingPlayers.join(", ")} typing…
                </span>
              )}
            </h2>
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
            <div ref={chatEndRef} />
          </div>
          <div style={s.inputRow}>
            <input
              style={{ ...s.input, flex: 1, minWidth: 0, padding: "8px 10px", fontSize: 14 }}
              value={chatInput}
              placeholder="Say something…"
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
            />
            <button style={{ ...s.btn, padding: "8px 12px" }} onClick={sendChat}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { height: "100dvh", background: "#121213", color: "#fff", fontFamily: "'Inter','Segoe UI',sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid #2a2a2c", flexWrap: "nowrap", overflow: "hidden", flexShrink: 0 },
  title: { margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", flexShrink: 0 },
  dot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block", flexShrink: 0 },
  roomTag: { fontSize: 12, color: "#538d4e", fontWeight: 700, flexShrink: 0 },
  tokenBadge: { display: "flex", alignItems: "center", gap: 3, background: "#1a1a1b", border: "1px solid #2a2a2c", borderRadius: 20, padding: "2px 7px", fontSize: 11, color: "#ccc", flexShrink: 0 },
  leaveBtn: { marginLeft: "auto", padding: "4px 10px", borderRadius: 8, border: "1px solid #3a3a3c", background: "transparent", color: "#818384", fontSize: 12, cursor: "pointer", flexShrink: 0 },
  playerTag: { fontSize: 12, fontWeight: 700, flexShrink: 0 },
  lobby: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, overflowY: "auto" },
  lobbyLabel: { fontSize: 11, color: "#818384", textTransform: "uppercase" as const, letterSpacing: 1, display: "block", marginBottom: 6 },
  lobbyTitle: { margin: "0 0 24px", fontSize: 26, fontWeight: 800 },
  main: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" },
  gameSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, padding: "6px 8px 4px", overflow: "hidden" },
  statusText: { fontSize: 13, color: "#818384", margin: 0, textAlign: "center", flexShrink: 0 },
  boardLabel: { fontSize: 11, color: "#818384", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px", textAlign: "center" },
  inputRow: { display: "flex", gap: 6, width: "100%" },
  input: { padding: "10px 12px", borderRadius: 10, border: "1px solid #3a3a3c", background: "#1a1a1b", color: "#fff", fontSize: 15, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  btn: { padding: "10px 14px", borderRadius: 10, border: "none", background: "#538d4e", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" },
  chatStrip: { flexShrink: 0, borderTop: "1px solid #2a2a2c", background: "#0e0e0f", padding: "6px 10px 8px", display: "flex", flexDirection: "column", gap: 4 },
  chatHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  chatTitle: { margin: 0, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#818384" },
  chatBox: { height: "3em", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 },
  chatMsg: { fontSize: 13, lineHeight: 1.4, wordBreak: "break-word" },
  wordError: { background: "#2a1a1a", border: "1px solid #b59f3b", color: "#b59f3b", borderRadius: 8, padding: "5px 10px", fontSize: 12, flexShrink: 0 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16, overflowY: "auto" },
  resultCard: { background: "#1a1a1b", border: "1px solid #2a2a2c", borderRadius: 16, padding: "16px 16px", width: "100%", maxWidth: 420, overflowY: "auto", maxHeight: "90dvh" },
  statsRow: { display: "flex", gap: 6, marginBottom: 8 },
  bonusBanner: { border: "1px solid #538d4e", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: "#86efac", marginBottom: 6, textAlign: "center" },
  tokenSection: { background: "#121213", borderRadius: 10, padding: "0 10px", marginBottom: 2 },
};

// force rebuild 2