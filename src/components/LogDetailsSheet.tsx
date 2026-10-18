"use client";

import { useEffect, useId, useRef, useState } from "react";
import { currencySymbol, parseAmount } from "@/lib/money";
import { fieldLabel, headline, iconButton, input, primaryButton, secondaryButton, textArea } from "@/lib/styles";
import { LIMITS, type Currency, type LogDetails, type LogEntry, type Task } from "@/lib/types";
import { Icon } from "./ui";

type Props = {
  /** "new" right after logging (offers Undo), "edit" when opened from a list (offers Delete). */
  mode: "new" | "edit";
  log: LogEntry;
  task: Task;
  currency: Currency;
  onSave: (details: LogDetails) => void;
  /** Undo (new) or delete (edit) this log. */
  onRemove: () => void;
  onClose: () => void;
};

/** Empty text box → null, so the database stores "nothing" instead of "". */
function clean(text: string): string | null {
  const t = text.trim();
  return t === "" ? null : t;
}

/**
 * Optional details for a logged task: a bottom sheet on phones, a centred dialog on bigger screens.
 * Built on the browser's own <dialog> element: showModal() moves focus inside, keeps Tab inside,
 * makes the page behind inert and closes on Esc.
 */
export function LogDetailsSheet({ mode, log, task, currency, onSave, onRemove, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [detail, setDetail] = useState(log.detail ?? "");
  const [amount, setAmount] = useState(log.amount ?? "");
  const [note, setNote] = useState(log.note ?? "");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const id = useId();

  // Show bills/groceries fields when the task asks, or when an older log already has them.
  const showMoney = task.asksAmount || log.detail !== null || log.amount !== null;

  useEffect(() => {
    // Remember what had focus (the task button you tapped), so it gets focus back when the sheet closes.
    const returnTo = document.activeElement as HTMLElement | null;
    const d = dialog.current!;
    d.showModal();
    // Focus the close button rather than the first input: on phones, focusing an input pops up the
    // keyboard, which is too much for a sheet that is optional.
    closeButton.current?.focus();
    return () => {
      if (d.open) d.close();
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      setAmountError(parsed.error);
      return;
    }
    const details: LogDetails = {
      detail: showMoney ? clean(detail) : null,
      amount: showMoney ? parsed.value : null,
      note: clean(note),
    };
    const empty = details.detail === null && details.amount === null && details.note === null;
    // Nothing typed right after logging: same as Skip, no need to bother the database.
    if (!(mode === "new" && empty)) onSave(details);
    onClose();
  }

  const time = new Date(log.at).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      // Esc: let React decide when to close, so state and screen stay in step.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the dimmed backdrop lands on the <dialog> itself (the content sits in the inner div).
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[28px] border-0 bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-[28px]"
    >
      <div className="flex flex-col gap-5 p-5 pb-8 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-black ${
                task.category === "mental" ? "bg-lavender" : "bg-tangerine"
              }`}
            >
              {mode === "new" ? (
                <>
                  <Icon name="check" className="h-3.5 w-3.5" /> Logged
                </>
              ) : (
                time
              )}
            </span>
            <h2 id={`${id}-title`} className={`mt-2 text-2xl sm:text-3xl ${headline}`}>
              <span aria-hidden>{task.emoji} </span>
              {task.name}
              <span className="sr-only">{mode === "new" ? ": add details (optional)" : ": edit details"}</span>
            </h2>
            <p className="mt-1 text-sm text-muted" aria-hidden>
              {mode === "new" ? "Add details (optional)" : "Edit details"}
            </p>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${iconButton} h-10 w-10 bg-canvas text-ink ring-1 ring-line`}
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          {showMoney && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-detail`} className={fieldLabel}>
                  What was it?
                </label>
                <input
                  id={`${id}-detail`}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  maxLength={LIMITS.logDetail}
                  placeholder="e.g. Electricity bill"
                  autoComplete="off"
                  className={input}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-amount`} className={fieldLabel}>
                  How much? ({currency})
                </label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-bold text-muted"
                    aria-hidden
                  >
                    {currencySymbol(currency)}
                  </span>
                  <input
                    id={`${id}-amount`}
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setAmountError(null);
                    }}
                    inputMode="decimal"
                    placeholder="0.00"
                    autoComplete="off"
                    maxLength={13}
                    aria-invalid={amountError ? true : undefined}
                    aria-describedby={amountError ? `${id}-amount-error` : undefined}
                    className={`${input.replace("px-5", "pl-14 pr-5")} tabular-nums`}
                  />
                </div>
              </div>
              {amountError && (
                <p id={`${id}-amount-error`} role="alert" className="text-sm font-semibold text-ink sm:col-span-2">
                  {amountError}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-note`} className={fieldLabel}>
              Comment
            </label>
            <textarea
              id={`${id}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={LIMITS.logNote}
              rows={3}
              placeholder={mode === "new" ? "Anything worth knowing? (optional)" : "Optional"}
              aria-describedby={`${id}-note-count`}
              className={textArea}
            />
            <p id={`${id}-note-count`} className="px-1 text-right text-xs tabular-nums text-muted">
              {note.length}/{LIMITS.logNote}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="submit" className={primaryButton}>
              {mode === "new" ? "Save details" : "Save"}
            </button>
            <button type="button" onClick={onClose} className={secondaryButton}>
              {mode === "new" ? "Skip" : "Cancel"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (mode === "edit" && !confirmDelete) return setConfirmDelete(true);
              onRemove();
              onClose();
            }}
            className="self-center rounded-full px-4 py-2 text-sm font-semibold text-muted underline underline-offset-4 hover:text-ink"
          >
            {mode === "new" ? "Undo log" : confirmDelete ? "Tap again to delete this log" : "Delete log"}
          </button>
        </form>
      </div>
    </dialog>
  );
}
