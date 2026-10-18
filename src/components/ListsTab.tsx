"use client";

import { useId, useState } from "react";
import { DONE_RECENTLY_DAYS, type ItemEdit } from "@/lib/data";
import { blackButton, colorCard, headline } from "@/lib/styles";
import { LIMITS, type HouseholdState, type ListItem, type ListKind, type Member } from "@/lib/types";
import { Avatar, ErrorNote, Icon, Loading } from "./ui";

const KINDS: Record<
  ListKind,
  { title: string; bg: string; done: string; addLabel: string; placeholder: string; emptyTitle: string; empty: string }
> = {
  shopping: {
    title: "What we need to buy",
    bg: "bg-tangerine",
    done: "Bought",
    addLabel: "Add to the shopping list",
    placeholder: "Milk, bin bags, coffee…",
    emptyTitle: "All stocked up 🧺",
    empty: "Nothing to buy right now. Add things here when you notice them running low.",
  },
  repair: {
    title: "Things to fix",
    bg: "bg-periwinkle",
    done: "Fixed",
    addLabel: "Add something that needs fixing",
    placeholder: "Dripping tap, squeaky door…",
    emptyTitle: "Everything works 🛠️",
    empty: "Nothing broken. When something stops working, note it here so it doesn't get forgotten.",
  },
};

/**
 * White fields on the coloured cards (black text in both themes). No width here on purpose: each use
 * sets its own (w-full, flex-1 or w-20). Two width classes on one element don't follow string order,
 * so a shared `w-full` used to beat the quantity box's `w-20` and push the + button off the card.
 */
const field = "rounded-full bg-white px-4 py-3 text-sm text-black placeholder:text-black/50";
/** Item name: takes the free space, and may shrink below the browser's default input width (min-w-0). */
const titleField = `${field} min-w-0 flex-1`;
/** Quantity: a fixed narrow box that never grows or shrinks. */
const qtyField = `${field} w-20 min-w-0 shrink-0 text-center`;

function clean(text: string): string | null {
  const t = text.trim();
  return t === "" ? null : t;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** The big round tick button. */
function Tick({ done, label, onToggle }: { done: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onToggle}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-black transition active:scale-90 ${
        done ? "bg-black text-white" : "bg-white text-transparent hover:text-black/30"
      }`}
    >
      <Icon name="check" className="h-5 w-5" />
    </button>
  );
}

type ItemProps = {
  item: ListItem;
  addedBy: Member | undefined;
  doneBy: Member | undefined;
  mine: boolean;
  onToggle: () => void;
  onEdit: (change: ItemEdit) => void;
  onDelete: () => void;
};

function ItemRow({ item, addedBy, doneBy, mine, onToggle, onEdit, onDelete }: ItemProps) {
  const look = KINDS[item.kind];
  const done = item.doneAt !== null;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const id = useId();

  function save(e: React.FormEvent) {
    e.preventDefault();
    const t = clean(title);
    if (!t) return;
    onEdit({ title: t, quantity: item.kind === "shopping" ? clean(quantity) : null, note: clean(note) });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="rounded-3xl bg-white/70 p-3">
        <form onSubmit={save} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              aria-label="Item"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={LIMITS.itemTitle}
              required
              className={titleField}
            />
            {item.kind === "shopping" && (
              <input
                aria-label="Quantity (optional)"
                placeholder="Qty"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                maxLength={LIMITS.itemQuantity}
                className={qtyField}
              />
            )}
          </div>
          <label htmlFor={`${id}-note`} className="px-2 text-xs font-bold text-black/70">
            Note (optional)
          </label>
          <textarea
            id={`${id}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={LIMITS.itemNote}
            rows={2}
            placeholder={item.kind === "shopping" ? "Brand, which shop…" : "Where, what happens…"}
            className={`${field.replace("rounded-full", "rounded-3xl")} w-full resize-none`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={`${blackButton} px-5 py-2.5`}>
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black"
            >
              Cancel
            </button>
            {mine && (
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto rounded-full px-3 py-2.5 text-sm font-semibold text-black/70 underline underline-offset-4"
              >
                Delete
              </button>
            )}
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`flex items-start gap-3 rounded-3xl p-2.5 ${done ? "" : "bg-white/60"}`}>
      <Tick done={done} label={`${look.done}: ${item.title}`} onToggle={onToggle} />
      <button
        onClick={() => setEditing(true)}
        aria-label={`Edit ${item.title}`}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-2xl py-1 text-left"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className={`break-words font-bold ${done ? "line-through opacity-60" : ""}`}>{item.title}</span>
          {item.quantity && (
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-bold tabular-nums">{item.quantity}</span>
          )}
        </span>
        {item.note && <span className="whitespace-pre-line break-words text-sm text-black/70">{item.note}</span>}
        {done && (
          <span className="text-xs font-medium text-black/70">
            {look.done}
            {doneBy ? ` by ${doneBy.name}` : ""} · {shortDate(item.doneAt!)}
          </span>
        )}
      </button>
      {addedBy && !done && (
        <span className="pt-1.5" title={`Added by ${addedBy.name}`}>
          <Avatar name={addedBy.name} styleIndex={addedBy.styleIndex} size="sm" ring="ring-transparent" />
          <span className="sr-only">Added by {addedBy.name}</span>
        </span>
      )}
    </li>
  );
}

