import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import {
  ChatPanel,
  AppStorage,
  IndexedDBStorageBackend,
  ProviderKeysStore,
  SessionsStore,
  SettingsStore,
  CustomProvidersStore,
  setAppStorage,
  defaultConvertToLlm,
  ApiKeyPromptDialog,
  createJavaScriptReplTool,
} from "@mariozechner/pi-web-ui";
import "@mariozechner/pi-web-ui/app.css";

import type { UserProfile } from "./onboarding";
import { buildSystemPrompt } from "./onboarding";
import { createMemoryTools } from "./memory-tools";
import { searchMemories, addMemory } from "./supermemory";

let storageInitialized = false;

async function initStorage() {
  if (storageInitialized) return;

  const settings = new SettingsStore();
  const providerKeys = new ProviderKeysStore();
  const sessions = new SessionsStore();
  const customProviders = new CustomProvidersStore();

  const backend = new IndexedDBStorageBackend({
    dbName: "simple-pi",
    version: 1,
    stores: [
      settings.getConfig(),
      providerKeys.getConfig(),
      sessions.getConfig(),
      SessionsStore.getMetadataConfig(),
      customProviders.getConfig(),
    ],
  });

  settings.setBackend(backend);
  providerKeys.setBackend(backend);
  sessions.setBackend(backend);
  customProviders.setBackend(backend);

  const storage = new AppStorage(
    settings,
    providerKeys,
    sessions,
    customProviders,
    backend
  );
  setAppStorage(storage);
  storageInitialized = true;
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

export async function renderChat(
  profile: UserProfile,
  onReset: () => void
): Promise<HTMLElement> {
  await initStorage();

  const containerTag = `user_${profile.name.toLowerCase().replace(/\s+/g, "_")}`;

  const wrapper = document.createElement("div");
  wrapper.className = "chat-view";

  // Header
  const header = document.createElement("div");
  header.className = "chat-header";
  header.innerHTML = `
    <div class="chat-header-left">
      <h2>Simple Pi</h2>
      <span class="role-badge">${profile.role}</span>
    </div>
    <button class="btn-reset" id="reset-btn">Reset Profile</button>
  `;
  wrapper.appendChild(header);

  header.querySelector("#reset-btn")!.addEventListener("click", () => {
    if (confirm("Reset your profile and start over?")) {
      onReset();
    }
  });

  // Chat container
  const chatContainer = document.createElement("div");
  chatContainer.className = "chat-container";
  wrapper.appendChild(chatContainer);

  // Memory tools
  const memoryTools = createMemoryTools(containerTag);

  // Create agent with memory-aware transformContext
  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(profile),
      model: getModel("anthropic", "claude-sonnet-4-5-20250929"),
      thinkingLevel: "off" as const,
      messages: [],
      tools: [],
    },
    convertToLlm: defaultConvertToLlm,

    // Before each LLM call, search supermemory for context relevant to the latest user message
    // and prepend it as a system-injected user message so the model has memory context.
    transformContext: async (messages) => {
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
  agent.subscribe((event) => {
    if (event.type === "agent_end") {
      // After the agent finishes, save the latest exchange
      const msgs = agent.state.messages;
      // Find the last user + assistant pair
      let userText = "";
      let assistantText = "";

      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i];
        if (!assistantText && msg.role === "assistant" && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === "text") {
              assistantText = block.text;
              break;
            }
          }
        }
        if (assistantText && msg.role === "user" && Array.isArray(msg.content)) {
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
        // Save in background, don't block
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

  // Create and configure ChatPanel
  const chatPanel = new ChatPanel();
  chatContainer.appendChild(chatPanel);

  await chatPanel.setAgent(agent, {
    onApiKeyRequired: async (provider: string) => {
      return await ApiKeyPromptDialog.prompt(provider);
    },
    toolsFactory: (
      _agent,
      _agentInterface,
      _artifactsPanel,
      runtimeProvidersFactory
    ) => {
      const replTool = createJavaScriptReplTool();
      replTool.runtimeProvidersFactory = runtimeProvidersFactory;
      return [...memoryTools, replTool];
    },
  });

  return wrapper;
}
