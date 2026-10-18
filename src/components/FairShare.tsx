"use client";

import { useEffect, useState } from "react";
import { useMemberships, useSession } from "@/lib/data";
import { capturePendingJoin, clearPendingJoin, readSelectedHousehold, saveSelectedHousehold } from "@/lib/invite";
import { isSupabaseConfigured } from "@/lib/supabase";
import { AuthScreen } from "./AuthScreen";
import { HouseholdApp } from "./HouseholdApp";
import { HouseholdSetup } from "./HouseholdSetup";
import { SetupNeeded } from "./SetupNeeded";
import { ErrorNote, Loading } from "./ui";

/** Root: setup → sign in → create/join household → the app. */
export function FairShare() {
  return isSupabaseConfigured ? <Session /> : <SetupNeeded />;
}

function Session() {
  const session = useSession();
  const [pendingJoin, setPendingJoin] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingJoin(capturePendingJoin());
  }, []);

  if (session === undefined) return <Loading />;
  if (!session) return <AuthScreen invited={pendingJoin !== null} />;
  return (
    <SignedIn
      userId={session.user.id}
      pendingJoin={pendingJoin}
      onJoinHandled={() => {
        clearPendingJoin();
        setPendingJoin(null);
      }}
    />
  );
}

type SignedInProps = { userId: string; pendingJoin: string | null; onJoinHandled: () => void };

function SignedIn({ userId, pendingJoin, onJoinHandled }: SignedInProps) {
  const { memberships, error, reload } = useMemberships(userId);
  const [selected, setSelected] = useState<string | null>(readSelectedHousehold);
  const [adding, setAdding] = useState(false);

  if (error) return <div className="mx-auto w-full max-w-xl p-6"><ErrorNote message={error} /></div>;
  if (!memberships) return <Loading />;

  const select = (id: string) => {
    saveSelectedHousehold(id);
    setSelected(id);
  };
  const active = memberships.find((m) => m.household.id === selected) ?? memberships[0];

  if (!active || adding || pendingJoin) {
    return (
      <HouseholdSetup
        defaultCode={pendingJoin}
        onDone={async (id) => {
          onJoinHandled();
          await reload();
          select(id);
          setAdding(false);
        }}
        onCancel={
          active
            ? () => {
                onJoinHandled();
                setAdding(false);
              }
            : undefined
        }
      />
    );
  }

  return (
    <HouseholdApp
      key={active.household.id}
      householdId={active.household.id}
      userId={userId}
      memberships={memberships}
      onSwitch={select}
      onAddHousehold={() => setAdding(true)}
    />
  );
}
