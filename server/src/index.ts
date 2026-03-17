import "dotenv/config";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { authMiddleware } from "./auth.js";
import chatRoutes from "./routes/chat.js";
import profileRoutes from "./routes/profile.js";
import composioRoutes, { callbackHandler } from "./routes/composio.js";

const app = express();

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://ai-sdr.plumhq.com",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// JSON body parser
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Health check (no auth required)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Composio OAuth callback – no auth required (browser redirect from Composio)
app.get("/api/composio/callback", callbackHandler);

// Authenticated API routes
app.use("/api", authMiddleware);
app.use("/api/chat", chatRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/composio", composioRoutes);

// Global error handler
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

app.listen(config.port, () => {
  console.log(`Simple Pi server running on port ${config.port}`);
  console.log(`Health check: http://localhost:${config.port}/health`);
});

export default app;
