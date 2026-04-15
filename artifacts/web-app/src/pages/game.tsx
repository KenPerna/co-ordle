import { useEffect, useRef, useState, useCallback } from "react";
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
  streakDays: number;
  dailyBonus: number;
  streakMultiplier: number;
  elapsedFormatted: string;
  guessesUsed: number;
  teamTotal: { intelligence: number; coins: number };
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

function RewardScreen({ status, winner, revealWord, rewards, playerName, onLeave }: {
  status: GameStatus; winner: string | null; revealWord: string | null;
  rewards: RewardInfo | null; playerName: string; onLeave: () => void;
}) {
  const won = status === "won";
  const isWinner = winner === playerName;

  return (
    <div style={s.overlay}>
      <style>{`
        @keyframes rise { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
        .result-card { animation: rise 0.4s ease; }
        .reward-row { animation: rise 0.5s ease 0.15s both; }
      `}</style>
      <div style={s.resultCard} className="result-card">
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          {won ? (
            <>
              <div style={{ fontSize: 13, letterSpacing: 3, color: "#538d4e", textTransform: "uppercase", marginBottom: 4 }}>Puzzle Solved!</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", animation: "pulse 1.2s ease-in-out infinite" }}>
                {isWinner ? "YOU WON!" : `${winner} WON!`}
              </div>
              <div style={{ fontSize: 14, color: "#818384", marginTop: 4 }}>
                {isWinner ? "Excellent teamwork!" : "Better luck next round."}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, letterSpacing: 3, color: "#b59f3b", textTransform: "uppercase", marginBottom: 4 }}>Game Over</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#fff" }}>
                The word was <span style={{ color: "#b59f3b" }}>{revealWord}</span>
              </div>
            </>
          )}
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

        {/* Special messages */}
        {rewards?.almostBonus && (
          <div style={s.bonusBanner}>
            You were ONE letter away! <span style={{ color: "#538d4e" }}>+8 Intelligence</span>
          </div>
        )}
        {rewards?.greatTeamwork && (
          <div style={{ ...s.bonusBanner, borderColor: "#3b82f6", color: "#93c5fd" }}>
            Great teamwork! Both players contributed this round.
          </div>
        )}
        {rewards?.dailyBonus ? (
          <div style={{ ...s.bonusBanner, borderColor: "#f97316", color: "#fdba74" }}>
            Daily bonus: <span style={{ fontWeight: 700 }}>+3 coins</span> for playing today!
          </div>
        ) : null}

        {/* Token rewards */}
        {rewards && (
          <div style={s.tokenSection} className="reward-row">
            <TokenRow icon="🧠" label="Intelligence" earned={rewards.intelligence} total={rewards.teamTotal.intelligence} color="#538d4e" />
            <TokenRow icon="🪙" label="Coins" earned={rewards.coins} total={rewards.teamTotal.coins} color="#b59f3b" />
            {rewards.streakMultiplier > 1 && (
              <div style={{ fontSize: 12, color: "#818384", textAlign: "center", marginTop: 4 }}>
                {rewards.streakMultiplier.toFixed(1)}x streak multiplier applied
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <div style={{ ...s.btn, flex: 1, textAlign: "center", background: "#1a1a1b", border: "1px solid #3a3a3c", cursor: "pointer", color: "#818384", fontSize: 14 }}
            onClick={onLeave}>
            Leave Room
          </div>
          <div style={{ ...s.btn, flex: 1, textAlign: "center", cursor: "default", color: "#818384", background: "#1a1a1b", border: "1px solid #3a3a3c", fontSize: 13 }}>
            Next round in a moment...
          </div>
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
  const [playerName] = useState(() => `Player${Math.floor(Math.random() * 900 + 100)}`);
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

    socket.on("gameState", ({ mode, rounds, status, winner: w, players: ps, teamTotal: tt }: any) => {
      setGameMode(mode);
      setPlayers(ps ?? []);
      setGameStatus(status ?? "playing");
      setWinner(w ?? null);
      if (tt) setTeamTotal(tt);
      if (mode === "shared") setSharedRounds(rounds ?? []);
      else setDualRounds(rounds ?? []);
    });

    socket.on("update", ({ rounds }: { rounds: SharedRound[] }) => {
      setSharedRounds(rounds);
    });

    socket.on("roundResult", (data: Record<string, { own: { word: string; result: string[] }; other: { result: string[] } }>) => {
      setWaitingForPartner(false);
      setPartnerReady(false);
      const myData = data[playerName];
      if (!myData) return;
      setDualRounds((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.waiting) {
          next[next.length - 1] = { own: myData.own, partnerResult: myData.other.result };
        } else {
          next.push({ own: myData.own, partnerResult: myData.other.result });
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

    socket.on("gameOver", ({ status, winner: w, word, rewards: r }: {
      status: GameStatus; winner?: string; word: string; rewards?: RewardInfo;
    }) => {
      setGameStatus(status);
      setWinner(w ?? null);
      setRevealWord(word);
      setRewards(r ?? null);
      if (r?.teamTotal) setTeamTotal((prev) => ({ ...prev, intelligence: r.teamTotal.intelligence, coins: r.teamTotal.coins }));
    });

    socket.on("newRound", () => {
      setSharedRounds([]);
      setDualRounds([]);
      setGameStatus("playing");
      setWinner(null);
      setRevealWord(null);
      setRewards(null);
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
    socketRef.current.emit("joinRoom", { gameId: id, player: playerName, mode: modeInput });
  }, [roomInput, modeInput, playerName]);

  const leaveRoom = useCallback(() => {
    setInRoom(false);
    setSharedRounds([]);
    setDualRounds([]);
    setChatMessages([]);
    setWaitingForPartner(false);
    setPartnerReady(false);
    setRewards(null);
    setGameStatus("playing");
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
          <input
            style={{ ...s.input, width: "100%", maxWidth: 340, marginBottom: 12 }}
            value={roomInput}
            placeholder="Room name (share to invite friends)"
            onChange={(e) => setRoomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            data-testid="input-room"
            autoFocus
          />
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
          <p style={{ color: "#3a3a3c", fontSize: 12, marginTop: 12 }}>
            Share the room name with your partner to play together
          </p>
        </div>
      </div>
    );
  }

  // ─── Game ────────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {gameStatus !== "playing" && (
        <RewardScreen
          status={gameStatus}
          winner={winner}
          revealWord={revealWord}
          rewards={rewards}
          playerName={playerName}
          onLeave={leaveRoom}
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

          <div style={{ ...s.inputRow, marginTop: 20 }}>
            <input
              style={{ ...s.input, flex: 1, minWidth: 0, opacity: isInputDisabled ? 0.5 : 1 }}
              value={currentGuess}
              maxLength={COLS}
              placeholder={isInputDisabled ? (waitingForPartner ? "Waiting for partner..." : "Game over") : "5-letter word..."}
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
