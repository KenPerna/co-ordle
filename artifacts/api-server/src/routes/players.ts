import { Router } from "express";
import { upsertPlayer, getPlayer } from "../db";

const router = Router();

// GET /api/players/:playerId — fetch a player's stats (creates if new)
router.get("/players/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const displayName = (req.query["name"] as string | undefined)?.trim();

  if (!playerId || playerId.length < 8) {
    return res.status(400).json({ error: "Invalid playerId" });
  }

  try {
    if (displayName) await upsertPlayer(playerId, displayName);
    const row = await getPlayer(playerId);
    if (!row) return res.json(null);

    return res.json({
      displayName: row.display_name,
      intelligence: row.intelligence,
      coins: row.coins,
      gamesPlayed: row.games_played,
      gamesWon: row.games_won,
      winRate: row.games_played > 0 ? Math.round((row.games_won / row.games_played) * 100) : 0,
      currentStreak: row.current_streak,
      bestStreak: row.best_streak,
    });
  } catch (e) {
    return res.status(500).json({ error: "DB error" });
  }
});

export default router;
