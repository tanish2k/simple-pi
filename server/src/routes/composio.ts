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
 *
 * Body: { toolkit: "gmail" | "googlecalendar" | "googledrive" | "salesforce" }
 * Response: { redirectUrl: string }
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
      // Build the callback URL for Composio to redirect to after OAuth.
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const callbackUrl = `${protocol}://${host}/api/composio/callback`;

      const result = await initiateConnection(
        user.id,
        toolkit,
        callbackUrl
      );

      res.json({ redirectUrl: result.redirectUrl });
    } catch (err: any) {
      console.error("Composio connect error:", err);
      res.status(500).json({
        error: err.message || "Failed to initiate connection",
      });
    }
  }
);

/**
 * GET /connections — List active Composio connections for the authenticated user.
 *
 * Response: { connections: [...] }
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
      res.json({ connections });
    } catch (err: any) {
      console.error("Composio connections error:", err);
      res.status(500).json({
        error: err.message || "Failed to list connections",
      });
    }
  }
);

/**
 * GET /callback — OAuth callback endpoint.
 *
 * Composio redirects the user here after OAuth completes.
 * Query params typically include: status, connected_account_id
 *
 * Redirects the user to the frontend with a status indicator.
 */
router.get(
  "/callback",
  async (req: Request, res: Response): Promise<void> => {
    const { status, connected_account_id } = req.query as {
      status?: string;
      connected_account_id?: string;
    };

    // Determine the frontend origin for the redirect.
    const frontendOrigin =
      process.env.FRONTEND_URL || "http://localhost:5173";

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (connected_account_id)
      params.set("connected_account_id", connected_account_id);

    res.redirect(`${frontendOrigin}/integrations?${params.toString()}`);
  }
);

export default router;
