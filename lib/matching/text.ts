// Pure text helpers for matching. No I/O.

const ABBREVIATIONS: Record<string, string> = {
  st: "street",
  str: "street",
  ave: "avenue",
  av: "avenue",
  blvd: "boulevard",
  rd: "road",
  dr: "drive",
  ct: "court",
  pt: "point",
  pl: "place",
  hwy: "highway",
  w: "west",
  e: "east",
  n: "north",
  s: "south",
  and: "and",
};
const DROP = new Set(["the"]);

/** lowercase, fold accents (Hôtel -> hotel), "&" -> "and", strip punctuation, expand abbreviations, drop articles. */
export function tokens(input: string): string[] {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ABBREVIATIONS[t] ?? t)
    .filter((t) => !DROP.has(t));
}

export const normaliseName = (name: string): string => tokens(name).join(" ");

/** Postal code in a canonical form: uppercase, no spaces or punctuation. */
export const normalisePostal = (postal: string): string => postal.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Digits only; a leading country code 1 on an 11-digit number is dropped. Null if nothing usable. */
export function phoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length >= 7 ? d : null;
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a.length === 0 ? 0 : 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array<boolean>(a.length).fill(false);
  const bMatch = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(b.length - 1, i + range);
    for (let j = lo; j <= hi; j++) {
      if (!bMatch[j] && a[i] === b[j]) {
        aMatch[i] = true;
        bMatch[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Dice coefficient over token sets: 2|A∩B| / (|A|+|B|). Order-insensitive. */
export function tokenDice(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

/** Name signal: best of Jaro-Winkler on sorted tokens and token-set Dice (handles reordering and extra words). */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  const jw = jaroWinkler([...ta].sort().join(" "), [...tb].sort().join(" "));
  return Math.max(jw, tokenDice(ta, tb));
}

export interface AddressParts {
  line1: string;
  city: string;
  postal: string;
}

export function addressSimilarity(a: AddressParts, b: AddressParts): number {
  const toks = (x: AddressParts) => [...tokens(x.line1), ...tokens(x.city), normalisePostal(x.postal).toLowerCase()];
  return tokenDice(toks(a), toks(b));
}
