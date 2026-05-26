import dotenv from "dotenv";
import app from "./app";
import { connectDB } from "./db";
import { connectRedis } from "./services/cache/redisService";

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  await connectRedis();

  connectDB();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();