import * as api from "./api";
import type { Toolkit, ComposioConnection } from "./api";

interface IntegrationDef {
  toolkit: Toolkit;
  name: string;
  description: string;
  icon: string;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    toolkit: "gmail",
    name: "Gmail",
    description: "Send and read emails",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" stroke="#EA4335" stroke-width="1.5"/><path d="M2 6l10 7 10-7" stroke="#EA4335" stroke-width="1.5"/></svg>`,
  },
  {
    toolkit: "googlecalendar",
    name: "Google Calendar",
    description: "Create events, check schedule",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#4285F4" stroke-width="1.5"/><path d="M3 9h18M8 2v4M16 2v4" stroke="#4285F4" stroke-width="1.5"/></svg>`,
  },
  {
    toolkit: "googledrive",
    name: "Google Drive",
    description: "Search and read files",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M8 2l8 0 6 10H2L8 2z" stroke="#0F9D58" stroke-width="1.5"/><path d="M2 12l4 7h12l4-7" stroke="#FBBC05" stroke-width="1.5"/></svg>`,
  },
  {
    toolkit: "salesforce",
    name: "Salesforce",
    description: "Manage leads, contacts, accounts",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#00A1E0" stroke-width="1.5"/><path d="M8 12.5c0-2.5 1.5-4 4-4s4 1.5 4 4-1.5 3.5-4 3.5-4-1-4-3.5z" stroke="#00A1E0" stroke-width="1.5"/></svg>`,
  },
];

export function renderIntegrations(config: {
  token: string;
  onBack: () => void;
}): HTMLElement {
  const { token, onBack } = config;
  let connections: ComposioConnection[] = [];
  let loading = true;

  const wrapper = document.createElement("div");
  wrapper.className = "integrations-page";

  function isConnected(toolkit: string): boolean {
    return connections.some(
      (c) =>
        c.appName?.toLowerCase() === toolkit.toLowerCase() ||
        c.appName?.toLowerCase().replace(/\s+/g, "") === toolkit.toLowerCase()
    );
  }

  function render() {
    wrapper.innerHTML = `
      <div class="integrations-card">
        <div class="integrations-header">
          <button class="btn-back" id="back-btn">&larr; Back to Chat</button>
          <h1>Integrations</h1>
          <p class="subtitle">Connect your tools so the AI agent can act on your behalf.</p>
        </div>
        <div class="integrations-list">
          ${loading ? '<div class="loading">Loading connections...</div>' : ""}
          ${
            !loading
              ? INTEGRATIONS.map(
                  (integ) => `
                <div class="integration-item" data-toolkit="${integ.toolkit}">
                  <div class="integration-icon">${integ.icon}</div>
                  <div class="integration-info">
                    <div class="integration-name">${integ.name}</div>
                    <div class="integration-desc">${integ.description}</div>
                  </div>
                  <div class="integration-status">
                    ${
                      isConnected(integ.toolkit)
                        ? '<span class="status-connected">Connected</span>'
                        : `<button class="btn-connect" data-toolkit="${integ.toolkit}">Connect</button>`
                    }
                  </div>
                </div>
              `
                ).join("")
              : ""
          }
        </div>
      </div>
    `;

    wrapper.querySelector("#back-btn")?.addEventListener("click", onBack);

    wrapper.querySelectorAll(".btn-connect").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const toolkit = (e.currentTarget as HTMLElement).dataset.toolkit as Toolkit;
        const button = e.currentTarget as HTMLButtonElement;
        button.disabled = true;
        button.textContent = "Connecting...";

        try {
          const { redirectUrl } = await api.connectToolkit(token, toolkit);
          if (redirectUrl) {
            window.location.href = redirectUrl;
          } else {
            button.textContent = "No redirect URL";
            setTimeout(() => {
              button.disabled = false;
              button.textContent = "Connect";
            }, 2000);
          }
        } catch (err: any) {
          console.error("Connect error:", err);
          button.textContent = "Failed";
          setTimeout(() => {
            button.disabled = false;
            button.textContent = "Connect";
          }, 2000);
        }
      });
    });
  }

  render();

  // Load connections
  api
    .getConnections(token)
    .then((conns) => {
      connections = conns;
      loading = false;
      render();
    })
    .catch((err) => {
      console.error("Failed to load connections:", err);
      loading = false;
      render();
    });

  return wrapper;
}
