import { Pool } from "pg";
import { logger } from "./lib/logger";

export const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });

// ─── Player ────────────────────────────────────────────────────────────────────

export async function upsertPlayer(id: string, displayName: string): Promise<void> {
  await pool.query(
    `INSERT INTO players (id, display_name)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE
       SET display_name = EXCLUDED.display_name`,
    [id, displayName]
  );
}

export interface PlayerRow {
  id: string;
  display_name: string;
  intelligence: number;
  coins: number;
  games_played: number;
  games_won: number;
  current_streak: number;
  best_streak: number;
  last_played: string | null;
}

export async function getPlayer(id: string): Promise<PlayerRow | null> {
  const { rows } = await pool.query<PlayerRow>(
    "SELECT * FROM players WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

export async function updatePlayerStats(
  id: string,
  intelligence: number,
  coins: number,
  won: boolean
): Promise<PlayerRow | null> {
  const today = new Date().toISOString().split("T")[0]!;
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0]!;

  // Streak logic: increment if played yesterday, reset to 1 if gap, keep if same day
  const { rows } = await pool.query<PlayerRow>(
    `UPDATE players SET
       intelligence   = intelligence + $2,
       coins          = coins + $3,
       games_played   = games_played + 1,
       games_won      = games_won + $4,
       current_streak = CASE
         WHEN last_played = $6 THEN current_streak          -- already counted today
         WHEN last_played = $7 THEN current_streak + 1      -- consecutive day
         ELSE 1                                              -- gap or first play
       END,
       best_streak    = GREATEST(best_streak,
         CASE
           WHEN last_played = $6 THEN current_streak
           WHEN last_played = $7 THEN current_streak + 1
           ELSE 1
         END),
       last_played    = $5
     WHERE id = $1
     RETURNING *`,
    [id, intelligence, coins, won ? 1 : 0, today, today, yesterday]
  );
  return rows[0] ?? null;
}

// ─── Team session ───────────────────────────────────────────────────────────────

export interface TeamSessionRow {
  id: number;
  player1_id: string;
  player2_id: string;
  games_played: number;
  games_won: number;
  intelligence_earned: number;
  coins_earned: number;
  last_played: string;
}

export async function upsertTeamSession(
  pAId: string,
  pBId: string,
  intelligence: number,
  coins: number,
  won: boolean
): Promise<TeamSessionRow | null> {
  const [p1, p2] = [pAId, pBId].sort();
  const { rows } = await pool.query<TeamSessionRow>(
    `INSERT INTO team_sessions (player1_id, player2_id, games_played, games_won, intelligence_earned, coins_earned)
     VALUES ($1, $2, 1, $3, $4, $5)
     ON CONFLICT (player1_id, player2_id) DO UPDATE SET
       games_played        = team_sessions.games_played + 1,
       games_won           = team_sessions.games_won + $3,
       intelligence_earned = team_sessions.intelligence_earned + $4,
       coins_earned        = team_sessions.coins_earned + $5,
       last_played         = NOW()
     RETURNING *`,
    [p1, p2, won ? 1 : 0, intelligence, coins]
  );
  return rows[0] ?? null;
}

export async function getTeamSession(
  pAId: string,
  pBId: string
): Promise<TeamSessionRow | null> {
  const [p1, p2] = [pAId, pBId].sort();
  const { rows } = await pool.query<TeamSessionRow>(
    "SELECT * FROM team_sessions WHERE player1_id = $1 AND player2_id = $2",
    [p1, p2]
  );
  return rows[0] ?? null;
}

pool.on("error", (err: Error) => logger.error({ err }, "DB pool error"));
