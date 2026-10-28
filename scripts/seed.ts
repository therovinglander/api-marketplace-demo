// Mac-only Atlas loader. Run: npm run seed   (needs MONGODB_URI + MONGODB_DB in .env)
// Refuses to touch any database other than "marketplace_demo". Drops and reinserts only this app's collections.
import fs from "node:fs";
import path from "node:path";
import { MongoClient, type Document } from "mongodb";
import { COLLECTIONS } from "../lib/repo/types";

const REQUIRED_DB = "marketplace_demo";

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;
  if (!uri) throw new Error("MONGODB_URI is not set (put it in .env on your Mac).");
  if (dbName !== REQUIRED_DB) {
    throw new Error(`Refusing to seed: MONGODB_DB must be "${REQUIRED_DB}", got "${dbName ?? ""}".`);
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);
  for (const name of COLLECTIONS) {
    const file = path.join(process.cwd(), "seed", `${name}.json`);
    const rows: Document[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
    await db.collection(name).drop().catch(() => undefined); // ignore "ns not found"
    await db.createCollection(name); // explicit, so transactions never hit an implicit create
    if (rows.length) await db.collection(name).insertMany(rows);
    console.log(`${name}: ${rows.length}`);
  }
  const ix = (n: string) => db.collection(n);
  await ix("rate_plans").createIndex({ capabilityId: 1, model: 1 });
  await ix("price_books").createIndex({ partnerId: 1, version: 1 }, { unique: true });
  await ix("hotel_records").createIndex({ supplierCode: 1, supplierHotelId: 1 }, { unique: true });
  await ix("hotel_records").createIndex({ geo: "2dsphere" });
  await ix("hotel_records").createIndex({ "address.postal": 1 });
  await ix("match_proposals").createIndex({ aId: 1, bId: 1 }, { unique: true });
  await ix("match_proposals").createIndex({ status: 1, score: -1 });
  await ix("canonical_hotels").createIndex({ memberIds: 1 });
  await ix("audit_log").createIndex({ entity: 1, entityId: 1, ts: 1 });
  await ix("onboarding_sessions").createIndex({ sandboxKeyHash: 1 }, { unique: true });
  console.log("indexes created");
  await client.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
