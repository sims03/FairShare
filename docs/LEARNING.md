# Learning notebook

Every concept explained while building FairShare, in plain words, with where it lives in this project.
Claude adds to this file whenever a new idea comes up.

---

## The big picture: how FairShare works

Think of a **restaurant**:

| Restaurant | FairShare | Where in the project |
|---|---|---|
| The dining room you sit in | **Front-end**: the website in your browser (buttons, screens) | `src/components/` |
| The waiter who takes your order to the kitchen | **API**: the agreed way to send requests and get answers | Supabase creates it for us |
| The kitchen's rules ("only staff in the fridge") | **Security rules** (row-level security) | `supabase/migrations/` (`create policy …`) |
| The fridge and pantry | **Database**: where all data is stored | Supabase PostgreSQL |
| The bouncer checking names at the door | **Authentication**: proving who you are | Supabase Auth |

What happens when you tap **"Did the dishes"**:

1. **Browser:** `LogTab.tsx` notices the tap and calls `logTask(...)` in `src/lib/data.ts`.
2. **Optimistic update:** the screen updates *immediately* (so it feels instant), before the server answers.
3. **API request:** `data.ts` sends a message over the internet to Supabase, roughly:
   "Insert into `logs`: task = dishes, household = X". The message also carries your **login token**
   (proof of who you are).
4. **Security check:** the database checks the rules: *are you a member of household X?* and
   *are you logging as yourself?* If not, it refuses.
5. **Saved:** the row is stored in the `logs` table. When other members open or refocus the app, they load it.
6. If the server refused, the app shows the error and reloads the real data.

---

## Concepts

### Front-end vs back-end
- **Front-end:** everything that runs in the user's browser: the screens, buttons and colours. Anyone can see
  its code (press F12 in Edge), so it can **never** be trusted to enforce rules.
- **Back-end:** everything that runs on a server you control: the database, login and security rules.

### API (Application Programming Interface)
A menu of requests one program can make to another, and what it answers. Like a waiter: you don't walk into the
kitchen, you order from the menu. Supabase automatically creates an API for each table: "give me rows from
`tasks` where household = X", "insert this row into `logs`".
*In FairShare:* every `getSupabase().from("...")` or `.rpc("...")` call in `src/lib/data.ts` is an API request.

### Database, table, row, column
- **Database:** an organised store of data, like a set of spreadsheets that can reference each other.
- **Table:** one spreadsheet (`households`, `household_members`, `tasks`, `logs`, `areas`, `list_items`).
- **Row:** one record (one logged task). **Column:** one field (`at` = when it happened).
- **Primary key:** a column that uniquely identifies each row (`id`).
- **Foreign key:** a column pointing to a row in another table (`logs.task_id` → `tasks.id`). The database refuses
  values that point at nothing. This is why an area can't be handed to someone outside the household.

### SQL
The language for talking to databases. `create table` makes a table, `select` reads, `insert` adds,
`update` changes, `delete` removes.
*In FairShare:* the files in `supabase/migrations/`.

### Supabase
A ready-made back-end: database + login + automatic API + security rules in one service, built on PostgreSQL.
Compared to Azure: Azure is a hardware store (you buy parts and assemble them). Supabase is a flat-pack kit
already cut for apps like this one.

### Authentication vs authorisation
- **Authentication** = *who are you?* (signing in with email and password).
- **Authorisation** = *what are you allowed to do?* (you may only see households you belong to).

### Row-level security (RLS)
Rules inside the database that decide, row by row, who can read or change data. Even if someone edits the
front-end code or calls the API directly, the database still says no.
*In FairShare:* `create policy "members read logs" … using (is_member(household_id))` in `supabase/migrations/001_initial.sql`.

### Environment variables and `.env.local`
Settings kept outside the code: *which* Supabase project to talk to. They're in a separate file so the same code
can point at different projects (test or live), and so git never uploads them.
- `NEXT_PUBLIC_…` variables are sent to the browser, so they must only hold **public** values (URL, publishable key).
- The **secret key** bypasses all security rules and must never be in the front-end or git.

### Publishable key vs secret key
- **Publishable key:** an ID card for the app. Safe to show; RLS decides what each signed-in person can do.
- **Secret key:** a master key that ignores RLS. Only for trusted server code. Never shared.

### Git
A save-history for code. Each **commit** is a snapshot with a message, so you can go back if something breaks.
`.gitignore` lists files git must never save (like `.env.local`).

