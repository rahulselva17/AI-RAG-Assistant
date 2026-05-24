import express from "express";
import cors from "cors";
import pool from "./db";
import documentRoutes from "./routes/documentRoute";
import supportRoutes from "./routes/supportRoutes";
import chatRoutes from "./routes/chatRoutes";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/docs", documentRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/chat", chatRoutes);


app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "AI RAG Assistant backend is running",
  });
});

app.get("/test-db", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Database query failed",
    });
  }
});

export default app;

