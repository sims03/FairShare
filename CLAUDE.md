# FairShare — project guide for Claude

@AGENTS.md

FairShare is a web app that helps households (couples, flatmates, families) share chores **and** the invisible
"mental load" (remembering bills, booking appointments, planning). Members log tasks with one tap, see a weekly
balance, and rotate ownership of recurring areas like "Bills".

The developer (the user) is **just starting to learn programming**. This project is how they learn, so teaching
matters as much as shipping. They are especially interested in **cybersecurity and digital forensics**.

## 1. How to work

### Agents
Follow the routing in the global `~/.claude/CLAUDE.md`:
- Writing or editing code → `coder` (a tiny mechanical edit like a typo or rename: do it directly)
- Unknown cause of a failure → `debugger`, then pass its diagnosis to `coder`
- Writing or running tests → `tester`
- Web lookups (docs, versions, comparisons) → `researcher`
- Conversation, planning, explanations and reading code stay in the main session.

Every delegation prompt must include: the memory folder path
`C:\Users\simon\.claude\projects\c--Users-simon-OneDrive-Desktop-household\memory\`, a pointer to this file, and
the relevant context (agents start with no memory of the conversation).

### Commits
After each feature works and is tested, **ask** "Commit this?" with a suggested message. Never commit without a yes.

### Before saying something works
1. `npx tsc --noEmit` (types), `npm run lint`, `npm run build` must all pass.
2. Anything touching the database: test it against the real Supabase project (e.g. a script with two test users,
   like the flow test used for households). Tell the user which test accounts were created so they can delete them.
3. Report honestly what was **not** tested.
4. **Known issue (project is in OneDrive):** the dev server sometimes keeps serving an old `globals.css`. After any
   CSS change, check the served CSS (fetch the page, grep its `/_next/static/…css` for the new class/keyframe). If it
   is stale: stop the server on :3000, `rm -rf .next/dev`, start `npm run dev` again. Happened 2026-10-18 (twice).

## 2. Explaining (most important rule)

Explain everything as if the user started coding today and has no prior knowledge.

**After every change**, end with a short "What I did and why" section:
1. **What changed:** the files, in plain words ("I added a screen where…").
2. **How it works:** the logic step by step, using everyday comparisons. Show the 3–10 most important lines of
   code and explain them line by line when a new idea appears.
3. **New concepts:** define any new term the first time it appears (API, function, component, state, query…).
4. **Security angle:** what could go wrong or be attacked here, and how the code prevents it (when relevant).
5. **Try it yourself:** one small thing the user can click or change to see it in action.

Also:
- Add every newly explained concept to `docs/LEARNING.md` (short definition + where it is used in this project).
- Avoid jargon without a definition. Prefer short sentences. Use analogies (restaurant, post office, keys…).
- If the user asks "why", answer the reason behind the design, not just what the code does.

## 3. Tech stack

| Part | Choice |
|---|---|
| Language | TypeScript |
| Framework | Next.js 16 (App Router) + React 19 — read `node_modules/next/dist/docs/` before using Next APIs |
| Styling | Tailwind CSS 4 (shared class strings in `src/lib/styles.ts`) |
| Backend | Supabase: PostgreSQL database, Auth (email + password), auto-generated API, row-level security |
| Hosting (later) | Vercel |

Key files:
- `supabase/migrations/` — numbered SQL files (`001_initial.sql`, `002_details_lists_history.sql`, …): tables,
  security policies, functions. Never edit a file that has already been run: every database change is a **new**
  numbered file, which the user runs in the Supabase SQL Editor (tell them exactly which file). See `supabase/README.md`.
- `src/lib/data.ts` — all reads/writes to Supabase (hooks: `useSession`, `useMemberships`, `useHousehold`,
  `useHistory`, `useLists`).
- `src/lib/balance.ts` — fairness maths for any date range, History periods and the plan's history limit.
- `src/lib/money.ts` — money as exact decimal text and whole cents (never floats), currency formatting.
- `src/components/` — one file per screen/tab. `FairShare.tsx` is the root (setup → sign in → household → app).
- `.env.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (git-ignored).

## 4. Security rules (always)

- **Never** use, request, or write the Supabase `sb_secret_` key anywhere in this project's front-end or in git.
  Only the publishable key goes in `NEXT_PUBLIC_*` variables.
- Every table has **row-level security** enabled with explicit policies and explicit grants. New table = new policies
  and grants in the same migration file (`supabase/migrations/`).
- **New tables: revoke the default Supabase privileges and grant only the columns/operations needed.** Supabase gives
  `anon` and `authenticated` every right on new tables, and a `grant` never takes rights away. So every new table
  starts with `revoke all on table … from public, anon, authenticated;`, then column-level `grant insert (…)` /
  `grant update (…)` for exactly what the app writes. `anon` gets nothing. See `003_tighten_privileges.sql`.
- **Never trust the browser's clock.** "When did this happen" columns (`logs.at`, `list_items.done_at`,
  `created_at`) are set by the database (`now()` in a default or a trigger), never taken from the client.
  (Known gap: `areas.since` is still sent by the browser when handing an area over.)
- Paid limits (like Premium's 6 months of history) are enforced in the database (`history_floor()` in the logs
  policy), never only in the UI. Members can't change `households.plan`; only server-side code or the dashboard can.
- User text always has a length CHECK in the database, and is shown through React (which escapes it). Never use
  `dangerouslySetInnerHTML`.
