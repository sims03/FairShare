"use client";

import { useState } from "react";
import type { Membership } from "@/lib/data";
import { inviteLink } from "@/lib/invite";
import { getSupabase } from "@/lib/supabase";
import { historyMonths } from "@/lib/balance";
import { blackButton, card, colorCard, fieldLabel, headline } from "@/lib/styles";
import { CURRENCIES, MAX_MEMBERS, type Currency, type HouseholdState } from "@/lib/types";
import { Avatar, AvatarStack } from "./ui";

type Props = {
  state: HouseholdState;
  memberships: Membership[];
  onSwitch: (householdId: string) => void;
  onAddHousehold: () => void;
  onCurrencyChange: (currency: Currency) => void;
};

export function PeopleTab({ state, memberships, onSwitch, onAddHousehold, onCurrencyChange }: Props) {
  const [copied, setCopied] = useState(false);
  const { household, members } = state;
  const full = members.length >= MAX_MEMBERS;
  const link = inviteLink(household.inviteCode);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this invite link:", link);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
      <section className={`${colorCard} bg-lavender`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className={`text-3xl ${headline}`}>Invite people</h3>
          <span className="shrink-0 rounded-full bg-white/60 px-3 py-1 text-xs font-bold tabular-nums">
            {members.length} of {MAX_MEMBERS}
          </span>
        </div>
        {full ? (
          <p className="text-sm font-medium text-black/75">This household is full.</p>
        ) : (
          <>
            <p className="mb-5 text-sm font-medium text-black/75">
              Send the link, or share the code to type in after signing up.
            </p>
            <div className="mb-5 rounded-3xl bg-white/60 px-3 py-5 text-center font-mono text-3xl font-extrabold tracking-[0.3em] sm:text-4xl">
              {household.inviteCode}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={copy} className={`${blackButton} flex-1`}>
                {copied ? "Link copied ✓" : "Copy invite link"}
              </button>
              {canShare && (
                <button
                  onClick={() =>
                    navigator.share({ title: `Join ${household.name} on FairShare`, url: link }).catch(() => {})
                  }
                  className="rounded-full bg-white px-6 py-3.5 text-sm font-bold text-black transition hover:opacity-85"
                >
                  Share
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <section className={card}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-extrabold tracking-tight">{household.name}</h3>
            <span
              className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                household.plan === "premium" ? "bg-bubblegum text-black" : "bg-peach text-ink"
              }`}
            >
              {household.plan === "premium" ? "Premium" : "Free plan"} · {historyMonths(household.plan)} months of
              history
            </span>
          </div>
          <AvatarStack members={members} ring="ring-surface" />
        </div>
        <ul className="flex flex-col gap-3">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 text-sm">
              <Avatar name={m.name} styleIndex={m.styleIndex} size="sm" ring="ring-surface" />
              <span className="flex-1 font-bold">
                {m.name}
                {m.id === state.currentMemberId && <span className="font-normal text-muted"> (you)</span>}
              </span>
              {m.role === "owner" && (
                <span className="rounded-full bg-peach px-2.5 py-1 text-xs font-semibold text-ink">Created it</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h3 className="mb-1 text-lg font-extrabold tracking-tight">Money</h3>
        <p className="mb-4 text-sm text-muted">Used for bills and groceries you log. Anyone in the household can change it.</p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="currency" className={fieldLabel}>
            Currency
          </label>
          <select
            id="currency"
            value={household.currency}
            onChange={(e) => onCurrencyChange(e.target.value as Currency)}
            className="w-full rounded-full border border-line bg-surface px-5 py-3.5 text-sm font-semibold text-ink"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className={card}>
        <h3 className="mb-3 text-lg font-extrabold tracking-tight">Your households</h3>
        <ul className="mb-4 flex flex-col gap-2">
          {memberships.map(({ household: h }) => (
            <li key={h.id}>
              <button
                onClick={() => onSwitch(h.id)}
                disabled={h.id === household.id}
                className="flex w-full items-center justify-between rounded-full px-4 py-2.5 text-left text-sm ring-1 ring-line transition hover:bg-canvas disabled:bg-canvas"
              >
                <span className="font-semibold">{h.name}</span>
                {h.id === household.id && <span className="text-xs font-semibold text-muted">Current</span>}
              </button>
            </li>
          ))}
        </ul>
        <button onClick={onAddHousehold} className="text-sm font-semibold text-lavender-deep underline underline-offset-4">
          + Create or join another household
        </button>
      </section>

      <button
        onClick={() => getSupabase().auth.signOut()}
        className="self-center justify-self-center rounded-full px-5 py-2.5 text-sm font-semibold text-muted underline underline-offset-4 lg:self-start"
      >
        Sign out
      </button>
    </div>
  );
}
