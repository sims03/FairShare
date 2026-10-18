"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { historyFloor, startOfWeek, type DateRange } from "./balance";
import { newId } from "./ids";
import { getSupabase } from "./supabase";
import type {
  Category,
  Currency,
  Household,
  HouseholdState,
  ListItem,
  ListKind,
  LogDetails,
  LogEntry,
  Plan,
} from "./types";

type DbError = { code?: string; message: string };

/**
 * Turns a database error into something a person can act on. "Column does not exist" / "table not found"
 * almost always means migration 002 hasn't been run yet.
 */
export function explain(error: DbError): string {
  const missing =
    ["42703", "42P01", "PGRST204", "PGRST205"].includes(error.code ?? "") ||
    /does not exist|schema cache/i.test(error.message);
  return missing
    ? "The database needs an update: run supabase/migrations/002_details_lists_history.sql in the Supabase " +
        "SQL Editor (see supabase/README.md), then reload this page."
    : error.message;
}

/**
 * Runs writes for the same row one after another, in the order they were made.
 * Example: you log a task and add details a second later. The "add details" update must wait until the
 * insert has reached the database, or it would update nothing.
 */
function useSerialWrites() {
  const chains = useRef(new Map<string, Promise<void>>());
  return useCallback((key: string, write: () => PromiseLike<unknown>) => {
    const previous = chains.current.get(key) ?? Promise.resolve();
    const next = previous.then(write).then(
      () => {},
      () => {},
    );
    chains.current.set(key, next);
    next.then(() => {
      if (chains.current.get(key) === next) chains.current.delete(key);
    });
  }, []);
}

// `amount::text` asks the database to send the money as exact text ("45.20"), not as a JSON number.
const LOG_COLUMNS = "id, task_id, user_id, at, detail, amount::text, note";

type LogRow = {
  id: string;
  task_id: string;
  user_id: string;
  at: string;
  detail: string | null;
  amount: string | null;
  note: string | null;
};

function toLogEntry(l: LogRow): LogEntry {
  return { id: l.id, taskId: l.task_id, memberId: l.user_id, at: l.at, detail: l.detail, amount: l.amount, note: l.note };
}

export function useSession() {
  // undefined = still loading, null = signed out.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return session;
}

export type Membership = { household: Pick<Household, "id" | "name" | "inviteCode">; displayName: string };

/** Households the signed-in user belongs to. */
export function useMemberships(userId: string) {
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("household_members")
      .select("display_name, joined_at, households (id, name, invite_code)")
      .eq("user_id", userId)
      .order("joined_at");
    if (error) return setError(explain(error));
    setMemberships(
      data.map((row) => {
        const h = row.households as unknown as { id: string; name: string; invite_code: string };
        return { household: { id: h.id, name: h.name, inviteCode: h.invite_code }, displayName: row.display_name };
      }),
    );
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  return { memberships, error, reload };
}

export async function createHousehold(name: string, displayName: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("create_household", {
    p_name: name,
    p_display_name: displayName,
  });
  if (error) throw new Error(explain(error));
  return data as string;
}

export async function joinHousehold(code: string, displayName: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("join_household", {
    p_code: code,
    p_display_name: displayName,
  });
  if (error) throw new Error(explain(error));
  return data as string;
}

