import "./style.css";
import { loadProfile, clearProfile, renderOnboarding } from "./onboarding";
import { renderChat } from "./chat";
import type { UserProfile } from "./onboarding";

const app = document.querySelector<HTMLDivElement>("#app")!;

async function showChat(profile: UserProfile) {
  app.innerHTML = "";
  const chatEl = await renderChat(profile, () => {
    clearProfile();
    showOnboarding();
  });
  app.appendChild(chatEl);
}

function showOnboarding() {
  app.innerHTML = "";
  const onboardingEl = renderOnboarding((profile) => {
    showChat(profile);
  });
  app.appendChild(onboardingEl);
}

// Check for existing profile
const existing = loadProfile();
if (existing) {
  showChat(existing);
} else {
  showOnboarding();
}
