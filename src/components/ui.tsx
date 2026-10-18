import { headline, initials, memberStyle } from "@/lib/styles";
import type { Member } from "@/lib/types";

const AVATAR_SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
  /** The page header: md on phones (leaves room for the name), lg from 640px. */
  header: "h-11 w-11 text-sm sm:h-14 sm:w-14 sm:text-base",
};

type AvatarProps = {
  name: string;
  styleIndex: number;
  size?: keyof typeof AVATAR_SIZES;
  /** Ring colour, matching whatever the avatar sits on (e.g. "ring-lavender"). */
  ring?: string;
};

export function Avatar({ name, styleIndex, size = "md", ring = "ring-canvas" }: AvatarProps) {
  const { hex, text } = memberStyle(styleIndex);
  return (
    <span
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ${ring} ${AVATAR_SIZES[size]}`}
      style={{ backgroundColor: hex, color: text }}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping avatars: the first `max` people, then a "+N" bubble. */
export function AvatarStack({ members, max = 4, ring }: { members: Member[]; max?: number; ring?: string }) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  const label = members.map((m) => m.name).join(", ");
  return (
    <div role="img" aria-label={`${members.length} ${members.length === 1 ? "person" : "people"}: ${label}`} className="flex -space-x-3">
      {shown.map((m) => (
        <Avatar key={m.id} name={m.name} styleIndex={m.styleIndex} ring={ring} />
      ))}
      {extra > 0 && (
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full bg-black text-sm font-bold text-white ring-2 ${ring ?? "ring-canvas"}`}>
          +{extra}
        </span>
      )}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-3 p-8 text-sm font-medium text-muted" role="status">
      <span className="h-3 w-3 animate-pulse rounded-full bg-lavender-deep" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-2xl bg-bubblegum px-4 py-3 text-sm font-medium text-black">
      {message}
    </p>
  );
}

/** Soft note for good news or hints (invites, "check your inbox"). */
export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-peach px-4 py-3 text-sm text-ink">{children}</p>;
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h2 className={`mb-5 text-3xl sm:text-4xl ${headline}`}>{children}</h2>;
}

/**
 * The FairShare mascot: a little house split down the middle, half lavender and half tangerine
 * (a fair share), with a happy face. Drawn in SVG so it stays sharp from 16px to poster size.
 * Same drawing as src/app/icon.svg (the browser tab icon), which has to use hex colours instead of tokens.
 * Decorative by default; pass `label` when the mark is the only thing that says "FairShare".
 */
export function LogoMark({ className = "h-7 w-7", label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path className="fill-lavender" d="M24 5.6Q22.7 5.6 21.4 6.6L6.4 18.8Q5 20 5 21.8V38Q5 43 10 43H24Z" />
      <path className="fill-tangerine" d="M24 5.6Q25.3 5.6 26.6 6.6L41.6 18.8Q43 20 43 21.8V38Q43 43 38 43H24Z" />
      <path
        className="fill-none stroke-black"
        strokeWidth={3.2}
        strokeLinejoin="round"
        d="M24 5.6Q25.3 5.6 26.6 6.6L41.6 18.8Q43 20 43 21.8V38Q43 43 38 43H10Q5 43 5 38V21.8Q5 20 6.4 18.8L21.4 6.6Q22.7 5.6 24 5.6Z"
      />
      <ellipse className="fill-bubblegum" cx="12.6" cy="32.6" rx="3.3" ry="2.2" />
      <ellipse className="fill-bubblegum" cx="35.4" cy="32.6" rx="3.3" ry="2.2" />
      <circle className="fill-black" cx="17.4" cy="27.4" r="3.3" />
      <circle className="fill-black" cx="30.6" cy="27.4" r="3.3" />
      <circle className="fill-white" cx="18.5" cy="26.3" r="1.1" />
      <circle className="fill-white" cx="31.7" cy="26.3" r="1.1" />
      <path className="fill-none stroke-black" strokeWidth={3} strokeLinecap="round" d="M20.4 32.6Q24 36.6 27.6 32.6" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 text-lg font-extrabold tracking-tight ${className}`}>
      <LogoMark className="h-8 w-8" />
      FairShare
    </span>
  );
}

const ICONS = {
  log: "M12 5v14M5 12h14",
  lists: "M10 6h10M10 12h10M10 18h10M4 6h.01M4 12h.01M4 18h.01",
  history: "M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5M12 7v5l3.5 2",
  week: "M12 3v9l6.4 6.4M21 12a9 9 0 1 1-9-9",
  owners: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  share: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  check: "M20 6 9 17l-5-5",
  lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z",
  wallet: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3h-4a2 2 0 0 0 0 4h4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5",
  close: "M18 6 6 18M6 6l12 12",
  back: "M19 12H5M12 19l-7-7 7-7",
  chevron: "m6 9 6 6 6-6",
  menu: "M4 7h16M4 12h16M4 17h16",
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
