"use client";

import { useState } from "react";
import { createHousehold, joinHousehold } from "@/lib/data";
import { card, input, primaryButton } from "@/lib/styles";
import { SplitScreen } from "./SplitScreen";
import { ErrorNote, PageTitle } from "./ui";

type Props = {
  defaultCode: string | null;
  onDone: (householdId: string) => void;
  onCancel?: () => void;
};

/** Create a new household or join one with an invite code. */
export function HouseholdSetup({ defaultCode, onDone, onCancel }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [code, setCode] = useState(defaultCode ?? "");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "create" | "join", e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return setError("Add the name your household will see first.");
    setBusy(kind);
    setError(null);
    try {
      onDone(
        kind === "create"
          ? await createHousehold(householdName, displayName)
          : await joinHousehold(code, displayName),
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  const joinForm = (
    <form key="join" onSubmit={(e) => run("join", e)} className={`${card} flex flex-col gap-3`}>
      <h3 className="text-lg font-extrabold tracking-tight">Join with an invite code</h3>
      <input
        required
        aria-label="Invite code"
        placeholder="e.g. K7QM4XRT"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className={`${input} font-mono tracking-[0.3em]`}
        maxLength={8}
      />
      <button type="submit" disabled={busy !== null} className={primaryButton}>
        {busy === "join" ? "Joining…" : "Join household"}
      </button>
    </form>
  );

  const createForm = (
    <form key="create" onSubmit={(e) => run("create", e)} className={`${card} flex flex-col gap-3`}>
      <h3 className="text-lg font-extrabold tracking-tight">Start a new household</h3>
      <input
        required
        aria-label="Household name"
        maxLength={60}
        placeholder="e.g. Maple Street flat"
        value={householdName}
        onChange={(e) => setHouseholdName(e.target.value)}
        className={input}
      />
      <p className="px-1 text-xs text-muted">Up to 12 people. We&apos;ll add some starter tasks you can use right away.</p>
      <button type="submit" disabled={busy !== null} className={primaryButton}>
        {busy === "create" ? "Creating…" : "Create household"}
      </button>
    </form>
  );

  return (
    <SplitScreen>
      <div className="flex flex-col gap-4">
        <PageTitle>Set up your household</PageTitle>
        <div className={`${card} flex flex-col gap-2`}>
          <label htmlFor="display-name" className="px-1 text-xs font-bold text-muted">
            Your name in the household
          </label>
          <input
            id="display-name"
            required
            maxLength={40}
            placeholder="e.g. Alex"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={input}
          />
        </div>
        {error && <ErrorNote message={error} />}
        {defaultCode ? [joinForm, createForm] : [createForm, joinForm]}
        {onCancel && (
          <button onClick={onCancel} className="self-center text-sm font-semibold text-muted underline underline-offset-4">
            Back to my household
          </button>
        )}
      </div>
    </SplitScreen>
  );
}
