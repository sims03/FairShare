import { appHomeUrl } from "./site";

// Invite links look like https://sims03.github.io/FairShare/?join=ABCD2345. The code is kept in
// localStorage so it survives signing up and confirming an email.
const PENDING_KEY = "fairshare.pendingJoin";
const SELECTED_KEY = "fairshare.selectedHousehold";

export function capturePendingJoin(): string | null {
  try {
    const code = new URLSearchParams(window.location.search).get("join");
    if (code) {
      localStorage.setItem(PENDING_KEY, code.trim().toUpperCase());
      // Remove "?join=…" from the address bar. `pathname` already includes the base path ("/FairShare/").
      window.history.replaceState(null, "", window.location.pathname);
    }
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearPendingJoin() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
}

export function inviteLink(code: string): string {
  return `${appHomeUrl()}?join=${code}`;
}

export function readSelectedHousehold(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedHousehold(id: string) {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {}
}
