import fs from "node:fs";
import path from "node:path";
import {
  APPEND_ONLY,
  COLLECTIONS,
  ConflictError,
  UNIQUE_KEYS,
  matches,
  type CollectionName,
  type Doc,
  type Filter,
  type Repo,
} from "./types";

export interface FileRepoOptions {
  seedDir: string;
  /** Where mutations are written. Omit for a purely in-memory repo (tests). */
  dataDir?: string;
}

type State = Record<CollectionName, Doc[]>;

function readJson(file: string): Doc[] | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as Doc[];
}

/** File mode: reads seed/*.json, writes mutations to .data/*.json. Synchronous, single process. */
export class FileRepo implements Repo {
  readonly mode = "file" as const;
  private state: State;

  constructor(private opts: FileRepoOptions) {
    const s = {} as State;
    for (const c of COLLECTIONS) {
      const fromData = opts.dataDir ? readJson(path.join(opts.dataDir, `${c}.json`)) : null;
      s[c] = fromData ?? readJson(path.join(opts.seedDir, `${c}.json`)) ?? [];
    }
    this.state = s;
  }

  private persist(coll: CollectionName) {
    if (!this.opts.dataDir) return;
    fs.mkdirSync(this.opts.dataDir, { recursive: true });
    fs.writeFileSync(path.join(this.opts.dataDir, `${coll}.json`), JSON.stringify(this.state[coll], null, 2));
  }

  private clash(coll: CollectionName, doc: Doc, ignoreId?: string): string | null {
    const rows = this.state[coll];
    if (rows.some((r) => r._id === doc._id && r._id !== ignoreId)) return `duplicate _id ${doc._id} in ${coll}`;
    const keys = UNIQUE_KEYS[coll];
    if (keys && rows.some((r) => r._id !== doc._id && keys.every((k) => r[k] === doc[k]))) {
      return `unique key (${keys.join(",")}) already exists in ${coll}`;
    }
    return null;
  }

  async find(coll: CollectionName, filter: Filter = {}): Promise<Doc[]> {
    return structuredClone(this.state[coll].filter((d) => matches(d, filter)));
  }

  async findOne(coll: CollectionName, filter: Filter): Promise<Doc | null> {
    const hit = this.state[coll].find((d) => matches(d, filter));
    return hit ? structuredClone(hit) : null;
  }

  async insert(coll: CollectionName, doc: Doc): Promise<void> {
    const problem = this.clash(coll, doc);
    if (problem) throw new ConflictError(problem);
    this.state[coll].push(structuredClone(doc));
    this.persist(coll);
  }

  async update(coll: CollectionName, id: string, patch: Record<string, unknown>): Promise<void> {
    if (APPEND_ONLY.includes(coll)) throw new Error(`${coll} is append-only`);
    const row = this.state[coll].find((d) => d._id === id);
    if (!row) throw new Error(`${coll}/${id} not found`);
    Object.assign(row, structuredClone(patch));
    this.persist(coll);
  }

  async upsert(coll: CollectionName, doc: Doc): Promise<void> {
    if (APPEND_ONLY.includes(coll)) throw new Error(`${coll} is append-only`);
    const i = this.state[coll].findIndex((d) => d._id === doc._id);
    const problem = this.clash(coll, doc, doc._id);
    if (problem && i < 0) throw new ConflictError(problem);
    if (i >= 0) this.state[coll][i] = structuredClone(doc);
    else this.state[coll].push(structuredClone(doc));
    this.persist(coll);
  }

  async transact<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    const snapshot = structuredClone(this.state);
    try {
      return await fn(this);
    } catch (e) {
      this.state = snapshot;
      for (const c of COLLECTIONS) this.persist(c);
      throw e;
    }
  }
}
