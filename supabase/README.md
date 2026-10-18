# Database migrations

## What is a migration?

A **migration** is one numbered SQL file that changes the database one step: "add a table", "add a column".
Think of the database as a house and the migrations as the builder's work orders, numbered in the order they
were done. A brand-new house follows every order from #1. A house that already finished #1 only needs #2.

We never edit a file that has already been run. If something needs to change later, we write the next file
(`003_…`). That way the files are an exact history of how the database got its shape, and any copy of the
project (a test project, a new Supabase project) can be rebuilt by running them in order.

## How to run one

Supabase dashboard → **SQL Editor** → **New query** → paste the whole file → **Run**.
Each file runs as a single transaction (`begin; … commit;`): either every change happens, or none do.

## Order

| File | What it does |
|---|---|
| `migrations/001_initial.sql` | Tables, security rules (RLS), `create_household` / `join_household` |
| `migrations/002_details_lists_history.sql` | Bill name, amount and comment on logs; household currency and plan (free: 2 months of history, premium: 6); shopping and repair lists; editing your own logs |
| `migrations/003_tighten_privileges.sql` | Removes the rights Supabase gives every new table by default and grants back only what the app uses (e.g. members can change only their display name); the server's clock decides when a task was logged |

- **A fresh Supabase project:** run `001`, then `002`, then `003`.
- **This project (FairShare's current database):** `001` and `002` were already run, so run **only `003`**, once.

Until `002` has been run, the app shows a message saying the database needs an update.

## Testing Premium

Members can't change their own plan (that will be a payment's job later). To try Premium, run this in the
SQL Editor with your household's invite code (People tab):

```sql
update households set plan = 'premium' where invite_code = 'ABCD2345';
-- and back:
update households set plan = 'free' where invite_code = 'ABCD2345';
```

## Why money is `numeric(12,2)` and not a float

Computers store "float" numbers in binary, and most decimals (like 0.10) can't be written exactly in binary,
just as 1/3 can't be written exactly in decimal (0.333…). So `0.1 + 0.2` gives `0.30000000000000004`.
For money, small errors add up and totals stop matching receipts. `numeric(12,2)` stores the exact decimal
digits: up to 10 digits before the point and exactly 2 after. The app also adds money up in whole cents
(integers), which are exact.
