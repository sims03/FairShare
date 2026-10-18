export type Category = "mental" | "physical";

/** Currencies a household can pick (the database only accepts these). */
export const CURRENCIES = [
  { code: "EUR", label: "Euro" },
  { code: "MKD", label: "Macedonian denar" },
  { code: "USD", label: "US dollar" },
  { code: "GBP", label: "British pound" },
  { code: "CHF", label: "Swiss franc" },
] as const;

export type Currency = (typeof CURRENCIES)[number]["code"];

/** "free" sees 2 months of history, "premium" 6. Only the database (a payment webhook later) can change it. */
export type Plan = "free" | "premium";

export type Household = {
  id: string;
  name: string;
  inviteCode: string;
  currency: Currency;
  plan: Plan;
};

export type Member = {
  /** The member's auth user id. */
  id: string;
  name: string;
  styleIndex: number;
  role: "owner" | "member";
};

export type Task = {
  id: string;
  name: string;
  emoji: string;
  category: Category;
  /** Effort score, 1 (tiny) to 5 (big). */
  effort: number;
  /** Ask "What was it?" and "How much?" after logging (bills, groceries). */
  asksAmount: boolean;
};

export type LogEntry = {
  id: string;
  taskId: string;
  memberId: string;
  /** ISO timestamp. */
  at: string;
} & LogDetails;

/** Optional details added after logging. Empty fields are null. */
export type LogDetails = {
  /** "What was it?", e.g. "Electricity bill" (max 80). */
  detail: string | null;
  /** Exact decimal as text, e.g. "45.20". Never a float (see src/lib/money.ts). */
  amount: string | null;
  /** Free comment (max 500). */
  note: string | null;
};

/** A recurring area of responsibility, e.g. "Bills", owned by one member at a time. */
export type Area = {
  id: string;
  name: string;
  emoji: string;
  ownerId: string;
  rotateEveryDays: number;
  /** ISO timestamp of when the current owner took over. */
  since: string;
};

export type HouseholdState = {
  household: Household;
  members: Member[];
  /** The signed-in user. */
  currentMemberId: string;
  tasks: Task[];
  logs: LogEntry[];
  areas: Area[];
};

export type ListKind = "shopping" | "repair";

/** One line on the shopping list or the repairs list. */
export type ListItem = {
  id: string;
  kind: ListKind;
  title: string;
  note: string | null;
  /** Shopping only, e.g. "2" or "1 kg". */
  quantity: string | null;
  createdBy: string;
  createdAt: string;
  /** Who ticked it (null if not done, or if that person left). */
  doneBy: string | null;
  /** When it was bought / fixed; null = still to do. */
  doneAt: string | null;
};

export const MAX_MEMBERS = 12;

// Text limits, the same numbers as the CHECK constraints in supabase/migrations/002_details_lists_history.sql.
export const LIMITS = {
  logDetail: 80,
  logNote: 500,
  itemTitle: 80,
  itemNote: 300,
  itemQuantity: 20,
} as const;
