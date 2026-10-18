"use client";

import { daysBetween } from "@/lib/balance";
import { CARD_COLORS, colorCard } from "@/lib/styles";
import type { HouseholdState } from "@/lib/types";
import { Avatar } from "./ui";

type Props = {
  state: HouseholdState;
  onHandOver: (areaId: string, toMemberId: string) => void;
};

export function OwnershipTab({ state, onHandOver }: Props) {
  const now = new Date();
  const members = new Map(state.members.map((m) => [m.id, m]));

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted sm:text-base">
        Each area has one owner who remembers, plans and follows through. Hand it over when it&apos;s time to swap.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.areas.map((area, i) => {
          const owner = members.get(area.ownerId);
          const held = daysBetween(area.since, now);
          const due = held >= area.rotateEveryDays;
          const others = state.members.filter((m) => m.id !== area.ownerId);
          const bg = CARD_COLORS[i % CARD_COLORS.length];

          return (
            <div key={area.id} className={`${colorCard} flex flex-col gap-5 ${bg}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/60 text-2xl" aria-hidden>
                  {area.emoji}
                </span>
                {due && (
                  <span className="rounded-full bg-black px-3 py-1.5 text-xs font-bold text-white">Time to swap</span>
                )}
              </div>
              <div>
                <h3 className="text-2xl font-extrabold leading-tight tracking-tight">{area.name}</h3>
                <p className="mt-1 text-sm font-medium text-black/70">
                  {held} {held === 1 ? "day" : "days"} · swaps every {area.rotateEveryDays}
                </p>
              </div>
              {owner && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Avatar name={owner.name} styleIndex={owner.styleIndex} size="sm" ring="ring-transparent" />
                  <span>
                    Owned by <strong className="font-bold">{owner.name}</strong>
                  </span>
                </div>
              )}
              {others.length > 0 && (
                <select
                  aria-label={`Hand ${area.name} to`}
                  value=""
                  onChange={(e) => e.target.value && onHandOver(area.id, e.target.value)}
                  className="mt-auto w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-black"
                >
                  <option value="">Hand over to…</option>
                  {others.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
