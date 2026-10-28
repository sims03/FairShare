"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { appHomeUrl } from "@/lib/site";
import { card, input, primaryButton } from "@/lib/styles";
import { SplitScreen } from "./SplitScreen";
import { ErrorNote, Notice, PageTitle } from "./ui";

export function AuthScreen({ invited }: { invited: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">(invited ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const auth = getSupabase().auth;
    if (mode === "signin") {
      const { error } = await auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await auth.signUp({
        email,
        password,
        // After clicking the confirmation email, come back to the app (including "/FairShare/" on Pages).
        options: { emailRedirectTo: appHomeUrl() },
      });
      if (error) setError(error.message);
      else if (!data.session) setNotice("Almost there! Check your inbox to confirm your email, then sign in here.");
    }
    setBusy(false);
  }

  return (
    <SplitScreen>
      <PageTitle>{mode === "signin" ? "Welcome back" : "Create your account"}</PageTitle>

      {invited && (
        <div className="mb-4">
          <Notice>You&apos;ve been invited to a household. Create an account or sign in to join.</Notice>
        </div>
      )}

      <form onSubmit={submit} className={`${card} flex flex-col gap-3`}>
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-full bg-canvas p-1 text-sm ring-1 ring-line">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-full py-2.5 font-bold transition ${mode === m ? "bg-ink text-canvas" : "text-muted hover:text-ink"}`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
        <label className="px-1 text-xs font-bold text-muted" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <label className="px-1 text-xs font-bold text-muted" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        {error && <ErrorNote message={error} />}
        {notice && <Notice>{notice}</Notice>}
        <button type="submit" disabled={busy} className={`${primaryButton} mt-2`}>
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </SplitScreen>
  );
}