type SectionProps = {
  kind: ListKind;
  items: ListItem[];
  members: Map<string, Member>;
  me: string;
  onAdd: (kind: ListKind, title: string, quantity: string | null) => void;
  onSetDone: (id: string, done: boolean) => void;
  onEdit: (id: string, change: ItemEdit) => void;
  onDelete: (id: string) => void;
};

function ListSection({ kind, items, members, me, onAdd, onSetDone, onEdit, onDelete }: SectionProps) {
  const look = KINDS[kind];
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("");
  const [showDone, setShowDone] = useState(false);
  const id = useId();

  const open = items.filter((i) => i.doneAt === null);
  const done = items
    .filter((i) => i.doneAt !== null)
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));

  function add(e: React.FormEvent) {
    e.preventDefault();
    const t = clean(title);
    if (!t) return;
    onAdd(kind, t, clean(quantity));
    setTitle("");
    setQuantity("");
  }

  const row = (item: ListItem) => (
    <ItemRow
      key={item.id}
      item={item}
      addedBy={members.get(item.createdBy)}
      doneBy={item.doneBy ? members.get(item.doneBy) : undefined}
      mine={item.createdBy === me}
      onToggle={() => onSetDone(item.id, item.doneAt === null)}
      onEdit={(change) => onEdit(item.id, change)}
      onDelete={() => onDelete(item.id)}
    />
  );

  return (
    <section className={`${colorCard} flex min-w-0 flex-col gap-4 ${look.bg}`} aria-labelledby={`${id}-title`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${id}-title`} className={`text-2xl sm:text-3xl ${headline}`}>
          {look.title}
        </h3>
        <span className="shrink-0 rounded-full bg-white/60 px-3 py-1 text-xs font-bold tabular-nums">
          {open.length} to do
        </span>
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input
          aria-label={look.addLabel}
          placeholder={look.placeholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={LIMITS.itemTitle}
          enterKeyHint="done"
          className={titleField}
        />
        {kind === "shopping" && (
          <input
            aria-label="Quantity (optional)"
            placeholder="Qty"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            maxLength={LIMITS.itemQuantity}
            className={qtyField}
          />
        )}
        <button
          type="submit"
          aria-label="Add"
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-black text-white transition hover:scale-105 active:scale-95"
        >
          <Icon name="log" />
        </button>
      </form>

      {open.length === 0 ? (
        <div className="rounded-3xl bg-white/60 p-4">
          <p className="font-bold">{look.emptyTitle}</p>
          <p className="mt-1 text-sm text-black/70">{look.empty}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">{open.map(row)}</ul>
      )}

      {done.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            aria-controls={`${id}-done`}
            className="flex items-center gap-1.5 rounded-full px-1 py-1 text-sm font-bold"
          >
            <Icon name="chevron" className={`h-4 w-4 transition ${showDone ? "rotate-180" : ""}`} />
            Done recently ({done.length})
          </button>
          {showDone && (
            <ul id={`${id}-done`} className="mt-2 flex flex-col gap-1">
              {done.map(row)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

type Props = {
  state: HouseholdState;
  items: ListItem[] | null;
  error: string | null;
  onAdd: SectionProps["onAdd"];
  onSetDone: SectionProps["onSetDone"];
  onEdit: SectionProps["onEdit"];
  onDelete: SectionProps["onDelete"];
};

export function ListsTab({ state, items, error, onAdd, onSetDone, onEdit, onDelete }: Props) {
  const members = new Map(state.members.map((m) => [m.id, m]));
  if (!items) return error ? <ErrorNote message={error} /> : <Loading label="Loading lists…" />;

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorNote message={error} />}
      {/* grid-cols-1 = one column of minmax(0, 1fr): the cards can never be wider than the screen. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        {(["shopping", "repair"] as const).map((kind) => (
          <ListSection
            key={kind}
            kind={kind}
            items={items.filter((i) => i.kind === kind)}
            members={members}
            me={state.currentMemberId}
            onAdd={onAdd}
            onSetDone={onSetDone}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
      <p className="px-2 text-center text-xs leading-relaxed text-muted">
        Ticked items stay under &ldquo;Done recently&rdquo; for {DONE_RECENTLY_DAYS} days. Tap an item to add a note or
        change it.
      </p>
    </div>
  );
}
