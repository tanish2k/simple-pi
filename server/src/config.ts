function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  supabaseUrl: process.env.SUPABASE_URL || "https://mmtcnirfbvdvbmhwkjgd.supabase.co",
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  supermemoryApiKey: requireEnv("SUPERMEMORY_API_KEY"),
  composioApiKey: process.env.COMPOSIO_API_KEY || "",
  port: parseInt(process.env.PORT || "3001", 10),
};
