import { Router } from "express";
import type { Request, Response } from "express";
import type { Agent } from "@mariozechner/pi-agent-core";
import { createAgentForUser } from "../agent.js";
import type { UserProfile } from "../agent.js";

const router = Router();

// Cache agents per user to maintain conversation state
const agentCache = new Map<string, Agent>();

function getOrCreateAgent(
  userId: string,
  profile: UserProfile
): Agent {
  const existing = agentCache.get(userId);
  if (existing) return existing;

  const agent = createAgentForUser(userId, profile);
  agentCache.set(userId, agent);
  return agent;
}

/**
 * POST / - Main chat endpoint with SSE streaming
 *
 * Request body: { message: string, profile: { name, role, personality, goals } }
 * Response: SSE stream of agent events
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { message, profile } = req.body as {
    message?: string;
    profile?: UserProfile;
  };

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing or invalid 'message' field" });
    return;
  }

  if (!profile || !profile.name || !profile.role) {
    res.status(400).json({ error: "Missing or invalid 'profile' field" });
    return;
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const agent = getOrCreateAgent(user.id, profile);

  // Track whether the response has ended
  let ended = false;

  function sendEvent(event: any): void {
    if (ended) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // Client may have disconnected
      ended = true;
    }
  }

  // Subscribe to agent events and forward them as SSE
  const unsubscribe = agent.subscribe((event: any) => {
    sendEvent(event);

    if (event.type === "agent_end" || event.type === "error") {
      ended = true;
      unsubscribe();
      res.end();
    }
  });

  // Handle client disconnect
  req.on("close", () => {
    if (!ended) {
      ended = true;
      unsubscribe();
      try {
        agent.abort();
      } catch {
        // Agent may not be running
      }
    }
  });

  try {
    await agent.prompt(message);
  } catch (err: any) {
    if (!ended) {
      sendEvent({
        type: "error",
        error: err.message || "Agent execution failed",
      });
      ended = true;
      unsubscribe();
      res.end();
    }
  }
});

/**
 * POST /abort - Abort the current agent execution
 */
router.post("/abort", async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const agent = agentCache.get(user.id);
  if (!agent) {
    res.status(404).json({ error: "No active agent session" });
    return;
  }

  try {
    agent.abort();
    res.json({ status: "aborted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to abort agent" });
  }
});

/**
 * DELETE /session - Clear agent session for the user
 */
router.delete("/session", async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  agentCache.delete(user.id);
  res.json({ status: "session_cleared" });
});

export default router;
