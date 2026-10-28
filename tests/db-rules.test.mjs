// FairShare database-rules test.
//
// What this does, in plain words: it plays the part of ordinary signed-in users (the same power an attacker
// with a normal account would have) and tries things the database should allow and things it should refuse:
// reading another household's data, faking who did something, back-dating, breaking length limits, and so on.
// Every check prints PASS or FAIL. The script exits with code 1 if anything failed.
//
// IMPORTANT: it CREATES REAL TEST USERS in your Supabase project (4 users: fairshare.test.<name>.<timestamp>@gmail.com)
// plus three test households called "Test flat <timestamp>". It cannot delete them (that needs an admin key, which
// this project deliberately never uses). Delete the users by hand afterwards: Supabase dashboard ->
// Authentication -> Users. Deleting the user who created a household also deletes that household and its data.
//
// Run:  node tests/db-rules.test.mjs     (needs .env.local with the URL and the publishable key; never prints the key)
// Run it after migrations 001, 002 and 003 have been applied.
//
// What migration 003 changed (and what this script now expects):
//  - every table: `revoke all` + column grants, so a forbidden column/operation gives error 42501 (permission denied)
//    instead of the old "0 rows" or silent success; signed-out (anon) users can read nothing;
//  - a `before insert` trigger on logs overwrites `at` with the server's now(): back-dating is no longer possible
//    for a normal user, so "old rows" can only be created by an admin in the SQL Editor (the script prints the steps).

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local");
  process.exit(2);
}

const stamp = Date.now();
const createdEmails = [];
let passed = 0;
let failed = 0;
const failures = [];

const show = (v) => JSON.stringify(v, (_k, x) => (x === undefined ? null : x));
const brief = (r) => (r.error ? `error ${r.error.code ?? "?"}: ${r.error.message}` : `ok, ${Array.isArray(r.data) ? r.data.length + " row(s)" : show(r.data)}`);

function check(name, ok, request, response, expected) {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}${response ? `   [${response}]` : ""}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`        request:  ${request}`);
    console.log(`        expected: ${expected}`);
    console.log(`        actual:   ${response}`);
    failures.push(name);
  }
}

/** Passes when the database refused: an error, or "0 rows changed" (what row-level security does). */
function rejected(name, request, r) {
  const refused = !!r.error || (Array.isArray(r.data) && r.data.length === 0);
  check(name, refused, request, brief(r), "an error or 0 rows affected");
}
/** Passes when the database accepted and returned at least one row. */
function accepted(name, request, r) {
  const okay = !r.error && Array.isArray(r.data) && r.data.length > 0;
  check(name, okay, request, brief(r), "no error and >= 1 row");
}
/** Passes only for a real error (used for CHECK constraints and missing column rights). */
function errored(name, request, r, code) {
  const okay = !!r.error && (!code || r.error.code === code);
  check(name, okay, request, brief(r), `an error${code ? " with code " + code : ""}`);
}

async function newUser(label) {
  const email = `fairshare.test.${label}.${stamp}@gmail.com`;
  const password = `T-${randomUUID()}`;
  const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw new Error(`signUp failed for ${email}: ${error.message}`);
  createdEmails.push(email);
  if (!data.session) throw new Error(`No session for ${email} (is email confirmation still ON?)`);
  return { sb, id: data.user.id, email };
}

const monthsAgo = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
};
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const str = (n) => "x".repeat(n);
/** True when an ISO time is within 60 seconds of the machine's clock (used for server-stamped times). */
const nearNow = (iso) => !!iso && Math.abs(Date.now() - new Date(iso).getTime()) < 60000;
const PERMISSION_DENIED = "42501";