async function loadHousehold(householdId: string, userId: string): Promise<HouseholdState> {
  const supabase = getSupabase();
  const since = startOfWeek(new Date()).toISOString();

  const [household, members, tasks, logs, areas] = await Promise.all([
    supabase.from("households").select("id, name, invite_code, currency, plan").eq("id", householdId).single(),
    supabase
      .from("household_members")
      .select("user_id, display_name, style_index, role")
      .eq("household_id", householdId)
      .order("joined_at"),
    supabase
      .from("tasks")
      .select("id, name, emoji, category, effort, asks_amount")
      .eq("household_id", householdId)
      .order("created_at"),
    supabase.from("logs").select(LOG_COLUMNS).eq("household_id", householdId).gte("at", since).order("at"),
    supabase
      .from("areas")
      .select("id, name, emoji, owner_id, rotate_every_days, since")
      .eq("household_id", householdId)
      .order("name"),
  ]);

  const failed = [household, members, tasks, logs, areas].find((r) => r.error);
  if (failed?.error) throw new Error(explain(failed.error));

  return {
    household: {
      id: household.data!.id,
      name: household.data!.name,
      inviteCode: household.data!.invite_code,
      currency: household.data!.currency as Currency,
      plan: household.data!.plan === "premium" ? "premium" : "free",
    },
    currentMemberId: userId,
    members: members.data!.map((m) => ({
      id: m.user_id,
      name: m.display_name,
      styleIndex: m.style_index,
      role: m.role,
    })),
    tasks: tasks.data!.map((t) => ({
      id: t.id,
      name: t.name,
      emoji: t.emoji,
      category: t.category as Category,
      effort: t.effort,
      asksAmount: t.asks_amount,
    })),
    logs: (logs.data as unknown as LogRow[]).map(toLogEntry),
    areas: areas.data!.map((a) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      ownerId: a.owner_id,
      rotateEveryDays: a.rotate_every_days,
      since: a.since,
    })),
  };
}

