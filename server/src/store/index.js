import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from '../config.js';

/*
 Document metadata lives in MongoDB when MONGO_URI is set, otherwise in data/documents.json.
 The .docx files themselves are always kept on disk under data/files/<id>/.
*/

const versionSchema = new mongoose.Schema(
  {
    n: Number,
    label: String,
    kind: { type: String, enum: ['original', 'rewrite', 'revision'] },
    mode: String,
    note: String,
    from: Number,
    changed: Number,
    total: Number,
    status: { type: String, enum: ['processing', 'ready', 'failed'] },
    progress: Number,
    error: String,
    createdAt: Date,
  },
  { _id: false },
);

const documentSchema = new mongoose.Schema(
  {
    _id: String,
    owner: { type: String, index: true },
    name: String,
    words: Number,
    status: { type: String, enum: ['processing', 'ready', 'failed'] },
    versions: [versionSchema],
  },
  { timestamps: true, versionKey: false },
);

const clean = (doc) => {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  o.id = o._id;
  delete o._id;
  return o;
};

function mongoStore() {
  const Doc = mongoose.models.Document || mongoose.model('Document', documentSchema);
  return {
    kind: 'mongodb',
    async list(owner) {
      return (await Doc.find({ owner }).sort({ updatedAt: -1 }).lean()).map(clean);
    },
    async get(id, owner) {
      return clean(await Doc.findOne({ _id: id, owner }).lean());
    },
    async create(doc) {
      const { id, ...rest } = doc;
      return clean(await Doc.create({ _id: id, ...rest }));
    },
    async update(id, mutate) {
      const current = await Doc.findById(id).lean();
      if (!current) return null;
      const next = clean(current);
      mutate(next);
      const { id: _ignored, createdAt, updatedAt, ...rest } = next;
      return clean(await Doc.findByIdAndUpdate(id, { $set: rest }, { new: true }).lean());
    },
    async remove(id, owner) {
      return (await Doc.deleteOne({ _id: id, owner })).deletedCount > 0;
    },
    async failStuck() {
      const stuck = await Doc.find({ 'versions.status': 'processing' }).lean();
      for (const d of stuck) await this.update(d._id, markStuck);
      return stuck.length;
    },
  };
}

// A job can't survive a server restart, so anything still "processing" at startup has failed.
function markStuck(d) {
  for (const v of d.versions) {
    if (v.status === 'processing') {
      v.status = 'failed';
      v.error = 'The server restarted while this was running. Please try again.';
    }
  }
  d.status = d.versions.at(-1)?.status || 'ready';
}

function jsonStore() {
  const file = path.join(config.dataDir, 'documents.json');
  let docs = new Map();
  let writing = Promise.resolve();

  const persist = () => {
    const snapshot = JSON.stringify([...docs.values()], null, 2);
    writing = writing.then(async () => {
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, snapshot);
      await fs.rename(tmp, file);
    });
    return writing;
  };

  return {
    kind: 'local file',
    async load() {
      await fs.mkdir(config.dataDir, { recursive: true });
      try {
        const list = JSON.parse(await fs.readFile(file, 'utf8'));
        docs = new Map(list.map((d) => [d.id, d]));
      } catch {
        docs = new Map();
      }
    },
    async list(owner) {
      return [...docs.values()]
        .filter((d) => d.owner === owner)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .map((d) => structuredClone(d));
    },
    async get(id, owner) {
      const d = docs.get(id);
      return d && d.owner === owner ? structuredClone(d) : null;
    },
    async create(doc) {
      const now = new Date().toISOString();
      const saved = { ...doc, createdAt: now, updatedAt: now };
      docs.set(doc.id, saved);
      await persist();
      return structuredClone(saved);
    },
    async update(id, mutate) {
      const d = docs.get(id);
      if (!d) return null;
      mutate(d);
      d.updatedAt = new Date().toISOString();
      await persist();
      return structuredClone(d);
    },
    async remove(id, owner) {
      const d = docs.get(id);
      if (!d || d.owner !== owner) return false;
      docs.delete(id);
      await persist();
      return true;
    },
    async failStuck() {
      const stuck = [...docs.values()].filter((d) => d.versions.some((v) => v.status === 'processing'));
      stuck.forEach(markStuck);
      if (stuck.length) await persist();
      return stuck.length;
    },
  };
}

export let store = null;

export async function initStore() {
  if (config.mongoUri) {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
      store = mongoStore();
      return store;
    } catch (err) {
      console.warn(`  ! Could not connect to MongoDB (${err.message}). Using the local file store instead.`);
    }
  }
  const s = jsonStore();
  await s.load();
  store = s;
  return store;
}

// ---- files on disk ----
const fileDir = (id) => path.join(config.dataDir, 'files', id);
export const versionFile = (id, n) => path.join(fileDir(id), `v${n}.docx`);
const previewFile = (id, n) => path.join(fileDir(id), `v${n}.json`);

export async function writeVersionFiles(id, n, buffer, previewData) {
  await fs.mkdir(fileDir(id), { recursive: true });
  await fs.writeFile(versionFile(id, n), buffer);
  if (previewData) await fs.writeFile(previewFile(id, n), JSON.stringify(previewData));
}

export const readVersionFile = (id, n) => fs.readFile(versionFile(id, n));

export async function readPreview(id, n) {
  try {
    return JSON.parse(await fs.readFile(previewFile(id, n), 'utf8'));
  } catch {
    return null;
  }
}

export const removeFiles = (id) => fs.rm(fileDir(id), { recursive: true, force: true });
