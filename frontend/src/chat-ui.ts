import type { UserProfile } from "./onboarding";
import * as api from "./api";
import { signOut } from "./auth";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ChatUIConfig {
  profile: UserProfile;
  token: string;
  onReset: () => void;
}

/**
 * Render simple markdown-like formatting for assistant messages.
 * Supports: bold, inline code, code blocks, and unordered lists.
 */
function renderMarkdown(text: string): string {
  // Escape HTML first
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="code-block"><code>${code.trim()}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Bold (**...**)
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italic (*...*)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

  // Unordered list items (- item or * item at line start)
  html = html.replace(/^[\-\*]\s+(.+)$/gm, "<li>$1</li>");
  // Wrap consecutive <li> items in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Newlines to <br> (but not inside pre/code blocks)
  // Simple approach: convert remaining newlines
  html = html.replace(
    /\n/g,
    "<br>"
  );

  return html;
}

export function renderChatUI(config: ChatUIConfig): HTMLElement {
  const { profile, token, onReset } = config;
  const messages: ChatMessage[] = [];
  let isStreaming = false;
  let abortRequested = false;

  // Main wrapper
  const wrapper = document.createElement("div");
  wrapper.className = "chat-view";

  // Header
  const header = document.createElement("div");
  header.className = "chat-header";
  header.innerHTML = `
    <div class="chat-header-left">
      <h2>Simple Pi</h2>
      <span class="role-badge">${escapeHtml(profile.role)}</span>
    </div>
    <div class="chat-header-right">
      <button class="btn-reset" id="reset-btn">Reset Profile</button>
      <button class="btn-reset" id="signout-btn">Sign Out</button>
    </div>
  `;
  wrapper.appendChild(header);

  header.querySelector("#reset-btn")!.addEventListener("click", () => {
    if (confirm("Reset your profile and start over?")) {
      onReset();
    }
  });

  header.querySelector("#signout-btn")!.addEventListener("click", async () => {
    await signOut();
    window.location.reload();
  });

  // Messages area
  const messagesEl = document.createElement("div");
  messagesEl.className = "messages";
  wrapper.appendChild(messagesEl);

  // Input area
  const inputArea = document.createElement("div");
  inputArea.className = "chat-input-area";
  inputArea.innerHTML = `
    <textarea id="chat-input" placeholder="Type a message..." rows="1"></textarea>
    <button class="btn-send" id="send-btn">Send</button>
  `;
  wrapper.appendChild(inputArea);

  const textarea = inputArea.querySelector("#chat-input") as HTMLTextAreaElement;
  const sendBtn = inputArea.querySelector("#send-btn") as HTMLButtonElement;

  // Auto-resize textarea
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  });

  // Send on Enter (Shift+Enter for newline)
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Escape to abort
    if (e.key === "Escape" && isStreaming) {
      handleAbort();
    }
  });

  sendBtn.addEventListener("click", handleSend);

  // Listen for Escape globally on the wrapper
  wrapper.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isStreaming) {
      handleAbort();
    }
  });

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function renderMessages() {
    messagesEl.innerHTML = "";

    if (messages.length === 0) {
      messagesEl.innerHTML = `
        <div class="empty-chat">
          <p>Hello${profile.name ? ", " + escapeHtml(profile.name) : ""}! How can I help you today?</p>
        </div>
      `;
      return;
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const msgEl = document.createElement("div");
      msgEl.className = `message ${msg.role}`;
      msgEl.setAttribute("data-index", String(i));

      if (msg.role === "assistant") {
        const contentHtml = renderMarkdown(msg.content);
        msgEl.innerHTML = contentHtml;
        // Add cursor if this is the last message and we're streaming
        if (i === messages.length - 1 && isStreaming) {
          const cursor = document.createElement("span");
          cursor.className = "cursor";
          msgEl.appendChild(cursor);
        }
      } else {
        msgEl.textContent = msg.content;
      }

      messagesEl.appendChild(msgEl);
    }

    scrollToBottom();
  }

  function updateLastAssistantMessage(content: string) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      lastMsg.content = content;

      // Update DOM directly for performance instead of full re-render
      const lastEl = messagesEl.querySelector(
        `[data-index="${messages.length - 1}"]`
      );
      if (lastEl) {
        const contentHtml = renderMarkdown(content);
        lastEl.innerHTML = contentHtml;
        if (isStreaming) {
          const cursor = document.createElement("span");
          cursor.className = "cursor";
          lastEl.appendChild(cursor);
        }
        scrollToBottom();
      } else {
        renderMessages();
      }
    }
  }

  function setInputEnabled(enabled: boolean) {
    textarea.disabled = !enabled;
    sendBtn.disabled = !enabled;
    sendBtn.textContent = enabled ? "Send" : "...";
  }

  async function handleSend() {
    const text = textarea.value.trim();
    if (!text || isStreaming) return;

    // Add user message
    messages.push({
      role: "user",
      content: text,
      timestamp: Date.now(),
    });

    // Clear input
    textarea.value = "";
    textarea.style.height = "auto";

    // Add empty assistant message
    messages.push({
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    });

    isStreaming = true;
    abortRequested = false;
    setInputEnabled(false);
    renderMessages();

    let assistantContent = "";

    try {
      await api.sendMessage(token, text, (event) => {
        if (abortRequested) return;

        if (event.type === "message_update" && event.text_delta) {
          assistantContent += event.text_delta;
          updateLastAssistantMessage(assistantContent);
        } else if (event.type === "message_start") {
          // Reset content for new message
          assistantContent = "";
        } else if (event.type === "agent_end") {
          // Streaming complete
          isStreaming = false;
          setInputEnabled(true);
          renderMessages();
        } else if (event.type === "error") {
          assistantContent += `\n\n[Error: ${event.message || "Unknown error"}]`;
          updateLastAssistantMessage(assistantContent);
        }
      });
    } catch (err: any) {
      // Network or fetch error
      if (assistantContent) {
        assistantContent += `\n\n[Connection error: ${err.message}]`;
      } else {
        assistantContent = `[Error: ${err.message}]`;
      }
      updateLastAssistantMessage(assistantContent);
    } finally {
      isStreaming = false;
      setInputEnabled(true);
      // Final render to remove cursor
      renderMessages();
      textarea.focus();
    }
  }

  async function handleAbort() {
    if (!isStreaming) return;
    abortRequested = true;
    try {
      await api.abortChat(token);
    } catch {
      // Best effort
    }
    isStreaming = false;
    setInputEnabled(true);
    renderMessages();
    textarea.focus();
  }

  // Initial render
  renderMessages();
  textarea.focus();

  return wrapper;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
