"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { decideAction, type ActionState } from "@/app/mapping/actions";

export const btn = "rounded px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <>
      <button name="decision" value="approve" disabled={pending} className={`${btn} bg-teal-700 text-white hover:bg-teal-800`}>
        {pending ? "Saving…" : "Approve"}
      </button>
      <button name="decision" value="reject" disabled={pending} className={`${btn} bg-stone-200 hover:bg-stone-300`}>
        Reject
      </button>
    </>
  );
}

export function DecisionForm({ id }: { id: string }) {
  const [state, action] = useActionState<ActionState | null, FormData>(decideAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="id" value={id} />
      <input
        name="note"
        aria-label="Decision note (becomes the audit reason)"
        placeholder="Note (becomes the audit reason)"
        className="min-w-48 flex-1 rounded border border-stone-300 px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      />
      <Buttons />
      {state ? (
        <p role="status" className={`w-full text-xs ${state.ok ? "text-teal-800" : "text-red-700"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
