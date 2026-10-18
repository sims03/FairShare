import { toCents } from "./money";
import type { Category, HouseholdState, LogEntry, Member, Plan, Task } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday 00:00 local time of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function daysBetween(fromIso: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / DAY_MS);
}

export type MemberTotals = {
  memberId: string;
  points: number;
  byCategory: Record<Category, number>;
  count: number;
  /** Money logged, in whole cents (exact integers, see src/lib/money.ts). */
  cents: number;
};

/** A time window: `from` is included, `to` is not (like "from Monday 00:00 up to, not including, next Monday"). */
export type DateRange = { from: Date; to: Date };

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** 00:00 local time on the day of `d`. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Effort points (and money) per member for the logs inside `range`. */
export function rangeTotals(members: Member[], taskList: Task[], logs: LogEntry[], range: DateRange) {
  const from = range.from.getTime();
  const to = range.to.getTime();
  const tasks = new Map(taskList.map((t) => [t.id, t]));
  const totals = new Map<string, MemberTotals>(
    members.map((m) => [
      m.id,
      { memberId: m.id, points: 0, byCategory: { mental: 0, physical: 0 }, count: 0, cents: 0 },
    ]),
  );

  for (const log of logs) {
    const t = new Date(log.at).getTime();
    const task = tasks.get(log.taskId);
    const row = totals.get(log.memberId);
    if (t < from || t >= to || !task || !row) continue;
    row.points += task.effort;
    row.byCategory[task.category] += task.effort;
    row.count += 1;
    if (log.amount) row.cents += toCents(log.amount);
  }

  const rows = [...totals.values()];
  const total = rows.reduce((sum, r) => sum + r.points, 0);
  const count = rows.reduce((sum, r) => sum + r.count, 0);
  const cents = rows.reduce((sum, r) => sum + r.cents, 0);
  return { rows, total, count, cents };
}

/** Effort points per member for the week containing `now`. */
export function weeklyTotals(state: HouseholdState, now: Date) {
  const from = startOfWeek(now);
  return rangeTotals(state.members, state.tasks, state.logs, { from, to: addDays(from, 7) });
}

// ---------------------------------------------------------------------------
// History periods
// ---------------------------------------------------------------------------

/**
 * How many months back History can show. The database enforces the same limit (history_floor() in
 * supabase/migrations/002_details_lists_history.sql); this copy only keeps the screen honest.
 */
export function historyMonths(plan: Plan): number {
  return plan === "premium" ? 6 : 2;
}

/** The oldest moment History may show for this plan: exactly 2 or 6 months before `now`. */
export function historyFloor(now: Date, plan: Plan): Date {
  return monthsAgo(now, historyMonths(plan));
}

export type Period = "thisWeek" | "lastWeek" | "thisMonth" | "last2Months" | "last3Months" | "last6Months";

export const PERIODS: { id: Period; label: string; premium: boolean }[] = [
  { id: "thisWeek", label: "This week", premium: false },
  { id: "lastWeek", label: "Last week", premium: false },
  { id: "thisMonth", label: "This month", premium: false },
  { id: "last2Months", label: "Last 2 months", premium: false },
  { id: "last3Months", label: "Last 3 months", premium: true },
  { id: "last6Months", label: "Last 6 months", premium: true },
];

/** What History shows: one of the periods, or a single day (picked from the week strip). */
export type HistoryView = { period: Period } | { period: "day"; day: string };

function monthsAgo(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() - months);
  return x;
}

/**
 * The date range for a History view, in the browser's local time.
 * `from` is never earlier than historyFloor(now, plan), whatever the view asks for.
 */
export function periodRange(view: HistoryView, now: Date, plan: Plan): DateRange {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const monday = startOfWeek(now);
  let range: DateRange;

  switch (view.period) {
    case "thisWeek":
      range = { from: monday, to: addDays(monday, 7) };
      break;
    case "lastWeek":
      range = { from: addDays(monday, -7), to: monday };
      break;
    case "thisMonth":
      range = { from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow };
      break;
    case "last2Months":
      range = { from: monthsAgo(today, 2), to: tomorrow };
      break;
    case "last3Months":
      range = { from: monthsAgo(today, 3), to: tomorrow };
      break;
    case "last6Months":
      range = { from: monthsAgo(today, 6), to: tomorrow };
      break;
    case "day": {
      const day = startOfDay(new Date(view.day));
      range = { from: day, to: addDays(day, 1) };
      break;
    }
  }

  const floor = historyFloor(now, plan);
  const from = range.from < floor ? floor : range.from;
  // A day older than the limit becomes an empty range instead of reaching further back.
  const to = range.to < from ? from : range.to;
  return { from, to };
}

export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}