/** A client with no session at all (a signed-out visitor). */
const anonClient = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let manualSql = "";
/** The manual hidden-history / premium check, filled with this run's real ids. Run it in the Supabase SQL Editor. */
function historySql(h, userId, taskId) {
  return `-- A) Create old logs as the admin (SQL Editor runs as 'postgres': it ignores row-level security and column rights).
--    The trigger must be switched off just for this insert, otherwise it stamps every row with now().
--    begin/commit makes it all-or-nothing: if the insert fails, the trigger is NOT left switched off.
begin;
alter table public.logs disable trigger logs_stamp_at;
insert into public.logs (household_id, task_id, user_id, at) values
  ('${h}', '${taskId}', '${userId}', now() - interval '1 month'),
  ('${h}', '${taskId}', '${userId}', now() - interval '3 months'),
  ('${h}', '${taskId}', '${userId}', now() - interval '5 months'),
  ('${h}', '${taskId}', '${userId}', now() - interval '7 months');
alter table public.logs enable trigger logs_stamp_at;
commit;
-- (Alternative without touching the trigger: insert normally, then 'update public.logs set at = now() - interval ...
--  where id = ...'. The trigger only runs on INSERT, and postgres may update 'at'.)

-- B) Check the trigger is back on: tgenabled must be 'O' (= enabled).
select tgname, tgenabled from pg_trigger where tgname = 'logs_stamp_at' and not tgisinternal;

-- C) FREE plan (plan = 'free'). Sign in to the app as that member and open History, or run in the browser console
--    / test script: select at from logs where household_id = '${h}'.
--    Expected: the 1-month-old log is visible; the 3-, 5- and 7-month-old logs are hidden.
--    The owner of a hidden log also cannot edit or delete it (update/delete change 0 rows).

-- D) PREMIUM plan (the app's members can't do this, only the admin can):
update public.households set plan = 'premium' where id = '${h}';
--    Expected now: 1, 3 and 5 months visible (and editable/deletable by their owner); the 7-month-old log still hidden.

-- E) Put it back and clean up (logs are never deleted by the app, so remove the test rows by hand):
update public.households set plan = 'free' where id = '${h}';
delete from public.logs where household_id = '${h}' and at < now() - interval '20 days';`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`FairShare DB rules test, run ${new Date().toISOString()}\n`);

  const alex = await newUser("alex");
  const sam = await newUser("sam");
  const bea = await newUser("bea");
  console.log(`Created users: ${createdEmails.join(", ")}\n`);

  // =========================================================================
  console.log("--- 0. Signed out (anon): 003 gives the signed-out role no rights at all ---");
  // =========================================================================
  const anon = anonClient();
  for (const table of ["households", "household_members", "tasks", "logs", "areas", "list_items"]) {
    errored(`Signed-out select on ${table} is refused with 42501`, `select * from ${table} (no session)`,
      await anon.from(table).select("*").limit(1), PERMISSION_DENIED);
  }
  errored("Signed-out insert into logs is refused", "insert logs (no session)",
    await anon.from("logs").insert({ household_id: randomUUID(), task_id: randomUUID() }), PERMISSION_DENIED);
  errored("Signed-out rpc create_household is refused", "rpc create_household (no session)",
    await anon.rpc("create_household", { p_name: "x", p_display_name: "x" }));
  console.log("NOTE  TRUNCATE cannot be tested: PostgREST (the Supabase API) has no truncate request. 003 also revokes the");
  console.log("      TRUNCATE right from anon/authenticated, which only matters for direct database connections.");

  // =========================================================================
  console.log("\n--- 7. Regression: the original flow ---");
  // =========================================================================
  const hName = `Test flat ${stamp}`;
  const created = await alex.sb.rpc("create_household", { p_name: hName, p_display_name: "Alex" });
  check("Alex creates household via rpc", !created.error && !!created.data, "rpc create_household", brief(created), "a uuid");
  const A = created.data;

  const createdB = await bea.sb.rpc("create_household", { p_name: `Test flat ${stamp} (B)`, p_display_name: "Bea" });
  check("Bea creates her own household", !createdB.error && !!createdB.data, "rpc create_household", brief(createdB), "a uuid");
  const B = createdB.data;

  const hA = await alex.sb.from("households").select("id, name, invite_code, currency, plan").eq("id", A).single();
  check("Alex reads own household, default currency EUR and plan free",
    !hA.error && hA.data.currency === "EUR" && hA.data.plan === "free", "select households", brief(hA), "currency=EUR, plan=free");
  const codeA = hA.data.invite_code;

  const joined = await sam.sb.rpc("join_household", { p_code: codeA, p_display_name: "Sam" });
  check("Sam joins Alex's household by invite code", !joined.error && joined.data === A, "rpc join_household", brief(joined), "household id A");

  const tasksA = await alex.sb.from("tasks").select("id, name, asks_amount").eq("household_id", A);
  const taskByName = Object.fromEntries((tasksA.data ?? []).map((t) => [t.name, t.id]));
  const task = taskByName["Did the dishes"];
  const billTask = taskByName["Paid a bill"];

  const samLog = await sam.sb.from("logs").insert({ household_id: A, task_id: task }).select("id, user_id").single();
  check("Sam logs a task", !samLog.error && samLog.data?.user_id === sam.id, "insert logs", brief(samLog), "row with user_id = Sam");

  const alexSees = await alex.sb.from("logs").select("id, user_id").eq("household_id", A);
  check("Alex sees Sam's log", (alexSees.data ?? []).some((l) => l.id === samLog.data?.id), "select logs", brief(alexSees), "includes Sam's log");

  const asAlex = await sam.sb.from("logs").insert({ household_id: A, task_id: task, user_id: alex.id }).select("id");
  errored("Sam cannot log as Alex (user_id = Alex): column not insertable (42501)", "insert logs user_id=Alex by Sam", asAlex, PERMISSION_DENIED);
  const asSelf = await sam.sb.from("logs").insert({ household_id: A, task_id: task, user_id: sam.id });
  errored("Even user_id = himself is refused (user_id comes from the default, 42501)", "insert logs user_id=Sam by Sam", asSelf, PERMISSION_DENIED);

  // Exactly what the app sends: id, household_id, task_id, at, with no .select() afterwards.
  const appLogId = randomUUID();
  const appLog = await sam.sb.from("logs").insert({ id: appLogId, household_id: A, task_id: task, at: new Date().toISOString() });
  check("App-shaped log insert {id, household_id, task_id, at} still works", !appLog.error, "insert logs (as the app does)",
    appLog.error ? `error ${appLog.error.code}: ${appLog.error.message}` : `status ${appLog.status}`, "no error");
  const appLogBack = await sam.sb.from("logs").select("id, user_id, at").eq("id", appLogId);
  check("...and the row has the client's id, user_id = Sam, at = server now",
    appLogBack.data?.length === 1 && appLogBack.data[0].user_id === sam.id && nearNow(appLogBack.data[0].at),
    "select logs by id", brief(appLogBack) + " " + show(appLogBack.data?.[0]), "1 row, user_id = Sam, at within 60s of now");
  accepted("Sam can undo (delete) his own app-shaped log", "delete own log", await sam.sb.from("logs").delete().eq("id", appLogId).select("id"));

  const undo = await alex.sb.from("logs").delete().eq("id", samLog.data?.id).select("id");
  rejected("Alex cannot undo Sam's log (delete affects 0 rows)", "delete logs of Sam by Alex", undo);
  const stillThere = await sam.sb.from("logs").select("id").eq("id", samLog.data?.id);
  check("Sam's log still exists after Alex's delete attempt", (stillThere.data ?? []).length === 1, "select logs", brief(stillThere), "1 row");

  const alexLog0 = await alex.sb.from("logs").insert({ household_id: A, task_id: task }).select("id").single();
  const undoOwn = await alex.sb.from("logs").delete().eq("id", alexLog0.data?.id).select("id");
  accepted("Alex can undo his own log", "delete own log", undoOwn);

  const areas = await alex.sb.from("areas").select("id, owner_id").eq("household_id", A);
  const areaId = areas.data?.[0]?.id;
  const hand = await alex.sb.from("areas").update({ owner_id: sam.id, since: new Date().toISOString() }).eq("id", areaId).select("owner_id");
  check("Alex hands an area over to Sam", !hand.error && hand.data?.[0]?.owner_id === sam.id, "update areas owner_id", brief(hand), "owner_id = Sam");
  const handOut = await alex.sb.from("areas").update({ owner_id: bea.id }).eq("id", areaId).select("owner_id");
  errored("Cannot hand an area to a non-member (Bea)", "update areas owner_id=Bea", handOut);
  const handB = await bea.sb.from("areas").update({ owner_id: bea.id }).eq("id", areaId).select("owner_id");
  rejected("Bea cannot change Alex's household areas", "update areas by outsider", handB);
  const handBack = await alex.sb.from("areas").select("owner_id").eq("id", areaId).single();
  check("Area owner is still Sam after the failed hand-overs", handBack.data?.owner_id === sam.id, "select areas", show(handBack.data), "owner_id = Sam");

  // 003: household_id (and id) can't be changed on tasks and areas, so nothing can be moved into another household.
  errored("Member cannot change tasks.household_id (42501)", "update tasks set household_id=B",
    await alex.sb.from("tasks").update({ household_id: B }).eq("id", task).select("id"), PERMISSION_DENIED);
  errored("Member cannot change tasks.household_id (no .select(), 42501)", "update tasks set household_id=B (no select)",
    await alex.sb.from("tasks").update({ household_id: B }).eq("id", task), PERMISSION_DENIED);
  errored("Member cannot change areas.household_id (42501)", "update areas set household_id=B",
    await alex.sb.from("areas").update({ household_id: B }).eq("id", areaId).select("id"), PERMISSION_DENIED);
  errored("Member cannot change areas.household_id (no .select(), 42501)", "update areas set household_id=B (no select)",
    await alex.sb.from("areas").update({ household_id: B }).eq("id", areaId), PERMISSION_DENIED);
  errored("Member cannot change tasks.id (42501)", "update tasks set id", await alex.sb.from("tasks").update({ id: randomUUID() }).eq("id", task).select("id"), PERMISSION_DENIED);
  const taskStill = await alex.sb.from("tasks").select("household_id").eq("id", task).single();
  const areaStill = await alex.sb.from("areas").select("household_id").eq("id", areaId).single();
  check("Task and area are still in household A afterwards", taskStill.data?.household_id === A && areaStill.data?.household_id === A,
    "select tasks/areas", show([taskStill.data, areaStill.data]), "both household_id = A");
  // What 003 deliberately still allows on tasks/areas (the planned "edit tasks" screen):
  const tNew = await alex.sb.from("tasks").insert({ household_id: A, name: "Temp task", emoji: "T", category: "mental", effort: 2, asks_amount: false }).select("id").single();
  check("Member can add a task (granted columns)", !tNew.error && !!tNew.data?.id, "insert tasks", brief({ ...tNew, data: [tNew.data] }), "a row");
  accepted("Member can rename a task", "update tasks name", await alex.sb.from("tasks").update({ name: "Temp task 2", effort: 3 }).eq("id", tNew.data?.id).select("id"));
  errored("Task name of 61 chars rejected", "update tasks name 61 chars", await alex.sb.from("tasks").update({ name: str(61) }).eq("id", tNew.data?.id).select("id"), "23514");
  accepted("Member can delete a task", "delete tasks", await alex.sb.from("tasks").delete().eq("id", tNew.data?.id).select("id"));
  accepted("Member can rename an area", "update areas name", await alex.sb.from("areas").update({ name: "Bills & payments" }).eq("id", areaId).select("id"));

  // Outsider reads
  for (const table of ["households", "household_members", "tasks", "logs", "areas", "list_items"]) {
    const col = table === "households" ? "id" : "household_id";
    const r = await bea.sb.from(table).select("*").eq(col, A);
    check(`Bea (other household) sees 0 rows of Alex's ${table}`, !r.error && r.data.length === 0, `select ${table}`, brief(r), "0 rows");
  }
  const tB = await bea.sb.from("tasks").insert({ household_id: A, name: "x", category: "mental", effort: 1 }).select("id");
  errored("Bea cannot add a task to Alex's household", "insert tasks into A by Bea", tB);
  const lB = await bea.sb.from("logs").insert({ household_id: A, task_id: task }).select("id");
  errored("Bea cannot log into Alex's household", "insert logs into A by Bea", lB);
  const joinBad = await bea.sb.rpc("join_household", { p_code: "ZZZZZZZZ", p_display_name: "Bea" });
  errored("Joining with a wrong code fails", "rpc join_household ZZZZZZZZ", joinBad);

  // =========================================================================
  console.log("\n--- 5. asks_amount seeding ---");
  // =========================================================================
  const trueNames = (tasksA.data ?? []).filter((t) => t.asks_amount).map((t) => t.name).sort();
  const falseCount = (tasksA.data ?? []).filter((t) => !t.asks_amount).length;
  check("12 tasks created", (tasksA.data ?? []).length === 12, "select tasks", `${(tasksA.data ?? []).length} tasks`, "12");
  check("asks_amount is true on exactly 'Did the grocery run' and 'Paid a bill'",
    show(trueNames) === show(["Did the grocery run", "Paid a bill"]), "select tasks", show(trueNames), '["Did the grocery run","Paid a bill"]');
  check("asks_amount is false on the other 10", falseCount === 10, "select tasks", `${falseCount} false`, "10");
  console.log("NOTE  Households that existed before migration 002 were updated by the migration; not visible from here.");

  // =========================================================================
  console.log("\n--- 1. list_items ---");
  // =========================================================================
  const ins = await alex.sb.from("list_items").insert({ household_id: A, kind: "shopping", title: "Milk", quantity: "2" }).select("*").single();
  check("Alex adds a shopping item; created_by is stamped as Alex",
    !ins.error && ins.data?.created_by === alex.id && ins.data?.done_at === null && ins.data?.done_by === null, "insert list_items", brief({ ...ins, data: [ins.data] }), "row with created_by = Alex");
  const item = ins.data?.id;

  const rep = await sam.sb.from("list_items").insert({ household_id: A, kind: "repair", title: "Fix tap", note: "Kitchen" }).select("*").single();
  check("Sam adds a repair item", !rep.error && rep.data?.created_by === sam.id, "insert list_items repair", brief({ ...rep, data: [rep.data] }), "row created_by = Sam");
  const repair = rep.data?.id;

  const selA = await sam.sb.from("list_items").select("id").eq("household_id", A);
  check("Sam (member) sees both items", (selA.data ?? []).length === 2, "select list_items", brief(selA), "2 rows");

  const upd = await sam.sb.from("list_items").update({ title: "Oat milk", note: "Barista", quantity: "3" }).eq("id", item).select("*");
  check("Sam (not the creator) can edit title, note and quantity",
    !upd.error && upd.data?.[0]?.title === "Oat milk" && upd.data?.[0]?.note === "Barista" && upd.data?.[0]?.quantity === "3", "update list_items", brief(upd), "title/note/quantity changed");

  // Ticking: fake time in the year 2000
  const tick = await sam.sb.from("list_items").update({ done_at: "2000-01-01T00:00:00Z" }).eq("id", item).select("done_at, done_by");
  const t0 = tick.data?.[0];
  const drift = t0 ? Math.abs(Date.now() - new Date(t0.done_at).getTime()) : Infinity;
  check("Ticking with a fake year-2000 time: server stamps done_by = Sam and done_at = server now",
    !tick.error && t0?.done_by === sam.id && drift < 60000, 'update done_at="2000-01-01"', brief(tick) + " " + show(t0), "done_by = Sam, done_at within 60s of now");
  const untick = await sam.sb.from("list_items").update({ done_at: null }).eq("id", item).select("done_at, done_by");
  check("Unticking clears done_at and done_by", !untick.error && untick.data?.[0]?.done_at === null && untick.data?.[0]?.done_by === null,
    "update done_at=null", brief(untick) + " " + show(untick.data?.[0]), "both null");
  const tick2 = await alex.sb.from("list_items").update({ done_at: new Date().toISOString() }).eq("id", item).select("done_at, done_by");
  check("Alex ticking stamps done_by = Alex", tick2.data?.[0]?.done_by === alex.id, "update done_at by Alex", brief(tick2), "done_by = Alex");

  // Forbidden columns
  errored("Updating kind is denied", "update list_items kind", await alex.sb.from("list_items").update({ kind: "repair" }).eq("id", item).select("id"));
  errored("Updating household_id is denied", "update list_items household_id=B", await alex.sb.from("list_items").update({ household_id: B }).eq("id", item).select("id"));
  errored("Updating done_by is denied", "update list_items done_by=Sam", await alex.sb.from("list_items").update({ done_by: sam.id }).eq("id", item).select("id"));
  errored("Updating created_by is denied", "update list_items created_by=Sam", await alex.sb.from("list_items").update({ created_by: sam.id }).eq("id", item).select("id"));
  // Insert restrictions
  errored("Insert with someone else's created_by fails", "insert list_items created_by=Sam by Alex",
    await alex.sb.from("list_items").insert({ household_id: A, kind: "shopping", title: "Fake", created_by: sam.id }).select("id"));
  const insDone = await alex.sb.from("list_items").insert({ household_id: A, kind: "shopping", title: "PreTicked", done_at: new Date().toISOString() }).select("id");
  errored("Insert with done_at set is rejected (no column right)", "insert list_items with done_at", insDone);
  const insDoneBy = await alex.sb.from("list_items").insert({ household_id: A, kind: "shopping", title: "PreTicked", done_by: alex.id }).select("id");
  errored("Insert with done_by set is rejected (no column right)", "insert list_items with done_by", insDoneBy);

  // Outsider
  const bSel = await bea.sb.from("list_items").select("id").eq("id", item);
  check("Bea sees 0 of Alex's list items", !bSel.error && bSel.data.length === 0, "select list_items by id", brief(bSel), "0 rows");
  errored("Bea cannot insert into Alex's household list", "insert list_items household=A by Bea",
    await bea.sb.from("list_items").insert({ household_id: A, kind: "shopping", title: "Intruder" }).select("id"));
  rejected("Bea cannot update Alex's item", "update list_items by Bea", await bea.sb.from("list_items").update({ title: "hacked" }).eq("id", item).select("id"));
  rejected("Bea cannot tick Alex's item", "update done_at by Bea", await bea.sb.from("list_items").update({ done_at: new Date().toISOString() }).eq("id", repair).select("id"));
  rejected("Bea cannot delete Alex's item", "delete list_items by Bea", await bea.sb.from("list_items").delete().eq("id", item).select("id"));
  const intact = await alex.sb.from("list_items").select("title").eq("id", item).single();
  check("Alex's item is unchanged after Bea's attempts", intact.data?.title === "Oat milk", "select list_items", brief({ ...intact, data: [intact.data] }), "title = Oat milk");

  // Delete: creator only
  rejected("Sam cannot delete Alex's item (0 rows)", "delete list_items by non-creator", await sam.sb.from("list_items").delete().eq("id", item).select("id"));
  accepted("Sam can delete his own repair item", "delete own list item", await sam.sb.from("list_items").delete().eq("id", repair).select("id"));

  // Constraints
  const mk = (over) => alex.sb.from("list_items").insert({ household_id: A, kind: "shopping", title: "T", ...over }).select("id");
  errored("List title '' rejected", "insert title=''", await mk({ title: "" }), "23514");
  errored("List title of 81 chars rejected", "insert title 81 chars", await mk({ title: str(81) }), "23514");
  accepted("List title of 80 chars accepted (boundary)", "insert title 80 chars", await mk({ title: str(80) }));
  errored("List note of 301 chars rejected", "insert note 301 chars", await mk({ note: str(301) }), "23514");
  accepted("List note of 300 chars accepted (boundary)", "insert note 300 chars", await mk({ note: str(300) }));
  errored("Quantity of 21 chars rejected", "insert quantity 21 chars", await mk({ quantity: str(21) }), "23514");
  errored("Quantity '' rejected", "insert quantity ''", await mk({ quantity: "" }), "23514");
  errored("kind 'other' rejected", "insert kind='other'", await mk({ kind: "other" }), "23514");
  errored("Quantity on a repair item rejected (insert)", "insert repair with quantity", await mk({ kind: "repair", quantity: "2" }), "23514");
  const rep2 = await alex.sb.from("list_items").insert({ household_id: A, kind: "repair", title: "Door" }).select("id").single();
  errored("Quantity on a repair item rejected (update)", "update repair quantity='2'",
    await alex.sb.from("list_items").update({ quantity: "2" }).eq("id", rep2.data?.id).select("id"), "23514");

  // The app's exact .or() filter
  const sinceNow = new Date(Date.now() - 14 * 86400000).toISOString();
  const orQuery = (since) =>
    alex.sb.from("list_items").select("id, done_at").eq("household_id", A).or(`done_at.is.null,done_at.gte."${since}"`).order("created_at", { ascending: false });
  const o1 = await orQuery(sinceNow);
  check("App's .or('done_at.is.null,done_at.gte.\"<iso>\"') filter works (no error; unticked + recently ticked rows)",
    !o1.error && o1.data.some((r) => r.id === item && r.done_at) && o1.data.some((r) => r.id === rep2.data?.id && !r.done_at),
    `select list_items .or(done_at.is.null,done_at.gte."${sinceNow}")`, brief(o1), "ticked 'item' and unticked 'rep2' both returned");
  const future = new Date(Date.now() + 86400000).toISOString();
  const o2 = await orQuery(future);
  check("Same filter with a cut-off in the future hides the ticked item but keeps unticked ones",
    !o2.error && !o2.data.some((r) => r.id === item) && o2.data.some((r) => r.id === rep2.data?.id),
    `.or with since=${future}`, brief(o2), "ticked item excluded, unticked included");

  // =========================================================================
  console.log("\n--- 2. Own-log updates ---");
  // =========================================================================
  const lid = randomUUID();
  const myLog = await alex.sb.from("logs").insert({ id: lid, household_id: A, task_id: billTask, at: new Date().toISOString() });
  check("Alex logs 'Paid a bill' the way the app does (id, household_id, task_id, at)", !myLog.error, "insert logs", myLog.error ? `error ${myLog.error.code}: ${myLog.error.message}` : `status ${myLog.status}`, "no error");
  const up1 = await alex.sb.from("logs").update({ detail: "Electricity", amount: 45.2, note: "Paid online" }).eq("id", lid).select("detail, amount::text, note");
  check("Updating detail/amount/note on own log works",
    !up1.error && up1.data?.[0]?.detail === "Electricity" && up1.data?.[0]?.amount === "45.20" && up1.data?.[0]?.note === "Paid online",
    "update own log", brief(up1) + " " + show(up1.data?.[0]), "detail, amount '45.20', note set");
  const up2 = await sam.sb.from("logs").update({ detail: "hacked" }).eq("id", lid).select("id");
  rejected("Updating another member's log affects 0 rows", "update Alex's log by Sam", up2);
  const after = await alex.sb.from("logs").select("detail").eq("id", lid).single();
  check("Alex's log detail unchanged after Sam's attempt", after.data?.detail === "Electricity", "select log", show(after.data), "Electricity");
  errored("Updating 'at' is denied (42501)", "update logs at", await alex.sb.from("logs").update({ at: daysAgo(1) }).eq("id", lid).select("id"), PERMISSION_DENIED);
  errored("Updating 'task_id' is denied (42501)", "update logs task_id", await alex.sb.from("logs").update({ task_id: task }).eq("id", lid).select("id"), PERMISSION_DENIED);
  errored("Updating 'user_id' is denied (42501)", "update logs user_id=Sam", await alex.sb.from("logs").update({ user_id: sam.id }).eq("id", lid).select("id"), PERMISSION_DENIED);
  errored("Updating 'household_id' on a log is denied (42501)", "update logs household_id=B", await alex.sb.from("logs").update({ household_id: B }).eq("id", lid).select("id"), PERMISSION_DENIED);
  const lidRow = await alex.sb.from("logs").select("household_id, user_id, task_id").eq("id", lid).single();
  check("Log row unchanged after those attempts", lidRow.data?.household_id === A && lidRow.data?.user_id === alex.id && lidRow.data?.task_id === billTask,
    "select log", show(lidRow.data), "household A, user Alex, task billTask");
  // The app deletes with only .eq("id") and no .select(): make sure that shape works too.
  const delId = randomUUID();
  await alex.sb.from("logs").insert({ id: delId, household_id: A, task_id: task, at: new Date().toISOString() });
  const delRes = await alex.sb.from("logs").delete().eq("id", delId);
  const delGone = await alex.sb.from("logs").select("id").eq("id", delId);
  check("Undo exactly as the app does it (delete by id, no .select()) removes the row", !delRes.error && delGone.data?.length === 0, "delete logs by id", delRes.error ? delRes.error.message : `status ${delRes.status}`, "no error, row gone");

  // =========================================================================
  console.log("\n--- 6. Constraint violations on logs ---");
  // =========================================================================
  const lg = (over) => alex.sb.from("logs").insert({ household_id: A, task_id: task, ...over }).select("id");
  errored("Log detail of 81 chars rejected", "insert detail 81 chars", await lg({ detail: str(81) }), "23514");
  errored("Log detail '' rejected", "insert detail=''", await lg({ detail: "" }), "23514");
  accepted("Log detail of 80 chars accepted (boundary)", "insert detail 80 chars", await lg({ detail: str(80) }));
  errored("Log note of 501 chars rejected", "insert note 501 chars", await lg({ note: str(501) }), "23514");
  accepted("Log note of 500 chars accepted (boundary)", "insert note 500 chars", await lg({ note: str(500) }));
  errored("Amount -1 rejected", "insert amount=-1", await lg({ amount: -1 }), "23514");
  errored("Amount 1000000000 rejected", "insert amount=1000000000", await lg({ amount: 1000000000 }), "23514");
  accepted("Amount 999999999.99 accepted (boundary)", "insert amount=999999999.99", await lg({ amount: 999999999.99 }));
  accepted("Amount 0 accepted", "insert amount=0", await lg({ amount: 0 }));
  const dec = await alex.sb.from("logs").insert({ household_id: A, task_id: task, amount: 12.345 }).select("id, amount::text").single();
  const stored = dec.data?.amount;
  check(`Amount 12.345 is stored with 2 decimals (stored as '${stored}')`, !dec.error && /^\d+\.\d{2}$/.test(stored ?? ""),
    "insert amount=12.345", brief({ ...dec, data: [dec.data] }), "2 decimals");
  const dec2 = await alex.sb.from("logs").select("amount::text").eq("id", dec.data?.id).single();
  console.log(`INFO  12.345 read back later with amount::text = '${dec2.data?.amount}'`);
  const upBad = await alex.sb.from("logs").update({ amount: -5 }).eq("id", lid).select("id");
  errored("Updating amount to -5 rejected", "update amount=-5", upBad, "23514");

  // =========================================================================
  console.log("\n--- 3. History floor (free plan = 2 months) and the server-stamped 'at' (migration 003) ---");
  // =========================================================================
  // Before 003 a client could choose `at`, so old rows could be created through the API. Now the trigger
  // logs_stamp_at overwrites `at` with now(): the insert SUCCEEDS but the stored time is the server's.
  const stampCases = [
    ["3 months ago", monthsAgo(3)],
    ["1 month ago", monthsAgo(1)],
    ["1 week ago", daysAgo(7)],
    ["the year 2000", "2000-01-01T00:00:00Z"],
    ["1 year in the FUTURE", new Date(Date.now() + 365 * 86400000).toISOString()],
  ];
  const stampedIds = {};
  for (const [label, at] of stampCases) {
    const id = randomUUID();
    const r = await alex.sb.from("logs").insert({ id, household_id: A, task_id: task, at }).select("id, at");
    const row = r.data?.[0];
    check(`Insert with at = ${label} succeeds, but 'at' is stored as server now (within 60s)`,
      !r.error && !!row && nearNow(row.at), `insert logs at=${at} .select("id, at")`, brief(r) + " " + show(row), "no error; stored at within 60s of now");
    stampedIds[label] = id;
  }
  // Same without .select() (the app's shape), then read the row back later: the stored value must still be "now".
  const oldId = randomUUID();
  const oldIns = await alex.sb.from("logs").insert({ id: oldId, household_id: A, task_id: task, at: monthsAgo(3) });
  const oldBack = await alex.sb.from("logs").select("id, at").eq("id", oldId);
  check("Back-dated insert without .select(): accepted, and reading it back later shows at = server now",
    !oldIns.error && oldBack.data?.length === 1 && nearNow(oldBack.data[0].at), "insert at=3 months ago, then select by id",
    (oldIns.error ? `insert error ${oldIns.error.message}` : `insert status ${oldIns.status}`) + "; " + brief(oldBack) + " " + show(oldBack.data?.[0]),
    "no error; 1 row with at within 60s of now");

  // Because a back-dated row now lands at "now", it is visible and its owner can still edit it.
  // (These replace the old "1-month-old log is visible / editable" checks, which only made sense when the client could choose `at`.)
  const midId = stampedIds["1 month ago"];
  const midSel = await alex.sb.from("logs").select("id").eq("id", midId);
  check("Log submitted with at = 1 month ago is visible (it was stamped now)", !midSel.error && midSel.data.length === 1, "select by id", brief(midSel), "1 row");
  accepted("...and its owner can update it", "update that log", await alex.sb.from("logs").update({ note: "ok" }).eq("id", midId).select("id"));
  const samHist = await sam.sb.from("logs").select("id").eq("id", midId);
  check("Sam (member) sees it too", samHist.data?.length === 1, "select by id as Sam", brief(samHist), "1 row");

  const oldAll = await alex.sb.from("logs").select("id, at").eq("household_id", A).lt("at", monthsAgo(2));
  check("No log older than 2 months appears in a household-wide select (now trivially true for normal users)",
    !oldAll.error && oldAll.data.length === 0, "select logs at < 2 months ago", brief(oldAll), "0 rows");

  console.log("SKIP  Hidden-history behaviour (3-month-old log hidden on free, not updatable/deletable, visible on premium):");
  console.log("      a normal user can no longer create an old row, so this can only be tested with a row created by an admin.");
  console.log("      The old script checks 'hidden / cannot update / cannot delete' are therefore REMOVED, not failing. Manual steps:");
  manualSql = historySql(A, alex.id, task);
  console.log(manualSql.split("\n").map((l) => "      | " + l).join("\n"));

  // Week range (same shape as the app's loadHousehold: the last 7 days) and History range query
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const week = await alex.sb.from("logs").select("id, task_id, user_id, at, detail, amount::text, note").eq("household_id", A).gte("at", weekStart.toISOString()).order("at");
  check("Week-range select (1-week-old range) works and returns this week's logs, all inside the range",
    !week.error && week.data.length >= 3 && week.data.every((l) => new Date(l.at) >= weekStart), "select logs gte 7 days ago", brief(week), ">= 3 rows, all at >= 7 days ago");
  const hist = await alex.sb.from("logs").select("id").eq("household_id", A).gte("at", monthsAgo(3)).lt("at", new Date(Date.now() + 60000).toISOString()).order("at", { ascending: false }).order("id", { ascending: false }).range(0, 199);
  check("History-style range select (from 3 months ago) works and includes every log made in this run (all stamped now)",
    !hist.error && [oldId, midId, ...Object.values(stampedIds)].every((id) => hist.data.some((l) => l.id === id)), "select logs range", brief(hist), "all back-dated test logs included");

  // =========================================================================
  console.log("\n--- 4. Currency and plan ---");
  // =========================================================================
  const cur = await sam.sb.from("households").update({ currency: "MKD" }).eq("id", A).select("currency");
  check("A member (Sam) can set currency to MKD", !cur.error && cur.data?.[0]?.currency === "MKD", "update currency=MKD", brief(cur), "currency = MKD");
  const curApp = await alex.sb.from("households").update({ currency: "USD" }).eq("id", A);
  const curBack = await alex.sb.from("households").select("currency").eq("id", A).single();
  check("Currency change exactly as the app does it (no .select()) works", !curApp.error && curBack.data?.currency === "USD", "update currency=USD (no select)",
    (curApp.error ? curApp.error.message : `status ${curApp.status}`) + "; now " + show(curBack.data), "no error, currency = USD");
  await alex.sb.from("households").update({ currency: "MKD" }).eq("id", A);
  errored("Currency 'XYZ' rejected", "update currency=XYZ", await sam.sb.from("households").update({ currency: "XYZ" }).eq("id", A).select("currency"), "23514");
  errored("Member updating plan is denied", "update plan='premium'", await sam.sb.from("households").update({ plan: "premium" }).eq("id", A).select("plan"));
  errored("Member updating name is denied", "update name", await sam.sb.from("households").update({ name: "Renamed" }).eq("id", A).select("name"));
  errored("Member updating invite_code is denied", "update invite_code", await sam.sb.from("households").update({ invite_code: "AAAAAAAA" }).eq("id", A).select("invite_code"));
  errored("Owner (Alex) updating plan is denied too", "update plan by owner", await alex.sb.from("households").update({ plan: "premium" }).eq("id", A).select("plan"));
  rejected("Non-member (Bea) changing A's currency affects 0 rows", "update currency by Bea", await bea.sb.from("households").update({ currency: "USD" }).eq("id", A).select("currency"));
  const hAfter = await alex.sb.from("households").select("name, invite_code, currency, plan").eq("id", A).single();
  check("After all attempts: currency MKD, plan free, name and invite code unchanged",
    hAfter.data?.currency === "MKD" && hAfter.data?.plan === "free" && hAfter.data?.name === hName && hAfter.data?.invite_code === codeA,
    "select households", show({ ...hAfter.data, invite_code: "<hidden>" }), "MKD / free / same name / same code");
  await alex.sb.from("households").update({ currency: "EUR" }).eq("id", A);

  // Direct-write attempts on other tables (not in the brief, cheap and relevant)
  // 003 removed insert/delete on households and household_members entirely, so these now fail with 42501 (permission
  // denied) instead of "0 rows" or a row-level-security error.
  errored("Member cannot insert into household_members directly (only via join_household) (42501)", "insert household_members",
    await bea.sb.from("household_members").insert({ household_id: A, user_id: bea.id, display_name: "Bea" }).select("user_id"), PERMISSION_DENIED);
  errored("...same without .select() (42501)", "insert household_members (no select)",
    await bea.sb.from("household_members").insert({ household_id: A, user_id: bea.id, display_name: "Bea" }), PERMISSION_DENIED);
  errored("Member cannot update their own role (42501)", "update household_members role", await sam.sb.from("household_members").update({ role: "owner" }).eq("user_id", sam.id).select("role"), PERMISSION_DENIED);
  errored("new_invite_code() is not callable", "rpc new_invite_code", await alex.sb.rpc("new_invite_code"));
  errored("Member cannot create a household row directly (42501)", "insert households",
    await sam.sb.from("households").insert({ name: "Direct", invite_code: "DIRECT01", created_by: sam.id }).select("id"), PERMISSION_DENIED);
  errored("...same without .select() (42501)", "insert households (no select)",
    await sam.sb.from("households").insert({ name: "Direct", invite_code: "DIRECT02", created_by: sam.id }), PERMISSION_DENIED);
  errored("Member cannot delete the household (42501)", "delete households", await sam.sb.from("households").delete().eq("id", A).select("id"), PERMISSION_DENIED);
  errored("Owner cannot delete the household either (42501)", "delete households by owner", await alex.sb.from("households").delete().eq("id", A).select("id"), PERMISSION_DENIED);
  errored("Member cannot delete another member's row / kick (42501)", "delete household_members of Alex by Sam",
    await sam.sb.from("household_members").delete().eq("user_id", alex.id).eq("household_id", A).select("user_id"), PERMISSION_DENIED);
  errored("Member cannot delete their OWN member row either (42501)", "delete household_members of Sam by Sam",
    await sam.sb.from("household_members").delete().eq("user_id", sam.id).eq("household_id", A).select("user_id"), PERMISSION_DENIED);
  const stillMembers = await alex.sb.from("household_members").select("user_id").eq("household_id", A);
  check("Household A still has its 2 members and exists after all of that", stillMembers.data?.length === 2, "select household_members", brief(stillMembers), "2 rows");
  console.log("NOTE  TRUNCATE is not reachable through the API (PostgREST has no truncate request), so it is not tested here.");

  const cy = await newUser("cy");
  await memberRowHardening(cy, A);
}

