const API_BASE = "https://api.supermemory.ai";
const API_KEY = import.meta.env.VITE_SUPERMEMORY_API_KEY as string;

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

export interface AddMemoryParams {
  content: string;
  containerTag: string;
  customId?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface SearchParams {
  q: string;
  containerTag: string;
  limit?: number;
  searchMode?: "hybrid" | "memories";
}

export interface SearchResult {
  id: string;
  memory?: string;
  chunk?: string;
  similarity: number;
  metadata?: Record<string, unknown> | null;
  updatedAt: string;
}

export interface SearchResponse {
  results: SearchResult[];
  timing: number;
  total: number;
}

export async function addMemory(params: AddMemoryParams): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_BASE}/v3/documents`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      content: params.content,
      containerTag: params.containerTag,
      customId: params.customId,
      metadata: params.metadata,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`supermemory add failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function searchMemories(params: SearchParams): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/v4/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      q: params.q,
      containerTag: params.containerTag,
      limit: params.limit ?? 5,
      searchMode: params.searchMode ?? "hybrid",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`supermemory search failed (${res.status}): ${text}`);
  }

  return res.json();
}
