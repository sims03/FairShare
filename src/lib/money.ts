// Money is never a float here. Floats can't hold most decimals exactly (0.1 + 0.2 = 0.30000000000000004),
// so amounts travel as exact decimal text ("45.20") and are added up as whole cents (integers, always exact).
import type { Currency } from "./types";

/** Up to 9 digits before the point (the database allows < 1,000,000,000) and up to 2 after. */
const AMOUNT_PATTERN = /^(\d{1,9})(?:\.(\d{0,2}))?$/;

export type ParsedAmount = { ok: true; value: string | null } | { ok: false; error: string };

/** Turns what someone typed ("45,2", " 1200 ") into exact decimal text ("45.20", "1200.00"), or an error. */
export function parseAmount(typed: string): ParsedAmount {
  const cleaned = typed.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return { ok: true, value: null };
  const match = AMOUNT_PATTERN.exec(cleaned);
  if (!match) return { ok: false, error: "Use a number like 45.20 (up to 2 decimals)." };
  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return { ok: true, value: `${whole}.${fraction}` };
}

/** "45.20" → 4520. Pure integer maths on the digits, so it is exact. */
export function toCents(amount: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return 0;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

const formatters = new Map<Currency, Intl.NumberFormat>();

function formatter(currency: Currency): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(undefined, { style: "currency", currency });
    formatters.set(currency, f);
  }
  return f;
}

/** 4520 cents in EUR → "€45.20" (style depends on the browser's language). */
export function formatMoney(cents: number, currency: Currency): string {
  // Dividing a whole number of cents by 100 only happens here, for display, and the formatter
  // rounds to 2 decimals, so what you see is exactly the stored amount.
  return formatter(currency).format(cents / 100);
}

/** The symbol shown in front of the "How much?" input, e.g. "€" or "MKD". */
export function currencySymbol(currency: Currency): string {
  return formatter(currency).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
}