/** Everything for one household, with optimistic actions. */
export function useHousehold(householdId: string, userId: string) {
  const [state, setState] = useState<HouseholdState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serial = useSerialWrites();

  const reload = useCallback(async () => {
    try {
      setState(await loadHousehold(householdId, userId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [householdId, userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(null);
    reload();
    // Pick up what other members logged when you come back to the tab.
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  /** The database said no: show why and reload the real data. */
  const failed = useCallback(
    (message: string) => {
      setError(message);
      reload();
    },
    [reload],
  );

  const logTask = useCallback(
    (taskId: string) => {
      const id = newId();
      const at = new Date().toISOString();
      const entry: LogEntry = { id, taskId, memberId: userId, at, detail: null, amount: null, note: null };
      setState((s) => s && { ...s, logs: [...s.logs, entry] });
      serial(id, () =>
        getSupabase()
          .from("logs")
          .insert({ id, household_id: householdId, task_id: taskId, at })
          .then(({ error }) => {
            if (error) failed(explain(error));
          }),
      );
      return id;
    },
    [householdId, userId, serial, failed],
  );

  const removeLog = useCallback(
    (logId: string) => {
      setState((s) => s && { ...s, logs: s.logs.filter((l) => l.id !== logId) });
      serial(logId, () =>
        getSupabase()
          .from("logs")
          .delete()
          .eq("id", logId)
          .then(({ error }) => {
            if (error) failed(explain(error));
          }),
      );
    },
    [serial, failed],
  );

  /** Save the bill name / amount / comment on one of your own logs. */
  const updateLog = useCallback(
    (logId: string, details: LogDetails) => {
      setState((s) => s && { ...s, logs: s.logs.map((l) => (l.id === logId ? { ...l, ...details } : l)) });
      serial(logId, () =>
        getSupabase()
          .from("logs")
          .update(details)
          .eq("id", logId)
          .select("id")
          .then(({ data, error }) => {
            if (error) failed(explain(error));
            // Row-level security doesn't raise an error for a log you may not edit: it just changes 0 rows.
            else if (data.length === 0) failed("Couldn't save those details. You can only edit your own logs.");
          }),
      );
    },
    [serial, failed],
  );

  const setCurrency = useCallback(
    (currency: Currency) => {
      setState((s) => s && { ...s, household: { ...s.household, currency } });
      serial(householdId, () =>
        getSupabase()
          .from("households")
          .update({ currency })
          .eq("id", householdId)
          .then(({ error }) => {
            if (error) failed(explain(error));
          }),
      );
    },
    [householdId, serial, failed],
  );

  const handOver = useCallback(
    (areaId: string, toMemberId: string) => {
      const since = new Date().toISOString();
      setState(
        (s) =>
          s && { ...s, areas: s.areas.map((a) => (a.id === areaId ? { ...a, ownerId: toMemberId, since } : a)) },
      );
      getSupabase()
        .from("areas")
        .update({ owner_id: toMemberId, since })
        .eq("id", areaId)
        .then(({ error }) => {
          if (error) failed(explain(error));
        });
    },
    [failed],
  );

  return { state, error, logTask, removeLog, updateLog, setCurrency, handOver };
}

// ---------------------------------------------------------------------------
// History: logs for one date range, newest first, 200 at a time.
// ---------------------------------------------------------------------------

export const HISTORY_PAGE_SIZE = 200;

async function fetchHistoryPage(
  householdId: string,
  range: DateRange,
  plan: Plan,
  offset: number,
): Promise<LogEntry[]> {
  // Never ask for more than the plan allows. The database refuses older rows anyway (history_floor()),
  // this just avoids asking.
  const floor = historyFloor(new Date(), plan);
  const from = range.from < floor ? floor : range.from;

  const { data, error } = await getSupabase()
    .from("logs")
    .select(LOG_COLUMNS)
    .eq("household_id", householdId)
    .gte("at", from.toISOString())
    .lt("at", range.to.toISOString())
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + HISTORY_PAGE_SIZE - 1);
  if (error) throw new Error(explain(error));
  return (data as unknown as LogRow[]).map(toLogEntry);
}

type HistoryResult = { key: string; logs: LogEntry[]; hasMore: boolean; error: string | null };

export function useHistory(householdId: string, range: DateRange, plan: Plan) {
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  // Each answer is tagged with the range it belongs to, so an old answer arriving late is ignored.
  const key = `${householdId}|${plan}|${fromIso}|${toIso}`;
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const r = { from: new Date(fromIso), to: new Date(toIso) };
    fetchHistoryPage(householdId, r, plan, 0).then(
      (logs) => setResult({ key, logs, hasMore: logs.length === HISTORY_PAGE_SIZE, error: null }),
      (e: Error) => setResult({ key, logs: [], hasMore: false, error: e.message }),
    );
  }, [householdId, plan, fromIso, toIso, key]);

  const current = result?.key === key ? result : null;
  const loaded = current?.logs.length ?? 0;

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const page = await fetchHistoryPage(householdId, { from: new Date(fromIso), to: new Date(toIso) }, plan, loaded);
      setResult((prev) => {
        if (!prev || prev.key !== key) return prev;
        // Skip rows we already have (they move down a page when someone logs something new).
        const seen = new Set(prev.logs.map((l) => l.id));
        return {
          ...prev,
          logs: [...prev.logs, ...page.filter((l) => !seen.has(l.id))],
          hasMore: page.length === HISTORY_PAGE_SIZE,
        };
      });
    } catch (e) {
      setResult((prev) => (prev && prev.key === key ? { ...prev, error: (e as Error).message } : prev));
    } finally {
      setLoadingMore(false);
    }
  }, [householdId, plan, fromIso, toIso, key, loaded]);

  /** Keep the loaded list in step after you edit or delete one of your logs. */
  const patchLog = useCallback((logId: string, details: LogDetails) => {
    setResult((prev) => prev && { ...prev, logs: prev.logs.map((l) => (l.id === logId ? { ...l, ...details } : l)) });
  }, []);
  const dropLog = useCallback((logId: string) => {
    setResult((prev) => prev && { ...prev, logs: prev.logs.filter((l) => l.id !== logId) });
  }, []);

  return {
    logs: current?.logs ?? null,
    hasMore: current?.hasMore ?? false,
    error: current?.error ?? null,
    loadingMore,
    loadMore,
    patchLog,
    dropLog,
  };
}

// ---------------------------------------------------------------------------
// Lists: shopping ("What we need to buy") and repairs ("Things to fix").
// ---------------------------------------------------------------------------

