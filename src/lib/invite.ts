// Invite links look like https://site/?join=ABCD2345. The code is kept in
// localStorage so it survives signing up and confirming an email.
const PENDING_KEY = "fairshare.pendingJoin";
const SELECTED_KEY = "fairshare.selectedHousehold";

export function capturePendingJoin(): string | null {
  try {
    const code = new URLSearchParams(window.location.search).get("join");
    if (code) {
      localStorage.setItem(PENDING_KEY, code.trim().toUpperCase());
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
  return `${window.location.origin}/?join=${code}`;
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
