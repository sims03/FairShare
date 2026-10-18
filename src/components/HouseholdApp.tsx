"use client";

import { useId, useRef, useState } from "react";
import type { HistoryView } from "@/lib/balance";
import { useHousehold, useLists, type Membership } from "@/lib/data";
import { headline, iconButton } from "@/lib/styles";
import { BalanceTab } from "./BalanceTab";
import { HistoryTab } from "./HistoryTab";
import { ListsTab } from "./ListsTab";
import { LogTab } from "./LogTab";
import { MenuButton, MenuDrawer, Sidebar, TABS, type TabId } from "./Nav";
import { OwnershipTab } from "./OwnershipTab";
import { PeopleTab } from "./PeopleTab";
import { Avatar, ErrorNote, Icon, Loading, PageTitle } from "./ui";

function todayLabel() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type Props = {
  householdId: string;
  userId: string;
  memberships: Membership[];
  onSwitch: (householdId: string) => void;
  onAddHousehold: () => void;
};

export function HouseholdApp({ householdId, userId, memberships, onSwitch, onAddHousehold }: Props) {
  const { state, error, logTask, removeLog, updateLog, setCurrency, handOver } = useHousehold(householdId, userId);
  // Lists load with the household, so switching tabs doesn't flash a loading state.
  const lists = useLists(householdId, userId);
  const [tab, setTab] = useState<TabId>("log");
  // Kept here (not in HistoryTab) so the chosen period survives switching tabs.
  const [historyView, setHistoryView] = useState<HistoryView>({ period: "thisWeek" });
  // Phones and tablets: the ☰ menu drawer.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  function openDay(day: Date) {
    setHistoryView({ period: "day", day: day.toISOString() });
    setTab("history");
  }

  if (!state) {
    return error ? (
      <div className="mx-auto w-full max-w-xl p-6">
        <ErrorNote message={error} />
      </div>
    ) : (
      <Loading />
    );
  }

  const me = state.members.find((m) => m.id === userId);
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="flex-1 lg:pl-72">
      <Sidebar
        tab={tab}
        onSelect={setTab}
        me={me}
        householdId={householdId}
        memberships={memberships}
        onSwitch={onSwitch}
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col px-4 pb-12 pt-6 sm:px-6 lg:px-10 lg:pt-8">
        {/* Phone: [avatar] [Hello / date] [+] [☰]. Desktop: [avatar] [Hello / date] [+] [invite]. */}
        <header className="mb-6 flex items-center gap-2.5 sm:gap-4">
          {me && <Avatar name={me.name} styleIndex={me.styleIndex} size="header" />}
          <div className="min-w-0 flex-1">
            <h1 className={`line-clamp-2 break-words text-2xl sm:text-3xl ${headline}`}>Hello, {me?.name ?? "there"}</h1>
            <p className="truncate text-sm font-medium text-muted">
              Today {todayLabel()} · {state.household.name}
            </p>
          </div>
          <button onClick={() => setTab("log")} aria-label="Log a task" className={`${iconButton} bg-ink text-canvas`}>
            <Icon name="log" />
          </button>
          <button
            onClick={() => setTab("people")}
            aria-label="Invite people"
            className={`${iconButton} bg-surface text-ink ring-1 ring-line max-lg:hidden`}
          >
            <Icon name="share" />
          </button>
          <MenuButton ref={menuButton} open={menuOpen} menuId={menuId} onOpen={() => setMenuOpen(true)} />
        </header>

        {current.title && <PageTitle>{current.title}</PageTitle>}

        {error && (
          <div className="mb-4">
            <ErrorNote message={error} />
          </div>
        )}

        <main className="flex-1">
          {tab === "log" && (
            <LogTab state={state} onLog={logTask} onRemove={removeLog} onUpdate={updateLog} onOpenDay={openDay} />
          )}
          {tab === "lists" && (
            <ListsTab
              state={state}
              items={lists.items}
              error={lists.error}
              onAdd={lists.addItem}
              onSetDone={lists.setDone}
              onEdit={lists.editItem}
              onDelete={lists.deleteItem}
            />
          )}
          {tab === "week" && <BalanceTab state={state} />}
          {tab === "history" && (
            <HistoryTab
              state={state}
              view={historyView}
              onViewChange={setHistoryView}
              onBackToLog={() => setTab("log")}
              onUpdateLog={updateLog}
              onRemoveLog={removeLog}
            />
          )}
          {tab === "owners" && <OwnershipTab state={state} onHandOver={handOver} />}
          {tab === "people" && (
            <PeopleTab
              state={state}
              memberships={memberships}
              onSwitch={onSwitch}
              onAddHousehold={onAddHousehold}
              onCurrencyChange={setCurrency}
            />
          )}
        </main>
      </div>

      {menuOpen && (
        <MenuDrawer
          id={menuId}
          tab={tab}
          onSelect={setTab}
          me={me}
          householdId={householdId}
          memberships={memberships}
          onSwitch={onSwitch}
          returnFocus={menuButton}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
