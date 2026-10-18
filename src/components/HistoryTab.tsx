"use client";

import { useMemo, useState } from "react";
import { historyMonths, PERIODS, periodRange, rangeTotals, startOfDay, type HistoryView } from "@/lib/balance";
import { useHistory } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { blackButton, card, chip, colorCard, headline, iconButton, secondaryButton } from "@/lib/styles";
import type { HouseholdState, LogDetails, LogEntry } from "@/lib/types";
import { ShareList, StatTile } from "./BalanceTab";
import { LogDetailsSheet } from "./LogDetailsSheet";
import { LogEntryRow } from "./LogEntryRow";
import { Avatar, ErrorNote, Icon, Loading } from "./ui";

type Props = {
  state: HouseholdState;
  view: HistoryView;
  onViewChange: (view: HistoryView) => void;
  onBackToLog: () => void;
  onUpdateLog: (logId: string, details: LogDetails) => void;
  onRemoveLog: (logId: string) => void;
};

/** "Today", "Yesterday", or "Mon 13 Oct". */
function dayLabel(day: Date, today: Date): string {
  const diff = Math.round((startOfDay(today).getTime() - day.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Logs (already newest first) grouped by the local calendar day they happened on. */
function groupByDay(logs: LogEntry[]) {
  const groups: { day: Date; logs: LogEntry[] }[] = [];
  for (const log of logs) {
    const day = startOfDay(new Date(log.at));
    const last = groups[groups.length - 1];
    if (last && last.day.getTime() === day.getTime()) last.logs.push(log);
    else groups.push({ day, logs: [log] });
  }
  return groups;
}

function PremiumCard({ onClose }: { onClose: () => void }) {
  return (
    <section className={`${colorCard} relative bg-bubblegum`} aria-labelledby="premium-title">
      <button
        onClick={onClose}
        aria-label="Close"
        className={`${iconButton} absolute right-4 top-4 h-10 w-10 bg-white/60 text-black`}
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1 text-xs font-bold text-white">
        <Icon name="lock" className="h-3.5 w-3.5" /> Premium
      </span>
      <h3 id="premium-title" className={`mt-3 pr-12 text-2xl sm:text-3xl ${headline}`}>
        FairShare Premium: see up to 6 months of history
      </h3>
      <ul className="mt-4 flex flex-col gap-2 text-sm font-medium text-black/80">
        {[
          "Look back 3 or 6 months instead of 2",
          "See how the load shifted over a season",
          "Your older logs are kept safe, ready when you upgrade",
        ].map((b) => (
          <li key={b} className="flex items-start gap-2">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
            {b}
          </li>
        ))}
      </ul>
      <button disabled className={`${blackButton} mt-5`}>
        Coming soon
      </button>
    </section>
  );
}

export function HistoryTab({ state, view, onViewChange, onBackToLog, onUpdateLog, onRemoveLog }: Props) {
  const plan = state.household.plan;
  // "Now" is fixed when the tab opens, so the date range (and the query) stays the same while you look.
  const [now] = useState(() => new Date());
  const range = useMemo(() => periodRange(view, now, plan), [view, now, plan]);
  const history = useHistory(state.household.id, range, plan);
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [showPremium, setShowPremium] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const tasks = useMemo(() => new Map(state.tasks.map((t) => [t.id, t])), [state.tasks]);
  const members = useMemo(() => new Map(state.members.map((m) => [m.id, m])), [state.members]);
  const currency = state.household.currency;

  const logs = history.logs;
  const shown = logs ? logs.filter((l) => !memberFilter || l.memberId === memberFilter) : null;
  const summary = logs ? rangeTotals(state.members, state.tasks, logs, range) : null;
  const focus = summary && memberFilter ? summary.rows.find((r) => r.memberId === memberFilter) : null;
  const editLog = editing ? logs?.find((l) => l.id === editing) : undefined;
  const editTask = editLog && tasks.get(editLog.taskId);

  const dayMode = view.period === "day";
  const longDay = dayMode
    ? new Date(view.day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "";

  return (
    <div className="flex flex-col gap-5">
      {dayMode && (
        <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
          <p className="text-sm">
            Showing <strong className="font-bold">{longDay}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={onBackToLog} className={`${secondaryButton} py-2.5`}>
              <Icon name="back" className="h-4 w-4" /> Back to Log
            </button>
            <button onClick={() => onViewChange({ period: "thisWeek" })} className={`${secondaryButton} py-2.5`}>
              Whole week
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Period" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {PERIODS.map((p) => {
            const locked = p.premium && plan !== "premium";
            const selected = !locked && view.period === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  // Locked periods show what Premium is instead of changing the view.
                  setShowPremium(locked);
                  if (!locked) onViewChange({ period: p.id });
                }}
                aria-pressed={selected}
                aria-label={locked ? `${p.label} (Premium)` : undefined}
                className={chip(selected)}
              >
                {locked && <Icon name="lock" className="h-3.5 w-3.5" />}
                {p.label}
                {locked && (
                  <span className="rounded-full bg-bubblegum px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                    Premium
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {state.members.length > 1 && (
          <div role="group" aria-label="Person" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <button onClick={() => setMemberFilter(null)} aria-pressed={memberFilter === null} className={chip(memberFilter === null)}>
              Everyone
            </button>
            {state.members.map((m) => (
              <button
                key={m.id}
                onClick={() => setMemberFilter(m.id)}
                aria-pressed={memberFilter === m.id}
                className={`${chip(memberFilter === m.id)} py-1.5 pl-1.5`}
              >
                <Avatar name={m.name} styleIndex={m.styleIndex} size="sm" ring="ring-transparent" />
                {m.id === state.currentMemberId ? "You" : m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {showPremium && <PremiumCard onClose={() => setShowPremium(false)} />}

      {history.error && <ErrorNote message={history.error} />}

      {!logs || !summary || !shown ? (
        !history.error && <Loading label="Loading history…" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:col-span-2 xl:col-span-3">
              <StatTile value={focus ? focus.points : summary.total} label="Effort points" icon="bolt" bg="bg-periwinkle" />
              <StatTile value={focus ? focus.count : summary.count} label="Tasks logged" icon="check" bg="bg-tangerine" />
              <div className="col-span-2 sm:col-span-1">
                <StatTile
                  value={formatMoney(focus ? focus.cents : summary.cents, currency)}
                  label="Money logged"
                  icon="wallet"
                  bg="bg-lavender"
                  compact
                />
              </div>
            </div>
            {summary.total > 0 && (
              <section className={`${card} md:col-span-2 xl:col-span-3`}>
                <h3 className="mb-4 text-lg font-extrabold tracking-tight">Everyone&apos;s share</h3>
                <ShareList
                  rows={summary.rows}
                  total={summary.total}
                  members={state.members}
                  me={state.currentMemberId}
                  highlight={memberFilter}
                />
              </section>
            )}
          </div>

          {history.hasMore && (
            <p className="px-2 text-xs text-muted">
              These totals include the {logs.length} newest entries loaded so far. Load more below to include older ones.
            </p>
          )}

          {shown.length === 0 ? (
            <div className={`${card} text-sm text-muted`}>
              {dayMode ? "Nothing logged on this day." : "Nothing logged in this period."}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groupByDay(shown).map((g) => (
                <section key={g.day.getTime()} className={card} aria-label={dayLabel(g.day, now)}>
                  <h3 className="mb-3 text-lg font-extrabold tracking-tight">{dayLabel(g.day, now)}</h3>
                  <ul className="flex flex-col gap-1.5">
                    {g.logs.map((log) => {
                      const task = tasks.get(log.taskId);
                      const who = members.get(log.memberId);
                      if (!task || !who) return null;
                      return (
                        <LogEntryRow
                          key={log.id}
                          log={log}
                          task={task}
                          who={who}
                          currency={currency}
                          time={new Date(log.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          onEdit={log.memberId === state.currentMemberId ? () => setEditing(log.id) : undefined}
                        />
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {history.hasMore && (
            <button onClick={history.loadMore} disabled={history.loadingMore} className={`${secondaryButton} self-center`}>
              {history.loadingMore ? "Loading…" : "Load more"}
            </button>
          )}

          <p className="px-2 text-center text-xs leading-relaxed text-muted">
            {plan === "premium" ? "Premium" : "Free plan"}: history goes back {historyMonths(plan)} months. A snapshot
            to talk about together, not a scorecard.
          </p>
        </>
      )}

      {editLog && editTask && (
        <LogDetailsSheet
          key={editLog.id}
          mode="edit"
          log={editLog}
          task={editTask}
          currency={currency}
          onSave={(details) => {
            onUpdateLog(editLog.id, details);
            history.patchLog(editLog.id, details);
          }}
          onRemove={() => {
            onRemoveLog(editLog.id);
            history.dropLog(editLog.id);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
