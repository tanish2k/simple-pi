import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { addMemory, searchMemories } from "./supermemory";

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
    execute: async (_toolCallId, params) => {
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
            { type: "text" as const, text: `Failed to save memory: ${e.message}` },
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
    execute: async (_toolCallId, params) => {
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
