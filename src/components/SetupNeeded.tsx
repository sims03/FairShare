import { card } from "@/lib/styles";
import { SplitScreen } from "./SplitScreen";
import { PageTitle } from "./ui";

/** Shown in development until .env.local has the Supabase keys. */
export function SetupNeeded() {
  return (
    <SplitScreen>
      <PageTitle>Almost ready: connect Supabase</PageTitle>
      <ol className={`${card} list-decimal space-y-3 pl-10 text-sm leading-relaxed sm:pl-11`}>
        <li>Create a free project at supabase.com.</li>
        <li>
          In the project, open <strong>SQL Editor</strong> and run each file in <code>supabase/migrations/</code> in
          order: first <code>001_initial.sql</code>, then <code>002_details_lists_history.sql</code> (paste, press Run).
        </li>
        <li>
          Copy <code>.env.local.example</code> to <code>.env.local</code> and fill in the project URL and publishable
          key (Project Settings → API).
        </li>
        <li>Restart the dev server.</li>
      </ol>
    </SplitScreen>
  );
}
