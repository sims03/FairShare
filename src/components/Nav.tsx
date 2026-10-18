"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import type { Membership } from "@/lib/data";
import { getSupabase } from "@/lib/supabase";
import { iconButton } from "@/lib/styles";
import type { Member } from "@/lib/types";
import { Avatar, Icon, Logo } from "./ui";

export const TABS = [
  { id: "log", label: "Log", title: null },
  { id: "lists", label: "Lists", title: "Lists" },
  { id: "week", label: "Week", title: "This week's balance" },
  { id: "history", label: "History", title: "History" },
  { id: "owners", label: "Owners", title: "Who owns what" },
  { id: "people", label: "People", title: "Your household" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

type NavProps = { tab: TabId; onSelect: (tab: TabId) => void };

/**
 * The six sections as pills on an ink background, shared by the desktop sidebar and the phone menu
 * so both always list the same sections in the same order. `large` = bigger rows for thumbs.
 */
function NavItems({ tab, onSelect, large = false }: NavProps & { large?: boolean }) {
  return (
    <nav aria-label="Main" className={`flex flex-col ${large ? "gap-2" : "gap-1.5"}`}>
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-full font-semibold transition ${
              large ? "p-2 pr-5 text-base" : "p-1.5 pr-4 text-sm"
            } ${active ? "bg-canvas text-ink" : "opacity-75 hover:bg-canvas/10 hover:opacity-100"}`}
          >
            <span
              className={`flex items-center justify-center rounded-full ${large ? "h-11 w-11" : "h-10 w-10"} ${
                active ? "bg-lavender text-black" : ""
              }`}
            >
              <Icon name={t.id} />
            </span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

type HouseholdProps = {
  householdId: string;
  memberships: Membership[];
  onSwitch: (householdId: string) => void;
};

/** Household picker, only shown to people in more than one household. */
function HouseholdSwitcher({ householdId, memberships, onSwitch }: HouseholdProps) {
  if (memberships.length <= 1) return null;
  return (
    <label className="flex flex-col gap-1.5 px-2 text-xs font-semibold opacity-90">
      Household
      <select
        value={householdId}
        onChange={(e) => onSwitch(e.target.value)}
        className="w-full rounded-full bg-canvas px-4 py-2.5 text-sm font-semibold text-ink"
      >
        {memberships.map(({ household: h }) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function UserChip({ me }: { me: Member }) {
  return (
    <div className="flex items-center gap-3 rounded-full bg-canvas/10 p-1.5 pr-4">
      <Avatar name={me.name} styleIndex={me.styleIndex} ring="ring-ink" />
      <span className="min-w-0 truncate text-sm font-bold">{me.name}</span>
    </div>
  );
}

type SidebarProps = NavProps & HouseholdProps & { me: Member | undefined };

/** Desktop (≥ 1024px): fixed ink sidebar with nav, household switcher and the current user. */
export function Sidebar({ tab, onSelect, me, householdId, memberships, onSwitch }: SidebarProps) {
  return (
    <aside className="fixed inset-y-4 left-4 z-10 hidden w-64 flex-col gap-8 rounded-[28px] bg-ink p-5 text-canvas lg:flex">
      <Logo className="px-2 pt-1" />
      <NavItems tab={tab} onSelect={onSelect} />
      <div className="mt-auto flex flex-col gap-4">
        <HouseholdSwitcher householdId={householdId} memberships={memberships} onSwitch={onSwitch} />
        {me && <UserChip me={me} />}
      </div>
    </aside>
  );
}

type MenuButtonProps = {
  ref: RefObject<HTMLButtonElement | null>;
  open: boolean;
  menuId: string;
  onOpen: () => void;
};

/** Phones and tablets (< 1024px): the round ☰ button in the header that opens the menu drawer. */
export function MenuButton({ ref, open, menuId, onOpen }: MenuButtonProps) {
  return (
    <button
      ref={ref}
      onClick={onOpen}
      aria-label="Open menu"
      aria-expanded={open}
      aria-controls={menuId}
      aria-haspopup="dialog"
      className={`${iconButton} bg-surface text-ink ring-1 ring-line lg:hidden`}
    >
      <Icon name="menu" />
    </button>
  );
}

type DrawerProps = SidebarProps & {
  id: string;
  /** Gets focus back when the drawer closes (the ☰ button). */
  returnFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
};

/**
 * Phones and tablets: the menu slides in from the right edge (the same side as the ☰ button, under
 * the right thumb). Built on <dialog> + showModal(), like LogDetailsSheet: the page behind becomes
 * inert, Tab stays inside, Esc closes it. Only mounted while open.
 */
export function MenuDrawer({ id, tab, onSelect, me, householdId, memberships, onSwitch, returnFocus, onClose }: DrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = dialog.current!;
    const back = returnFocus.current;
    d.showModal();
    closeButton.current?.focus();
    // Stop the page behind from scrolling while the menu is open (a modal <dialog> doesn't do this itself).
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
      if (d.open) d.close();
      // Tapping a button doesn't focus it on iPhone, so return focus to ☰ explicitly.
      if (back?.isConnected) back.focus();
    };
  }, [returnFocus]);

  // The drawer is phone/tablet only: if the window grows to desktop size, close it (the sidebar takes over).
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onChange = () => desktop.matches && onClose();
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, [onClose]);

  function go(next: TabId) {
    onSelect(next);
    onClose();
  }

  return (
    <dialog
      ref={dialog}
      id={id}
      aria-labelledby={titleId}
      // Esc: let React close it, so state and screen stay in step.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A tap on the dimmed backdrop lands on the <dialog> itself (the content fills the inner div).
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 ml-auto h-dvh max-h-none w-80 max-w-[calc(100vw-3rem)] overflow-hidden overscroll-contain rounded-l-[28px] border-0 bg-ink p-0 text-canvas shadow-2xl backdrop:bg-black/50 motion-safe:animate-drawer-in motion-safe:backdrop:animate-fade-in"
    >
      <div className="flex h-full flex-col gap-6 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-5 pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId}>
            <Logo className="px-2" />
            <span className="sr-only">menu</span>
          </h2>
          <button
            ref={closeButton}
            onClick={onClose}
            aria-label="Close menu"
            className={`${iconButton} bg-canvas/10 text-canvas`}
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <NavItems tab={tab} onSelect={go} large />

        <div className="mt-auto flex flex-col gap-4">
          <HouseholdSwitcher
            householdId={householdId}
            memberships={memberships}
            onSwitch={(next) => {
              onClose();
              onSwitch(next);
            }}
          />
          <button
            onClick={() => go("people")}
            className="flex items-center gap-3 rounded-full bg-lavender p-2 pr-5 text-sm font-bold text-black transition active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/60">
              <Icon name="share" />
            </span>
            Invite people
          </button>
          {me && <UserChip me={me} />}
          <button
            onClick={() => getSupabase().auth.signOut()}
            className="self-start rounded-full px-3 py-2 text-sm font-semibold underline underline-offset-4 opacity-75 hover:opacity-100"
          >
            Sign out
          </button>
        </div>
      </div>
    </dialog>
  );
}
