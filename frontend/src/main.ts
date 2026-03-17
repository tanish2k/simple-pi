import "./style.css";
import { getSession, signInWithGoogle, onAuthStateChange } from "./auth";
import { loadProfile, clearProfile, renderOnboarding } from "./onboarding";
import { renderChatUI } from "./chat-ui";
import type { UserProfile } from "./onboarding";

const app = document.querySelector<HTMLDivElement>("#app")!;

function showLogin() {
  app.innerHTML = "";
  const loginPage = document.createElement("div");
  loginPage.className = "login-page";
  loginPage.innerHTML = `
    <div class="login-card">
      <h1>Simple Pi</h1>
      <p class="tagline">Your personalized AI assistant</p>
      <button class="btn-google" id="google-signin-btn">
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Sign in with Google
      </button>
    </div>
  `;
  app.appendChild(loginPage);

  loginPage
    .querySelector("#google-signin-btn")!
    .addEventListener("click", async () => {
      try {
        await signInWithGoogle();
      } catch (err: any) {
        console.error("Sign-in failed:", err);
        alert("Sign-in failed. Please try again.");
      }
    });
}

function showOnboarding(token: string) {
  app.innerHTML = "";
  const onboardingEl = renderOnboarding((profile) => {
    showChat(profile, token);
  });
  app.appendChild(onboardingEl);
}

function showChat(profile: UserProfile, token: string) {
  app.innerHTML = "";
  const chatEl = renderChatUI({
    profile,
    token,
    onReset: () => {
      clearProfile();
      showOnboarding(token);
    },
  });
  app.appendChild(chatEl);
}

async function handleAuthCallback(): Promise<boolean> {
  // Check if the current URL is the auth callback
  const path = window.location.pathname;
  const hash = window.location.hash;
  const search = window.location.search;

  if (path === "/auth/callback" || hash.includes("access_token") || search.includes("code=")) {
    // Supabase client will handle the token exchange automatically
    // Wait a moment for Supabase to process the callback
    const session = await getSession();
    if (session) {
      // Clean up the URL
      window.history.replaceState({}, "", "/");
      return true;
    }
    // If no session yet, wait briefly and try again
    await new Promise((resolve) => setTimeout(resolve, 500));
    const retrySession = await getSession();
    if (retrySession) {
      window.history.replaceState({}, "", "/");
      return true;
    }
  }
  return false;
}

async function init() {
  // Handle auth callback first
  await handleAuthCallback();

  // Check current auth state
  const session = await getSession();

  if (!session) {
    showLogin();
  } else {
    const token = session.access_token;
    const profile = loadProfile();
    if (profile) {
      showChat(profile, token);
    } else {
      showOnboarding(token);
    }
  }

  // Listen for auth state changes
  onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session) {
      const token = session.access_token;
      const profile = loadProfile();
      if (profile) {
        showChat(profile, token);
      } else {
        showOnboarding(token);
      }
    } else if (event === "SIGNED_OUT") {
      showLogin();
    }
  });
}

init();
