import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const ROWS = 6;
const COLS = 5;

type TileColor = "green" | "yellow" | "gray" | "empty";

interface GuessRow {
  guess: string;
  result: TileColor[];
  player: string;
  won?: boolean;
}

interface ChatMessage {
  player: string;
  text: string;
}

const TILE_COLORS: Record<TileColor, string> = {
  green: "#538d4e",
  yellow: "#b59f3b",
  gray: "#3a3a3c",
  empty: "#121213",
};

export default function Game() {
  const [playerName] = useState(() => `Player${Math.floor(Math.random() * 1000)}`);
  const [gameId, setGameId] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [inRoom, setInRoom] = useState(false);

  const [guesses, setGuesses] = useState<GuessRow[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [status, setStatus] = useState<string>("Guess the 5-letter word!");
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("gameState", (data: { guesses: GuessRow[] }) => {
      setGuesses(data.guesses ?? []);
    });

    socket.on("guessUpdate", (data: GuessRow) => {
      setGuesses((prev) => [...prev, data]);
    });

    socket.on("playerJoined", ({ player }: { player: string }) => {
      setChatMessages((prev) => [...prev, { player: "System", text: `${player} joined the room` }]);
    });

    socket.on("gameOver", ({ winner, word }: { winner: string; word: string }) => {
      setStatus(`${winner} won! The word was "${word.toUpperCase()}"`);
    });

    socket.on("newRound", () => {
      setGuesses([]);
      setStatus("New round! Guess the 5-letter word.");
    });

    socket.on("chatMessage", (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  function joinRoom() {
    const id = roomInput.trim();
    if (!id || !socketRef.current) return;
    setGameId(id);
    setInRoom(true);
    setGuesses([]);
    setChatMessages([]);
    setStatus("Guess the 5-letter word!");
    socketRef.current.emit("joinRoom", { gameId: id, player: playerName });
  }

  function submitGuess() {
    const guess = currentGuess.trim().toLowerCase();
    if (guess.length !== COLS || !socketRef.current) return;
    socketRef.current.emit("guess", { guess, player: playerName });
    setCurrentGuess("");
  }

  function sendChat() {
    const text = chatInput.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit("chat", { player: playerName, text });
    setChatInput("");
  }

  const displayRows: (GuessRow | null)[] = [
    ...guesses.slice(-ROWS),
    ...Array(Math.max(0, ROWS - guesses.length)).fill(null),
  ];

  if (!inRoom) {
    return (
      <div style={styles.page}>
        <header style={styles.header}>
          <h1 style={styles.title}>Wordle Live</h1>
          <span style={{ ...styles.dot, background: connected ? "#538d4e" : "#3a3a3c" }} />
          <span style={styles.playerTag}>{playerName}</span>
        </header>
        <div style={styles.lobby}>
          <h2 style={styles.lobbyTitle}>Join a Game Room</h2>
          <p style={styles.lobbySubtitle}>Enter a room name to start or join an existing game</p>
          <div style={styles.inputRow}>
            <input
              style={{ ...styles.input, flex: 1 }}
              value={roomInput}
              placeholder="e.g. room1, friends, office"
              onChange={(e) => setRoomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              data-testid="input-room"
              autoFocus
            />
            <button
              style={styles.button}
              onClick={joinRoom}
              data-testid="button-join"
            >
              Join
            </button>
          </div>
          <p style={styles.lobbyHint}>Share the room name with friends so they can join the same game</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Wordle Live</h1>
        <span style={{ ...styles.dot, background: connected ? "#538d4e" : "#3a3a3c" }} />
        <span style={styles.roomTag} title="Room name — copy to invite friends">{gameId}</span>
        <button style={styles.leaveBtn} onClick={() => setInRoom(false)} data-testid="button-leave">
          Leave
        </button>
        <span style={styles.playerTag}>{playerName}</span>
      </header>

      <div style={styles.main}>
        <section style={styles.gridSection}>
          <p style={styles.status}>{status}</p>
          <div style={styles.grid}>
            {displayRows.map((row, ri) =>
              Array.from({ length: COLS }).map((_, ci) => {
                const letter = row ? row.guess[ci]?.toUpperCase() ?? "" : "";
                const color: TileColor = row ? (row.result[ci] as TileColor) : "empty";
                return (
                  <div
                    key={`${ri}-${ci}`}
                    style={{ ...styles.tile, background: TILE_COLORS[color] }}
                  >
                    {letter}
                  </div>
                );
              })
            )}
          </div>

          <div style={styles.inputRow}>
            <input
              style={styles.input}
              value={currentGuess}
              maxLength={COLS}
              placeholder="Type a 5-letter word..."
              onChange={(e) => setCurrentGuess(e.target.value.toLowerCase())}
              onKeyDown={(e) => e.key === "Enter" && submitGuess()}
              data-testid="input-guess"
            />
            <button style={styles.button} onClick={submitGuess} data-testid="button-guess">
              Guess
            </button>
          </div>
        </section>

        <section style={styles.chatSection}>
          <h2 style={styles.chatTitle}>Chat — {gameId}</h2>
          <div style={styles.chatMessages}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={styles.chatMsg}>
                <span style={{
                  ...styles.chatPlayer,
                  color: msg.player === "System" ? "#818384" : "#538d4e",
                  fontStyle: msg.player === "System" ? "italic" : "normal",
                }}>
                  {msg.player}:{" "}
                </span>
                <span>{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div style={styles.inputRow}>
            <input
              style={styles.input}
              value={chatInput}
              placeholder="Say something..."
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              data-testid="input-chat"
            />
            <button style={styles.button} onClick={sendChat} data-testid="button-chat">
              Send
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#121213",
    color: "#ffffff",
    fontFamily: "'Segoe UI', sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "16px 24px",
    borderBottom: "1px solid #3a3a3c",
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    display: "inline-block",
  },
  roomTag: {
    fontSize: 14,
    color: "#538d4e",
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: "text",
    userSelect: "all",
  },
  leaveBtn: {
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid #3a3a3c",
    background: "transparent",
    color: "#818384",
    fontSize: 12,
    cursor: "pointer",
  },
  playerTag: {
    fontSize: 13,
    color: "#818384",
    marginLeft: "auto",
  },
  lobby: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 16,
    padding: 32,
  },
  lobbyTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
  },
  lobbySubtitle: {
    margin: 0,
    color: "#818384",
    fontSize: 14,
  },
  lobbyHint: {
    margin: 0,
    color: "#3a3a3c",
    fontSize: 12,
    textAlign: "center",
  },
  main: {
    display: "flex",
    flex: 1,
    gap: 32,
    padding: 24,
    flexWrap: "wrap",
  },
  gridSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    flex: 1,
    minWidth: 280,
  },
  status: {
    fontSize: 14,
    color: "#818384",
    margin: 0,
    textAlign: "center",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: `repeat(${COLS}, 56px)`,
    gap: 6,
  },
  tile: {
    width: 56,
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    fontWeight: 700,
    border: "2px solid #3a3a3c",
    borderRadius: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  inputRow: {
    display: "flex",
    gap: 8,
    width: "100%",
    maxWidth: 340,
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 6,
    border: "1px solid #3a3a3c",
    background: "#1a1a1b",
    color: "#fff",
    fontSize: 15,
    outline: "none",
  },
  button: {
    padding: "10px 18px",
    borderRadius: 6,
    border: "none",
    background: "#538d4e",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  chatSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    flex: 1,
    minWidth: 260,
    maxWidth: 360,
  },
  chatTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#818384",
  },
  chatMessages: {
    flex: 1,
    minHeight: 300,
    maxHeight: 400,
    overflowY: "auto",
    background: "#1a1a1b",
    borderRadius: 8,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    border: "1px solid #3a3a3c",
  },
  chatMsg: {
    fontSize: 14,
    lineHeight: 1.4,
    wordBreak: "break-word",
  },
  chatPlayer: {
    fontWeight: 700,
  },
};