### Optimistic update
Updating the screen *before* the server confirms, then fixing it if the server says no. It makes the app feel
instant. *In FairShare:* `logTask` in `src/lib/data.ts`.

### Invite code
A random 8-character code (`6MUUDKRD`). It skips look-alike characters (0/O, 1/I/L) and comes from a secure
random source, so it can't realistically be guessed.
*In FairShare:* `new_invite_code()` in `supabase/migrations/001_initial.sql`.

### Port and localhost
- **localhost** means "this computer". The dev server is only on your machine, not the internet.
- A **port** is a door number on a computer. The dev server listens on door 3000. Only one program can
  listen on a door at a time, which is why a second server moved to 3001.

### Process, spawn and stdout
- A **process** is a running program. **Spawning** means one program starting another.
- **stdout** ("standard output") is the text a program prints.
*In FairShare:* `scripts/dev.mjs` spawns `next dev`, reads its stdout, and opens the browser when it sees "Ready".

### Regular expression (regex)
A pattern for searching text. `/Local:\s+(http:\/\/localhost:\d+)/` means "the word Local:, some spaces, then
an address ending in digits". *In FairShare:* `scripts/dev.mjs` uses one to find the server address.

### fetch, async/await, try/catch
- **fetch(url):** make a web request from code, exactly like the browser does.
- **await:** wait for a slow thing (like a network request) to finish before continuing.
- **try/catch:** "try this; if it fails, do that instead of crashing".
*In FairShare:* `isUp()` in `scripts/dev.mjs`, and every Supabase call in `src/lib/data.ts`.

### Cache and hard refresh
A **cache** is a saved copy of something, kept so it's faster next time. When the copy is out of date, you see
old content. **Ctrl + F5** in the browser reloads everything without the cache. If the dev server's cache is stale,
stop it (Ctrl + C) and start it again.

### CSS
The language that styles web pages: colours, sizes, spacing, layout. HTML says *what* is on the page; CSS says
*how it looks*.

### CSS variables and design tokens
A **CSS variable** is a named value: `--lavender: #c9b8ff;`. A **design token** is a colour or size with a
meaningful name. Components say `bg-lavender`, never `#c9b8ff`, so changing the colour in one place changes it
everywhere. *In FairShare:* the top of `src/app/globals.css`.

### Tailwind CSS
Instead of writing CSS files, you put small ready-made style words on elements: `rounded-full` (round corners),
`p-5` (padding), `bg-ink` (background colour). `@theme inline` in `globals.css` teaches Tailwind our own colour
names.

### Dark mode (media query)
`@media (prefers-color-scheme: dark) { … }` means "only if the computer is set to dark mode". Inside it, the same
variables get dark values, so the whole app switches automatically. *In FairShare:* `src/app/globals.css`.

### Responsive design and breakpoints
One page that adapts to the screen size. A **breakpoint** is the width where the layout changes. In Tailwind, a
prefix means "from this width up": `md:` = 768px+, `lg:` = 1024px+, `xl:` = 1280px+.
*In FairShare:* `lg:hidden` hides the bottom nav on computers; `hidden lg:flex` shows the sidebar only on
computers (`src/components/Nav.tsx`).

### CSS grid (bento layout)
A grid splits space into columns. `grid md:grid-cols-2 xl:grid-cols-3` = 1 column on phones, 2 on tablets,
3 on big screens. "Bento" = boxes of different sizes fitted together like a lunch box.
*In FairShare:* `src/components/BalanceTab.tsx`, `LogTab.tsx`.

### Contrast and luminance
**Luminance** is how bright a colour is (0 = black, 1 = white). Text needs enough **contrast** against its background
to be readable (accessibility rules, called WCAG). *In FairShare:* `luminance()` in `src/lib/styles.ts` picks black
or white initials for each member's avatar colour.

### Component
A reusable piece of the screen, written as a function that returns what to show. `<Avatar name="Alex" />` draws
a coloured circle with initials; we use it everywhere instead of repeating the code. *In FairShare:*
`src/components/ui.tsx` (Avatar, AvatarStack, LogoMark, Logo, Icon).

### SVG and the app icon
**SVG** is a picture written as text: "draw this shape, fill it lavender". It stays sharp at any size, from a 16px
browser tab to a big poster. *In FairShare:* the mascot `LogoMark` in `src/components/ui.tsx`, and the same drawing
in `src/app/icon.svg`, which Next.js turns into the browser-tab icon automatically (a *file convention*: the file's
name and place are the instruction).

