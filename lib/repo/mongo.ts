import { MongoClient, type ClientSession, type Db, type Filter as MFilter } from "mongodb";
import {
  APPEND_ONLY,
  ConflictError,
  type CollectionName,
  type Doc,
  type Filter,
  type Repo,
} from "./types";

const DUPLICATE_KEY = 11000;

function isDuplicate(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: number }).code === DUPLICATE_KEY;
}

/** Mongo mode. Needs a reachable Atlas cluster, so it is exercised on Andrew's Mac, not in the sandbox. */
export class MongoRepo implements Repo {
  readonly mode = "mongo" as const;

  constructor(
    private client: MongoClient,
    private db: Db,
    private session?: ClientSession,
  ) {}

  static async connect(uri: string, dbName: string): Promise<MongoRepo> {
    // Fail fast (5 s) with a clear message instead of hanging when Atlas is unreachable.
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    try {
      await client.connect();
      await client.db(dbName).command({ ping: 1 });
    } catch (e) {
      await client.close().catch(() => undefined);
      throw new Error(
        `Cannot reach MongoDB (${(e as Error).message}). Unset MONGODB_URI or set DATA_MODE=file to run offline.`,
      );
    }
    return new MongoRepo(client, client.db(dbName));
  }

  private c(coll: CollectionName) {
    return this.db.collection<Doc>(coll);
  }

  async find(coll: CollectionName, filter: Filter = {}): Promise<Doc[]> {
    return (await this.c(coll).find(filter as MFilter<Doc>, { session: this.session }).toArray()) as Doc[];
  }

  async findOne(coll: CollectionName, filter: Filter): Promise<Doc | null> {
    return (await this.c(coll).findOne(filter as MFilter<Doc>, { session: this.session })) as Doc | null;
  }

  async insert(coll: CollectionName, doc: Doc): Promise<void> {
    try {
      await this.c(coll).insertOne({ ...doc }, { session: this.session });
    } catch (e) {
      if (isDuplicate(e)) throw new ConflictError(`duplicate key in ${coll}`);
      throw e;
    }
  }

  async update(coll: CollectionName, id: string, patch: Record<string, unknown>): Promise<void> {
    if (APPEND_ONLY.includes(coll)) throw new Error(`${coll} is append-only`);
    const r = await this.c(coll).updateOne({ _id: id }, { $set: patch }, { session: this.session });
    if (r.matchedCount === 0) throw new Error(`${coll}/${id} not found`);
  }

  async upsert(coll: CollectionName, doc: Doc): Promise<void> {
    if (APPEND_ONLY.includes(coll)) throw new Error(`${coll} is append-only`);
    try {
      await this.c(coll).replaceOne({ _id: doc._id }, { ...doc }, { upsert: true, session: this.session });
    } catch (e) {
      if (isDuplicate(e)) throw new ConflictError(`duplicate key in ${coll}`);
      throw e;
    }
  }

  async transact<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    if (this.session) return fn(this);
    const session = this.client.startSession();
    try {
      return await session.withTransaction(() => fn(new MongoRepo(this.client, this.db, session)));
    } finally {
      await session.endSession();
    }
  }
}