// ---------------------------------------------------------------------------
// 8. The household_members row: only display_name may be edited (migration 001 intends this).
//    Also runnable alone against an existing household:  node tests/db-rules.test.mjs --members-only <household uuid>
// ---------------------------------------------------------------------------
async function memberRowHardening(cy, A) {
  console.log("\n--- 8. household_members row: only display_name should be editable ---");
  const c = await cy.sb.rpc("create_household", { p_name: `Test flat ${stamp} (C)`, p_display_name: "Cy" });
  check("Cy creates his own household C", !c.error && !!c.data, "rpc create_household", brief(c), "uuid");
  const C = c.data;
  const COLS = "household_id, user_id, role, style_index, joined_at, display_name";
  const mine = () => cy.sb.from("household_members").select(COLS).eq("user_id", cy.id);

  // The one thing a member may edit: display_name (with and without asking for the row back).
  const dn = await cy.sb.from("household_members").update({ display_name: "Cyrus" }).eq("user_id", cy.id).select("display_name");
  accepted("Cy can change his display_name (intended), with .select()", "update display_name", dn);
  const dn2 = await cy.sb.from("household_members").update({ display_name: "Cyrus II" }).eq("user_id", cy.id);
  const dn2Back = await mine();
  check("Cy can change his display_name without .select() too", !dn2.error && dn2Back.data?.[0]?.display_name === "Cyrus II",
    "update display_name (no select)", (dn2.error ? dn2.error.message : `status ${dn2.status}`) + "; now " + show(dn2Back.data?.[0]?.display_name), "no error, display_name = Cyrus II");
  errored("display_name of 41 chars rejected", "update display_name 41 chars",
    await cy.sb.from("household_members").update({ display_name: str(41) }).eq("user_id", cy.id).select("display_name"), "23514");

  // Snapshot the row, then try to change every other column in both request shapes.
  const before = (await mine()).data?.[0];
  console.log(`INFO  Cy's member row before the attempts: ${show(before)}`);

  // A member first empties his own household's areas (they block moving the row through a foreign key), so the
  // move to household A is blocked by permissions alone, not by a side effect.
  await cy.sb.from("areas").delete().eq("household_id", C);

  const attempts = [
    ["household_id", A],
    ["role", "member"],
    ["style_index", 7],
    ["joined_at", "2000-01-01T00:00:00Z"],
    ["user_id", randomUUID()],
  ];
  for (const [col, value] of attempts) {
    // Variant 1: asks for the row back (.select()). Variant 2: the supabase-js default, no row returned.
    const withSel = await cy.sb.from("household_members").update({ [col]: value }).eq("user_id", cy.id).select(col);
    errored(`Cy cannot change his own ${col} (with .select()) - expect 42501`, `update household_members set ${col}=${show(value)} .select()`, withSel, PERMISSION_DENIED);
    const afterSel = (await mine()).data?.[0];
    check(`...row unchanged afterwards (${col}, with .select())`, show(afterSel) === show(before), "re-select own member row", show(afterSel), show(before));

    const noSel = await cy.sb.from("household_members").update({ [col]: value }).eq("user_id", cy.id);
    errored(`Cy cannot change his own ${col} (no .select()) - expect 42501`, `update household_members set ${col}=${show(value)} (no select)`, noSel, PERMISSION_DENIED);
    const afterNo = (await mine()).data?.[0];
    check(`...row unchanged afterwards (${col}, no .select())`, show(afterNo) === show(before), "re-select own member row", show(afterNo), show(before));
  }

  // A multi-column update that mixes the allowed column with a forbidden one must be refused as a whole.
  const mixed = await cy.sb.from("household_members").update({ display_name: "Sneaky", household_id: A }).eq("user_id", cy.id).select("household_id");
  errored("Mixed update (display_name + household_id) is refused as a whole (42501)", "update display_name + household_id", mixed, PERMISSION_DENIED);
  const afterMixed = (await mine()).data?.[0];
  check("...and display_name was NOT changed by the refused mixed update", show(afterMixed) === show(before), "re-select own member row", show(afterMixed), show(before));

  const peek = await cy.sb.from("logs").select("id").eq("household_id", A);
  check("Cy still sees 0 of household A's logs", !peek.error && peek.data.length === 0, "select logs of A as Cy", brief(peek), "0 rows");
  const peekM = await cy.sb.from("household_members").select("user_id").eq("household_id", A);
  check("Cy still sees 0 of household A's members", !peekM.error && peekM.data.length === 0, "select household_members of A as Cy", brief(peekM), "0 rows");
  const where = await mine();
  console.log(`INFO  Cy's member row afterwards: ${show(where.data)}`);
}

if (process.argv[2] === "--members-only") {
  try {
    const cy = await newUser("cy");
    console.log(`Created user: ${cy.email}\n`);
    await memberRowHardening(cy, process.argv[3]);
  } catch (e) {
    failed++;
    console.log(`FAIL  script crashed: ${e.message}`);
  }
  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  console.log("Created user: " + createdEmails.join(", "));
  process.exit(failed ? 1 : 0);
}

try {
  await main();
} catch (e) {
  failed++;
  failures.push("script crashed");
  console.log(`FAIL  script crashed: ${e.message}`);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failures.length) console.log("Failed: " + failures.join(" | "));
console.log("\nTest users created (delete by hand in Supabase -> Authentication -> Users):");
for (const e of createdEmails) console.log("  " + e);
process.exit(failed ? 1 : 0);
