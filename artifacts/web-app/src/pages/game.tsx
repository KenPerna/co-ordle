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
      transition: "background 0.2s",
    }}>
      {letter ?? ""}
    </div>
  );
}

function Board({ rounds, maxRows = ROWS, cols = COLS, showLetters = true, tileSize = 52 }: {
  rounds: { letters: string[]; colors: TileColor[] }[];
  maxRows?: number; cols?: number; showLetters?: boolean; tileSize?: number;
}) {
  const empty = Array(cols).fill(null).map((_, i) => ({ letters: [], colors: [] }));
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

export default function Game() {
  const [playerName] = useState(() => `Player${Math.floor(Math.random() * 900 + 100)}`);
  const [roomInput, setRoomInput] = useState("");
  const [modeInput, setModeInput] = useState<GameMode>("shared");
  const [inRoom, setInRoom] = useState(false);
  const [gameId, setGameId] = useState("");
  const [gameMode, setGameMode] = useState<GameMode>("shared");
  const [players, setPlayers] = useState<string[]>([]);

  const [sharedRounds, setSharedRounds] = useState<SharedRound[]>([]);
  const [dualRounds, setDualRounds] = useState<DualViewRound[]>([]);
  const [waitingForPartner, setWaitingForPartner] = useState(false);
  const [partnerReady, setPartnerReady] = useState(false);

  const [gameStatus, setGameStatus] = useState<GameStatus>("playing");
  const [winner, setWinner] = useState<string | null>(null);
  const [revealWord, setRevealWord] = useState<string | null>(null);

  const [currentGuess, setCurrentGuess] = useState("");
  const [wordError, setWordError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [typingPlayers, setTypingPlayers] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addSystem = (text: string) =>
    setChatMessages((prev) => [...prev, { player: "System", text, system: true }]);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("gameState", ({ mode, rounds, status, winner: w, players: ps }: any) => {
      setGameMode(mode);
      setPlayers(ps ?? []);
      setGameStatus(status ?? "playing");
      setWinner(w ?? null);
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
      setWordError(`"${guess}" was already guessed this round`);
      setTimeout(() => setWordError(null), 3000);
    });

    socket.on("gameOver", ({ status, winner: w, word }: { status: GameStatus; winner?: string; word: string }) => {
      setGameStatus(status);
      setWinner(w ?? null);
      setRevealWord(word);
    });

    socket.on("newRound", () => {
      setSharedRounds([]);
      setDualRounds([]);
      setGameStatus("playing");
      setWinner(null);
      setRevealWord(null);
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
    socketRef.current.emit("joinRoom", { gameId: id, player: playerName, mode: modeInput });
  }, [roomInput, modeInput, playerName]);

  const leaveRoom = useCallback(() => {
    setInRoom(false);
    setSharedRounds([]);
    setDualRounds([]);
    setChatMessages([]);
    setWaitingForPartner(false);
    setPartnerReady(false);
  }, []);

  const submitGuess = useCallback(() => {
    const guess = currentGuess.trim().toLowerCase();
    if (guess.length !== COLS || !socketRef.current || gameStatus !== "playing") return;
    if (gameMode === "dual" && waitingForPartner) return;

    if (gameMode === "dual") {
      setDualRounds((prev) => [...prev, {
        own: { word: guess, result: [] },
        waiting: true,
      }]);
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

  const sharedBoardRows = sharedRounds.map((r) => ({
    letters: r.guess.split(""),
    colors: r.result as TileColor[],
  }));

  const myBoardRows = dualRounds.map((r) => ({
    letters: r.own ? r.own.word.split("") : [],
    colors: (r.own?.result ?? []) as TileColor[],
  }));

  const partnerBoardRows = dualRounds.map((r) => ({
    letters: [],
    colors: (r.partnerResult ?? []) as TileColor[],
  }));

  const guessCount = gameMode === "shared" ? sharedRounds.length : dualRounds.length;
  const isInputDisabled = gameStatus !== "playing" || (gameMode === "dual" && waitingForPartner);

  let statusText = "Guess the 5-letter word!";
  if (gameMode === "dual" && waitingForPartner) statusText = "Waiting for partner...";
  else if (gameMode === "dual" && partnerReady && !waitingForPartner) statusText = "Partner is ready — make your guess!";
  else if (guessCount > 0) statusText = `${ROWS - guessCount} guess${ROWS - guessCount === 1 ? "" : "es"} remaining`;

  if (!inRoom) {
    return (
      <div style={s.page}>
        <style>{`@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.04);opacity:.85}}`}</style>
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

  return (
    <div style={s.page}>
      <style>{`@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.8}} @keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {gameStatus !== "playing" && (
        <div style={s.overlay}>
          <div style={{ animation: "pulse 1s ease-in-out infinite", textAlign: "center" }}>
            {gameStatus === "won" ? (
              <>
                <div style={{ fontSize: 52, fontWeight: 900, color: "#538d4e", letterSpacing: 4 }}>
                  {winner === playerName ? "YOU WON!" : `${winner} WON!`}
                </div>
                <div style={{ fontSize: 20, color: "#ccc", marginTop: 8 }}>
                  {winner === playerName ? "Brilliant guess!" : "Better luck next round."}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 52, fontWeight: 900, color: "#b59f3b", letterSpacing: 4 }}>GAME OVER</div>
                <div style={{ fontSize: 20, color: "#ccc", marginTop: 8 }}>
                  The word was <strong style={{ color: "#fff" }}>{revealWord}</strong>
                </div>
              </>
            )}
            <div style={{ fontSize: 14, color: "#818384", marginTop: 16 }}>Next round starting soon...</div>
          </div>
        </div>
      )}

      <header style={s.header}>
        <h1 style={s.title}>Co-Ordle</h1>
        <span style={{ ...s.dot, background: connected ? "#538d4e" : "#3a3a3c" }} />
        <span style={{ ...s.roomTag, userSelect: "all", cursor: "text" }} title="Tap to copy room name">{gameId}</span>
        <span style={{ fontSize: 12, color: "#818384", marginLeft: 8 }}>
          {gameMode === "dual" ? "DUAL BRAIN" : "SHARED"}
        </span>
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
            {players.length > 0 && (
              <div style={{ display: "flex", gap: 6 }}>
                {players.map((p) => (
                  <span key={p} style={{ fontSize: 11, color: playerColor(p), fontWeight: 700 }}>{p}</span>
                ))}
              </div>
            )}
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
  header: { display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: "1px solid #2a2a2c", flexWrap: "wrap" },
  title: { margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase" },
  dot: { width: 9, height: 9, borderRadius: "50%", display: "inline-block", flexShrink: 0 },
  roomTag: { fontSize: 14, color: "#538d4e", fontWeight: 700 },
  leaveBtn: { marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "1px solid #3a3a3c", background: "transparent", color: "#818384", fontSize: 13, cursor: "pointer" },
  playerTag: { fontSize: 13, fontWeight: 700 },
  lobby: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 0 },
  lobbyTitle: { margin: "0 0 24px", fontSize: 26, fontWeight: 800 },
  main: { display: "flex", flex: 1, gap: 24, padding: 16, flexWrap: "wrap" },
  gameSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1, minWidth: 280 },
  statusText: { fontSize: 14, color: "#818384", margin: 0, textAlign: "center" },
  boardLabel: { fontSize: 12, color: "#818384", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px", textAlign: "center" },
  inputRow: { display: "flex", gap: 8, width: "100%", maxWidth: 360 },
  input: { padding: "13px 14px", borderRadius: 10, border: "1px solid #3a3a3c", background: "#1a1a1b", color: "#fff", fontSize: 16, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const },
  btn: { padding: "13px 20px", borderRadius: 10, border: "none", background: "#538d4e", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", whiteSpace: "nowrap" },
  chatSection: { display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 260, maxWidth: 380 },
  chatTitle: { margin: 0, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#818384" },
  chatBox: { flex: 1, minHeight: 260, maxHeight: 420, overflowY: "auto", background: "#1a1a1b", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 5, border: "1px solid #2a2a2c" },
  chatMsg: { fontSize: 14, lineHeight: 1.5, wordBreak: "break-word" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  wordError: { background: "#3a1a1a", border: "1px solid #b59f3b", color: "#b59f3b", borderRadius: 8, padding: "8px 14px", fontSize: 13, animation: "fadeIn 0.2s ease" },
};
