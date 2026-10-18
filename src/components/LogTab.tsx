"use client";

import { useState } from "react";
import { startOfWeek, weeklyTotals } from "@/lib/balance";
import { card, chip, colorCard, headline } from "@/lib/styles";
import type { Category, HouseholdState, LogDetails, LogEntry } from "@/lib/types";
import { LogDetailsSheet } from "./LogDetailsSheet";
import { LogEntryRow } from "./LogEntryRow";
import { AvatarStack, Icon, LogoMark } from "./ui";

const FILTERS: { id: "all" | Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mental", label: "Thinking & planning" },
  { id: "physical", label: "Doing" },
];

// Planning tasks are lavender cards, doing tasks are tangerine cards.
const CATEGORY_LOOK: Record<Category, { label: string; bg: string }> = {
  mental: { label: "Planning", bg: "bg-lavender" },
  physical: { label: "Doing", bg: "bg-tangerine" },
};

function EffortDots({ effort }: { effort: number }) {
  return (
    <span className="flex gap-1" role="img" aria-label={`Effort ${effort} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`h-2 w-2 rounded-full ${n <= effort ? "bg-black" : "bg-black/20"}`} />
      ))}
    </span>
  );
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Mon–Sun pills for this week. Today is the black pill with a star; a dot marks days with logs.
 * Tapping a day (up to today) opens History for that day.
 */
function WeekStrip({ logs, now, onOpenDay }: { logs: LogEntry[]; now: Date; onOpenDay: (day: Date) => void }) {
  const monday = startOfWeek(now);
  const counts = new Map<string, number>();
  for (const log of logs) {
    const key = new Date(log.at).toDateString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  return (
    <ol aria-label="This week (tap a day to see it in History)" className="grid grid-cols-7 gap-1.5 sm:gap-3">
      {days.map((d) => {
        const key = d.toDateString();
        const today = key === now.toDateString();
        const count = counts.get(key) ?? 0;
        const future = d > now;
        const long = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
        return (
          <li key={key}>
            <button
              onClick={() => onOpenDay(d)}
              disabled={future}
              aria-label={`${today ? "Today, " : ""}${long}: ${count} ${count === 1 ? "task" : "tasks"} logged${
                future ? "" : ". Show in History"
              }`}
              aria-current={today ? "date" : undefined}
              className={`flex w-full flex-col items-center gap-1 rounded-full py-3 transition enabled:hover:-translate-y-0.5 disabled:opacity-50 ${
                today ? "bg-ink text-canvas" : "bg-surface text-ink ring-1 ring-line"
              }`}
            >
              <span className="text-[11px] font-semibold opacity-70" aria-hidden>
                {today ? "★" : d.toLocaleDateString("en-GB", { weekday: "short" })}
              </span>
              <span className="text-lg font-extrabold tabular-nums" aria-hidden>
                {d.getDate()}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${count > 0 ? (today ? "bg-lavender" : "bg-lavender-deep") : "bg-transparent"}`}
                aria-hidden
              />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

type Props = {
  state: HouseholdState;
  onLog: (taskId: string) => string;
  onRemove: (logId: string) => void;
  onUpdate: (logId: string, details: LogDetails) => void;
  onOpenDay: (day: Date) => void;
};

export function LogTab({ state, onLog, onRemove, onUpdate, onOpenDay }: Props) {
  const [filter, setFilter] = useState<"all" | Category>("all");
  // The details sheet: right after logging ("new") or when you tap one of your own entries ("edit").
  const [sheet, setSheet] = useState<{ logId: string; mode: "new" | "edit" } | null>(null);

  const now = new Date();
  const { rows, total } = weeklyTotals(state, now);
  const logged = rows.reduce((sum, r) => sum + r.count, 0);
  const tasks = new Map(state.tasks.map((t) => [t.id, t]));
  const members = new Map(state.members.map((m) => [m.id, m]));
  const recent = [...state.logs].reverse().slice(0, 6);
  const sheetLog = sheet && state.logs.find((l) => l.id === sheet.logId);
  const sheetTask = sheetLog && tasks.get(sheetLog.taskId);

  return (
    <div className="flex flex-col gap-5">
      {/*
        The mascot has its own grid column, so it can never cover the text. Phones: it sits beside the
        headline and the sentence below uses the full width. From 640px: it spans all three rows on the right.
      */}
      <section
        className={`${colorCard} grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 bg-lavender sm:gap-x-8`}
      >
        <h2 className={`self-center text-4xl sm:self-end sm:text-5xl ${headline}`}>Share the load</h2>
        <LogoMark className="col-start-2 row-start-1 h-20 w-20 rotate-6 sm:row-span-3 sm:h-32 sm:w-32 sm:self-center lg:h-36 lg:w-36" />
        <p className="col-span-2 text-sm font-medium text-black/75 sm:col-span-1 sm:text-base">
          {logged === 0
            ? "Nothing logged yet this week. Tap a task below to start."
            : `${logged} ${logged === 1 ? "task" : "tasks"} logged this week, ${total} effort points so far.`}
        </p>
        <div className="col-span-2 mt-2 sm:col-span-1">
          <AvatarStack members={state.members} ring="ring-lavender" />
        </div>
      </section>

      <WeekStrip logs={state.logs} now={now} onOpenDay={onOpenDay} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <section className="flex flex-col gap-4">
          <h2 className={`text-2xl sm:text-3xl ${headline}`}>What did you just take care of?</h2>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={chip(filter === f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 min-[1400px]:grid-cols-4">
            {state.tasks
              .filter((t) => filter === "all" || t.category === filter)
              .map((task) => {
                const look = CATEGORY_LOOK[task.category];
                return (
                  <button
                    key={task.id}
                    onClick={() => setSheet({ logId: onLog(task.id), mode: "new" })}
                    className={`group flex min-h-40 flex-col items-start justify-between gap-3 rounded-[28px] p-4 text-left text-black transition hover:-translate-y-0.5 active:scale-95 sm:p-5 ${look.bg}`}
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/60 text-xl" aria-hidden>
                        {task.emoji}
                      </span>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white transition group-hover:scale-110">
                        <Icon name="log" className="h-4 w-4" />
                      </span>
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-black/65">{look.label}</span>
                      <span className="text-base font-extrabold leading-tight tracking-tight">{task.name}</span>
                    </span>
                    <EffortDots effort={task.effort} />
                  </button>
                );
              })}
          </div>
        </section>

        <section className={`${card} xl:sticky xl:top-8`}>
          <h2 className="mb-4 text-lg font-extrabold tracking-tight">Recently logged</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet this week. Tap a task to log it.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {recent.map((log) => {
                const task = tasks.get(log.taskId);
                const who = members.get(log.memberId);
                if (!task || !who) return null;
                return (
                  <LogEntryRow
                    key={log.id}
                    log={log}
                    task={task}
                    who={who}
                    currency={state.household.currency}
                    time={timeLabel(log.at)}
                    onEdit={
                      log.memberId === state.currentMemberId
                        ? () => setSheet({ logId: log.id, mode: "edit" })
                        : undefined
                    }
                  />
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {sheet && sheetLog && sheetTask && (
        <LogDetailsSheet
          key={sheetLog.id}
          mode={sheet.mode}
          log={sheetLog}
          task={sheetTask}
          currency={state.household.currency}
          onSave={(details) => onUpdate(sheetLog.id, details)}
          onRemove={() => onRemove(sheetLog.id)}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
