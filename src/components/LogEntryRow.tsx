"use client";

import { formatMoney, toCents } from "@/lib/money";
import type { Currency, LogEntry, Member, Task } from "@/lib/types";
import { Avatar } from "./ui";

type Props = {
  log: LogEntry;
  task: Task;
  who: Member;
  currency: Currency;
  time: string;
  /** Only your own logs get this: tapping opens the details sheet. */
  onEdit?: () => void;
};

/**
 * One logged task: "Alex · 🧾 Paid a bill · Electricity · €45.20", the comment underneath, and the time.
 * All text goes through React, which escapes it, so a comment like "<script>" shows up as plain text.
 */
export function LogEntryRow({ log, task, who, currency, time, onEdit }: Props) {
  const extras = [log.detail, log.amount !== null ? formatMoney(toCents(log.amount), currency) : null].filter(Boolean);

  const content = (
    <>
      <Avatar name={who.name} styleIndex={who.styleIndex} size="sm" ring="ring-surface" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="break-words">
          <strong className="font-bold">{who.name}</strong> · <span aria-hidden>{task.emoji} </span>
          {task.name}
          {extras.map((x, i) => (
            <span key={i}> · {x}</span>
          ))}
        </span>
        {log.note && <span className="whitespace-pre-line break-words text-xs text-muted">{log.note}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted">
        {time}
        {onEdit && <span className="font-semibold text-lavender-deep">Edit</span>}
      </span>
    </>
  );

  return (
    <li>
      {onEdit ? (
        <button
          onClick={onEdit}
          className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-2xl px-2 py-1.5 text-left text-sm transition hover:bg-canvas"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-3 py-1.5 text-sm">{content}</div>
      )}
    </li>
  );
}
