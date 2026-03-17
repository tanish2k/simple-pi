import { Router } from "express";
import type { Request, Response } from "express";
import {
  initiateConnection,
  getActiveConnections,
} from "../tools/composio.js";

const router = Router();

const VALID_TOOLKITS = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "salesforce",
] as const;

type Toolkit = (typeof VALID_TOOLKITS)[number];

function isValidToolkit(value: unknown): value is Toolkit {
  return (
    typeof value === "string" &&
    VALID_TOOLKITS.includes(value as Toolkit)
  );
}

/**
 * POST /connect — Initiate an OAuth connection for a toolkit.
 */
router.post(
  "/connect",
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { toolkit } = req.body as { toolkit?: string };

    if (!toolkit || !isValidToolkit(toolkit)) {
      res.status(400).json({
        error: `Invalid or missing toolkit. Must be one of: ${VALID_TOOLKITS.join(", ")}`,
      });
      return;
    }

    try {
      const callbackUrl =
        process.env.COMPOSIO_CALLBACK_URL ||
        (() => {
          const protocol =
            req.headers["x-forwarded-proto"] ||
            (req.secure ? "https" : "http");
          const host = req.headers["x-forwarded-host"] || req.headers.host;
          return `${protocol}://${host}/api/composio/callback`;
        })();

      console.log(`Composio connect: toolkit=${toolkit}, callback=${callbackUrl}`);

      const result = await initiateConnection(user.id, toolkit, callbackUrl);

      console.log(`Composio connect result: redirectUrl=${result.redirectUrl}`);
      res.json({ redirectUrl: result.redirectUrl });
    } catch (err: any) {
      console.error("Composio connect error:", err.message || err);
      res.status(500).json({
        error: err.message || "Failed to initiate connection",
      });
    }
  }
);

/**
 * GET /connections — List active Composio connections for the authenticated user.
 */
router.get(
  "/connections",
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const connections = await getActiveConnections(user.id);
      console.log(`Composio connections for ${user.id}: ${connections.length} active`);
      res.json({ connections });
    } catch (err: any) {
      console.error("Composio connections error:", err.message || err);
      res.status(500).json({
        error: err.message || "Failed to list connections",
      });
    }
  }
);

/**
 * Standalone callback handler (mounted directly, NOT through the router,
 * so it runs BEFORE the auth middleware).
 *
 * Composio redirects the browser here after OAuth.
 * Query params: status, connectedAccountId, appName
 */
export async function callbackHandler(
  req: Request,
  res: Response
): Promise<void> {
  const { status, connectedAccountId, appName } = req.query as {
    status?: string;
    connectedAccountId?: string;
    appName?: string;
  };

  console.log(
    `Composio callback: status=${status}, connectedAccountId=${connectedAccountId}, appName=${appName}`
  );

  const frontendOrigin =
    process.env.FRONTEND_URL || "http://localhost:5173";

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (connectedAccountId) params.set("connected_account_id", connectedAccountId);
  if (appName) params.set("app", appName);

  res.redirect(`${frontendOrigin}/integrations?${params.toString()}`);
}

export default router;
