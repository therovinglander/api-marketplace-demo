// Thin TypeScript SDK for the sandbox API. Isomorphic (browser or Node 18+): no dependencies.
// Auth: Bearer sandbox key. Retries: up to 3 on 429 / 5xx / network errors, exponential backoff from 200 ms + jitter.
// Never retries 4xx (other than 429). Book calls always carry an Idempotency-Key, reused across retries.

export class MarketplaceError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}
export class AuthError extends MarketplaceError {}
export class ValidationError extends MarketplaceError {}
export class RateLimitError extends MarketplaceError {}
export class UpstreamError extends MarketplaceError {}

export interface SearchRequest { hotelId: string; checkIn: string; nights: number }
export interface SearchResponse { rateKey: string; hotelId: string; checkIn: string; nights: number; totalUsd: number; illustrative: true }
export interface BookRequest { rateKey: string; guestName: string }
export interface BookResponse { bookingId: string; status: "confirmed"; rateKey: string; guestName: string; totalUsd: number; illustrative: true }

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Retries after the first attempt (default 3, so at most 4 calls). */
  maxRetries?: number;
  baseDelayMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export class MarketplaceClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly opts: ClientOptions) {
    if (!opts.apiKey) throw new ValidationError("apiKey is required");
    this.baseUrl = (opts.baseUrl ?? "http://localhost:3000/api/v1/sandbox").replace(/\/+$/, "");
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 200;
    this.fetchFn = opts.fetch ?? ((...a) => fetch(...a));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
  }

  search(req: SearchRequest): Promise<SearchResponse> {
    return this.request("search", req);
  }

  /** Idempotent: pass your own key to make a retry across process restarts safe; otherwise one is generated per call. */
  book(req: BookRequest, idempotencyKey: string = `idem_${crypto.randomUUID()}`): Promise<BookResponse> {
    return this.request("book", req, { "Idempotency-Key": idempotencyKey });
  }

  /** Any other capability: content-mapping, room-mapping, dedupe, pricing, taxes. */
  call<T = unknown>(capability: string, body: unknown): Promise<T> {
    return this.request(capability, body);
  }

  private async request<T>(path: string, body: unknown, extra: Record<string, string> = {}): Promise<T> {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.opts.apiKey}`, ...extra },
      body: JSON.stringify(body),
    };
    for (let attempt = 0; ; attempt++) {
      let res: Response | undefined;
      let netErr: unknown;
      try {
        res = await this.fetchFn(`${this.baseUrl}/${path}`, init);
      } catch (e) {
        netErr = e;
      }
      if (res?.ok) return (await res.json()) as T;
      const retryable = !res || res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(this.baseDelayMs * 2 ** attempt + this.random() * this.baseDelayMs);
        continue;
      }
      throw await toError(res, netErr);
    }
  }
}

async function toError(res: Response | undefined, netErr: unknown): Promise<MarketplaceError> {
  if (!res) return new UpstreamError(`network error: ${netErr instanceof Error ? netErr.message : String(netErr)}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const msg = (body as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`;
  if (res.status === 401 || res.status === 403) return new AuthError(msg, res.status, body);
  if (res.status === 429) return new RateLimitError(msg, res.status, body);
  if (res.status >= 500) return new UpstreamError(msg, res.status, body);
  return new ValidationError(msg, res.status, body);
}
