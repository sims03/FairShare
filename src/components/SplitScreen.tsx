import { Logo, LogoMark } from "./ui";

/** Decorative shapes for the hero panel: rounded divs and a star (no images). */
function HeroShapes() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <span className="absolute right-[10%] top-[40%] hidden h-24 w-32 rotate-12 rounded-[60%_40%_55%_45%/55%_60%_40%_45%] bg-bubblegum lg:block" />
      <span className="absolute -bottom-12 -right-10 hidden h-48 w-48 rounded-full bg-periwinkle sm:block lg:h-64 lg:w-64" />
      <span className="absolute right-[45%] top-[20%] hidden text-5xl text-black lg:block">★</span>
    </div>
  );
}

/**
 * Full-screen two-part layout for the signed-out and setup screens:
 * a lavender hero (left on desktop, top on phones) and the form.
 */
export function SplitScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
      <section className="relative flex min-h-64 flex-col justify-between gap-10 overflow-hidden rounded-[28px] bg-lavender p-6 text-black sm:min-h-80 sm:p-10 lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:flex-[1.15] lg:p-14">
        <HeroShapes />
        {/* The mascot sits in the top row next to the logo (not floating), so the headline never runs under it. */}
        <div className="relative flex items-start justify-between gap-4">
          <Logo />
          <LogoMark className="h-20 w-20 shrink-0 rotate-6 sm:h-32 sm:w-32 lg:h-44 lg:w-44" />
        </div>
        <div className="relative max-w-3xl">
          <h1 className="text-4xl font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl xl:text-8xl">
            Share the load, even the invisible part
          </h1>
          <p className="mt-4 max-w-md text-sm font-medium text-black/75 sm:text-base">
            Log chores and the mental load in one tap, then look at the week together.
          </p>
        </div>
      </section>

      <div className="flex flex-1 justify-center py-4 lg:items-center lg:py-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
