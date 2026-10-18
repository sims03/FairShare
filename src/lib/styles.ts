// One colour per member slot (households allow up to 12 people), chosen to sit well
// next to the lavender / tangerine / periwinkle / bubblegum palette.
const MEMBER_HEXES = [
  "#6D4AFF",
  "#F08A24",
  "#5B74FF",
  "#F0479A",
  "#14B8A6",
  "#E5A800",
  "#A855F7",
  "#FF7A59",
  "#2FA8DC",
  "#6BAF1A",
  "#D946EF",
  "#64748B",
];

/** Relative brightness of a colour (0 = black, 1 = white), per the WCAG formula. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Initials go in black or white, whichever is easier to read on that colour.
export const MEMBER_STYLES = MEMBER_HEXES.map((hex) => {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onBlack = (l + 0.05) / (luminance("#111111") + 0.05);
  return { hex, text: onBlack > onWhite ? "#111111" : "#FFFFFF" };
});

export function memberStyle(styleIndex: number) {
  return MEMBER_STYLES[styleIndex % MEMBER_STYLES.length];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Bento cards rotate through these solid colours (always with black text). */
export const CARD_COLORS = ["bg-lavender", "bg-tangerine", "bg-periwinkle", "bg-bubblegum"] as const;

// Shared look: very rounded cards, black pill buttons, heavy tight headlines.
export const card = "rounded-[28px] bg-surface p-5 text-ink ring-1 ring-line sm:p-6";
export const colorCard = "rounded-[28px] p-5 text-black sm:p-6";
export const headline = "font-extrabold leading-[1.05] tracking-[-0.03em]";
export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-bold text-canvas transition hover:opacity-85 active:scale-[0.98] disabled:opacity-50";
/** Black button for use on top of a coloured card (stays black in dark mode). */
export const blackButton =
  "inline-flex items-center justify-center gap-2 rounded-full bg-black px-6 py-3.5 text-sm font-bold text-white transition hover:opacity-85 active:scale-[0.98] disabled:opacity-50";
export const iconButton =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition hover:scale-105 active:scale-95";
export const input =
  "w-full rounded-full border border-line bg-surface px-5 py-3.5 text-sm text-ink transition placeholder:text-muted focus:border-lavender-deep";
/** Quiet pill button next to a primary one ("Skip", "Cancel", "Load more"). */
export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-full bg-canvas px-6 py-3.5 text-sm font-bold text-ink ring-1 ring-line transition hover:ring-ink/30 active:scale-[0.98] disabled:opacity-50";
export const textArea =
  "w-full resize-none rounded-3xl border border-line bg-surface px-5 py-3.5 text-sm text-ink transition placeholder:text-muted focus:border-lavender-deep";
/** Small label above an input. */
export const fieldLabel = "px-1 text-xs font-bold text-muted";
/** Filter chips (periods, people, task kinds): black when selected. */
export function chip(selected: boolean) {
  return `inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
    selected ? "bg-ink text-canvas" : "bg-surface text-ink ring-1 ring-line hover:ring-ink/30"
  }`;
}
