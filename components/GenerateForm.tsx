"use client";

import { useActionState } from "react";
import { generateAction, type ActionState } from "@/app/mapping/actions";
import { SubmitButton } from "@/components/SubmitButton";

/** Generate-proposals form that shows the result, including the live-demo rate-limit message. */
export function GenerateForm() {
  const [state, action] = useActionState<ActionState | null, FormData>(generateAction, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <SubmitButton label="Generate proposals" />
      {state ? (
        <span role="status" className={`text-xs ${state.ok ? "text-teal-800" : "text-red-700"}`}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
