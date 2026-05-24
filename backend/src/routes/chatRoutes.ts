import express from "express";
import pool from "../db";

const router = express.Router();

router.post("/session", async (req, res) => {
  try {
    const { title } = req.body;

    const result = await pool.query(
      "INSERT INTO chat_sessions (title) VALUES ($1) RETURNING *",
      [title || "New Support Chat"]
    );

    res.json({
      success: true,
      session: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "Failed to create chat session",
    });
  }
});

router.get("/session/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
      [id]
    );

    res.json({
      success: true,
      messages: result.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch messages",
    });
  }
});

export default router;