### Database migration
A numbered SQL file that changes the database one step ("add a column"). Files that have already run are never
edited; the next change is a new file. Like a builder's numbered work orders: a new house follows all of them, an
existing house only the new ones. *In FairShare:* `supabase/migrations/` and `supabase/README.md`.

### Transaction
"All or nothing". `begin; … commit;` wraps many changes so that if one fails, none happen, and the database is
never left half-changed. *In FairShare:* the first and last lines of `002_details_lists_history.sql`.

### CHECK constraint
A rule the database checks on every row, e.g. `char_length(note) between 1 and 500`. Even if someone skips the
website and calls the API directly, a 10,000-character comment is refused.
*In FairShare:* `logs_note_length`, `logs_amount_range`, `households_currency_allowed` in migration 002.

### Column-level grants
A grant says what a role may do. A *column-level* grant narrows it to certain columns:
`grant update (currency) on households` means members can change the currency and nothing else, so they can't
change the household's `plan` (that would be giving themselves Premium for free).

### Database trigger
A small function the database runs automatically before or after a change. *In FairShare:* when a list item is
ticked, `list_items_stamp_done` writes who ticked it and when, so nobody can claim "Alex fixed it" from the browser.

### Money: decimal, not float
Computers store ordinary numbers ("floats") in binary, which can't hold most decimals exactly:
`0.1 + 0.2 = 0.30000000000000004`. For money we store `numeric(12,2)` (exact decimal digits), send it as text
("45.20"), and add it up as whole cents (integers are exact). *In FairShare:* `src/lib/money.ts`.

### Dialog (modal) accessibility
A dialog is a box on top of the page that needs an answer. To work for keyboard and screen-reader users it must:
move focus inside when it opens, keep Tab inside, close with Esc, have a title that is read out, label every input,
and put focus back where you were when it closes. The browser's `<dialog>` element with `showModal()` does most of
this. *In FairShare:* `src/components/LogDetailsSheet.tsx`.

### XSS (cross-site scripting) and why React escaping matters
XSS is when an attacker gets their own code to run in someone else's browser, e.g. by typing
`<script>steal()</script>` into a comment that others will see. React treats text as text: it **escapes** it, so the
comment is shown literally instead of running. The one way around this is `dangerouslySetInnerHTML`, which this
project never uses. *In FairShare:* comments and notes in `LogEntryRow.tsx` and `ListsTab.tsx`.

### Pagination
Loading a long list in pages ("200 rows, then Load more") instead of everything at once, so the app stays fast and
the database isn't asked for 10,000 rows. *In FairShare:* `HISTORY_PAGE_SIZE` and `.range(…)` in `src/lib/data.ts`.

### Date ranges and time zones
A "day" depends on where you are: Monday 00:00 in Skopje is Sunday 23:00 in London. The app works out ranges in your
local time (`periodRange` in `src/lib/balance.ts`), then sends them to the database as UTC timestamps (the
`…Z` at the end of `2026-10-18T22:00:00.000Z`), so everyone's database rows line up. Ranges are "from (included)
to (not included)", so a log at exactly midnight belongs to one day only.

### Freemium limits enforced in the database
Free households see 2 months of history, Premium 6. Hiding the buttons is not enough, because anyone can call the
API directly. So the database's read rule for logs includes `at >= history_floor(household_id)`; older rows stay
stored but are invisible until the household upgrades. *In FairShare:* `history_floor()` in migration 002.

### Hamburger menu, drawer and focus management
The ☰ icon ("hamburger": three lines like a burger) is a button that opens a **drawer**, a panel that slides in from
the side of the screen, like pulling out a drawer in a cupboard. It is a kind of dialog, so the dialog rules apply:
when it opens, keyboard focus moves into it (onto the close button); Esc or a tap on the dim area closes it; and focus
goes back to ☰ afterwards, so a keyboard or screen-reader user is put back exactly where they were. `aria-expanded`
tells screen readers whether the menu is open, and `aria-controls` says which element the button opens. While it is
open, the page behind is locked so it doesn't scroll under your thumb. *In FairShare:* `MenuButton` and `MenuDrawer`
in `src/components/Nav.tsx`; the drawer and the desktop sidebar share `NavItems`, so they always list the same sections.

