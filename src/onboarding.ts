export interface UserProfile {
  name: string;
  role: string;
  personality: string;
  goals: string;
}

const STORAGE_KEY = "simple-pi-profile";

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function loadProfile(): UserProfile | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as UserProfile;
}

export function clearProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function buildSystemPrompt(profile: UserProfile): string {
  return `You are a personal AI assistant. Here is who you are working with:

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

export function renderOnboarding(
  onComplete: (profile: UserProfile) => void
): HTMLElement {
  let step = 0;

  const container = document.createElement("div");

  function render() {
    if (step === 0) {
      container.innerHTML = `
        <div class="onboarding">
          <div class="onboarding-card">
            <div class="step-indicator">
              <div class="step-dot active"></div>
              <div class="step-dot"></div>
            </div>
            <h1>Welcome</h1>
            <p class="subtitle">Tell us about yourself so your AI assistant can be personalized.</p>
            <div class="form-group">
              <label>Your Name</label>
              <input type="text" id="name" placeholder="e.g. Alex" />
            </div>
            <div class="form-group">
              <label>Your Role</label>
              <input type="text" id="role" placeholder="e.g. Software Engineer, Product Manager, Student" />
            </div>
            <div class="form-group">
              <label>Personality & Tone</label>
              <textarea id="personality" placeholder="How should the AI communicate? e.g. Casual and friendly, Direct and technical, Patient and encouraging"></textarea>
            </div>
            <div class="btn-row">
              <button class="btn btn-primary" id="next-btn">Next</button>
            </div>
          </div>
        </div>
      `;

      container.querySelector("#next-btn")!.addEventListener("click", () => {
        const name = (
          container.querySelector("#name") as HTMLInputElement
        ).value.trim();
        const role = (
          container.querySelector("#role") as HTMLInputElement
        ).value.trim();
        const personality = (
          container.querySelector("#personality") as HTMLTextAreaElement
        ).value.trim();

        if (!name || !role) {
          alert("Please fill in your name and role.");
          return;
        }

        (container as any)._draft = { name, role, personality };
        step = 1;
        render();
      });
    } else {
      const draft = (container as any)._draft as {
        name: string;
        role: string;
        personality: string;
      };

      container.innerHTML = `
        <div class="onboarding">
          <div class="onboarding-card">
            <div class="step-indicator">
              <div class="step-dot active"></div>
              <div class="step-dot active"></div>
            </div>
            <h1>Your Goals</h1>
            <p class="subtitle">What do you want to accomplish with your AI assistant?</p>
            <div class="form-group">
              <label>Goals</label>
              <textarea id="goals" placeholder="e.g. Help me write better code, brainstorm product ideas, learn new topics, draft emails..."></textarea>
            </div>
            <div class="btn-row">
              <button class="btn btn-secondary" id="back-btn">Back</button>
              <button class="btn btn-primary" id="start-btn">Start Chatting</button>
            </div>
          </div>
        </div>
      `;

      container.querySelector("#back-btn")!.addEventListener("click", () => {
        step = 0;
        render();
      });

      container.querySelector("#start-btn")!.addEventListener("click", () => {
        const goals = (
          container.querySelector("#goals") as HTMLTextAreaElement
        ).value.trim();

        if (!goals) {
          alert("Please describe at least one goal.");
          return;
        }

        const profile: UserProfile = {
          name: draft.name,
          role: draft.role,
          personality: draft.personality || "Friendly and helpful",
          goals,
        };

        saveProfile(profile);
        onComplete(profile);
      });
    }
  }

  render();
  return container;
}
