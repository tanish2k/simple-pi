import { Agent } from "@mariozechner/pi-agent-core";
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

export async function renderChat(
  profile: UserProfile,
  onReset: () => void
): Promise<HTMLElement> {
  await initStorage();

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

  // Create agent
  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(profile),
      model: getModel("anthropic", "claude-sonnet-4-5-20250929"),
      thinkingLevel: "off" as const,
      messages: [],
      tools: [],
    },
    convertToLlm: defaultConvertToLlm,
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
      return [replTool];
    },
  });

  return wrapper;
}
