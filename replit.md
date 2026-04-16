# Co-Ordle Workspace

## Overview

pnpm workspace monorepo using TypeScript. A real-time multiplayer Wordle-style game called **Co-Ordle**.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Backend**: Express 5 + Socket.IO (real-time multiplayer)
- **Frontend**: React + Vite + Wouter (routing)
- **Database**: PostgreSQL (raw `pg` pool, no ORM)
- **Build**: esbuild

## Artifacts

| Artifact | Kind | Preview Path | Port |
|---|---|---|---|
| `artifacts/api-server` | api | `/api`, `/socket.io` | 8080 |
| `artifacts/web-app` | web | `/` | 22965 |
| `artifacts/mockup-sandbox` | design | `/__mockup` | 8081 |

## Game Features

- **Shared Mode**: all players see every guess
- **Dual Brain Mode**: each player sees only their partner's color clues (no partner word)
- **Token/reward system**: intelligence points, coins, streaks, bonuses
- **On-screen keyboard**
- **Win/loss celebration screen** (RewardScreen overlay)
- **Persistent player identity** (UUID in localStorage, display name editable)
- **Per-player stats** (games played, wins, win rate, streaks, intelligence, coins) — backed by PostgreSQL `players` table
- **Per-team session stats** (aggregate for a player pair) — backed by PostgreSQL `team_sessions` table

## Database Tables

### `players`
| Column | Type | Notes |
|---|---|---|
| id | text (UUID) | Primary key, set by client |
| display_name | text | |
| intelligence | integer | Career total |
| coins | integer | Career total |
| games_played | integer | |
| games_won | integer | |
| current_streak | integer | Consecutive days |
| best_streak | integer | |
| last_played | date | |
| created_at | timestamptz | |

### `team_sessions`
| Column | Type | Notes |
|---|---|---|
| id | serial | PK |
| player1_id | text | FK → players.id (sorted lower UUID) |
| player2_id | text | FK → players.id (sorted higher UUID) |
| games_played | integer | |
| games_won | integer | |
| intelligence_earned | integer | |
| coins_earned | integer | |
| last_played | timestamptz | |

## Key Files

- `artifacts/api-server/src/index.ts` — Socket.IO game engine + Express server
- `artifacts/api-server/src/db.ts` — DB helpers (upsertPlayer, updatePlayerStats, upsertTeamSession, getTeamSession)
- `artifacts/api-server/src/routes/players.ts` — REST `GET /api/players/:playerId`
- `artifacts/api-server/src/game/wordEngine.ts` — word validation + guess evaluation
- `artifacts/web-app/src/pages/game.tsx` — main game UI (lobby, board, keyboard, RewardScreen)
- `artifacts/web-app/src/App.tsx` — Wouter router (/ and /game both serve Game)

## Socket Events

**Client → Server**
- `joinRoom { gameId, player, playerId, mode }` — join/create a room
- `guess { gameId, playerId, guess }` — submit a guess
- `chatMessage { gameId, player, text }` — send chat

**Server → Client**
- `gameState { mode, rounds, status, winner, players, teamTotal, playerStats }` — full state on join
- `update { rounds }` — shared mode round update
- `roundResult { own, other }` — dual mode round result (per-player)
- `playerSubmitted { playerId }` — partner submitted (dual mode)
- `gameOver { status, winner, word, rewards, playerStats, partnerStats, teamStats }` — end of round
- `newRound { mode }` — new round started
- `playerJoined / playerLeft / playerTyping / wordAlreadyUsed / chatMessage`

## localStorage Keys

- `coOrdle_playerId` — UUID, generated once per device
- `coOrdle_playerName` — display name, set by player in lobby

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/web-app run dev` — run web app

## GitHub

https://github.com/KenPerna/co-ordle
