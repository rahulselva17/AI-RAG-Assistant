import dotenv from "dotenv";
import app from "./app";
import { connectDB } from "./db";

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;

connectDB();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});