- `security definer` functions must `set search_path = public`, check `auth.uid()`, and validate input.
- Never trust the browser: limits (like max 12 members) are enforced in the database, not only in the UI.
- Never commit `.env*` files (except `.env.local.example`). Run `npm audit` when adding packages and explain results.
- Personal data (emails, IP addresses) is sensitive: collect only what is needed, explain why, and plan retention.
- **Security logs are for protecting accounts, never for household members to watch each other.** Login history and
  IP addresses are visible only to the account owner (and the developer/admin), never to other household members.
  This app must never feel like evidence collection.

## 5. Cybersecurity & digital forensics learning track

Weave these into the project when they fit, and explain them as you go:
- How login works (passwords, hashing, sessions, JWT tokens) and how attackers attack it (brute force, credential
  stuffing, phishing) — and the defences (rate limits, strong passwords, email confirmation, MFA).
- Where to see who logged in and from which **IP address**: Supabase dashboard → Authentication → Logs / audit log,
  and Logs Explorer (API/edge logs include request IPs). Later: our own `security_events` table filled from a
  server-side function (the browser cannot be trusted to report its own IP).
- A "Recent sign-ins" page for each user (device, approx. location, time) + "sign out everywhere".
- OWASP Top 10 applied to this app (access control, injection, misconfiguration, etc.).
- Forensics basics: what logs exist, how to read them, building a timeline of an incident, preserving evidence,
  and privacy/legal limits (GDPR treats IP addresses as personal data).
- Testing our own app safely (e.g. trying to read another household's data and proving RLS blocks it).

## 6. Design

Style (from the user's mockups, chosen 2026-10-18): bold, playful "bento" layout. **Solid coloured cards** with
black text, very rounded corners (`rounded-[28px]`), heavy tight headlines ("Hello, Alex" / "Your week"), black
pill buttons, a week strip of day pills (today = black pill), round icon buttons, overlapping avatar stacks.

Layout must **fill the whole screen** at every size:
- Phone (< 1024px): single column. Navigation is a round ☰ button in the header that opens a drawer sliding in
  from the right (sections, household switcher, invite, user, sign out). No bottom bar: on iPhone it sat on top of
  Safari's own toolbar and covered content.
- Desktop (≥ 1024px): fixed left sidebar (nav, household switcher, user), content uses the full remaining width in a
  responsive bento grid (2–4 columns). No narrow centred phone column on desktop.

Tone: neutral and friendly, **no blame language** ("snapshot to talk about together, not a scorecard").

### Colour scheme (always use these, nothing else)
Defined once as CSS variables / Tailwind theme tokens in `src/app/globals.css`. Use the token names, not hex.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `canvas` | `#FBF6EF` warm cream | `#0B0B0F` near-black | page background |
| `surface` | `#FFFFFF` | `#18181D` | plain cards, inputs |
| `ink` | `#111111` | `#F5F3EF` | text, primary buttons, nav bar |
| `muted` | `#6B6B76` | `#A1A1AA` | secondary text |
| `line` | `#ECE6DD` | `#2A2A31` | borders, empty bar tracks |
| `lavender` | `#C9B8FF` | same | brand colour, "Thinking & planning" tasks, hero cards |
| `lavender-deep` | `#6D4AFF` | `#A08BFF` | accents, focus rings, links |
| `tangerine` | `#FFB660` | same | "Doing" tasks, highlights |
| `periwinkle` | `#93A5FF` | same | stats, secondary cards |
| `bubblegum` | `#FF7EB9` | same | small accents, badges, "time to swap" |
| `peach` | `#FFE2C6` | `#3A2A1E` | soft background glow, subtle chips |

Coloured cards (lavender, tangerine, periwinkle, bubblegum) always use **black text** (`#111111`) in both themes.
Member colours (12 people) are a separate set in `src/lib/styles.ts`, harmonised with this palette.
Font: Plus Jakarta Sans (headlines extra-bold, tight letter-spacing).

## 7. Roadmap

Done:
- [x] Tech stack chosen (web app instead of mobile)
- [x] Prototype: one-tap logging, weekly balance, ownership rotation
- [x] Supabase: accounts, create/join households (max 12 people), invite links/codes, row-level security
- [x] UI restyled to the mockup
- [x] Colour scheme + full-screen responsive bento redesign (sidebar on desktop, bottom nav on phones)
- [x] `npm run dev:edge` / `dev:chrome` (start + open browser)
- [x] Phone navigation: ☰ menu drawer instead of the bottom bar; shopping-list add row and Log hero fixed at 320–430px
- [x] Mascot logo + tab icon; details on logs (bill name, amount, comment) with household currency; shopping and
  repair lists; History (free: 2 months, Premium: 6 months, enforced in the database); migrations folder

Next (suggested order — confirm with the user before starting each):
- [ ] First git commit
- [ ] Visually check signed-in screens on phone + desktop (only build-checked so far)
- [ ] Add/edit/delete own tasks and areas; rename household; leave household / remove member
- [ ] Security: "Recent sign-ins" with IP + device, password reset, rate limiting, sign out everywhere
- [ ] Live updates (Supabase Realtime) so other members' logs appear instantly
- [ ] Installable on phones (PWA) with a quick "log a task" shortcut
- [ ] Deploy to Vercel + real email provider + turn "Confirm email" back on
- [ ] Premium payments (webhook sets `households.plan`), insights beyond History