/** Ticked items stay visible under "Done recently" for this many days. */
export const DONE_RECENTLY_DAYS = 14;

const ITEM_COLUMNS = "id, kind, title, note, quantity, created_by, created_at, done_by, done_at";

type ItemRow = {
  id: string;
  kind: ListKind;
  title: string;
  note: string | null;
  quantity: string | null;
  created_by: string;
  created_at: string;
  done_by: string | null;
  done_at: string | null;
};

function toListItem(r: ItemRow): ListItem {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    note: r.note,
    quantity: r.quantity,
    createdBy: r.created_by,
    createdAt: r.created_at,
    doneBy: r.done_by,
    doneAt: r.done_at,
  };
}

export type ItemEdit = Pick<ListItem, "title" | "note" | "quantity">;

type WriteResult = { data: unknown[] | null; error: DbError | null };

export function useLists(householdId: string, userId: string) {
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serial = useSerialWrites();

  const reload = useCallback(async () => {
    const since = new Date(Date.now() - DONE_RECENTLY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await getSupabase()
      .from("list_items")
      .select(ITEM_COLUMNS)
      .eq("household_id", householdId)
      // Everything still to do, plus what was ticked in the last 14 days.
      .or(`done_at.is.null,done_at.gte."${since}"`)
      .order("created_at", { ascending: false });
    if (error) return setError(explain(error));
    setItems((data as unknown as ItemRow[]).map(toListItem));
    setError(null);
  }, [householdId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  /**
   * Checks the database really changed a row: row-level security answers "0 rows changed",
   * not an error, when it says no.
   */
  const expectRow = useCallback(
    (message: string) =>
      ({ data, error }: WriteResult) => {
        if (!error && data && data.length > 0) return;
        setError(error ? explain(error) : message);
        reload();
      },
    [reload],
  );

  const patch = useCallback((id: string, change: Partial<ListItem>) => {
    setItems((list) => list && list.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }, []);

  const addItem = useCallback(
    (kind: ListKind, title: string, quantity: string | null) => {
      const item: ListItem = {
        id: newId(),
        kind,
        title,
        note: null,
        quantity: kind === "shopping" ? quantity : null,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        doneBy: null,
        doneAt: null,
      };
      setItems((list) => [item, ...(list ?? [])]);
      serial(item.id, () =>
        getSupabase()
          .from("list_items")
          .insert({ id: item.id, household_id: householdId, kind, title, quantity: item.quantity })
          .select("id")
          .then(expectRow("Couldn't add that item. Try again.")),
      );
    },
    [householdId, userId, serial, expectRow],
  );

  const setDone = useCallback(
    (id: string, done: boolean) => {
      // The database records who and when (a trigger). Here we only show it straight away.
      const doneAt = done ? new Date().toISOString() : null;
      patch(id, { doneAt, doneBy: done ? userId : null });
      serial(id, () =>
        getSupabase()
          .from("list_items")
          .update({ done_at: doneAt })
          .eq("id", id)
          .select("id")
          .then(expectRow("Couldn't update that item. Try again.")),
      );
    },
    [userId, serial, patch, expectRow],
  );

  const editItem = useCallback(
    (id: string, change: ItemEdit) => {
      patch(id, change);
      serial(id, () =>
        getSupabase()
          .from("list_items")
          .update(change)
          .eq("id", id)
          .select("id")
          .then(expectRow("Couldn't save that change. Try again.")),
      );
    },
    [serial, patch, expectRow],
  );

  const deleteItem = useCallback(
    (id: string) => {
      setItems((list) => list && list.filter((i) => i.id !== id));
      serial(id, () =>
        getSupabase()
          .from("list_items")
          .delete()
          .eq("id", id)
          .select("id")
          .then(expectRow("Only the person who added an item can delete it.")),
      );
    },
    [serial, expectRow],
  );

  return { items, error, addItem, setDone, editItem, deleteItem };
}
