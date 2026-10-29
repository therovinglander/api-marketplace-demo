// U4: deals page copy. Kept in one module so tests can pin the wording.
export const DEALS_WHO = "Who uses this: account managers and the deal desk for large partners, and finance when an invoice is disputed.";

export const DEALS_WHY = [
  { label: "Why commitments:", text: "a partner that commits to volume gets a discount. In return the platform gets predictable traffic to plan supplier deals and capacity around." },
  { label: "Why versions:", text: "every price book is versioned, so you can always answer \"what rate applied when, and who changed it?\"" },
];

export const DEAL_TERMS = [
  { term: "Graduated discount", def: "like income tax, each slice of committed volume gets its own tier's discount, so committing more never lowers the bill." },
  { term: "Overage at list", def: "volume above the commitment is billed at the standard list price, with no discount." },
  { term: "Take-or-pay", def: "the partner pays for whichever is higher, actual or committed volume. Unused commitment is still billed (the shortfall)." },
];

export const DEALS_SCOPE = "This prices the Search capability only. Other capabilities use list rate plans (illustrative).";
