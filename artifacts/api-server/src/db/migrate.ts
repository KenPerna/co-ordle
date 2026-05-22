import { pool } from "../db";
import { logger } from "../lib/logger";

async function migrate() {
  logger.info("Running migrations...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id               TEXT PRIMARY KEY,
      display_name     TEXT NOT NULL,
      intelligence     INTEGER NOT NULL DEFAULT 0,
      coins            INTEGER NOT NULL DEFAULT 0,
      games_played     INTEGER NOT NULL DEFAULT 0,
      games_won        INTEGER NOT NULL DEFAULT 0,
      current_streak   INTEGER NOT NULL DEFAULT 0,
      best_streak      INTEGER NOT NULL DEFAULT 0,
      last_played      DATE
    );

    CREATE TABLE IF NOT EXISTS team_sessions (
      id                  SERIAL PRIMARY KEY,
      player1_id          TEXT NOT NULL REFERENCES players(id),
      player2_id          TEXT NOT NULL REFERENCES players(id),
      games_played        INTEGER NOT NULL DEFAULT 0,
      games_won           INTEGER NOT NULL DEFAULT 0,
      intelligence_earned INTEGER NOT NULL DEFAULT 0,
      coins_earned        INTEGER NOT NULL DEFAULT 0,
      last_played         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (player1_id, player2_id)
    );
  `);
  logger.info("Migrations complete.");
  await pool.end();
}

migrate().catch((err) => {
  logger.error({ err }, "Migration failed");
  process.exit(1);
});