### Flexbox shrinking: `min-w-0`, `flex-1` and `shrink-0`
A flex row shares its width between its children. `flex-1` = "take the free space", `shrink-0` = "never get smaller
than your own width". The catch: by default a flex child refuses to shrink below its content's natural width, and an
`<input>` has a natural width of about 20 characters. Three inputs and a button on a 375px phone don't fit, so
something gets squashed or pushed out of the card. `min-w-0` lifts that floor ("you may shrink to nothing"), so the
name box shrinks while the quantity box (`w-20 shrink-0`) and the + button (`shrink-0`) keep their size. The same
floor exists in CSS grid: `grid-cols-1` means one column of `minmax(0, 1fr)`, which can never be wider than the screen.
*In FairShare:* `titleField` / `qtyField` in `src/components/ListsTab.tsx`, and `grid-cols-1` on the tab grids.

### Two Tailwind classes for the same property: the last one in the CSS file wins
`class="w-full w-20"` does **not** mean "w-20 wins because it's written last". The browser looks at the order of the
rules in the generated CSS file, and Tailwind decides that order, not you. In our CSS `.w-full` comes after `.w-20`,
so the quantity box was 100% wide and pushed the + button off the card. Rule of thumb: never put two classes that set
the same thing (two widths, two paddings, two displays) on one element. Use a responsive variant instead
(`max-lg:hidden`), because variants always come later in the file. *In FairShare:* the `field` comment in `ListsTab.tsx`.

### Safe areas (notch and home bar)
Modern iPhones have a notch or camera island at the top and a home bar at the bottom. The browser reports how much
room they take as `env(safe-area-inset-top)`, `…-bottom`, etc., so a panel can add that much padding.
`max(1.25rem, env(safe-area-inset-top))` means "normal padding, or more if the phone needs it". These values are 0
unless the page opts in to drawing under the notch with `viewport-fit=cover`. FairShare doesn't opt in yet (Safari
keeps the page inside the safe area for us), but the drawer is ready for when the app becomes an installable PWA.
*In FairShare:* the drawer padding in `src/components/Nav.tsx`.

---

## Security notes so far
- Rules live in the **database**, not the browser, because anyone can change front-end code.
- The 12-member limit is checked inside `join_household`, and the household row is **locked** while joining so
  two people joining at the same moment can't sneak past the limit (a *race condition*).
- **Port scanning:** attackers "knock" on every port of a computer to see which programs answer. Each open port
  is a possible way in, so servers only open the ports they need. "Refused to connect" = nothing listening.
- The dev server also shows a "Network: 192.168…" address, so other devices on your Wi-Fi can open it. Only run
  it on networks you trust.
- Migration 002 locks down UPDATE rights column by column (`revoke update …` then `grant update (…)`), so a member
  can't move a log to another day, rename who ticked a list item, or switch their household to Premium.
- Tested on 2026-10-18: a member can't log a task as someone else, can't undo another member's log, and can't see a
  household before joining.
- **Default privileges and least privilege.** *Least privilege* means every person or program gets only the keys it
  needs for its job, nothing more: a cleaner gets the front-door key, not the key to the safe. Supabase hands out the
  opposite by default (*default privileges*): every new table gives the `anon` (signed out) and `authenticated`
  (signed in) roles every right, including `truncate` (empty the whole table, which ignores row-level security).
  A `grant` only adds keys, it never takes one back, so migration 001's `grant update (display_name)` didn't stop a
  member changing their own `role` or `household_id`. The fix is "take every key back, then hand out the right ones":
  `revoke all on table … from public, anon, authenticated;` followed by narrow grants such as
  `grant update (display_name) on household_members`. Row-level security decides *which rows*; grants decide *which
  actions and columns*. Both must say yes. *In FairShare:* section 1 of `003_tighten_privileges.sql`.
- **Server-side timestamps (never trust the client's time).** The browser's clock belongs to the user: it can be wrong
  by accident, or set on purpose, and anyone calling the API directly can send any time they like. Migration 003 adds
  a trigger (`logs_stamp_at`) that overwrites `at` with the database's `now()` on every new log, so nobody can log
  "Cleaned the bathroom" three months ago to look better in the balance. The screen still shows the browser's time
  straight away (an optimistic update) and swaps in the real one on the next reload. The same idea is used for ticking
  list items (`list_items_stamp_done`). For forensics this matters too: a timeline of events is only trustworthy when
  one trusted clock wrote the times. *In FairShare:* section 2 of `003_tighten_privileges.sql`.
