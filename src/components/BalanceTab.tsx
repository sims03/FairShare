"use client";

import { percent, weeklyTotals, type MemberTotals } from "@/lib/balance";
import { card, colorCard, headline, memberStyle } from "@/lib/styles";
import type { Category, HouseholdState, Member } from "@/lib/types";
import { Avatar, Icon, type IconName } from "./ui";

function ShareBar({ segments }: { segments: { key: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-line">
      {total > 0 &&
        segments.map((s) => (
          <div key={s.key} style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} />
        ))}
    </div>
  );
}

/** Donut ring built from a conic gradient, one slice per member. */
function Donut({ slices, label }: { slices: { color: string; value: number }[]; label: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  let acc = 0;
  const stops = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const from = (acc / total) * 360;
      acc += s.value;
      return `${s.color} ${from}deg ${(acc / total) * 360}deg`;
    });
  // Empty week: a faint ring in the card's own text colour.
  const background =
    total > 0 ? `conic-gradient(${stops.join(", ")})` : "color-mix(in srgb, var(--canvas) 20%, transparent)";

  return (
    <div className="relative h-36 w-36 shrink-0 rounded-full sm:h-40 sm:w-40" style={{ background }}>
      <div className="absolute inset-3.5 flex flex-col items-center justify-center rounded-full bg-ink text-center">
        <span className="text-3xl font-extrabold tabular-nums tracking-tight">{label}</span>
        <span className="text-[11px] font-medium opacity-70">your share</span>
      </div>
    </div>
  );
}

type StatTileProps = {
  value: string | number;
  label: string;
  icon: IconName;
  bg: string;
  /** Smaller number, for long values like "€1,234.50". */
  compact?: boolean;
};

export function StatTile({ value, label, icon, bg, compact = false }: StatTileProps) {
  return (
    <div className={`${colorCard} flex h-full min-h-40 flex-col justify-between gap-4 ${bg}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div>
        <div
          className={`break-words tabular-nums ${compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl"} ${headline}`}
        >
          {value}
        </div>
        <div className="mt-1 text-sm font-semibold text-black/75">{label}</div>
      </div>
    </div>
  );
}

type ShareListProps = {
  rows: MemberTotals[];
  total: number;
  members: Member[];
  /** The signed-in member, marked "(you)". */
  me: string;
  /** When set, everyone else is faded (History's person filter). */
  highlight?: string | null;
};

/** One bar per person: their effort points and share of the total, biggest first. */
export function ShareList({ rows, total, members, me, highlight = null }: ShareListProps) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  return (
    <ul className="flex flex-col gap-4">
      {sorted.map((r) => {
        const m = byId.get(r.memberId);
        if (!m) return null;
        const share = percent(r.points, total);
        const color = memberStyle(m.styleIndex).hex;
        return (
          <li
            key={r.memberId}
            className={`flex items-center gap-3 transition ${highlight && highlight !== m.id ? "opacity-40" : ""}`}
          >
            <Avatar name={m.name} styleIndex={m.styleIndex} size="sm" ring="ring-surface" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <span className="truncate font-bold">
                  {m.name}
                  {m.id === me && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {r.points} pts · {share}%
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const CATEGORIES: { category: Category; title: string }[] = [
  { category: "mental", title: "Thinking & planning" },
  { category: "physical", title: "Doing" },
];

export function BalanceTab({ state }: { state: HouseholdState }) {
  const { rows, total } = weeklyTotals(state, new Date());
  const members = new Map(state.members.map((m) => [m.id, m]));
  const colorOf = (memberId: string) => memberStyle(members.get(memberId)!.styleIndex).hex;
  const mine = rows.find((r) => r.memberId === state.currentMemberId);
  const contributors = rows.filter((r) => r.points > 0).length;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <section className="flex flex-col items-center gap-5 rounded-[28px] bg-ink p-6 text-canvas sm:flex-row md:col-span-2 xl:col-span-1 xl:flex-col xl:items-start">
        <Donut
          label={`${percent(mine?.points ?? 0, total)}%`}
          slices={rows.map((r) => ({ color: colorOf(r.memberId), value: r.points }))}
        />
        <div className="text-center sm:text-left">
          <h3 className={`text-2xl ${headline}`}>Your share</h3>
          <p className="mt-1 text-sm opacity-70">Of all the effort points your household logged since Monday.</p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:col-span-2">
        <StatTile value={total} label="Effort points" icon="bolt" bg="bg-periwinkle" />
        <StatTile value={rows.reduce((s, r) => s + r.count, 0)} label="Tasks logged" icon="check" bg="bg-tangerine" />
        <div className="col-span-2 sm:col-span-1">
          <StatTile value={`${contributors} of ${rows.length}`} label="People pitching in" icon="people" bg="bg-bubblegum" />
        </div>
      </div>

      <section className={`${card} xl:col-span-2`}>
        <h3 className="mb-4 text-lg font-extrabold tracking-tight">Everyone this week</h3>
        <ShareList rows={rows} total={total} members={state.members} me={state.currentMemberId} />
      </section>

      <section className={card}>
        <h3 className="mb-4 text-lg font-extrabold tracking-tight">By kind of work</h3>
        <div className="flex flex-col gap-5">
          {CATEGORIES.map(({ category, title }) => {
            const catTotal = rows.reduce((sum, r) => sum + r.byCategory[category], 0);
            return (
              <div key={category}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-bold">{title}</span>
                  <span className="tabular-nums text-muted">{catTotal} pts</span>
                </div>
                <ShareBar
                  segments={rows.map((r) => ({
                    key: r.memberId,
                    value: r.byCategory[category],
                    color: colorOf(r.memberId),
                  }))}
                />
              </div>
            );
          })}
        </div>
      </section>

      <p className="px-2 text-center text-xs leading-relaxed text-muted md:col-span-2 xl:col-span-3">
        Points are each task&apos;s effort score. This is a snapshot to talk about together, not a scorecard.
      </p>
    </div>
  );
}
