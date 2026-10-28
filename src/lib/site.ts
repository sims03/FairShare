// Where the app lives. On GitHub Pages it's under a sub-folder (https://sims03.github.io/FairShare/),
// so "/FairShare" is the base path; locally it's "" (http://localhost:3000/). Set in next.config.ts.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Full URL of the app's home page, e.g. https://sims03.github.io/FairShare/ (browser only). */
export function appHomeUrl(): string {
  return `${window.location.origin}${BASE_PATH}/`;
}
