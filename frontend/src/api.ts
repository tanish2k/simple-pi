const BASE_URL =
  (import.meta.env.VITE_API_URL as string) || "http://localhost:3001";

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Send a chat message and stream SSE events back.
 * Each parsed event is passed to `onEvent`.
 */
export async function sendMessage(
  token: string,
  message: string,
  onEvent: (event: any) => void
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat request failed (${res.status}): ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE lines
    const lines = buffer.split("\n");
    // Keep the last (possibly incomplete) line in the buffer
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("data: ")) {
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") {
          return;
        }
        try {
          const parsed = JSON.parse(dataStr);
          onEvent(parsed);
        } catch {
          // Skip unparseable lines
          console.warn("Could not parse SSE data:", dataStr);
        }
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith("data: ")) {
      const dataStr = trimmed.slice(6);
      if (dataStr !== "[DONE]") {
        try {
          const parsed = JSON.parse(dataStr);
          onEvent(parsed);
        } catch {
          // Skip
        }
      }
    }
  }
}

/**
 * Abort the current chat stream.
 */
export async function abortChat(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat/abort`, {
    method: "POST",
    headers: authHeaders(token),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Abort request failed (${res.status}): ${text}`);
  }
}

/**
 * Save user profile to server.
 */
export async function saveProfile(
  token: string,
  profile: object
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/profile`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(profile),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Save profile failed (${res.status}): ${text}`);
  }
}

/**
 * Get user profile from server.
 */
export async function getProfile(
  token: string
): Promise<object | null> {
  const res = await fetch(`${BASE_URL}/api/profile`, {
    method: "GET",
    headers: authHeaders(token),
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get profile failed (${res.status}): ${text}`);
  }

  return res.json();
}
