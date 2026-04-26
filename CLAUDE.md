# Co-Ordle
Multiplayer co-op Wordle. pnpm monorepo.
- Backend: Express + Socket.IO — artifacts/api-server/src/index.ts
- Frontend: React/Vite — artifacts/web-app/src/pages/game.tsx
- DB: PostgreSQL (players, team_sessions tables)
- Game modes: shared, dual brain
- Word engine: artifacts/api-server/src/game/wordEngine.ts