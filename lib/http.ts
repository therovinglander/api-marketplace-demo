/** Parse a request body that must be a JSON object. Returns null for invalid JSON, `null`, arrays and scalars (callers answer 400). */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await req.json();
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
