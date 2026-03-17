import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { config } from "./config.js";
import { createMemoryTools, searchMemories, addMemory } from "./tools/memory.js";
import { createComposioTools } from "./tools/composio.js";

export interface UserProfile {
  name: string;
  role: string;
  personality: string;
  goals: string;
}

function buildSystemPrompt(profile: UserProfile): string {
  return `You are a personal AI SDR (Sales Development Representative) assistant. Here is who you are working with:

- Name: ${profile.name}
- Role: ${profile.role}
- Personality preferences: ${profile.personality}
- Goals: ${profile.goals}

Tailor your responses to match their role and help them achieve their goals. Be conversational and adapt your tone to their personality preferences. Be concise and helpful.

You have access to long-term memory tools:
- Use "save_memory" to remember important facts, preferences, decisions, or project details the user shares. Be proactive — if the user tells you something worth remembering, save it.
- Use "recall_memories" to search for relevant past context when the user references previous conversations or when additional context would help.

Relevant memories from past conversations may be automatically injected into your context. Use them naturally without explicitly calling them out.`;
}

/** Extract the latest user message text from the message list. */
function getLatestUserText(messages: AgentMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "text") return block.text;
      }
    }
  }
  return null;
}

export function createAgentForUser(
  userId: string,
  profile: UserProfile
): Agent {
  const containerTag = `user_${userId}`;
  const memoryTools = createMemoryTools(containerTag);
  const composioTools = createComposioTools();
  const allTools = [...memoryTools, ...composioTools];

  const agent = new Agent({
    getApiKey: async (_provider: string) => config.anthropicApiKey,
    initialState: {
      systemPrompt: buildSystemPrompt(profile),
      model: getModel("anthropic", "claude-sonnet-4-5-20250929"),
      thinkingLevel: "off" as const,
      messages: [],
      tools: allTools,
    },

    // Before each LLM call, search supermemory for context relevant to the latest user message
    // and prepend it as a system-injected user message so the model has memory context.
    transformContext: async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
      const userText = getLatestUserText(messages);
      if (!userText) return messages;

      try {
        const response = await searchMemories({
          q: userText,
          containerTag,
          limit: 5,
          searchMode: "hybrid",
        });

        if (response.results.length === 0) return messages;

        const memoryBlock = response.results
          .map((r) => r.memory || r.chunk || "")
          .filter(Boolean)
          .join("\n- ");

        if (!memoryBlock) return messages;

        // Inject a context message at the start
        const memoryMessage: AgentMessage = {
          role: "user",
          content: [
            {
              type: "text",
              text: `[SYSTEM — relevant memories from past conversations]\n- ${memoryBlock}\n[END MEMORIES]\n\nUse these memories as context if relevant. Do not mention this system message to the user.`,
            },
          ],
          timestamp: Date.now(),
        };

        return [memoryMessage, ...messages];
      } catch {
        // If memory search fails, proceed without it
        return messages;
      }
    },
  });

  // Auto-save conversation exchanges to supermemory
  agent.subscribe((event: any) => {
    if (event.type === "agent_end") {
      const msgs = agent.state.messages;
      let userText = "";
      let assistantText = "";

      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i];
        if (
          !assistantText &&
          msg.role === "assistant" &&
          Array.isArray(msg.content)
        ) {
          for (const block of msg.content) {
            if (block.type === "text") {
              assistantText = block.text;
              break;
            }
          }
        }
        if (
          assistantText &&
          msg.role === "user" &&
          Array.isArray(msg.content)
        ) {
          for (const block of msg.content) {
            if (block.type === "text") {
              userText = block.text;
              break;
            }
          }
          break;
        }
      }

      if (userText && assistantText) {
        addMemory({
          content: `User: ${userText}\nAssistant: ${assistantText}`,
          containerTag,
          metadata: { type: "conversation" },
        }).catch(() => {
          // Silent fail for auto-save
        });
      }
    }
  });

  return agent;
}
