import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { config } from "../config.js";

const API_BASE = "https://api.supermemory.ai";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.supermemoryApiKey}`,
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

export async function addMemory(
  params: AddMemoryParams
): Promise<{ id: string; status: string }> {
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

  return res.json() as Promise<{ id: string; status: string }>;
}

export async function searchMemories(
  params: SearchParams
): Promise<SearchResponse> {
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

  return res.json() as Promise<SearchResponse>;
}

export function createMemoryTools(containerTag: string): AgentTool<any>[] {
  const saveMemoryTool: AgentTool<any> = {
    name: "save_memory",
    label: "Save Memory",
    description:
      "Save important information, facts, preferences, or decisions to long-term memory. Use this when the user shares something worth remembering for future conversations — preferences, project details, key decisions, personal info, etc.",
    parameters: Type.Object({
      content: Type.String({
        description:
          "The information to save. Be specific and include context so it's useful later.",
      }),
      category: Type.Optional(
        Type.String({
          description:
            'Optional category like "preference", "project", "personal", "decision"',
        })
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: any
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: undefined;
    }> => {
      try {
        const result = await addMemory({
          content: params.content,
          containerTag,
          metadata: params.category ? { category: params.category } : undefined,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory saved successfully (id: ${result.id}).`,
            },
          ],
          details: undefined,
        };
      } catch (e: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to save memory: ${e.message}`,
            },
          ],
          details: undefined,
        };
      }
    },
  };

  const recallMemoryTool: AgentTool<any> = {
    name: "recall_memories",
    label: "Recall Memories",
    description:
      "Search long-term memory for relevant information. Use this when the user asks about something that may have been discussed before, or when you need context from past conversations to give a better answer.",
    parameters: Type.Object({
      query: Type.String({
        description:
          "Natural language search query describing what you're looking for.",
      }),
      limit: Type.Optional(
        Type.Number({
          description: "Max results to return (default 5).",
        })
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: any
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: undefined;
    }> => {
      try {
        const response = await searchMemories({
          q: params.query,
          containerTag,
          limit: params.limit ?? 5,
        });

        if (response.results.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "No relevant memories found." },
            ],
            details: undefined,
          };
        }

        const formatted = response.results
          .map((r, i) => {
            const text = r.memory || r.chunk || "(no content)";
            return `${i + 1}. [similarity: ${r.similarity.toFixed(2)}] ${text}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${response.results.length} memories:\n\n${formatted}`,
            },
          ],
          details: undefined,
        };
      } catch (e: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to recall memories: ${e.message}`,
            },
          ],
          details: undefined,
        };
      }
    },
  };

  return [saveMemoryTool, recallMemoryTool];
}
