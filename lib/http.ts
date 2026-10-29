import { MAX_BODY_BYTES } from "@/lib/rateLimit";

/**
 * Parse a request body that must be a JSON object. Returns null for invalid JSON, `null`, arrays, scalars
 * and bodies over MAX_BODY_BYTES (callers answer 400; guardWrite answers 413 first when Content-Length says so).
 */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) return null;
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
