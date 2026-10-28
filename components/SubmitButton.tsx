"use client";

import { useFormStatus } from "react-dom";

function Inner({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded bg-teal-700 px-3 py-1.5 text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

/** Submit button that disables itself while its parent <form> action is pending (stops double-submit). */
export function SubmitButton({ label }: { label: string }) {
  return <Inner label={label} />;
}
