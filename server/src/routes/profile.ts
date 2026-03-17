import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

const router = Router();

// Shared Supabase admin client (service role key for DB access)
const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

/**
 * GET / - Get the authenticated user's profile from Supabase
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("name, role, personality, goals")
      .eq("id", user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      console.error("Profile fetch error:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
      return;
    }

    res.json(data);
  } catch (err) {
    console.error("Profile GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST / - Create or update profile (upsert)
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { name, role, personality, goals } = req.body as {
    name?: string;
    role?: string;
    personality?: string;
    goals?: string;
  };

  if (!name || !role || !goals) {
    res.status(400).json({ error: "Missing required fields: name, role, goals" });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          name,
          role,
          personality: personality || "Friendly and helpful",
          goals,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("name, role, personality, goals")
      .single();

    if (error) {
      console.error("Profile upsert error:", error);
      res.status(500).json({ error: "Failed to save profile" });
      return;
    }

    res.json(data);
  } catch (err) {
    console.error("Profile POST error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE / - Delete profile
 */
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const { error } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (error) {
      console.error("Profile delete error:", error);
      res.status(500).json({ error: "Failed to delete profile" });
      return;
    }

    res.json({ status: "deleted" });
  } catch (err) {
    console.error("Profile DELETE error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
