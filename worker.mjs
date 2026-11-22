// <define:__ASSETS__>
var define_ASSETS_default = ["index.html", "app-icon-192.png", "app-icon.svg", "app-icon.png", "app.js", "http.mjs", "study-pairs.mjs", "study-pair-lesson.mjs", "onboarding-core.mjs", "reference-content.mjs", "speech.mjs", "styles.css", "sync-client.mjs", "sync-core.mjs", "sync-vault.mjs", "ui-core.mjs", "vendor/wanakana.mjs", "voice-customization.mjs", "start.mjs", "manifest.webmanifest", "decks/manifest.json", "decks/n1-vocabulary.json", "decks/n2-vocabulary.json", "decks/n3-vocabulary.json", "decks/n4-vocabulary.json", "decks/n5-vocabulary.json", "decks/study-reference.json.gz", "decks/reference-words/00.json.gz", "decks/reference-words/01.json.gz", "decks/reference-words/02.json.gz", "decks/reference-words/03.json.gz", "decks/reference-words/04.json.gz", "decks/reference-words/05.json.gz", "decks/reference-words/06.json.gz", "decks/reference-words/07.json.gz", "decks/reference-words/08.json.gz", "decks/reference-words/09.json.gz", "decks/reference-words/10.json.gz", "decks/reference-words/11.json.gz", "decks/reference-words/12.json.gz", "decks/reference-words/13.json.gz", "decks/reference-words/14.json.gz", "decks/reference-words/15.json.gz", "decks/reference-words/16.json.gz", "decks/reference-words/17.json.gz", "decks/reference-words/18.json.gz", "decks/reference-words/19.json.gz", "decks/reference-words/20.json.gz", "decks/reference-words/21.json.gz", "decks/reference-words/22.json.gz", "decks/reference-words/23.json.gz", "decks/reference-words/24.json.gz", "decks/reference-words/25.json.gz", "decks/reference-words/26.json.gz", "decks/reference-words/27.json.gz", "decks/reference-words/28.json.gz", "decks/reference-words/29.json.gz", "decks/reference-words/30.json.gz", "decks/reference-words/31.json.gz"];

// <define:process.argv>
var define_process_argv_default = [];

// <define:process.env>
var define_process_env_default = {};

// web/browser-files.mjs
var statePrefix = "/learner/";
var deckPrefix = "/decks/";
var decoder = new TextDecoder();
var storage;
var files;
var before;
var changes;
var chunkCounts = /* @__PURE__ */ new Map();
var separator = "\0";
var maxChunks = 512;
var missing = (path) => Object.assign(new Error(`File not found: ${path}`), { code: "ENOENT" });
var openStorage = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(`leo-sensei:${self.registration.scope}`, 2);
  request.onupgradeneeded = () => {
    const db = request.result;
    const filesStore = db.createObjectStore("files");
    if (db.objectStoreNames.contains("study")) {
      const legacy = request.transaction.objectStore("study").get("files");
      legacy.onsuccess = () => {
        [...legacy.result ?? /* @__PURE__ */ new Map()].map(([path, content]) => filesStore.put(content, path));
        db.deleteObjectStore("study");
      };
    }
  };
  request.onsuccess = () => {
    const db = request.result;
    db.onversionchange = () => db.close();
    resolve(db);
  };
  request.onerror = () => reject(request.error);
});
var loadFiles = (db) => new Promise((resolve, reject) => {
  const transaction = db.transaction("files");
  const store = transaction.objectStore("files");
  const keys = store.getAllKeys();
  const values = store.getAll();
  transaction.oncomplete = () => {
    const parts = /* @__PURE__ */ new Map();
    keys.result.map((key, index) => {
      const [path, chunk] = key.split(separator);
      if (!parts.has(path)) parts.set(path, []);
      parts.get(path).push(values.result[index]);
      if (chunk) chunkCounts.set(path, Number(chunk));
    });
    resolve(new Map([...parts].map(([path, entries]) => [path, entries.length === 1 ? entries[0] : entries.join("")])));
  };
  transaction.onabort = () => reject(transaction.error);
});
var saveFiles = (db, pending) => new Promise((resolve, reject) => {
  const transaction = db.transaction("files", "readwrite");
  const store = transaction.objectStore("files");
  const nextCounts = new Map(chunkCounts);
  [...pending].map(([path, change]) => {
    const count = nextCounts.get(path) ?? 0;
    const prefix = path + separator;
    if (change.append !== void 0 && count < maxChunks) {
      const next = count + 1;
      store.put(change.append, prefix + String(next).padStart(4, "0"));
      nextCounts.set(path, next);
      return;
    }
    if (count) store.delete(IDBKeyRange.bound(prefix, prefix + "\uFFFF"));
    nextCounts.delete(path);
    if (files.has(path)) store.put(files.get(path), path);
    else store.delete(path);
  });
  transaction.oncomplete = () => {
    chunkCounts = nextCounts;
    resolve();
  };
  transaction.onabort = () => reject(transaction.error);
});
var beginFiles = () => (storage ??= openStorage().catch((error3) => {
  storage = null;
  throw error3;
})).then((db) => files ?? loadFiles(db)).then((loaded) => {
  files = loaded;
  before = null;
  changes = null;
});
var finishFiles = (keep) => {
  if (!before) return Promise.resolve();
  const original = before;
  const pending = changes;
  before = null;
  changes = null;
  if (!keep) {
    files = original;
    return Promise.resolve();
  }
  return storage.then((db) => saveFiles(db, pending)).catch((error3) => {
    files = original;
    throw error3;
  });
};
var readBytes = (path) => {
  if (path.startsWith(deckPrefix)) {
    const url = new URL(path.slice(1), self.registration.scope);
    return caches.match(url).then((response) => {
      if (!response) throw missing(path);
      return response.arrayBuffer();
    }).then((bytes) => new Uint8Array(bytes));
  }
  return files.has(path) ? Promise.resolve(files.get(path)) : Promise.reject(missing(path));
};
var resultToCallback = (promise, callback) => promise.then((value) => callback(null, value), callback);
var set = (path, value, append) => {
  if (!path.startsWith(statePrefix)) throw new Error("Study data path is read only.");
  before ??= new Map(files);
  changes ??= /* @__PURE__ */ new Map();
  const previous = changes.get(path);
  changes.set(path, { append: append !== void 0 && (!previous || previous.append !== void 0) ? (previous?.append ?? "") + append : void 0 });
  if (value === void 0) files.delete(path);
  else files.set(path, value);
};
var readFile = (path, encoding, callback = encoding) => resultToCallback(
  readBytes(path).then((data) => encoding === "utf8" && typeof data !== "string" ? decoder.decode(data) : data),
  callback
);
var writeFile = (path, value, encoding, callback = encoding) => resultToCallback(Promise.resolve().then(() => set(path, value)), callback);
var appendFile = (path, value, encoding, callback = encoding) => resultToCallback(Promise.resolve().then(() => set(path, (files.get(path) ?? "") + value, value)), callback);
var mkdir = (_path, _options, callback) => queueMicrotask(() => callback(null));
var rename = (from, to, callback) => resultToCallback(Promise.resolve().then(() => {
  if (!files.has(from)) throw missing(from);
  set(to, files.get(from));
  set(from, void 0);
}), callback);
var rm = (path, _options, callback) => resultToCallback(Promise.resolve().then(() => set(path, void 0)), callback);

// web/node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}

// web/node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// web/node_modules/@noble/hashes/esm/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());

// web/node_modules/@noble/hashes/esm/sha256.js
var sha2562 = sha256;

// web/browser-platform.mjs
var createHash = (algorithm) => {
  if (algorithm !== "sha256") throw new Error(`Unsupported study hash: ${algorithm}`);
  const hash3 = sha2562.create();
  const api = {
    update: (value) => (hash3.update(typeof value === "string" ? utf8ToBytes(value) : value), api),
    digest: (encoding) => {
      const bytes = hash3.digest();
      return encoding === "hex" ? bytesToHex(bytes) : bytes;
    }
  };
  return api;
};
var randomUUID = () => crypto.randomUUID();
var timingSafeEqual = (left, right) => left.length === right.length && left.reduce((difference, byte, index) => difference | byte ^ right[index], 0) === 0;
var normalize = (path) => {
  const parts = path.split("/").reduce((segments, part) => {
    if (part === "." || part === "") return segments;
    if (part === ".." && segments.length) segments.pop();
    else segments.push(part);
    return segments;
  }, []);
  return (path.startsWith("/") ? "/" : "") + parts.join("/");
};
var join = (...parts) => normalize(parts.join("/"));
var dirname = (path) => path.slice(0, path.lastIndexOf("/")) || "/";
var extname = (path) => /\.[^./]+$/u.exec(path)?.[0] ?? "";
var fileURLToPath = (url) => decodeURIComponent(new URL(url).pathname);
var text = (request) => request.body.text();
var createServer = (handler) => handler;
var systemTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// scripts/lib/learner-core.mjs
var hour = 60 * 60 * 1e3;
var day = 24 * hour;
var marumoriIntervals = Object.freeze([0, 4 * hour, 8 * hour, day, 2 * day, 7 * day, 14 * day, 30 * day, 120 * day]);
var wanikaniIntervals = Object.freeze([4, 8, 23, 47, 167, 335, 719, 2879, null].map(
  (hours) => hours === null ? null : hours * hour
));
var answerEventTypes = /* @__PURE__ */ new Set(["review_answered", "reactivation_answered", "extra_review_answered"]);
var isReviewAnswerEvent = (event) => answerEventTypes.has(event?.type);
var isLearningAnswerEvent = (event) => isReviewAnswerEvent(event) && event?.practice !== true;
var isSchedulingAnswerEvent = (event) => isLearningAnswerEvent(event) || isReviewAnswerEvent(event) && event?.practice === true && event?.correct === false;
var eventsArray = (events) => Array.isArray(events) ? events : [];
var voidedAnswerIds = (events) => new Set(
  eventsArray(events).filter((event) => event?.type === "review_answer_voided" && typeof event.targetEventId === "string").map(({ targetEventId }) => targetEventId)
);
var correctionKey = ({ type, occurredAt, eventId }) => JSON.stringify([type, occurredAt, eventId ?? null]);
var validStudyDay = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && (/* @__PURE__ */ new Date(`${value}T00:00:00.000Z`)).toISOString().slice(0, 10) === value;
var correctedStudyDays = (events) => {
  const history = eventsArray(events);
  const corrections = history.filter((event) => event?.type === "study_day_corrected" && event.version === 1).flatMap((event) => Array.isArray(event.corrections) ? event.corrections : []).filter((correction) => typeof correction?.target?.type === "string" && typeof correction.target.occurredAt === "string" && validStudyDay(correction.studyDate) && (!correction.session || correction.target.type === "session_started" && Array.isArray(correction.session.scheduled) && Array.isArray(correction.session.reactivations)));
  const times = new Set(corrections.map(({ target }) => target.occurredAt));
  const byTarget = new Map(corrections.map((correction) => [correctionKey(correction.target), correction]));
  return history.filter((event) => event?.type !== "study_day_corrected").map((event) => {
    const correction = times.has(event?.occurredAt) ? byTarget.get(correctionKey(event)) : void 0;
    if (!correction) return event;
    return {
      ...event,
      studyDate: correction.studyDate,
      ...event.type === "session_started" && correction.session ? { session: { ...correction.session, studyDate: correction.studyDate } } : {},
      ...event.type === "bypass_started" && validStudyDay(correction.makeupStudyDate) ? { makeupStudyDate: correction.makeupStudyDate } : {}
    };
  });
};
var reviewProjections = /* @__PURE__ */ new WeakSet();
var effectiveReviewEvents = (events) => {
  if (reviewProjections.has(events)) return events;
  const corrected = correctedStudyDays(events);
  const voidedIds = voidedAnswerIds(corrected);
  const projected = corrected.filter((event) => event?.type !== "review_answer_voided" && (!voidedIds.size || !isReviewAnswerEvent(event) || !voidedIds.has(event?.eventId)));
  reviewProjections.add(projected);
  return projected;
};
var effectiveLearningEvents = (events) => effectiveReviewEvents(events).filter(
  (event) => !isReviewAnswerEvent(event) || isLearningAnswerEvent(event)
);
var effectiveSchedulingEvents = (events) => effectiveReviewEvents(events).filter(
  (event) => !isReviewAnswerEvent(event) || isSchedulingAnswerEvent(event)
);
var validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
var clone = (value) => structuredClone(value);
var initialCardState = (cardId) => ({
  cardId,
  status: "unscheduled",
  stage: null,
  dueAt: null,
  lastReviewedAt: null,
  reviewCount: 0,
  lastRating: null,
  reviewAttempt: null
});
var wanikaniIntervalMs = (stage) => Number.isInteger(stage) && stage >= 1 && stage <= wanikaniIntervals.length ? wanikaniIntervals[stage - 1] : null;
var marumoriLevelToWanikaniStage = (level) => Number.isInteger(level) && level >= 1 && level <= marumoriIntervals.length ? Math.max(1, level - 1) : null;
var reviewCycleKey = (event) => event.extraSessionId ? `extra:${event.extraSessionId}` : event.studyDate ? `daily:${event.studyDate}` : `legacy:${event.eventId ?? event.occurredAt}`;
var currentStage = (state) => Number.isInteger(state?.stage) ? Math.min(9, Math.max(1, state.stage)) : null;
var penaltyFor = (stage, incorrectCount) => Math.ceil(incorrectCount / 2) * (stage >= 5 ? 2 : 1);
var strongReviewWindowDays = Object.freeze({ 7: 3, 8: 12 });
var strongReviewOffsetMs = (stage, cardId) => ((windowDays) => windowDays === 0 ? 0 : (Number.parseInt(
  createHash("sha256").update(`${stage}:${String(cardId ?? "")}`).digest("hex").slice(0, 8),
  16
) % (windowDays * 2 + 1) - windowDays) * day)(strongReviewWindowDays[stage] ?? 0);
var dueAtFor = (stage, reviewedAt, cardId) => ((interval) => interval === null ? null : new Date(Math.floor((Date.parse(reviewedAt) + interval + strongReviewOffsetMs(stage, cardId)) / hour) * hour).toISOString())(wanikaniIntervalMs(stage));
var marumoriLevelFromDates = (reviewedAt, dueAt) => ((interval) => ((index) => index < 0 ? null : index + 1)(
  marumoriIntervals.findIndex((candidate) => candidate === interval)
))(Date.parse(dueAt) - Date.parse(reviewedAt));
var baselineStage = (event) => marumoriLevelToWanikaniStage(
  Number.isInteger(event.marumoriLevel) ? event.marumoriLevel : marumoriLevelFromDates(event.reviewedAt, event.dueAt)
);
var attemptFor = (cardState, key, priorStage, sameReview) => ({
  key,
  startStage: sameReview ? cardState.reviewAttempt.startStage : priorStage ?? 1,
  incorrectCount: sameReview ? Number(cardState.reviewAttempt.incorrectCount ?? 0) : 0,
  completed: sameReview ? Boolean(cardState.reviewAttempt.completed) : false
});
var resultingStage = (priorStage, sameReview, attempt, correct, incorrectCount) => correct ? sameReview && attempt.completed ? priorStage : priorStage === null ? 1 : incorrectCount > 0 ? priorStage : Math.min(9, priorStage + 1) : Math.max(1, attempt.startStage - penaltyFor(attempt.startStage, incorrectCount));
var reviewedState = (cardState, event, key, sameReview, attempt, stage, incorrectCount) => ({
  ...cardState,
  status: stage === 9 ? "burned" : "wanikani",
  stage,
  dueAt: dueAtFor(stage, event.occurredAt, cardState.cardId ?? event.cardId),
  lastReviewedAt: new Date(event.occurredAt).toISOString(),
  reviewCount: Number(cardState.reviewCount ?? 0) + Number(!sameReview),
  lastRating: incorrectCount > 0 ? "again" : "good",
  reviewAttempt: {
    key,
    startStage: attempt.startStage,
    incorrectCount,
    completed: attempt.completed || event.correct
  }
});
var scheduleReview = (cardState, event) => ((key) => ((sameReview) => sameReview && cardState.reviewAttempt.completed ? cardState : ((priorStage) => ((attempt) => ((incorrectCount) => ((stage) => reviewedState(
  cardState,
  event,
  key,
  sameReview,
  attempt,
  stage,
  incorrectCount
))(resultingStage(priorStage, sameReview, attempt, event.correct, incorrectCount)))(
  attempt.incorrectCount + Number(!event.correct)
))(attemptFor(cardState, key, priorStage, sameReview)))(currentStage(cardState)))(cardState.reviewAttempt?.key === key))(reviewCycleKey(event));
var applyBaseline = (cardState, event) => ({
  ...cardState,
  status: event.scheduled ? "marumori" : "unscheduled",
  stage: event.scheduled ? baselineStage(event) : null,
  dueAt: event.scheduled ? event.dueAt : null,
  lastReviewedAt: event.scheduled ? event.reviewedAt : null,
  reviewAttempt: null,
  ...event.scheduled ? {
    importedIntervalDays: (Date.parse(event.dueAt) - Date.parse(event.reviewedAt)) / day,
    importedLevel: event.marumoriLevel ?? null
  } : {}
});
var applicableBaseline = (event, cardsById) => event?.type === "marumori_baseline" && typeof event.cardId === "string" && Object.hasOwn(cardsById, event.cardId) && typeof event.scheduled === "boolean" && (!event.scheduled || validDate(event.reviewedAt) && validDate(event.dueAt));
var applicableAnswer = (event, cardsById) => isSchedulingAnswerEvent(event) && typeof event.cardId === "string" && Object.hasOwn(cardsById, event.cardId) && typeof event.correct === "boolean" && validDate(event.occurredAt);
var applicableKnownChange = (event, cardsById) => ["card_marked_known", "card_known_restored"].includes(event?.type) && typeof event.cardId === "string" && Object.hasOwn(cardsById, event.cardId) && validDate(event.occurredAt);
var eventTime = (event) => Date.parse(event.type === "marumori_baseline" ? event.reviewedAt ?? event.occurredAt : event.occurredAt);
var importedBaseline = (event) => event.type === "marumori_baseline" && event.provenance?.source !== "marumori-rebase";
var eventPhase = (event) => importedBaseline(event) ? 0 : event?.type === "marumori_baseline" ? 1 : isSchedulingAnswerEvent(event) ? 2 : 3;
var eventOrder = (left, right) => eventPhase(left) - eventPhase(right) || (isSchedulingAnswerEvent(left) && isSchedulingAnswerEvent(right) ? eventTime(left) - eventTime(right) : 0);
var foldCardEvents = (cardState, events, cardsById) => events.toSorted(
  eventOrder
).reduce(
  (state, event) => applicableBaseline(event, cardsById) ? applyBaseline(state, event) : applicableAnswer(event, cardsById) ? scheduleReview(state, event) : applicableKnownChange(event, cardsById) ? { ...state, known: event.type === "card_marked_known" } : state,
  cardState
);
var createCardStateProjector = () => {
  let previous;
  return (catalog, effectiveEvents) => {
    if (previous?.catalog === catalog && previous.events === effectiveEvents) return previous.projection;
    const initial = previous?.catalog === catalog ? previous.initial : Object.fromEntries(catalog.cards.map(({ id }) => [id, initialCardState(id)]));
    const grouped = Object.groupBy(effectiveEvents.filter((event) => typeof event?.cardId === "string" && (event.type === "marumori_baseline" || event.type === "card_marked_known" || event.type === "card_known_restored" || isSchedulingAnswerEvent(event))), ({ cardId }) => cardId);
    const canReuse = previous?.catalog === catalog;
    const cardsById = Object.fromEntries(Object.entries(initial).map(([id, state]) => {
      const events = grouped[id] ?? [];
      const old = canReuse ? previous.grouped[id] ?? [] : [];
      return [id, canReuse && events.length === old.length && events.every((event, index) => event === old[index]) ? previous.projection.cardsById[id] : foldCardEvents(state, events, initial)];
    }));
    const projection = { cardsById };
    previous = { catalog, events: effectiveEvents, initial, grouped, projection };
    return projection;
  };
};
var foldLearningEvents = (catalog, events) => {
  const cards = Array.isArray(catalog?.cards) ? catalog.cards : [];
  const sourceEvents = effectiveSchedulingEvents(events);
  const initialCardsById = Object.fromEntries(cards.map(({ id }) => [id, initialCardState(id)]));
  const eventsByCardId = Object.groupBy(
    sourceEvents.filter(({ cardId }) => typeof cardId === "string"),
    ({ cardId }) => cardId
  );
  return {
    cardsById: Object.fromEntries(
      cards.map(({ id }) => [
        id,
        foldCardEvents(
          initialCardsById[id],
          eventsByCardId[id] ?? [],
          initialCardsById
        )
      ])
    ),
    ignoredEvents: sourceEvents.filter((event) => !applicableBaseline(event, initialCardsById) && !applicableAnswer(event, initialCardsById) && !applicableKnownChange(event, initialCardsById)).map(clone)
  };
};
var parseJsonResult = (text4, callback) => (Promise.resolve(String(text4)).then(JSON.parse).then(
  (value) => callback({ ok: true, value }),
  () => callback({ ok: false, error: "Invalid JSON" })
), void 0);

// scripts/lib/grading.mjs
var normalizeEnglish = (value) => String(value ?? "").toLowerCase().replace(/&/gu, " and ").replace(/[^a-z0-9\s-]/gu, " ").replace(/\b(a|an|the|to|be|being|of|as)\b/gu, " ").replace(/\s+/gu, " ").trim();
var normalizeKana = (value) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, "").replace(/n$/iu, "\u3093").replace(/[ァ-ヶ]/gu, (character) => String.fromCharCode(character.charCodeAt(0) - 96));
var flattenAnswerValues = (value) => Array.isArray(value) ? value.flatMap(flattenAnswerValues) : [value];
var normalizeReadingEntry = (value) => normalizeKana(value).replace(/^[-]/u, "").replace(/[-]$/u, "");
var readingVariants = (value) => String(value ?? "").split(/[;,、/]/u).map(normalizeReadingEntry).flatMap((normalized) => normalized.includes(".") ? [normalized.replaceAll(".", ""), normalized.split(".")[0]] : [normalized]).filter(Boolean);
var englishTokens = (value) => normalizeEnglish(value).split(/\s+/u).filter(Boolean);
var compactEnglish = (value) => normalizeEnglish(value).replace(/[\s-]+/gu, "");
var withoutParentheticalText = (value) => [...String(value ?? "")].reduce(
  ({ depth, text: text4 }, character) => character === "(" ? { depth: depth + 1, text: text4 } : character === ")" ? { depth: Math.max(0, depth - 1), text: text4 } : depth === 0 ? { depth, text: `${text4}${character}` } : { depth, text: text4 },
  { depth: 0, text: "" }
).text;
var comparableMeanings = (meanings = []) => [...new Set(
  flattenAnswerValues(meanings).flatMap((meaning) => [meaning, withoutParentheticalText(meaning)]).map(normalizeEnglish).filter(Boolean)
)];
var meaningsOverlap = (left, right) => ((rightMeanings) => comparableMeanings(left).some((meaning) => rightMeanings.has(meaning)))(new Set(comparableMeanings(right)));
var meaningVariants = (meaning) => ((source) => [.../* @__PURE__ */ new Set([
  source,
  withoutParentheticalText(source).replace(/\s+/gu, " ").trim()
])].filter(Boolean))(String(meaning ?? ""));
var levenshtein = (left, right) => [...left].reduce(
  (previousRow, leftCharacter, leftIndex) => [...right].reduce(
    (row, rightCharacter, rightIndex) => [
      ...row,
      Math.min(
        previousRow[rightIndex + 1] + 1,
        row[rightIndex] + 1,
        previousRow[rightIndex] + (leftCharacter === rightCharacter ? 0 : 1)
      )
    ],
    [leftIndex + 1]
  ),
  Array.from({ length: right.length + 1 }, (_, index) => index)
)[right.length];
var tokenMatches = (answerToken, expectedToken) => answerToken === expectedToken ? true : answerToken.length < 4 || expectedToken.length < 4 ? false : levenshtein(answerToken, expectedToken) <= Math.max(1, Math.floor(expectedToken.length * 0.2));
var gradeExpectedMeaning = (answer) => (meaning) => ({
  ...englishTokens(meaning).filter((token) => token.length > 2).map((expectedToken, _, expectedTokens) => ({
    expectedTokens,
    matched: englishTokens(answer).some((answerToken) => tokenMatches(answerToken, expectedToken))
  })).reduce(
    (result, { expectedTokens, matched }) => ({
      expectedTokens,
      matchedCount: result.matchedCount + Number(matched)
    }),
    { expectedTokens: [], matchedCount: 0 }
  ),
  compactMatched: tokenMatches(compactEnglish(answer), compactEnglish(meaning))
});
var gradeMeaning = (answer, meanings) => englishTokens(answer).length === 0 ? { correct: false, score: 0, matchedMeaning: null } : meanings.flatMap((meaning) => meaningVariants(meaning).map((variant) => ({
  meaning,
  ...gradeExpectedMeaning(answer)(variant)
}))).map(({ meaning, expectedTokens, matchedCount, compactMatched }) => ({
  correct: compactMatched || expectedTokens.length > 0 && matchedCount / expectedTokens.length >= (expectedTokens.length <= 2 ? 1 : 0.6),
  score: compactMatched ? 1 : expectedTokens.length === 0 ? 0 : matchedCount / expectedTokens.length,
  matchedMeaning: meaning
})).reduce(
  (best, candidate) => candidate.score > best.score ? candidate : best,
  { correct: false, score: 0, matchedMeaning: null }
);
var gradeReading = (answer, expectedReadings) => ({
  correct: flattenAnswerValues(expectedReadings).flatMap(readingVariants).includes(normalizeKana(answer)),
  normalizedAnswer: normalizeKana(answer)
});
var normalizeJapaneseSurface = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, "").trim();
var gradeReverseVocabulary = (answer, expectedSurface, expectedReadings = []) => ({
  correct: flattenAnswerValues(expectedSurface).flatMap((surface) => String(surface ?? "").split(/[;,、]/u)).map(normalizeJapaneseSurface).includes(normalizeJapaneseSurface(answer)) || gradeReading(answer, expectedReadings).correct,
  normalizedAnswer: normalizeJapaneseSurface(answer)
});

// scripts/lib/reference-lookup.mjs
var referenceText = (value) => String(value ?? "").normalize("NFKC").trim();
var unique = (values) => values.filter((value, position) => values.findIndex((other) => other.text === value.text && other.rule === value.rule) === position);
var compact = (value) => referenceText(value).replace(/[~〜～…\s]/gu, "");
var variants = (value) => unique([
  { text: referenceText(value), rule: "exact" },
  ...[referenceText(value).replace(/\([^)]*\)/gu, ""), referenceText(value).replace(/[()]/gu, "")].map((text4) => ({ text: compact(text4), rule: "notation" }))
].filter(({ text: text4 }) => text4 && !/[()]/u.test(text4)));
var referenceForms = (card) => unique([card.item, ...card.surfaceAliases ?? []].flatMap(variants).flatMap((variant) => [
  variant,
  ...[["\u3059\u308B", "suru"], ["\u306A", "na"], ["\u306B", "adverb"], ["\u3068", "adverb"]].filter(([ending]) => variant.text.endsWith(ending) && variant.text.length > ending.length).map(([ending, rule]) => ({ text: variant.text.slice(0, -ending.length), rule }))
]));
var referenceReadings = (card) => unique([card.reading, ...card.readings ?? []].flatMap(variants).flatMap((variant) => [
  variant,
  ...[["\u3059\u308B", "suru"], ["\u306A", "na"], ["\u306B", "adverb"], ["\u3068", "adverb"]].filter(([ending]) => variant.text.endsWith(ending) && variant.text.length > ending.length).map(([ending, rule]) => ({ text: variant.text.slice(0, -ending.length), rule }))
]).map((variant) => ({ ...variant, text: normalizeKana(variant.text) })).filter(({ text: text4 }) => /^[ぁ-ゖゝゞー]+$/u.test(text4)));
var referenceSupplement = (card, data = {}) => data.supplements?.find((note) => referenceText(note.item) === referenceText(card.item) && normalizeKana(note.reading) === normalizeKana(card.reading)) ?? null;
var referenceLookupKeys = (card, data = {}) => [.../* @__PURE__ */ new Set([
  ...referenceForms(card).map(({ text: text4 }) => text4),
  ...referenceReadings(card).map(({ text: text4 }) => text4),
  ...(referenceSupplement(card, data)?.lookups ?? []).flatMap((lookup) => referenceLookupKeys(lookup))
])];
var referenceRuleApplies = (rule, tags = []) => ({
  suru: tags.some((tag) => /^vs(?:-|$)/u.test(tag)),
  na: tags.includes("adj-na"),
  adverb: tags.some((tag) => ["adv", "adv-to", "adj-na"].includes(tag))
})[rule] ?? true;
var kanjiSkeleton = (value) => [...referenceText(value)].filter((ch) => /\p{Script=Han}/u.test(ch)).join("");

// scripts/lib/daily-session.mjs
var studyDayFormatters = /* @__PURE__ */ new Map();
var studyDayFormatter = (timeZone) => studyDayFormatters.get(timeZone) ?? ((formatter) => (studyDayFormatters.set(timeZone, formatter), formatter))(new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23"
}));
var asDate = (value) => value instanceof Date ? new Date(value.getTime()) : new Date(value);
var asTime = (value, fallback = Number.POSITIVE_INFINITY) => {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};
var lexicographic = (left, right) => String(left).localeCompare(String(right));
var hash = (value) => Number.parseInt(
  createHash("sha256").update(value).digest("hex").slice(0, 8),
  16
);
var seededSelectionTieBreak = (seed, leftId, rightId) => hash(`${seed}:selection:${leftId}`) - hash(`${seed}:selection:${rightId}`) || lexicographic(leftId, rightId);
var cardsArray = (cards) => Array.isArray(cards) ? cards : cards?.cards ?? [];
var statesArray = (cardStates) => Array.isArray(cardStates) ? cardStates : Object.values(cardStates?.cardsById ?? cardStates ?? {});
var stateIndex = (cardStates) => Object.fromEntries(
  statesArray(cardStates).map((state) => [state.cardId ?? state.id, state])
);
var marumori = (card) => card.provenance?.marumori ?? card.marumori ?? {};
var strength = (card, state) => Number.isFinite(Number(state?.stage)) ? Number(state.stage) : Number.isFinite(Number(marumori(card).level)) ? Number(marumori(card).level) : Number.POSITIVE_INFINITY;
var isLeech = (card) => Boolean(marumori(card).leech);
var isImported = (card) => Boolean(card.provenance?.marumori || card.marumori);
var isLocalWanikani = (state) => state?.status === "wanikani";
var importedIntervalDays = (state) => {
  const interval = Number(state?.importedIntervalDays);
  return Number.isFinite(interval) && interval > 0 ? interval : null;
};
var overdueIntervals = (state, nowTime) => {
  const interval = importedIntervalDays(state);
  const overdueDays = Math.max(0, nowTime - asTime(state?.dueAt, nowTime)) / (24 * 60 * 60 * 1e3);
  return interval === null ? null : overdueDays / interval;
};
var dueComparator = (states, nowTime, seed) => (left, right) => Number(isLocalWanikani(states[right.id])) - Number(isLocalWanikani(states[left.id])) || (overdueIntervals(states[right.id], nowTime) ?? Number.NEGATIVE_INFINITY) - (overdueIntervals(states[left.id], nowTime) ?? Number.NEGATIVE_INFINITY) || asTime(states[left.id]?.dueAt) - asTime(states[right.id]?.dueAt) || strength(left, states[left.id]) - strength(right, states[right.id]) || Number(isLeech(right)) - Number(isLeech(left)) || seededSelectionTieBreak(seed, left.id, right.id);
var poolComparator = (states, seed) => (left, right) => strength(left, states[left.id]) - strength(right, states[right.id]) || Number(isLeech(right)) - Number(isLeech(left)) || seededSelectionTieBreak(seed, left.id, right.id);
var isDue = (state, nowTime) => Boolean(
  state && !state.known && state.status === "wanikani" && Number.isFinite(asTime(state.dueAt)) && asTime(state.dueAt) <= nowTime
);
var isReactivatable = (card, state) => Boolean(
  isImported(card) && !state?.known && state?.status === "marumori"
);
var sessionCard = (source) => (card) => ({
  cardId: card.id,
  type: card.type,
  source,
  promptDirection: "recognition"
});
var learnedVocabulary = (cards, states) => cards.filter((card) => card.type === "vocabulary" && (states[card.id]?.known === true || Number.isInteger(states[card.id]?.stage)));
var firstForm = (value) => String(value ?? "").split(/[;,、/]/u)[0].normalize("NFKC").trim();
var reviewForm = (value) => [...firstForm(value)].reduce(
  ({ depth, text: text4 }, character) => character === "(" ? { depth: depth + 1, text: text4 } : character === ")" ? { depth: Math.max(0, depth - 1), text: text4 } : depth > 0 || /[~～〜\s]/u.test(character) ? { depth, text: text4 } : { depth, text: `${text4}${character}` },
  { depth: 0, text: "" }
).text;
var surfaceShape = (card) => ((counts) => [
  [counts.kanji, "kanji"],
  [counts.hiragana, "hiragana"],
  [counts.katakana, "katakana"],
  [counts.latin, "Latin"],
  [counts.other, "other"]
].filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`).join(" + "))([...reviewForm(card.item)].reduce(
  (counts, character) => /\p{Script=Han}/u.test(character) ? { ...counts, kanji: counts.kanji + 1 } : /\p{Script=Hiragana}/u.test(character) ? { ...counts, hiragana: counts.hiragana + 1 } : /[\p{Script=Katakana}ーｰ]/u.test(character) ? { ...counts, katakana: counts.katakana + 1 } : /[a-z0-9]/iu.test(character) ? { ...counts, latin: counts.latin + 1 } : /\s/u.test(character) ? counts : { ...counts, other: counts.other + 1 },
  { kanji: 0, hiragana: 0, katakana: 0, latin: 0, other: 0 }
));
var readingShape = (card) => ((reading) => ({
  length: [...reading].length,
  initial: [...reading].length > 1 && /^[ぁ-ゖー]/u.test(reading) ? [...reading][0] : null
}))(normalizeKana(reviewForm(card.readings?.[0] ?? card.reading)));
var answerShape = (card) => ({
  surface: surfaceShape(card),
  readingLength: readingShape(card).length,
  readingInitial: readingShape(card).initial
});
var sameAnswerClue = (left, right) => left.surface === right.surface && left.readingLength === right.readingLength && left.readingInitial === right.readingInitial;
var reversePromptHint = (card, learned) => ((target, collisions) => !target.surface || target.readingLength === 0 || collisions.some((candidate) => sameAnswerClue(target, answerShape(candidate))) ? null : `Written: ${target.surface} \xB7 Reading: ${target.readingLength} kana${target.readingInitial ? ` \xB7 starts with ${target.readingInitial}` : ""}`)(answerShape(card), learned.filter((candidate) => candidate.id !== card.id && meaningsOverlap(card.meanings, candidate.meanings)));
var withReversePrompts = (studyDay, scheduled, cards, states) => {
  const vocabulary = scheduled.filter(({ type }) => type === "vocabulary");
  const reverseCount = Math.round(vocabulary.length * 0.1);
  const cardsById = Object.fromEntries(cards.map((card) => [card.id, card]));
  const learned = learnedVocabulary(cards, states);
  const learnedIds = new Set(learned.map(({ id }) => id));
  const reverseEntries = [...vocabulary].map((entry) => ({
    ...entry,
    promptHint: learnedIds.has(entry.cardId) ? reversePromptHint(cardsById[entry.cardId], learned) : null
  })).filter(({ promptHint }) => promptHint !== null).sort((left, right) => hash(`${studyDay}:${left.cardId}`) - hash(`${studyDay}:${right.cardId}`) || lexicographic(left.cardId, right.cardId)).slice(0, reverseCount);
  const reverseById = new Map(reverseEntries.map(({ cardId, promptHint }) => [cardId, promptHint]));
  return scheduled.map((entry) => ({
    ...entry,
    promptDirection: entry.type === "vocabulary" && reverseById.has(entry.cardId) ? "reverse" : "recognition",
    ...reverseById.get(entry.cardId) ? { promptHint: reverseById.get(entry.cardId) } : {}
  }));
};
var presentationOrder = (studyDay, entries) => [...entries].sort((left, right) => hash(`${studyDay}:presentation:${left.cardId}`) - hash(`${studyDay}:presentation:${right.cardId}`) || lexicographic(left.cardId, right.cardId)).map(({ cardId }) => cardId);
var frozenSession = (events, studyDay) => [...events].filter((event) => event.type === "session_started" && event.studyDate === studyDay).sort((left, right) => asTime(left.occurredAt) - asTime(right.occurredAt)).map((event) => event.session).find((session) => session);
var positiveCount = (value) => Number.isInteger(value) && value > 0 ? value : 100;
var missedDaySessionVersion = 4;
var typePlanFor = (requiredDailyCount) => ((count) => ((kanji) => Object.freeze([
  Object.freeze({ type: "kanji", dailyLimit: kanji }),
  Object.freeze({ type: "vocabulary", dailyLimit: count - kanji })
]))(Math.round(count * 0.35)))(positiveCount(requiredDailyCount));
var shiftedStudyDay = (value, days) => new Date(
  Date.parse(`${value}T00:00:00.000Z`) + days * 24 * 60 * 60 * 1e3
).toISOString().slice(0, 10);
var previousStudyDay = (value) => shiftedStudyDay(value, -1);
var nextStudyDay = (value) => shiftedStudyDay(value, 1);
var studyDate = (now, timeZone = systemTimeZone()) => ((parts) => ((date) => Number(parts.hour) < 4 ? previousStudyDay(date) : date)(`${parts.year}-${parts.month}-${parts.day}`))(Object.fromEntries(
  studyDayFormatter(timeZone).formatToParts(asDate(now)).map(({ type, value }) => [type, value])
));
var bypassStudyDate = (event, timeZone) => event.studyDate ?? studyDate(event.occurredAt, timeZone);
var bypassMakeupStudyDate = (event, timeZone) => event.makeupStudyDate ?? nextStudyDay(bypassStudyDate(event, timeZone));
var bypassMakeupReviews = (events, currentStudyDay, timeZone) => events.filter((event) => event.type === "bypass_started" && bypassMakeupStudyDate(event, timeZone) === currentStudyDay).map(({ makeupReviews }) => Number(makeupReviews)).filter((makeupReviews) => Number.isInteger(makeupReviews) && makeupReviews > 0).reduce((total, makeupReviews) => total + makeupReviews, 0);
var uniqueEmergencyUnlocks = (events) => events.filter((event) => event.type === "emergency_unlock_granted").toSorted((left, right) => asTime(left.occurredAt) - asTime(right.occurredAt)).filter((event, index, unlocks) => unlocks.findIndex(
  (candidate) => candidate.studyDate === event.studyDate
) === index);
var carryoverForStudyDate = (events = [], targetStudyDate) => uniqueEmergencyUnlocks(events).filter((event) => event.targetStudyDate === targetStudyDate).map(({ carryoverCount }) => Number(carryoverCount)).filter((carryoverCount) => Number.isInteger(carryoverCount) && carryoverCount > 0).reduce((total, carryoverCount) => total + carryoverCount, 0);
var makeupReviewsFor = (events, currentStudyDay, timeZone) => bypassMakeupReviews(events, currentStudyDay, timeZone) + carryoverForStudyDate(events, currentStudyDay) + missedDayReviewsFor(events, currentStudyDay, timeZone);
var generatedDailySession = ({ cards, cardStates, events = [], now, requiredDailyCount = 100, timeZone }, studyDay) => {
  const allCards = cardsArray(cards);
  const states = stateIndex(cardStates);
  const nowTime = asDate(now).getTime();
  const makeupReviews = makeupReviewsFor(events, studyDay, timeZone);
  const typePlan = typePlanFor(requiredDailyCount);
  const selections = typePlan.map(({ type, dailyLimit: dailyLimit2 }) => {
    const typedCards = allCards.filter((card) => card.type === type);
    const allDue = [...typedCards].filter((card) => isDue(states[card.id], nowTime)).sort(dueComparator(states, nowTime, studyDay));
    const due = allDue.slice(0, dailyLimit2);
    const pool = [...typedCards].filter((card) => isReactivatable(card, states[card.id])).sort(poolComparator(states, studyDay));
    const reactivations2 = pool.slice(0, Math.max(0, dailyLimit2 - due.length));
    return {
      scheduled: due.map(sessionCard("due")),
      reactivations: reactivations2.map(sessionCard("reactivation"))
    };
  });
  const baseScheduled = selections.flatMap((selection) => selection.scheduled);
  const baseReactivations = selections.flatMap((selection) => selection.reactivations);
  const baseIds = new Set([...baseScheduled, ...baseReactivations].map(({ cardId }) => cardId));
  const makeupScheduled = [...allCards].filter((card) => ["kanji", "vocabulary"].includes(card.type) && isDue(states[card.id], nowTime) && !baseIds.has(card.id)).sort(dueComparator(states, nowTime, studyDay)).slice(0, makeupReviews).map(sessionCard("due"));
  const makeupScheduledIds = new Set(makeupScheduled.map(({ cardId }) => cardId));
  const makeupReactivations = [...allCards].filter((card) => ["kanji", "vocabulary"].includes(card.type) && isReactivatable(card, states[card.id]) && !baseIds.has(card.id) && !makeupScheduledIds.has(card.id)).sort(poolComparator(states, studyDay)).slice(0, Math.max(0, makeupReviews - makeupScheduled.length)).map(sessionCard("reactivation"));
  const scheduled = [...baseScheduled, ...makeupScheduled];
  const reversedScheduled = withReversePrompts(studyDay, scheduled, allCards, states);
  const reactivations = [...baseReactivations, ...makeupReactivations];
  const generated = {
    sessionVersion: missedDaySessionVersion,
    studyDate: studyDay,
    startedAt: asDate(now).toISOString(),
    scheduled: reversedScheduled,
    reactivations,
    presentationOrder: presentationOrder(studyDay, [...reversedScheduled, ...reactivations])
  };
  return generated;
};
var selectDailySession = (input) => ((studyDay) => frozenSession(input.events ?? [], studyDay) ?? generatedDailySession(input, studyDay))(studyDate(input.now, input.timeZone));
var eventStudyDate = (event, timeZone) => typeof event?.studyDate === "string" && event.studyDate.length > 0 ? event.studyDate : Number.isFinite(Date.parse(event?.occurredAt ?? "")) ? studyDate(event.occurredAt, timeZone) : null;
var answersFor = (events, session, eventTypes, timeZone) => events.filter(
  (event) => eventTypes.includes(event.type) && eventStudyDate(event, timeZone) === session.studyDate
);
var knownCardIds = (events, throughStudyDate, timeZone) => events.filter((event) => ["card_marked_known", "card_known_restored"].includes(event.type) && typeof event.cardId === "string" && eventStudyDate(event, timeZone) <= throughStudyDate).toSorted((left, right) => asTime(left.occurredAt) - asTime(right.occurredAt)).reduce((known, event) => event.type === "card_marked_known" ? /* @__PURE__ */ new Set([...known, event.cardId]) : new Set([...known].filter((cardId) => cardId !== event.cardId)), /* @__PURE__ */ new Set());
var progressFor = (entries, answers2, known) => {
  const ids = entries.map(({ cardId }) => cardId);
  const attempted2 = ids.filter((cardId) => known.has(cardId) || answers2.some((event) => event.cardId === cardId)).length;
  const eventuallyCorrect2 = ids.filter((cardId) => known.has(cardId) || answers2.some((event) => event.cardId === cardId && event.correct === true)).length;
  return {
    required: ids.length,
    attempted: attempted2,
    eventuallyCorrect: eventuallyCorrect2,
    accuracy: ids.length === 0 ? 1 : eventuallyCorrect2 / ids.length
  };
};
var sessionProgress = (session, events, timeZone) => {
  const known = knownCardIds(events, session.studyDate, timeZone);
  const scheduled = progressFor(session.scheduled, answersFor(events, session, ["review_answered"], timeZone), known);
  const reactivations = progressFor(session.reactivations, answersFor(events, session, ["reactivation_answered"], timeZone), known);
  const complete = Number(session.sessionVersion ?? 1) >= 2 ? scheduled.eventuallyCorrect === scheduled.required && reactivations.eventuallyCorrect === reactivations.required : scheduled.attempted === scheduled.required && scheduled.accuracy >= 0.8 && reactivations.attempted === reactivations.required;
  return { complete, scheduled, reactivations };
};
var missedDayReviewsFor = (events, currentStudyDay, timeZone) => ((session) => session && Number(session.sessionVersion ?? 1) >= missedDaySessionVersion && session.scheduled.length + session.reactivations.length > 0 && !sessionProgress(session, events, timeZone).complete ? 50 : 0)(frozenSession(events, previousStudyDay(currentStudyDay)));
var validSession = (session) => Boolean(
  session && typeof session.studyDate === "string" && Array.isArray(session.scheduled) && Array.isArray(session.reactivations)
);
var errorStatus = (now, message, timeZone) => ({
  state: "error",
  studyDate: studyDate(now, timeZone),
  complete: false,
  failOpen: true,
  error: message,
  bypass: null,
  makeupReviews: 0,
  makeupTomorrow: 0,
  progress: {
    scheduled: { required: 0, attempted: 0, eventuallyCorrect: 0, accuracy: 0 },
    reactivations: { required: 0, attempted: 0, eventuallyCorrect: 0, accuracy: 0 }
  }
});
var activeBypassEvent = ({ events = [], currentStudyDate, now, timeZone }) => events.filter((event) => event && typeof event === "object" && !Array.isArray(event) && ["bypass_started", "emergency_unlock_granted"].includes(event.type) && eventStudyDate(event, timeZone) === currentStudyDate).toSorted((left, right) => asTime(right.expiresAt) - asTime(left.expiresAt)).find((event) => asTime(event.expiresAt, Number.NEGATIVE_INFINITY) > asDate(now).getTime()) ?? null;
var deriveDailyStatus = ({ session, events = [], now, timeZone }) => validSession(session) ? (() => {
  const progress = sessionProgress(session, events, timeZone);
  const bypass = activeBypassEvent({
    events,
    currentStudyDate: session.studyDate,
    now,
    timeZone
  });
  return {
    state: progress.complete ? "complete" : "incomplete",
    studyDate: session.studyDate,
    complete: progress.complete,
    failOpen: false,
    error: null,
    bypass: bypass ? { active: true, eventType: bypass.type, reason: bypass.reason, expiresAt: bypass.expiresAt } : null,
    makeupReviews: makeupReviewsFor(events, session.studyDate, timeZone),
    makeupTomorrow: makeupReviewsFor(events, nextStudyDay(session.studyDate), timeZone),
    progress: { scheduled: progress.scheduled, reactivations: progress.reactivations }
  };
})() : errorStatus(now, "Daily session is missing or invalid.", timeZone);
var defaultBypassMinutes = 240;
var createBypassEvent = ({ now, durationMinutes = defaultBypassMinutes, timeZone }) => ((minutes) => ((sourceStudyDate) => ({
  ok: true,
  event: {
    type: "bypass_started",
    studyDate: sourceStudyDate,
    occurredAt: asDate(now).toISOString(),
    makeupStudyDate: nextStudyDay(sourceStudyDate),
    makeupReviews: 50,
    durationMinutes: minutes,
    expiresAt: new Date(asDate(now).getTime() + minutes * 60 * 1e3).toISOString()
  }
}))(studyDate(now, timeZone)))(Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0 ? Number(durationMinutes) : defaultBypassMinutes);
var gateAccess = (status) => status?.state === "error" || status?.failOpen ? { allowed: true, reason: "fail_open", expiresAt: null } : status?.state === "complete" ? { allowed: true, reason: "study_complete", expiresAt: null } : status?.bypass?.active ? {
  allowed: true,
  reason: status.bypass.eventType === "emergency_unlock_granted" ? "emergency_unlock" : "temporary_bypass",
  expiresAt: status.bypass.expiresAt
} : { allowed: false, reason: "study_incomplete", expiresAt: null };

// scripts/lib/review-service.mjs
var cardsArray2 = (cards) => Array.isArray(cards) ? cards : cards?.cards ?? [];
var cardIndex = (cards) => Object.fromEntries(cardsArray2(cards).map((card) => [card.id, card]));
var shuffleRank = (value) => Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16);
var shuffledPresentationOrder = (entries, seed) => entries.toSorted((left, right) => shuffleRank(`${seed}:${left.cardId}`) - shuffleRank(`${seed}:${right.cardId}`) || left.cardId.localeCompare(right.cardId)).map(({ cardId }) => cardId);
var statesArray2 = (cardStates) => Array.isArray(cardStates) ? cardStates : Object.values(cardStates?.cardsById ?? cardStates ?? {});
var hasKanji = (value) => /[\u4e00-\u9fff]/u.test(String(value ?? ""));
var eventAliases = (events, cardId, type) => events.filter((event) => event.type === type && event.cardId === cardId).map(({ value }) => value);
var acceptedReadings = (card, events = []) => [.../* @__PURE__ */ new Set([
  ...Array.isArray(card?.readings) && card.readings.length > 0 ? card.readings : card?.reading ? [card.reading] : [],
  ...Array.isArray(card?.readingAliases) ? card.readingAliases : [],
  ...eventAliases(events, card?.id, "reading_alias_added")
])];
var acceptedMeanings = (card, events = []) => [.../* @__PURE__ */ new Set([
  ...Array.isArray(card?.meanings) ? card.meanings : [],
  ...Array.isArray(card?.meaningAliases) ? card.meaningAliases : [],
  ...eventAliases(events, card?.id, "meaning_alias_added")
])];
var acceptedSurfaces = (card) => [...new Set([
  card?.item,
  ...Array.isArray(card?.surfaceAliases) ? card.surfaceAliases : []
].flatMap((surface) => String(surface ?? "").split(/[;,、]/u)).map((surface) => surface.trim()).filter(Boolean))];
var displayReadings = (readings) => [...new Set(readings.map((reading) => String(reading).replaceAll(".", "")))];
var requiresReading = (card) => acceptedReadings(card).length > 0 && hasKanji(card?.item);
var eventStudyDateMatches = (event, session) => event.studyDate === session.studyDate;
var answers = (events, session, type) => events.filter(
  (event) => event.type === type && eventStudyDateMatches(event, session)
);
var attempted = (eventsForType, cardId) => eventsForType.some((event) => event.cardId === cardId);
var eventuallyCorrect = (eventsForType, cardId) => eventsForType.some(
  (event) => event.cardId === cardId && event.correct === true
);
var firstTryFor = (entries, answerEvents) => ((firstAnswers) => ({
  attempted: firstAnswers.length,
  correct: firstAnswers.filter(({ correct }) => correct).length,
  rate: firstAnswers.length === 0 ? 0 : firstAnswers.filter(({ correct }) => correct).length / firstAnswers.length
}))(entries.map(({ cardId }) => answerEvents.filter((event) => event.cardId === cardId).toSorted((left, right) => eventTime2(left) - eventTime2(right))[0]).filter(Boolean));
var knownCardIds2 = (events) => events.filter((event) => ["card_marked_known", "card_known_restored"].includes(event.type) && typeof event.cardId === "string").toSorted((left, right) => eventTime2(left) - eventTime2(right)).reduce((known, event) => event.type === "card_marked_known" ? /* @__PURE__ */ new Set([...known, event.cardId]) : new Set([...known].filter((cardId) => cardId !== event.cardId)), /* @__PURE__ */ new Set());
var eventTime2 = (event) => Number.isFinite(Date.parse(event.occurredAt)) ? Date.parse(event.occurredAt) : Number.NEGATIVE_INFINITY;
var latestAttemptTime = (eventsForType, cardId) => eventsForType.filter((event) => event.cardId === cardId).map(eventTime2).reduce((latest, occurredAt) => Math.max(latest, occurredAt), Number.NEGATIVE_INFINITY);
var lessonGroup = (entries, answered) => Array.from(
  { length: Math.ceil(entries.length / 5) },
  (_, index) => entries.slice(index * 5, index * 5 + 5)
).find((group) => group.some(({ cardId }) => !eventuallyCorrect(answered, cardId))) ?? [];
var orderedExtraEntries = (entries, extraSession) => {
  const ranks = new Map((extraSession?.presentationOrder ?? []).map((cardId, index) => [cardId, index]));
  return entries.toSorted((left, right) => (ranks.get(left.cardId) ?? Number.POSITIVE_INFINITY) - (ranks.get(right.cardId) ?? Number.POSITIVE_INFINITY));
};
var lessonQueue = (entries, answered, extraSession) => ((ordered2) => [
  ...ordered2.filter(({ cardId }) => !attempted(answered, cardId)),
  ...ordered2.filter(({ cardId }) => attempted(answered, cardId) && !eventuallyCorrect(answered, cardId)).toSorted((left, right) => latestAttemptTime(answered, left.cardId) - latestAttemptTime(answered, right.cardId))
])(orderedExtraEntries(entries, extraSession));
var orderedSessionEntries = (session) => {
  const entries = [...session.scheduled, ...session.reactivations];
  const ranks = new Map((session.presentationOrder ?? []).map((cardId, index) => [cardId, index]));
  return entries.toSorted((left, right) => (ranks.get(left.cardId) ?? Number.POSITIVE_INFINITY) - (ranks.get(right.cardId) ?? Number.POSITIVE_INFINITY));
};
var publicQueueCard = (cardsById) => (entry) => ({
  id: entry.cardId,
  type: entry.type,
  ...entry.promptDirection === "recognition" ? { item: cardsById[entry.cardId]?.item ?? entry.cardId } : {},
  prompt: entry.promptDirection === "reverse" ? cardsById[entry.cardId]?.meanings?.join("; ") || "Meaning" : cardsById[entry.cardId]?.item ?? entry.cardId,
  promptDirection: entry.promptDirection,
  ...entry.promptHint ? { promptHint: entry.promptHint } : {},
  requiresReading: entry.promptDirection === "recognition" && requiresReading(cardsById[entry.cardId]),
  source: entry.source
});
var queuedEntries = ({ session, events, status }) => {
  const scheduledAnswers = answers(events, session, "review_answered");
  const reactivationAnswers = answers(events, session, "reactivation_answered");
  const known = knownCardIds2(events);
  const answersForEntry = (entry) => entry.source === "reactivation" ? reactivationAnswers : scheduledAnswers;
  const strictEntries = orderedSessionEntries(session).filter((entry) => !known.has(entry.cardId) && !eventuallyCorrect(answersForEntry(entry), entry.cardId));
  const retryEntries = strictEntries.map((entry, index) => ({ entry, index, latestAttempt: latestAttemptTime(answersForEntry(entry), entry.cardId) })).filter(({ entry }) => attempted(answersForEntry(entry), entry.cardId)).toSorted((left, right) => left.latestAttempt - right.latestAttempt || left.index - right.index).map(({ entry }) => entry);
  const strictQueue = [
    ...strictEntries.filter((entry) => !attempted(answersForEntry(entry), entry.cardId)),
    ...retryEntries
  ];
  const scheduled = status.progress.scheduled.attempted < status.progress.scheduled.required ? session.scheduled.filter(({ cardId }) => !known.has(cardId) && !attempted(scheduledAnswers, cardId)) : status.progress.scheduled.accuracy < 0.8 ? session.scheduled.filter(({ cardId }) => !known.has(cardId) && !eventuallyCorrect(scheduledAnswers, cardId)) : [];
  const reactivations = session.reactivations.filter(({ cardId }) => !known.has(cardId) && !attempted(reactivationAnswers, cardId));
  return status.complete ? [] : Number(session.sessionVersion ?? 1) >= 2 ? strictQueue : [...scheduled, ...reactivations];
};
var dailyResult = ({ cards, events }) => (session) => (status) => ({
  ok: status.state !== "error",
  value: {
    session,
    status,
    firstTry: firstTryFor(
      [...session.scheduled, ...session.reactivations],
      [
        ...answers(events, session, "review_answered"),
        ...answers(events, session, "reactivation_answered")
      ]
    ),
    queue: queuedEntries({ session, events, status }).map(publicQueueCard(cardIndex(cards)))
  },
  error: status.state === "error" ? status.error : null
});
var buildDailyView = ({ cards, cardStates, events = [], now, requiredDailyCount, timeZone }) => ((reviewEvents) => ((session) => dailyResult({ cards, events: reviewEvents })(session)(deriveDailyStatus({ session, events: reviewEvents, now, timeZone })))(
  selectDailySession({ cards, cardStates, events: reviewEvents, now, requiredDailyCount, timeZone })
))(effectiveReviewEvents(events));
var eligibleExtraCards = ({ cards, cardStates, session, now }) => {
  const excluded = new Set([...session?.scheduled ?? [], ...session?.reactivations ?? []].map(({ cardId }) => cardId));
  const cardsById = cardIndex(cards);
  return statesArray2(cardStates).filter(({ cardId, known, status, dueAt }) => !excluded.has(cardId) && !known && ["wanikani", "marumori"].includes(status) && Number.isFinite(Date.parse(dueAt ?? "")) && Date.parse(dueAt) <= Date.parse(now) && ["kanji", "vocabulary"].includes(cardsById[cardId]?.type));
};
var extraCandidates = (input, selectionSeed = input.session?.studyDate ?? "") => eligibleExtraCards(input).toSorted((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt) || Number(left.stage ?? Number.POSITIVE_INFINITY) - Number(right.stage ?? Number.POSITIVE_INFINITY) || seededSelectionTieBreak(selectionSeed, left.cardId, right.cardId));
var availableExtraReviewCount = (input) => eligibleExtraCards(input).length;
var extraEntries = ({ cards, cardStates, session, now, limit, selectionSeed }) => {
  const cardsById = cardIndex(cards);
  return extraCandidates({ cards, cardStates, session, now }, selectionSeed).slice(0, Math.max(0, Number(limit) || 0)).map(({ cardId }) => ({ cardId, type: cardsById[cardId].type, source: "extra", promptDirection: "recognition" }));
};
var extraQueue = (entries, answered, extraSession) => ((ordered2) => [
  ...ordered2.filter(({ cardId }) => !attempted(answered, cardId)),
  ...ordered2.filter(({ cardId }) => attempted(answered, cardId) && !eventuallyCorrect(answered, cardId))
])(orderedExtraEntries(entries, extraSession));
var createExtraSessionEvent = ({ cards, cardStates, session, now, limit = 100 }) => {
  const occurredAt = new Date(now).toISOString();
  const extraSessionId = `extra:${session.studyDate}:${occurredAt}`;
  const entries = extraEntries({ cards, cardStates, session, now, limit, selectionSeed: extraSessionId });
  return {
    type: "extra_session_started",
    studyDate: session.studyDate,
    occurredAt,
    extraSessionId,
    session: {
      sessionVersion: 1,
      extraSessionId,
      studyDate: session.studyDate,
      startedAt: occurredAt,
      entries,
      presentationOrder: shuffledPresentationOrder(entries, extraSessionId)
    }
  };
};
var createPracticeSessionEvent = ({ cards, cardIds, now, studyDate: studyDate2, scope: scope2 }) => ((occurredAt) => ((extraSessionId) => ((entries) => ({
  type: "extra_session_started",
  studyDate: studyDate2,
  occurredAt,
  extraSessionId,
  session: {
    sessionVersion: 1,
    extraSessionId,
    studyDate: studyDate2,
    startedAt: occurredAt,
    practice: true,
    scope: scope2,
    entries,
    presentationOrder: shuffledPresentationOrder(entries, extraSessionId)
  }
}))(cardIds.map((cardId) => cardIndex(cards)[cardId]).filter(Boolean).map((card) => ({ cardId: card.id, type: card.type, source: "extra", promptDirection: "recognition" }))))(
  `practice:${scope2.type}:${scope2.band}:${occurredAt}`
))(new Date(now).toISOString());
var buildExtraView = ({ cards, cardStates, session, extraSession, events = [], now, limit = 100 }) => {
  const cardsById = cardIndex(cards);
  const entries = extraSession?.entries ?? extraEntries({ cards, cardStates, session, now, limit });
  const answers2 = extraSession ? effectiveReviewEvents(events).filter((event) => event.type === "extra_review_answered" && event.extraSessionId === extraSession.extraSessionId) : [];
  const known = new Set(statesArray2(cardStates).filter(({ known: markedKnown }) => markedKnown).map(({ cardId }) => cardId));
  const answered = [...answers2, ...entries.filter(({ cardId }) => known.has(cardId)).map(({ cardId }) => ({ cardId, correct: true }))];
  const lesson = Boolean(extraSession?.lesson);
  const activeGroup = lesson ? lessonGroup(entries, answered) : [];
  const queueEntries = lesson ? lessonQueue(activeGroup, answered, extraSession) : extraQueue(entries, answered, extraSession);
  return {
    extraSessionId: extraSession?.extraSessionId ?? null,
    practice: Boolean(extraSession?.practice),
    scope: extraSession?.scope ?? null,
    lesson,
    more: Boolean(extraSession?.more),
    presentationOrder: extraSession?.presentationOrder ?? [],
    required: entries.length,
    attempted: entries.filter(({ cardId }) => attempted(answered, cardId)).length,
    correct: entries.filter(({ cardId }) => eventuallyCorrect(answered, cardId)).length,
    firstTry: firstTryFor(entries, answers2),
    reviewed: lesson ? entries.filter(({ cardId }) => eventuallyCorrect(answered, cardId)).length : entries.filter(({ cardId }) => eventuallyCorrect(answered, cardId)).length,
    lessonGroup: lesson ? {
      index: activeGroup.length === 0 ? Math.ceil(entries.length / 5) : Math.floor(entries.indexOf(activeGroup[0]) / 5),
      total: Math.ceil(entries.length / 5),
      cardIds: activeGroup.filter(({ cardId }) => !known.has(cardId)).map(({ cardId }) => cardId)
    } : null,
    queue: queueEntries.map(publicQueueCard(cardsById))
  };
};
var sessionEntry = (session, cardId) => session.scheduled.find((entry) => entry.cardId === cardId) ?? session.reactivations.find((entry) => entry.cardId === cardId) ?? null;
var recognitionGrade = (card, input) => {
  const reading = requiresReading(card) ? gradeReading(input.readingAnswer, acceptedReadings(card)) : { correct: true, normalizedAnswer: "" };
  const meaning = gradeMeaning(input.meaningAnswer, acceptedMeanings(card));
  return { correct: reading.correct && meaning.correct, reading, meaning };
};
var matchingReverseAlternative = ({ answer, card, cards, cardStates, events: history }) => {
  const events = history.filter(({ type }) => type === "reading_alias_added" || type === "meaning_alias_added");
  return ((meanings, states) => cardsArray2(cards).filter((candidate) => candidate.type === "vocabulary" && candidate.id !== card.id).filter((candidate) => states[candidate.id]?.known || Number.isInteger(states[candidate.id]?.stage)).filter((candidate) => meaningsOverlap(meanings, acceptedMeanings(candidate, events))).find((candidate) => gradeReverseVocabulary(
    answer,
    acceptedSurfaces(candidate),
    acceptedReadings(candidate, events)
  ).correct) ?? null)(
    acceptedMeanings(card, events),
    Object.fromEntries(statesArray2(cardStates).map((state) => [state.cardId ?? state.id, state]))
  );
};
var reverseGrade = (card, input) => ({
  correct: gradeReverseVocabulary(input.reverseAnswer, acceptedSurfaces(card), acceptedReadings(card)).correct,
  reading: { correct: true, normalizedAnswer: "" },
  meaning: { correct: true, score: 1, matchedMeaning: card.meanings?.[0] ?? null }
});
var answerEventType = (source) => ({
  reactivation: "reactivation_answered",
  extra: "extra_review_answered"
})[source] ?? "review_answered";
var successfulReview = ({ card, cards, cardStates, entry, eventId, events = [], input, now, studyDay }) => {
  const reviewCard = {
    ...card,
    readings: acceptedReadings(card, events),
    meanings: acceptedMeanings(card, events)
  };
  const grade = entry.promptDirection === "reverse" ? reverseGrade(reviewCard, input) : recognitionGrade(reviewCard, input);
  const alternative = entry.promptDirection === "reverse" && !grade.correct ? matchingReverseAlternative({ answer: input.reverseAnswer, card, cards, cardStates, events }) : null;
  const event = {
    type: answerEventType(entry.source),
    ...eventId ? { eventId } : {},
    studyDate: studyDay,
    occurredAt: new Date(now).toISOString(),
    cardId: card.id,
    correct: grade.correct,
    readingCorrect: grade.reading.correct,
    meaningCorrect: grade.meaning.correct,
    promptDirection: entry.promptDirection,
    answers: {
      reading: input.readingAnswer ?? null,
      meaning: input.meaningAnswer ?? null,
      reverse: input.reverseAnswer ?? null
    }
  };
  return alternative ? {
    ok: true,
    value: {
      event: null,
      feedback: {
        retry: true,
        noPenalty: true,
        correct: false,
        submittedReverse: input.reverseAnswer ?? null,
        message: "That is also valid for this meaning. Use the clue to recall this card\u2019s word."
      }
    }
  } : {
    ok: true,
    value: {
      event,
      feedback: {
        answerEventId: event.eventId ?? null,
        correct: grade.correct,
        readingCorrect: grade.reading.correct,
        meaningCorrect: grade.meaning.correct,
        submittedReading: input.readingAnswer ?? null,
        submittedMeaning: input.meaningAnswer ?? null,
        submittedReverse: input.reverseAnswer ?? null,
        expectedReading: displayReadings(acceptedReadings(card, events)).join("; ") || null,
        expectedMeanings: acceptedMeanings(card, events),
        expectedSurface: acceptedSurfaces(card).join("; ")
      }
    }
  };
};
var createReviewEvent = ({ cards, cardStates, session, eventId, events = [], input, now }) => cardIndex(cards)[input?.cardId] && sessionEntry(session, input?.cardId) ? successfulReview({
  card: cardIndex(cards)[input.cardId],
  cards,
  cardStates,
  entry: sessionEntry(session, input.cardId),
  eventId,
  events,
  input,
  now,
  studyDay: session.studyDate
}) : { ok: false, error: "Card is not part of today's required session." };
var createReadingCheck = ({ cards, events = [], input }) => {
  const card = cardIndex(cards)[input?.cardId];
  return card && requiresReading(card) ? {
    ok: true,
    value: gradeReading(input?.readingAnswer, acceptedReadings(card, events))
  } : { ok: false, error: "A known card with a reading is required." };
};
var createExtraReviewEvent = ({ cards, cardStates, eventId, events = [], extraSession, input, studyDate: studyDate2, now }) => cardIndex(cards)[input?.cardId] && (!extraSession || extraSession.entries.some(({ cardId }) => cardId === input.cardId)) ? ((review) => extraSession ? review.value.event ? {
  ...review,
  value: {
    ...review.value,
    event: {
      ...review.value.event,
      extraSessionId: extraSession.extraSessionId,
      ...extraSession.practice ? { practice: true } : {}
    }
  }
} : review : review)(
  successfulReview({
    card: cardIndex(cards)[input.cardId],
    cards,
    cardStates,
    entry: {
      cardId: input.cardId,
      type: cardIndex(cards)[input.cardId].type,
      source: "extra",
      promptDirection: "recognition"
    },
    eventId,
    events,
    input,
    now,
    studyDay: studyDate2
  })
) : { ok: false, error: "Card is not part of this extra-review batch." };
var latestAnswerForStudyDay = (events, studyDate2) => effectiveReviewEvents(events).filter((event) => isReviewAnswerEvent(event) && event.studyDate === studyDate2).at(-1) ?? null;
var createRedoEvent = ({ events = [], input, studyDate: studyDate2, now }) => ((target) => target?.eventId && target.eventId === input?.answerEventId ? {
  ok: true,
  value: {
    event: {
      type: "review_answer_voided",
      studyDate: studyDate2,
      occurredAt: new Date(now).toISOString(),
      targetEventId: target.eventId,
      cardId: target.cardId,
      targetType: target.type,
      ...target.extraSessionId ? { extraSessionId: target.extraSessionId } : {}
    },
    target
  }
} : {
  ok: false,
  conflict: true,
  error: "Only the latest recorded answer can be redone."
})(latestAnswerForStudyDay(events, studyDate2));
var aliasEventType = (kind) => ({
  meaning: "meaning_alias_added",
  reading: "reading_alias_added"
})[kind] ?? null;
var createAnswerAliasEvent = ({ cards, input, studyDate: studyDate2, now = (/* @__PURE__ */ new Date()).toISOString() }) => {
  const card = cardIndex(cards)[input?.cardId];
  const type = aliasEventType(input?.kind);
  const rawValue = String(input?.value ?? "").trim();
  const value = input?.kind === "reading" ? normalizeKana(rawValue) : rawValue;
  return card && type && value ? {
    ok: true,
    value: {
      event: {
        type,
        studyDate: studyDate2,
        occurredAt: new Date(now).toISOString(),
        cardId: card.id,
        value
      }
    }
  } : { ok: false, error: "A known card, alias kind, and non-empty answer are required." };
};
var createKnownCardEvent = ({ cards, input, studyDate: studyDate2, now = (/* @__PURE__ */ new Date()).toISOString() }) => cardIndex(cards)[input?.cardId] && typeof input?.known === "boolean" ? {
  ok: true,
  value: {
    event: {
      type: input.known ? "card_marked_known" : "card_known_restored",
      cardId: input.cardId,
      studyDate: studyDate2,
      occurredAt: new Date(now).toISOString()
    }
  }
} : { ok: false, error: "A known card and boolean state are required." };

// scripts/lib/kanji-stories.mjs
var kanjiStories = Object.freeze({
  // Common shapes and characters
  \u4E00: "A teacher chalks a single line across an empty board. One stroke, one line, one.",
  \u4E8C: "A child puts down one short ice-pop stick, then a longer one beneath it. Two sticks.",
  \u4E09: "Stack three shelves on the wall. The bottom one is the longest because it has to catch everything.",
  \u4EBA: "Two strokes lean together like a person's legs in mid-stride. Imagine them walking off the page.",
  \u5165: "The tall stroke holds the low one open like a door. Slip between them to enter.",
  \u516B: "Two strokes start close and fall apart like the roof of a tent. Imagine eight people trying to fit underneath.",
  \u5341: "At the crossroads, a tired walker marks ten miles with one big cross.",
  \u53E3: "Draw an open, square mouth. Imagine it taking a bite out of one corner of the page.",
  \u65E5: "Picture a window split across the middle. The sun is so bright it lights both panes.",
  \u6708: "The moon hangs like a lantern, with two little bars inside to hold a candle.",
  \u76EE: "A robot looks at you through an upright rectangle with two bars inside. That whole window is one eye.",
  \u6728: "A trunk rises straight up and branches spread down on either side. A tree takes up the whole page.",
  \u6C34: "A narrow stream goes down the middle. A splash flies off on each side. Picture all that moving water.",
  \u706B: "Two sparks fly out from a bonfire. The two long strokes in the middle are flames.",
  \u5C71: "Follow the ridge with your eyes. The big peak in the middle tells you this is a mountain.",
  \u5DDD: "Three lines of water race one another downstream. Together they make a river.",
  \u5927: "A person spreads both arms and plants their legs wide to show you how big a fish was.",
  \u5C0F: "Two little drops hang off a thin hook. They're so small they barely show on the page.",
  \u4E2D: "A skewer goes straight through the middle of a block of tofu.",
  \u4E0A: "A little flag rises up from the long ground line. Look up to see it.",
  \u4E0B: "A drop hangs down from a balcony. Look below the long top line to see it.",
  \u672C: "A book's paper came from a tree (\u6728). The little mark across the root shows where the book began.",
  \u624B: "The upright stroke is your wrist. The little crossbars are fingers closing around a cup in your hand.",
  \u751F: "A seedling pushes through the soil. The bottom line is the ground and the new life grows up through the middle.",
  \u7530: "A farmer cuts two paths across a square rice field. From above you can see four paddies.",
  \u9580: "Picture two gate doors swinging apart from the empty space in the middle.",
  \u3005: "Read the kanji, then picture a little echo (\u3005) writing the same character again.",
  \u51FA: "A mountain-shaped creature (\u5C71) climbs out of a square pit (\u51F5). You see it as it exits.",
  \u6C17: "A whiff of air (\u6C14) carries two crossed twigs (\u4E42) across the path. You feel the breeze.",
  \u732B: "A trail of paw prints (\u2EA8) leads straight into a bed of seedlings (\u82D7). A cat is hiding there.",
  \u7E2E: "At an inn (\u5BBF), you pull the drawstring (\u7CF8) on your laundry bag. Its opening shrinks from a wide circle to a tiny hole.",
  \u7C21: "Lay two bamboo poles (\u7AF9) across a gap (\u9593). You've built a simple bridge.",
  \u7BA1: "The official (\u5B98) carries water to the garden through a length of bamboo (\u7AF9). That's the pipe.",
  \u7F6A: "Someone who did wrong (\u975E) gets tangled in the detective's net (\u7F52). The crime has caught up with them.",
  \u72AC: "A big (\u5927) dog wags its tail so hard that the tip is just a dot (\u4E36).",
  \u771F: "You get out ten (\u5341) different tools (\u5177) to check one little claim. Every tool tells you it's true.",
  \u6EB6: "You pour water (\u6C35) into a container (\u5BB9) and drop in sugar. Stir until it dissolves.",
  \u9727: "At morning duty (\u52D9), rain (\u96E8) hangs in the air so thickly you can see only fog.",
  \u5317: "Two figures turn their backs on one another. A wind from the north squeezes through the gap.",
  \u6771: "The sun shines through a tree straight ahead. Walk toward the sunrise and you're heading east.",
  \u897F: "The open end of a box catches the last light of the sinking sun. Point that way for west.",
  \u96E8: "Four drops of rain fall behind a window. No wonder the picnic is canceled.",
  \u4FDD: "A person (\u4EBB) sees someone frozen in surprise (\u5446) in the middle of the road and rushes to protect them.",
  \u9D0E: "A bird (\u9CE5) raids every district (\u533A) along the seafront. Someone has to guard their chips from the seagull.",
  \u4F4F: "A traveler (\u4EBB) asks the lord (\u4E3B) for a place to live. He hands them the key to a cottage.",
  \u51F9: "Think of a square dish (\u51F5) with the middle scooped out. A marble rolls into the concave dip.",
  \u51F8: "Put a lump of dough on a flat tray and picture the middle rising into a convex bump.",
  \u5B66: "The little roof has three spots of light. Under it, a child (\u5B50) stays up late studying.",
  \u9AD8: "A tall tower has a small window at the top and a bigger doorway at the bottom. Look up at the window.",
  \u4E59: "A finish-line ribbon bends into a hook. It catches the second runner just as they cross.",
  \u898B: "An eye (\u76EE) sprouts two little legs (\u513F) and walks closer so it can see.",
  \u8A89: "Your reputation is the words (\u8A00) people put underneath your picture when you leave the room.",
  \u55AB: "Seal the pledge (\u5951) with one bite (\u53E3) of the cake. You have to eat the whole slice for it to count.",
  \u7DE8: "Lay a spool of thread (\u7CF8) across a flat book (\u6241). Knit the loose pages together into one volume.",
  \u548C: "Everyone shares the grain (\u79BE), so every mouth (\u53E3) has enough to eat. The village is at peace.",
  \u9B44: "A pale (\u767D) ghost (\u9B3C) drifts out of the empty suit of armor. You just saw its soul.",
  \u8001: "The old person (\u8002) leans over a bowl and carefully lifts it with a spoon (\u5315).",
  \u6D69: "The tide (\u6C35) climbs past a sign (\u544A) that announced the beach was safe. Now water stretches as far as you can see.",
  \u899A: "Look (\u898B) at the three marks above the roof. You shut your eyes and try to recall their shape.",
  \u6182: "A person bends under a heavy head and drags their feet. Their worries are coming along for the walk.",
  \u9B31: "Above, a thicket of trees crowds out the sky. Below, a little figure sits in the gloom beside three long shadows.",
  \u7815: "A soldier (\u5346) drops their shield on a brittle stone (\u77F3). It shatters into gravel.",
  \u87FB: "A tiny insect (\u866B) insists on doing what's right (\u7FA9). Watch the ant take a lost crumb back to its nest.",
  \u8907: "A traveler comes back (\u590D) wearing the very same coat (\u8864). Look again. It's a duplicate coat.",
  \u6B6F: "Put your foot down (\u6B62) on a comb stuck in a block of clay. The little white squares look like teeth.",
  \u51EA: "Imagine the wind coming to a stop (\u6B62) under a shelter (\u51E0). The whole harbor goes still.",
  \u56C1: "A mouth (\u53E3) leans in close to a tower of ears (\u8076). It whispers the secret to all three.",
  \u9A13: "Line up all (\u3452) the horses (\u99AC) at the track. One by one, test which can clear the jump.",
  \u654F: "Every (\u6BCE) time the tapping hand (\u6535) strikes the table, a nimble fly dodges the blow.",
  \u52C7: "With a little flag (\u30DE) held above his head, a man (\u7537) finds the courage to go first.",
  \u51F6: "A big X (\u4E42) sits at the bottom of an open box (\u51F5). Whoever opens it gets a streak of bad luck.",
  \u5883: "A mound of earth (\u571F) marks where the old road ends (\u7ADF). That's the boundary between two villages.",
  \u689F: "A bird (\u9CE5) sits in a tree (\u6728) without making a sound. It only opens its eyes after dark. It's an owl.",
  \u9D09: "A crow (\u9CE5) picks up a fang (\u7259) and flies off. The fang is much too big for its nest.",
  \u7121: "Four sparks (\u706C) flicker under a bundle of tinder. By morning there's nothing left.",
  \u540D: "At dusk (\u5915), it's too dark to recognize faces. Open your mouth (\u53E3) and call out a name.",
  \u5207: "Someone cuts seven (\u4E03) slices of bread with one very sharp knife (\u5200).",
  \u5E74: "Imagine the crossbars on a doorframe where you mark your height. Each one is a year.",
  \u4F1A: "Picture people (\u4EBA) coming together under the same cloud (\u4E91) to hold a meeting.",
  \u5F15: "Pull the string (\u4E28) on the bow (\u5F13) until it goes tight.",
  \u53D6: "A reaching hand (\u53C8) takes hold of a donkey's ear (\u8033) to lead it out of the stable.",
  \u5916: "At dusk (\u5915), someone takes a divining stick (\u535C) out of the house to make their prediction outside.",
  \u52D5: "It takes all your strength (\u529B) to get the heavy stone (\u91CD) moving.",
  \u5B50: "Picture a small child with arms stretched wide, waiting for someone to pick them up.",
  \u91D1: "Picture a pointy roof over a stack of bars. The two little marks stand out like flecks of gold.",
  \u65B9: "A sign sits on a post with one leg swinging out. Follow the direction the leg points.",
  \u9762: "An upright rectangle has little features inside it. Picture someone putting it on as a mask.",
  \u81EA: "The short mark above the box is the tip of a nose. Point to it to mean yourself.",
  \u610F: "A sound (\u97F3) drops into your heart (\u5FC3) and starts turning into an idea.",
  \u66F8: "A brush (\u807F) moves across a sheet of paper (\u65E5) and writes the first line of a book.",
  \u70B9: "A fortune teller (\u5360) points to one glowing spot in the fire (\u706C). That's where you have to look.",
  \u91CD: "A thousand (\u5343) villagers (\u91CC) ride the same ferry. Imagine how heavy it is.",
  \u9577: "A horizontal bar is a shelf. Beneath it a very long ribbon unfurls and almost touches the floor.",
  \u7406: "In the village (\u91CC), someone sorts jade (\u738B) by color and size. There's a logic to where each stone goes.",
  \u5BB6: "Under one roof (\u5B80) sits a pig (\u8C55) with the whole family. Yes, the pig lives in the house.",
  \u524D: "Picture the row of small strokes up front, with the rest of the procession coming behind them.",
  \u6240: "Someone marks a door (\u6238) with an axe (\u65A4). Now you can tell which place to come back to.",
  \u98DF: "Picture a covered bowl. Lift the lid and take a bite of the food.",
  \u7A7A: "A wooden beam (\u5DE5) props up a cave (\u7A74). You peek in and find it completely empty.",
  \u8ECA: "Imagine looking down on a cart. The rectangle is the body, and the long stroke is the axle.",
  \u5206: "A knife (\u5200) slices through a piece of fruit. The two strokes (\u516B) above it show the halves falling apart.",
  \u5730: "A bent stake (\u4E5F) gets pushed into the dirt (\u571F). It marks this particular patch of ground.",
  \u5408: "Put a sloping lid over the open mouth (\u53E3) of a pot. Listen for a click when it fits.",
  \u4E0D: "Think of a falling line (\u4E3F) hitting a barrier (\u4E00). Someone has stood a post (\u4E28) underneath it to say no.",
  \u5FC3: "A little bowl of a heart holds three hopping drops. Feel them jump with each beat.",
  \u5915: "A slanted crescent has just one little mark inside. It's the first moon you see in the evening.",
  \u7236: "Picture a father crossing his arms, then lifting two fingers to wave hello.",
  \u6BCD: "Two little marks inside a frame look like a mother holding two children close.",
  \u5144: "Two legs (\u513F) and a big mouth (\u53E3). Imagine your big brother calling for you to catch up.",
  \u59B9: "A young girl (\u5973) asks to walk home alone. Her older sibling says she's not yet (\u672A) old enough.",
  \u53CB: "A second hand (\u53C8) reaches up to meet yours. It's the friend who pulls you over the wall.",
  \u5B57: "Under a roof (\u5B80), a child (\u5B50) is carefully learning to write one character.",
  \u5370: "A kneeling figure (\u5369) presses down on a stamp until it leaves a clear mark.",
  \u7528: "The bars inside a box are tools hanging in a rack. Reach for one you can use.",
  \u5DDE: "Imagine three islands (\u4E36) between the bends of a river (\u5DDD). Together they make one state.",
  // The temple, blue, and gate families
  \u6301: "At the temple (\u5BFA), you hold a bell rope in your hand (\u624C).",
  \u5F85: "Your footsteps (\u5F73) stop at the temple (\u5BFA) gate. You wait for it to open.",
  \u6642: "When the sun (\u65E5) reaches the temple (\u5BFA) roof, you know what time it is.",
  \u4F8D: "Picture a person (\u4EBB) standing guard at a temple (\u5BFA). That's your samurai.",
  \u8A69: "The words (\u8A00) you hear chanted in the temple (\u5BFA) sound like a poem.",
  \u7B49: "At the temple (\u5BFA), a monk trims bamboo (\u7AF9) sticks until they're all equal in length.",
  \u7279: "The cow (\u725B) gets to sleep inside the temple (\u5BFA). She's clearly special.",
  \u6674: "The sun (\u65E5) pokes through the clouds and the sky turns blue (\u9752). Clear weather at last.",
  \u6E05: "You scoop up water (\u6C35) from a blue (\u9752) lake. It's so clear you can see through the handful.",
  \u7CBE: "On a blue (\u9752) tray, you pick out every speck of husk until the rice (\u7C73) is perfectly refined.",
  \u60C5: "A friend feels blue (\u9752), so you put a hand over your heart (\u5FC4) and ask about their feelings.",
  \u8ACB: "Your words (\u8A00) are written on a little blue (\u9752) slip. You hand it over as a request.",
  \u775B: "Look into a blue (\u9752) eye (\u76EE) and watch the pupil get bigger in the dark.",
  \u805E: "Put your ear (\u8033) against the gate (\u9580) to hear who's on the other side.",
  \u9593: "The sun (\u65E5) shines through the gap between the doors of the gate (\u9580).",
  \u554F: "A mouth (\u53E3) pokes through the gate (\u9580) and asks a question.",
  \u958B: "Picture two hands (\u5F00) lifting the bar inside the gate (\u9580) to open it.",
  \u9589: "Picture the carpenter's latch (\u624D) swinging down to close the gate (\u9580).",
  \u9591: "You shut the gate (\u9580) and sit under a tree (\u6728). Finally, some quiet.",
  \u95A3: "Each (\u5404) official passes through the same gate (\u9580) for the cabinet meeting.",
  \u95A5: "A clan fells (\u4F10) the trees around its gate (\u9580) so it can see who is coming.",
  \u95B2: "At the gate (\u9580), a guard looks through (\u514C) your papers one by one before letting you in.",
  \u95C7: "There's a sound (\u97F3) behind the gate (\u9580), but it's too dark to see what made it.",
  // The body and everyday shapes
  \u8170: "The key (\u8981) to carrying a heavy pack is to strap it around the waist of your body (\u6708).",
  \u8179: "Dinner comes back (\u590D) up. You clutch the belly of your body (\u6708).",
  \u809D: "In the body (\u6708), the liver is a little drying rack (\u5E72) that filters what passes through.",
  \u80F8: "Hug a little box (\u5308) against the chest of your body (\u6708).",
  \u80A9: "Push open a heavy door (\u6238) with the shoulder of your body (\u6708).",
  \u80CC: "Face north (\u5317) so the sun can warm the back of your body (\u6708).",
  \u8102: "The cook's order (\u65E8) is to trim all the fat off the meat (\u6708).",
  \u4F11: "A person (\u4EBB) leans against a tree (\u6728) to rest.",
  \u4F53: "A person (\u4EBB) props a heavy book (\u672C) against their body to hold it steady.",
  \u6797: "Plant a tree (\u6728) beside another tree (\u6728) and you've started a grove.",
  \u68EE: "A lone tree (\u6728) disappears behind a grove (\u6797). Suddenly you're in a forest.",
  \u660E: "The sun (\u65E5) and moon (\u6708) are up at the same time. The whole sky looks bright.",
  \u4FE1: "A person (\u4EBB) gives you their word (\u8A00), and you believe them.",
  \u56F0: "A tree (\u6728) grows up inside four walls (\u56D7). Now its branches are in trouble.",
  \u5FD8: "A name vanishes (\u4EA1) from your heart (\u5FC3). You've forgotten it.",
  \u5FD9: "You're so busy that by lunchtime your heart (\u5FC4) feels like it might give out (\u4EA1).",
  \u5FCD: "A blade (\u5203) hangs over your heart (\u5FC3). You grit your teeth and endure it.",
  \u8A8D: "You finally find the words (\u8A00) to acknowledge what someone has endured (\u5FCD).",
  \u6012: "An enslaved person (\u5974) hears another order and feels anger rise in their heart (\u5FC3).",
  \u52AA: "An enslaved person (\u5974) strains with all their strength (\u529B) to move a stone. Every inch takes effort.",
  \u6055: "Imagine the same thing (\u5982) happening to you. Your heart (\u5FC3) softens and you forgive.",
  \u6163: "A needle keeps piercing (\u8CAB) the same spot in your heart (\u5FC4) every day, until you get used to the prick.",
  \u614E: "Your heart (\u5FC4) tells you to check if the rumor is true (\u771F). You proceed with caution.",
  \u6094: "Every (\u6BCE) night your heart (\u5FC4) replays the same mistake. That's regret.",
  \u60DC: "Your heart (\u5FC4) keeps going back to the old days (\u6614). It's a shame you can't have them back.",
  \u618E: "Think back to something that happened long ago (\u66FD). If your heart (\u5FC4) still clenches, that's hate.",
  // Water, movement, and words
  \u6CF3: "The water (\u6C35) seems to stretch forever (\u6C38). You start swimming.",
  \u6D0B: "A sheep (\u7F8A) stands at the water's (\u6C35) edge. The endless water scares it: that's the ocean.",
  \u6CB9: "An oil drum (\u7531) springs a leak. See the oil spread over the water (\u6C35).",
  \u6E29: "In a bath of water (\u6C35), a little dish with a sun above it (\u6637) keeps you warm.",
  \u6D74: "In a valley (\u8C37), you bathe in water (\u6C35) from a hot spring.",
  \u6D2A: "The water (\u6C35) comes for everyone together (\u5171). The whole village is flooded.",
  \u6E2F: "Follow the little lane (\u5DF7) until it meets the water (\u6C35). That's the harbor.",
  \u6E56: "Water (\u6C35) surrounds a little island shaped like a goatee (\u80E1). The whole thing is a lake.",
  \u6CB3: "You ask if you may (\u53EF) cross. The water (\u6C35) roars back from the river below.",
  \u6CE2: "The skin (\u76AE) of the water (\u6C35) wrinkles as the first wave rolls in.",
  \u6CE3: "You stand (\u7ACB) at the station waving goodbye. Water (\u6C35) runs down your face as you cry.",
  \u6D99: "You come back (\u623B) to read the letter one last time. Water (\u6C35) wells up in your eyes as tears.",
  \u6F2B: "Water (\u6C35) oozes under the door and spreads out wide (\u66FC). It wanders all over the floor.",
  \u6E2C: "The rules (\u5247) say the water (\u6C35) must reach the red line. Get a ruler and measure it.",
  \u6E1B: "The water (\u6C35) tastes salty (\u54B8). Boil it until the amount of water has decreased and salt is left in the pot.",
  \u6E6F: "The bright sun (\u661C) beats on a bucket of water (\u6C35) until it feels like hot bathwater.",
  \u9003: "You see an omen (\u5146) of trouble and take the road (\u2ECC) to escape.",
  \u9014: "You still have distance left over (\u4F59). The road (\u2ECC) ahead is the rest of the way.",
  \u901F: "You tie up the bundle (\u675F), throw it on your bicycle, and speed down the road (\u2ECC).",
  \u8FFD: "A stack of boxes (\u{200A4}) rolls off a truck. You chase it down the road (\u2ECC).",
  \u8FF7: "You spill the rice (\u7C73) that was marking your route. Now you're lost on the road (\u2ECC).",
  \u8FD4: "You turn back (\u53CD) along the road (\u2ECC) to return the wallet you found.",
  \u8FF0: "On the road (\u2ECC), a traveler tells you about their technique (\u672E). They describe every step.",
  \u8A71: "Your tongue (\u820C) trips over the words (\u8A00) as you try to tell a story.",
  \u8A9E: "My (\u543E) words (\u8A00) sound different from yours. We're speaking different languages.",
  \u8AAD: "A bookseller (\u58F2) runs a finger over the words (\u8A00) to read you the first line.",
  \u8AD6: "A stack of papers (\u4F96) sits beside your notes. You weigh each set of words (\u8A00) before making your argument.",
  \u8AC7: "You sit beside a tower of flames (\u708E), swapping words (\u8A00) late into the night. That's a long chat.",
  \u8A73: "The shepherd uses far too many words (\u8A00) to describe one sheep (\u7F8A) in detail.",
  \u8B1D: "Your arrow shoots (\u5C04) through the next target over. Words (\u8A00) tumble out as you apologize.",
  \u8B70: "Everyone has words (\u8A00) about what's right (\u7FA9). The discussion goes on for hours.",
  \u8AAC: "Use your words (\u8A00) to open up (\u514C) the lid on a difficult idea. Now you can explain what's inside.",
  \u8AA4: "A translator starts a speech with words (\u8A00) from Wu (\u5449) at the wrong embassy. Everyone notices the error.",
  \u8A18: "You write down a few words (\u8A00) about yourself (\u5DF1). Now you have a record.",
  \u7D00: "You tie a new knot in your own (\u5DF1) thread (\u7CF8) for each year of the era.",
  \u8D77: "Get yourself (\u5DF1) up on your feet. It's time to run (\u8D70).",
  \u6539: "A tap (\u6535) on your own (\u5DF1) shoulder reminds you it's time to reform an old habit.",
  \u914D: "You pour the wine (\u9149) yourself (\u5DF1), distributing it evenly between the guests.",
  // Money and work
  \u8CB8: "You lend someone your shell money (\u8C9D) in place of (\u4EE3) the change they forgot.",
  \u8CBB: "A springy wire (\u5F17) flicks your shell money (\u8C9D) out of your purse. An unexpected expense.",
  \u8CC7: "You put some shell money (\u8C9D) away for the next (\u6B21) venture. Those are your resources.",
  \u8CA7: "You split (\u5206) the last shell coin (\u8C9D) between four people. Everyone is still poor.",
  \u8CA1: "You turn your talent (\u624D) into a pile of shell money (\u8C9D). That's your wealth.",
  \u8CA9: "You flip (\u53CD) the stall's sign to OPEN. Now you're selling for shell money (\u8C9D).",
  \u8CBF: "Two traders open the two leaves of a gate (\u536F) and trade shell money (\u8C9D) for cloth.",
  \u8CAF: "Put your shell money (\u8C9D) under a little roof with a hook (\u5B81). That's where you keep your savings.",
  \u8CE6: "A soldier (\u6B66) comes to collect shell money (\u8C9D) for the levy.",
  \u8CED: "One person (\u8005) bets their last shell coin (\u8C9D) on a horse.",
  \u8CA2: "Workers build (\u5DE5) a tower of shell money (\u8C9D) as tribute to the king.",
  \u8CE0: "Someone yelps (\u5485) after you step on their foot. You offer them shell money (\u8C9D) as compensation.",
  \u8D08: "A friend you knew long ago (\u66FD) turns up bearing a shell (\u8C9D) as a gift.",
  // Shared shapes that point to different meanings
  \u52DF: "At dusk (\u83AB), you still need more strength (\u529B) to move a log, so you recruit anyone passing by.",
  \u5E55: "At dusk (\u83AB), a huge cloth (\u5DFE) drops across the stage. That's the curtain.",
  \u5893: "At dusk (\u83AB), you leave flowers on a mound of earth (\u571F). This is the grave.",
  \u66AE: "The last sun (\u65E5) slips under the dusk (\u83AB) sky. Daylight is ending.",
  \u6155: "At dusk (\u83AB), listen to your heart (\u2E97) longing for someone far away.",
  \u50E7: "A person (\u4EBB) from long ago (\u66FD) shaves their head and becomes a monk.",
  \u5897: "Add more earth (\u571F) to where the old mound used to be (\u66FD). Watch it increase in height.",
  \u5C64: "Under the roof (\u5C38), old (\u66FD) newspapers are stacked up in layers.",
  \u62B1: "Wrap (\u5305) your hands (\u624C) around a friend and give them a hug.",
  \u6CE1: "Water (\u6C35) wraps (\u5305) a tiny pocket of air. A bubble rises.",
  \u7832: "Pack a stone (\u77F3) into a tube that wraps (\u5305) around it. Imagine the cannon firing it across the moat.",
  \u80DE: "A baby's body (\u6708) floats in a thin bag that wraps (\u5305) around it. That's the amniotic sac.",
  \u98FD: "Picture eating (\u98E0) an entire wrapped lunch (\u5305). You're full before dessert.",
  \u653E: "Tap (\u6535) the cage door open and set the birds free in every direction (\u65B9).",
  \u8A2A: "You follow the directions (\u65B9) to a friend's house and call out a greeting (\u8A00). You've come to visit.",
  \u9632: "Build a wall of earth (\u2ED6) in the direction (\u65B9) of the flood to ward it off.",
  \u82B3: "Whatever direction (\u65B9) you turn, the flowers (\u8279) smell fragrant.",
  \u8AB2: "The words (\u8A00) about fruit (\u679C) fill an entire chapter of the textbook.",
  \u83D3: "A little leaf (\u8279) sits on a fruit (\u679C) made entirely of sugar. It's a sweet.",
  \u88F8: "Your clothes (\u8864) fell into the river, so you cover your naked body with a very large fruit (\u679C).",
  \u5DE3: "The parent birds bring fruit (\u679C) to three open mouths (\u2E8D) in a nest.",
  \u7FD2: "A white (\u767D) bird tries its wings (\u7FBD) again and again until it learns to fly.",
  \u7FCC: "A bird folds its wings (\u7FBD) and stands (\u7ACB) on one leg. It's staying put until the following day.",
  \u7FFC: "A bird with unusual (\u7570) wings (\u7FBD) can fly backward.",
  \u7761: "Your eyelids (\u76EE) droop (\u5782) until you fall asleep.",
  \u7720: "All the people (\u6C11) in the village close their eyes (\u76EE) and sleep.",
  \u77B3: "Lean close to the child's (\u7AE5) eye (\u76EE). You can see your reflection in the pupil.",
  \u524A: "Use a knife (\u5202) to shave wood until it resembles (\u8096) the face in the photograph.",
  \u5224: "Cut (\u5202) the apple in half (\u534A) and compare the two pieces before you make your judgment.",
  \u520A: "Carve (\u5202) a printing block out of a dry (\u5E72) board and publish the first edition.",
  \u578B: "As punishment (\u5211), you have to pack wet earth (\u571F) into the same mold all day.",
  \u5F69: "Pick (\u91C7) three pigments and brush three strokes (\u5F61) of color across the wall.",
  \u5F71: "In a bright scene (\u666F), three dark strokes (\u5F61) stretch out behind the fence. That's its shadow.",
  \u5F6B: "Go all the way around (\u5468) the bowl, carving little strokes (\u5F61) into the wood.",
  \u983C: "You walk with a bundle (\u675F) balanced on your head (\u9801), relying on a friend's hand to steady it.",
  \u9802: "Put a nail (\u4E01) at the head (\u9801) of the mountain to mark its summit.",
  \u984D: "A guest (\u5BA2) bumps the top of their head (\u9801) on the doorframe. Right on the forehead.",
  \u5D29: "Two friends (\u670B) watch as the mountain (\u5C71) starts to crumble.",
  \u5D07: "A sect (\u5B97) worships the mountain (\u5C71) above its village.",
  \u78E8: "Polish a stone (\u77F3) with a piece of hemp cloth (\u9EBB) until you can see your face in it.",
  \u6469: "Rub your hands (\u624B) together in rough hemp gloves (\u9EBB). Feel the friction."
});
var componentImages = Object.freeze({
  \u6728: "a tree",
  \u6C35: "three drops of water",
  \u8279: "a tuft of grass",
  \u53E3: "an open mouth",
  \u624C: "a reaching hand",
  \u4EBB: "a person",
  \u7CF8: "a spool of thread",
  \u8A00: "a speech bubble",
  \u91D1: "a pile of coins",
  \u571F: "a mound of earth",
  \u5FC4: "a beating heart",
  \u6708: "a crescent moon",
  \u65E5: "a patch of sunlight",
  \u7AF9: "two bamboo stalks",
  \u866B: "a little bug",
  \u5973: "a woman",
  \u5C71: "a mountain",
  \u9B5A: "a fish",
  \u9CE5: "a bird",
  \u5FC3: "a beating heart",
  \u77F3: "a stone",
  \u8C9D: "a shell",
  \u738B: "a king",
  \u7592: "a sickbed",
  \u706B: "a flame",
  \u8DB3: "a foot",
  \u79BE: "a stalk of grain",
  \u5B80: "a roof",
  "\u2ED6": "a bank of earth",
  \u8864: "a coat",
  \u99AC: "a horse",
  \u76EE: "an eye",
  \u8FB6: "a winding path",
  "\u2ECC": "a winding path",
  \u5E7F: "a sloping roof",
  \u8ECA: "a cart",
  \u7C73: "a pile of rice",
  "\u2EA8": "a paw print",
  \u72AD: "a paw print",
  \u56D7: "a wall",
  \u7530: "a rice field",
  \u5202: "a blade",
  \u9801: "a head",
  \u9580: "a gate",
  \u4E00: "a horizontal line",
  \u96B9: "a small bird",
  \u4E3F: "a falling stroke",
  \u529B: "a flexed arm",
  \u9149: "a jar of wine",
  \u5927: "a person stretching both arms",
  \u5F73: "two steps",
  \u793A: "a sign",
  \u96E8: "rain clouds",
  \u7ACB: "a figure standing upright",
  \u6535: "a tapping hand",
  \u5341: "a cross",
  \u6208: "a spear",
  \u4E36: "a dot",
  \u8863: "a robe",
  "\u2ECF": "a town",
  \u7A74: "a cave",
  \u5DFE: "a hanging cloth",
  \u767D: "a white tile",
  \u8005: "a person",
  \u5382: "a cliff",
  \u9769: "a piece of leather",
  \u706C: "four sparks",
  \u6B20: "a wide yawn",
  \u8033: "an ear",
  \u65B9: "a signpost",
  \u5C38: "a low awning",
  \u5BF8: "a small ruler",
  \u4EBA: "a walking figure",
  \u5F13: "a bow",
  \u4EA0: "a cap",
  \u513F: "two legs",
  \u516B: "two spreading strokes",
  \u7F52: "a net",
  \u7F8A: "a sheep",
  \u51AB: "two chips of ice",
  \u821F: "a boat",
  \u53C8: "a hand",
  \u76BF: "a dish",
  \u5B50: "a child",
  \u5305: "a wrapped bundle",
  \u65A4: "an axe",
  \u725B: "a cow",
  \u9B3C: "a ghost",
  \u4E8C: "two lines",
  \u51E0: "a low table",
  \u5E72: "a drying rack",
  \u6797: "a grove",
  \u7FBD: "a pair of wings",
  \u531A: "an open box",
  \u74E6: "a roof tile",
  \u624B: "a hand",
  \u76AE: "a piece of skin",
  \u9ADF: "a lock of hair",
  \u5315: "a spoon",
  \u793B: "an altar",
  \u72AC: "a dog",
  \u9091: "a village",
  \u5206: "two things split apart",
  \u53F0: "a pedestal",
  \u65E6: "a sun at the horizon",
  \u6238: "a door",
  \u535C: "a divining stick",
  \u9AA8: "a bone",
  \u5200: "a knife",
  \u9E7F: "a deer",
  \u9752: "a patch of blue",
  \u5F0B: "an arrow",
  \u52F9: "a wrapping arm",
  \u4E28: "a vertical line",
  \u5BFA: "a temple bell",
  \u98DF: "a bowl of food",
  \u98E0: "a bowl of food",
  \u5915: "a sliver of moon",
  \u6C34: "a stream",
  \u8089: "a piece of meat",
  \u5DE5: "a wooden beam",
  \u8CB7: "a bag of purchases",
  \u53E4: "an old gravestone",
  \u83AB: "a dusk sky",
  \u82D7: "a seedling",
  \u5B98: "a government office",
  \u53EF: "a stamp of approval",
  \u5370: "a stamp",
  \u5369: "a bent knee",
  \u5BBF: "an inn",
  \u590D: "a returning traveler",
  \u8CAC: "a bill to pay",
  \u5408: "a lid that fits",
  \u91C7: "a picking hand",
  \u7528: "a little toolbox",
  \u826E: "a stop sign",
  \u536F: "two leaves of a gate",
  \u8840: "a drop of blood in a dish",
  \u81EA: "a nose",
  \u9762: "a face",
  \u884C: "a crossroads",
  \u77E2: "an arrow",
  \u77DB: "a spear",
  \u7F51: "a net",
  \u9AD8: "a tall tower",
  \u6587: "a scroll of writing",
  \u5182: "an open frame",
  \u6B62: "a planted foot",
  \u4E42: "two crossing strokes",
  \u8C55: "a pig",
  \u79B8: "a track in the mud",
  \u5BB9: "a container",
  \u8C46: "a bean",
  \u8F9B: "a hot pepper",
  \u820C: "a tongue",
  \u722B: "a claw",
  \u5344: "two uprights",
  \u620A: "a spear",
  \u51F5: "an open box",
  \u5446: "a person frozen in surprise",
  \u4E3B: "a host",
  \u8002: "someone stooping with age",
  \u5F51: "a snout",
  \u7ADF: "a finish line",
  \u5346: "a soldier",
  \u7236: "a father",
  \u7259: "a fang",
  \u7FA9: "a judge",
  \u5360: "a fortune-teller",
  \u807F: "a brush",
  \u97F3: "a ringing bell",
  \u4E91: "a cloud",
  \u4E03: "seven marks",
  \u518B: "a window",
  \u518A: "a thin book",
  \u9593: "a gap",
  \u8981: "a belt",
  \u9577: "a long ribbon",
  \u8096: "a portrait",
  \u9589: "a closed gate",
  \u6BCE: "a calendar",
  \u4EE4: "an order on a scroll",
  \u5177: "a toolbox"
});
var nestedPosition = /* @__PURE__ */ new Set(["kamaec", "tarec", "nyoc", "\u2FF5B", "\u2FF62"]);
var sceneEndings = [
  [/^(?:to )?(?:wash|rinse|bathe|clean)(?:\b|$)/u, "A bucket tips over and washes the whole scene clean."],
  [/^(?:to )?(?:burn|flame|fire|hot|heat)(?:\b|$)/u, "A red glow spreads until the whole scene gives off heat."],
  [/^(?:to )?(?:freeze|cold|ice|chill|frost)(?:\b|$)/u, "In one breath the scene turns icy and everything freezes in place."],
  [/^(?:to )?(?:break|crack|shatter|crush|smash)(?:\b|$)/u, "One sharp knock breaks the whole scene into pieces."],
  [/^(?:to )?(?:push|press|squeeze|compress)(?:\b|$)/u, "Two enormous hands press in from the sides until the scene barely fits."],
  [/^(?:to )?(?:pull|draw|drag|haul)(?:\b|$)/u, "A rope goes taut and drags the scene across the page."],
  [/^(?:to )?(?:touch|feel|stroke|pat)(?:\b|$)/u, "You reach out and trace the scene with the tip of one finger."],
  [/^(?:to )?(?:lift|raise|elevate|hoist)(?:\b|$)/u, "An invisible crane lifts the scene right off the ground."],
  [/^(?:to )?(?:fall|drop|sink|descend|lower)(?:\b|$)/u, "The floor gives way and the whole scene drops through it."],
  [/^(?:to )?(?:shrink|contract|narrow|small)(?:\b|$)/u, "The whole scene shrinks until it fits in a shirt pocket."],
  [/^(?:to )?(?:stretch|extend|prolong|long|expand|spread)(?:\b|$)/u, "The scene stretches out like rubber until it takes up the whole page."],
  [/^(?:to )?(?:wrap|envelop|enfold|cover)(?:\b|$)/u, "A sheet of paper folds around the whole scene like a parcel."],
  [/^(?:to )?(?:surround|enclose|fence|encircle)(?:\b|$)/u, "A fence springs up and closes all the way around the scene."],
  [/^(?:to )?(?:tie|bind|fasten|knot)(?:\b|$)/u, "A ribbon snakes around the whole scene and ties itself in a knot."],
  [/^(?:to )?(?:separate|divide|split|apart)(?:\b|$)/u, "A line cuts through the floor and the two sides slide apart."],
  [/^(?:to )?(?:join|connect|combine|merge|unite)(?:\b|$)/u, "You push the pieces together and they click into one shape."],
  [/^(?:to )?(?:cut|slice|carve|sever|chop)(?:\b|$)/u, "A blade flashes past and leaves a clean cut down the middle."],
  [/^(?:to )?(?:dig|excavate|bury)(?:\b|$)/u, "A shovel opens a hole in the ground beside the scene."],
  [/^(?:to )?(?:grow|sprout|germinate)(?:\b|$)/u, "The floor cracks and fresh shoots grow up through the scene."],
  [/^(?:to )?(?:shine|bright|illuminate|gleam|light)(?:\b|$)/u, "A spotlight comes on and makes the whole scene shine."],
  [/^(?:to )?(?:dark|dim|black|obscure)(?:\b|$)/u, "The lights go out and only a dark outline is left."],
  [/^(?:to )?(?:disappear|vanish|extinguish|erase)(?:\b|$)/u, "You blink once and the whole scene disappears."],
  [/^(?:to )?(?:melt|dissolve|liquefy|thaw)(?:\b|$)/u, "The whole scene melts and runs off the page."],
  [/^(?:to )?(?:dry|wither|desiccate)(?:\b|$)/u, "Under a hot light, the scene dries and wrinkles at the edges."],
  [/^(?:to )?(?:rotate|turn|roll|spin)(?:\b|$)/u, "The floor turns like a record and carries the scene around with it."],
  [/^(?:to )?(?:reflect|mirror|reflection)(?:\b|$)/u, "A mirror rolls in and shows the whole scene backward."],
  [/^(?:to )?(?:bend|curve|bow|fold)(?:\b|$)/u, "A giant finger bends the entire scene as if it were made of paper."],
  [/^(?:to )?(?:hide|conceal|hidden|secret)(?:\b|$)/u, "A curtain snaps shut and hides the whole scene from view."],
  [/^(?:to )?(?:wait|pause|stop|halt)(?:\b|$)/u, "A bell rings and the whole scene stops mid-motion."],
  [/^(?:to )?(?:swift|fast|hurry|run|rush)(?:\b|$)/u, "The scene races by so fast you have to turn your head to follow it."],
  [/^(?:to )?(?:go|walk|travel|journey)(?:\b|$)/u, "The floor becomes a long road and the whole scene sets off down it."],
  [/^(?:to )?(?:fly|soar|float)(?:\b|$)/u, "A gust of wind lifts the whole scene up into the air."],
  [/^(?:to )?(?:jump|leap|bounce|hop)(?:\b|$)/u, "The floor springs up and makes the whole scene jump."],
  [/^(?:to )?(?:cry|weeping|tears|weep)(?:\b|$)/u, "Someone starts crying and a tear lands in the middle of the scene."],
  [/^(?:to )?(?:laugh|smile|laughter|grin)(?:\b|$)/u, "A laugh breaks out behind the curtain and everyone sees the joke."],
  [/^(?:to )?(?:eat|feed|bite|chew|food)(?:\b|$)/u, "The scene lands on a dinner plate, and you imagine taking a bite."],
  [/^(?:to )?(?:drink|sip|swallow|thirst)(?:\b|$)/u, "A cup is raised to someone's lips and they take a long swallow."],
  [/^(?:to )?(?:sleep|doze|slumber|drowsy)(?:\b|$)/u, "The light goes low and you picture the scene falling asleep."],
  [/^(?:to )?(?:write|record|scribe|writing|inscribe)(?:\b|$)/u, "A scratchy pen writes down everything that happens."],
  [/^(?:to )?(?:read|peruse|literature)(?:\b|$)/u, "The scene pops up from a book that someone is reading aloud."],
  [/^(?:to )?(?:sing|song|chant|recite)(?:\b|$)/u, "Someone sings the entire scene aloud, one phrase at a time."],
  [/^(?:to )?(?:hear|listen|sound|noise)(?:\b|$)/u, "The scene looks still until you lean close and hear it."],
  [/^(?:to )?(?:speak|talk|say|speech|word)(?:\b|$)/u, "The audience sees it as the first image in a story told out loud."],
  [/^(?:to )?(?:ask|question|inquire|doubt)(?:\b|$)/u, "Someone at the front raises a hand and asks what is happening."],
  [/^(?:to )?(?:see|look|watch|view|observe)(?:\b|$)/u, "You peer through a pair of binoculars to see it clearly."],
  [/^(?:to )?(?:think|consider|ponder|thought)(?:\b|$)/u, "The scene hangs inside a thought bubble while you puzzle it out."],
  [/^(?:to )?(?:learn|study|lesson|teach)(?:\b|$)/u, "A teacher draws it step by step on the board for the class to copy."],
  [/^(?:to )?(?:buy|sell|trade|purchase|price)(?:\b|$)/u, "A merchant puts the whole scene in a market stall and names a price."],
  [/^(?:to )?(?:count|number|calculate|reckon)(?:\b|$)/u, "You point across the scene and count what you can see."],
  [/^(?:to )?(?:choose|select|pick|choice)(?:\b|$)/u, "You have to choose a piece and leave all the others behind."],
  [/^(?:to )?(?:compare|contrast)(?:\b|$)/u, "You set up a second copy and look back and forth, trying to spot the difference."],
  [/^(?:to )?(?:test|examine|inspect|verify|verification)(?:\b|$)/u, "An examiner brings in a magnifying glass and checks every stroke."],
  [/^(?:to )?(?:rule|govern|control|authority)(?:\b|$)/u, "Someone steps onto a balcony and tries to direct the whole scene below."],
  [/^(?:to )?(?:sick|ill|sickness|disease|ailment)(?:\b|$)/u, "A doctor puts the whole scene to bed and takes its temperature."],
  [/^(?:to )?(?:heal|cure|recover)(?:\b|$)/u, "A nurse takes off the bandages and everything underneath has healed."],
  [/^(?:to )?(?:fight|attack|battle|war)(?:\b|$)/u, "A bell rings and the scene breaks into a noisy fight."],
  [/^(?:to )?(?:protect|guard|defend)(?:\b|$)/u, "A guard plants their feet in front of the scene to protect it."],
  [/^(?:to )?(?:steal|rob|thief|theft)(?:\b|$)/u, "A thief takes one piece while everyone is looking the other way."],
  [/^(?:to )?(?:praise|applaud|admire)(?:\b|$)/u, "The audience gets to its feet and applauds the scene."],
  [/^(?:to )?(?:love|affection|fond|adore)(?:\b|$)/u, "Someone draws a big heart around the scene and saves it as a keepsake."],
  [/^(?:to )?(?:anger|angry|rage|wrath)(?:\b|$)/u, "A figure storms in, slams a door and rattles the whole scene."],
  [/^(?:to )?(?:fear|afraid|dread|terror)(?:\b|$)/u, "A shadow falls over the scene and you feel the hairs rise on your arms."],
  [/^(?:to )?(?:sad|be sad|grieve|grief|sorrow|melancholy|gloom|depressed)(?:\b|$)/u, "All the color drains out of the scene and the figures hang their heads."],
  [/^(?:to )?(?:happy|joy|delight|celebrate)(?:\b|$)/u, "Confetti rains down and everyone in the scene starts cheering."],
  [/^(?:to )?(?:snow|hail|sleet)(?:\b|$)/u, "White flakes keep falling until the whole scene is blanketed."],
  [/^(?:to )?(?:rain|drizzle|shower)(?:\b|$)/u, "The first drops hit and then rain pours over the whole scene."],
  [/^(?:to )?(?:wind|breeze|gust)(?:\b|$)/u, "A gust of wind rushes across and sends the props skittering."],
  [/^(?:to )?(?:fog|mist|haze)(?:\b|$)/u, "A bank of fog drifts in until all you can see are the outlines."],
  [/^(?:to )?(?:bird|sparrow|hawk|eagle|owl|duck|goose|crow|pigeon|swallow)(?:\b|$)/u, "A bird swoops down, perches on the scene, and calls out."],
  [/^(?:to )?(?:fish|salmon|carp|trout|herring|eel|tuna|shark)(?:\b|$)/u, "The scene sinks underwater and a fish darts across it."],
  [/^(?:to )?(?:insect|bug|beetle|ant|moth|butterfly|bee|cicada)(?:\b|$)/u, "Something tiny crawls out from the scene and you lean in for a closer look."],
  [/^(?:to )?(?:tree|shrub|pine|willow|oak|cedar|cypress)(?:\b|$)/u, "Roots push down underneath the scene and a trunk grows up through the middle."],
  [/^(?:to )?(?:flower|blossom|bloom|orchid|chrysanthemum|petal)(?:\b|$)/u, "A bud pushes through the scene and slowly opens its petals."],
  [/^(?:to )?(?:empty|vacant|vacancy|hollow)(?:\b|$)/u, "You open a trapdoor and all the pieces fall through. The space is empty."],
  [/^(?:to )?(?:clear up|sunny|clear sky)(?:\b|$)/u, "The clouds finally part and a bright patch of sky appears."],
  [/^(?:to )?(?:whisper|murmur|mutter)(?:\b|$)/u, "Someone leans over and whispers what just happened, so only you can hear."],
  [/^(?:to )?(?:boundary|border|frontier)(?:\b|$)/u, "A bright stripe appears underneath. One step over it and you're on the other side."],
  [/^(?:to )?(?:duplicate|copy|replica|repeat)(?:\b|$)/u, "A mirror drops away and you realize there are two identical copies."],
  [/^(?:to )?(?:memorize|remember|memory|recall)(?:\b|$)/u, "The lights go out. Close your eyes and see whether you can bring the scene back."],
  [/^(?:to )?(?:forget|forgetful)(?:\b|$)/u, "The lights go out. You reach for the memory and find that the details are already slipping away."],
  [/^(?:to )?(?:harmony|harmonious|peace|peaceful)(?:\b|$)/u, "Two notes ring together in harmony and the whole scene settles."],
  [/^(?:to )?(?:calm|lull|quiet|stillness)(?:\b|$)/u, "A gust rattles everything for a moment. Then the air goes still."],
  [/^(?:to )?(?:begin|start|beginning|commence)(?:\b|$)/u, "The curtain parts and for a moment you see the very beginning of the story."]
];
var keyword = (meanings = []) => meanings.map((meaning) => String(meaning ?? "").trim()).find((meaning) => /[\p{L}\p{N}]/u.test(meaning) && meaning.length <= 90) ?? meanings.find((meaning) => String(meaning ?? "").trim())?.trim();
var partImage = (part, dictionary) => {
  const { literal, original, position, paths } = part;
  const image = original === "\u8089" && literal === "\u6708" ? "a piece of meat" : componentImages[literal] ?? componentImages[original];
  if (literal && image) return `${image} (${literal})`;
  if (literal) {
    const label = keyword(dictionary[literal]?.meanings?.filter((meaning) => !/radical \(no\.|^\(/iu.test(meaning)));
    return label ? `a tile for \u201C${label}\u201D (${literal})` : `a cutout shaped like ${literal}`;
  }
  const count = paths?.length ?? 0;
  if (!count) return "";
  const where = position === "top" ? "near the top" : position === "bottom" ? "near the bottom" : position === "left" ? "on the left" : position === "right" ? "on the right" : "";
  return `${count === 1 ? "a single stroke" : `a cluster of ${count} strokes`}${where ? ` ${where}` : ""}`;
};
var picture = (literal, parts, dictionary) => {
  const props = parts.length === 1 && parts[0].literal === literal ? [] : parts.map((part) => ({
    position: part.position,
    image: partImage({ ...part, literal: part.literal === literal ? "" : part.literal }, dictionary)
  })).filter(({ image }) => image).slice(0, 3);
  const first = props[0];
  const second = props[1];
  if (!first) return `Picture a paper cutout in the shape of ${literal}.`;
  if (!second) return `Picture ${first.image} as the centerpiece in a pop-up book.`;
  if (props.length > 2) {
    const images = props.map(({ image }) => image);
    return `A curtain opens on ${images.slice(0, -1).join(", ")} and ${images.at(-1)}.`;
  }
  const inner = props.find(({ position }) => nestedPosition.has(position));
  if (inner) return `Picture ${inner.image} tucked into ${inner === first ? second.image : first.image}.`;
  if (first.position === "top" && second.position === "bottom") {
    return `Picture ${first.image} balanced above ${second.image}.`;
  }
  return `Picture ${first.image} beside ${second.image}.`;
};
var keywordScenes = [
  (meaning) => `As the cutouts come together, their shadow changes into a picture of \u201C${meaning}\u201D.`,
  (meaning) => `A gust of wind turns them into a moving picture. Imagine \u201C${meaning}\u201D unfolding in it.`,
  (meaning) => `When you touch the scene, it comes to life as a short play about \u201C${meaning}\u201D.`,
  (meaning) => `Freeze the scene as if you're taking a photo. Write \u201C${meaning}\u201D on the back of the photo.`
];
var kanjiMemoryStory = ({ literal, entry, dictionary, cardMeanings }) => {
  if (Object.hasOwn(kanjiStories, literal)) return kanjiStories[literal];
  const meaning = keyword(cardMeanings) ?? keyword(entry.meanings);
  if (!meaning || !/^[\p{Script=Han}⺀-⻳]$/u.test(literal)) return "";
  const scene = picture(literal, entry.components ?? [], dictionary);
  const ending = sceneEndings.find(([pattern]) => pattern.test(meaning.toLowerCase()))?.[1];
  return `${scene} ${ending ?? keywordScenes[literal.codePointAt(0) % keywordScenes.length](meaning)}`;
};

// scripts/lib/study-reference.mjs
var unique2 = (values) => [...new Set(values.filter(Boolean))];
var text2 = (value) => String(value ?? "").normalize("NFKC").trim();
var kanjiIn = (value) => unique2([...text2(value)].filter((ch) => /\p{Script=Han}/u.test(ch)));
var applies = (values, value) => values?.includes("*") || values?.some((entry) => text2(entry) === text2(value));
var wordForms = (word) => word.forms.length ? word.forms : word.readings.map(({ text: reading }) => reading);
var readingExamples = (examples = [], readings) => examples.filter((example) => !example.readings || example.readings.some((reading) => readings.includes(normalizeKana(reading))));
var componentNames = (entry = {}) => unique2((entry.components ?? []).map((part) => part.literal).filter((literal) => !["\u4E00", "\u4E28", "\u4E36", "\u4E3F", "\u4E59", "\u4E85"].includes(literal)));
var createReferenceIndex = (data = {}) => ({
  data,
  byForm: (data.words ?? []).reduce((index, word) => (unique2([...word.forms, ...word.readings.flatMap(({ text: reading }) => [reading, normalizeKana(reading)])]).map((form) => index.set(text2(form), [...index.get(text2(form)) ?? [], word])), index), /* @__PURE__ */ new Map()),
  bySound: Object.entries(data.kanji ?? {}).reduce((index, [literal, entry]) => (entry.phonetic ? index.set(entry.phonetic.part, [...index.get(entry.phonetic.part) ?? [], literal]) : null, index), /* @__PURE__ */ new Map()),
  byPart: Object.entries(data.kanji ?? {}).reduce((index, [literal, entry]) => (componentNames(entry).map((part) => index.set(part, [...index.get(part) ?? [], literal])), index), /* @__PURE__ */ new Map())
});
var kanjiEntry = (literal, index, lexicon) => ({
  ...index.data.kanji?.[literal] ?? {},
  ...lexicon?.[literal] ?? {}
});
var kanjiSummary = (literal, index, lexicon, studied, detailed = false) => ((entry) => ({
  item: literal,
  type: "kanji",
  reading: unique2([...entry.onReadings ?? [], ...entry.kunReadings ?? []]).join(" \xB7 "),
  meanings: entry.meanings ?? [],
  studied: studied.has(literal),
  parts: unique2((entry.components ?? []).map((part) => part.literal)),
  diagram: entry.components ?? [],
  ...detailed ? {
    radicalInfo: entry.radicalInfo ?? null,
    onReadings: entry.onReadings ?? [],
    kunReadings: entry.kunReadings ?? [],
    phonetic: entry.phonetic ?? null,
    lookalikes: (entry.similar ?? []).slice(0, 4).map((ch) => ({
      item: ch,
      type: "kanji",
      meanings: kanjiEntry(ch, index, lexicon).meanings ?? [],
      reading: (kanjiEntry(ch, index, lexicon).onReadings ?? []).join(" \xB7 ")
    }))
  } : {}
}))(kanjiEntry(literal, index, lexicon));
var matchingWordSenses = (card, word, forms, wantedReadings) => word.senses.flatMap((sense) => {
  const matches = word.readings.flatMap((reading) => {
    const readingMatches = wantedReadings.length ? wantedReadings.filter((query) => query.text === normalizeKana(reading.text)) : [{ rule: "exact" }];
    return !applies(sense.kana, reading.text) ? [] : readingMatches.filter((query) => referenceRuleApplies(query.rule, sense.tags)).flatMap((query) => forms.filter((form) => referenceRuleApplies(form.rule, sense.tags)).filter((form) => word.forms.length === 0 ? text2(reading.text) === form.text && applies(sense.kanji, "*") : reading.kanji.length === 0 && normalizeKana(reading.text) === normalizeKana(form.text) && applies(sense.kanji, "*") || word.forms.some((spelling) => applies(reading.kanji, spelling) && applies(sense.kanji, spelling) && (text2(spelling) === form.text || normalizeKana(reading.text) === normalizeKana(form.text) || wantedReadings.length > 0 && kanjiSkeleton(form.text) && kanjiSkeleton(form.text) === kanjiSkeleton(spelling)))).map((form) => ({ reading: reading.text, rule: query.rule !== "exact" ? query.rule : form.rule })));
  });
  return matches.length ? [{ sense, matches }] : [];
});
var directVocabularyEntries = (card, index) => {
  const forms = referenceForms(card);
  const wantedReadings = referenceReadings(card);
  return referenceLookupKeys(card).flatMap((key) => index.byForm.get(key) ?? []).filter((word, position, words) => words.findIndex((candidate) => candidate.id === word.id) === position).flatMap((word) => ((matched) => matched.length ? [{
    id: word.id,
    forms: wordForms(word),
    readings: unique2(matched.flatMap(({ matches }) => matches.map(({ reading }) => reading))),
    lookupNote: wordForms(word).includes(card.item) && matched.some(({ matches }) => matches.some(({ rule }) => rule === "exact")) ? "" : "Matched the dictionary form shown below, including study-list notation or word endings where needed.",
    examples: readingExamples(word.examples, matched.flatMap(({ matches }) => matches.map(({ reading }) => normalizeKana(reading)))),
    senses: matched.map(({ sense, matches }) => ({
      meanings: sense.meanings,
      tags: sense.tags.map((tag) => index.data.tags?.[tag] ?? tag),
      info: sense.info,
      examples: readingExamples(sense.examples, matches.map(({ reading }) => normalizeKana(reading))),
      related: [
        ...(sense.related ?? []).map((relation) => ({ relation, label: "Related word" })),
        ...(sense.antonyms ?? []).map((relation) => ({ relation, label: "Opposite" }))
      ].slice(0, 6).map(({ relation: [item, reading], label }) => ({
        item,
        type: "vocabulary",
        reading: typeof reading === "string" ? reading : "",
        meanings: [label]
      })),
      matchesCard: comparableMeanings(card.meanings ?? []).some((meaning) => comparableMeanings(sense.meanings).includes(meaning))
    })).toSorted((a, b) => Number(b.matchesCard) - Number(a.matchesCard))
  }] : [])(matchingWordSenses(card, word, forms, wantedReadings)));
};
var vocabularyEntries = (card, index) => ((direct) => direct.length ? direct : (referenceSupplement(card, index.data)?.lookups ?? []).flatMap((lookup) => directVocabularyEntries(lookup, index).map((entry) => ({ ...entry, relationship: lookup.relationship }))))(directVocabularyEntries(card, index));
var studyReference = ({ card, index, lexicon = {}, studied = /* @__PURE__ */ new Set() }) => {
  const literal = text2(card.item);
  const common = {
    item: literal,
    type: card.type,
    reading: card.reading ?? "",
    readings: card.readings ?? [],
    meanings: card.meanings ?? [],
    sources: index.data.sources ?? []
  };
  return card.type !== "kanji" ? {
    ...common,
    entries: vocabularyEntries(card, index),
    referenceNote: referenceSupplement(card, index.data)?.note ?? "",
    phraseExamples: referenceSupplement(card, index.data)?.examples ?? [],
    components: kanjiIn(literal).map((ch) => kanjiSummary(ch, index, lexicon, studied, true))
  } : ((entry) => ((phonetic) => ({
    ...common,
    ...entry,
    item: literal,
    literal,
    story: kanjiMemoryStory({ literal, entry, dictionary: index.data.kanji ?? {}, cardMeanings: card.meanings }),
    meanings: card.meanings?.length ? card.meanings : entry.meanings ?? [],
    components: (entry.components ?? []).map((part) => ({
      ...part,
      ...kanjiSummary(part.original || part.literal, index, lexicon, studied),
      literal: part.literal,
      item: part.original || index.data.radicals?.[part.literal]?.base || part.literal,
      meaning: index.data.radicals?.[part.literal]?.meaning ?? index.data.kanji?.[part.original || part.literal]?.meanings?.[0] ?? (part.literal === entry.radicalInfo?.literal ? entry.radicalInfo?.meaning : "Component")
    })),
    similar: (entry.similar ?? []).map((ch) => kanjiSummary(ch, index, lexicon, studied)).toSorted((a, b) => Number(b.studied) - Number(a.studied)).slice(0, 12),
    sharedComponents: unique2(componentNames(entry).flatMap((part) => index.byPart.get(part) ?? [])).filter((ch) => ch !== literal && !(entry.similar ?? []).includes(ch)).map((ch) => ({
      ...kanjiSummary(ch, index, lexicon, studied),
      shared: componentNames(entry).filter((part) => componentNames(index.data.kanji[ch]).includes(part))
    })).toSorted((a, b) => Number(b.studied) - Number(a.studied) || b.shared.length - a.shared.length).slice(0, 8),
    soundFamily: phonetic ? {
      ...phonetic,
      shared: (entry.onReadings ?? []).map(normalizeKana).filter((reading) => phonetic.readings.includes(reading)),
      family: (index.bySound.get(phonetic.part) ?? []).filter((ch) => ch !== literal).map((ch) => ({
        ...kanjiSummary(ch, index, lexicon, studied),
        shared: (kanjiEntry(ch, index, lexicon).onReadings ?? []).map(normalizeKana).filter((reading) => phonetic.readings.includes(reading))
      })).toSorted((a, b) => Number(b.studied) - Number(a.studied) || Number(b.shared.length > 0) - Number(a.shared.length > 0)).slice(0, 12)
    } : null
  }))(entry.phonetic))(kanjiEntry(literal, index, lexicon));
};
var oneEditApart = (left, right) => left !== right && Math.abs(left.length - right.length) <= 1 && (left.length === right.length ? [...left].filter((ch, position) => ch !== right[position]).length === 1 : ((longer, shorter) => [...longer].some((_, position) => longer.slice(0, position) + longer.slice(position + 1) === shorter))(
  left.length > right.length ? left : right,
  left.length > right.length ? right : left
));
var kanjiReadingContrasts = /* @__PURE__ */ new Map([["\u8170", "\u8179"], ["\u8179", "\u8170"]]);
var kanjiContrastHint = (card, reading, index) => {
  const item = kanjiReadingContrasts.get(text2(card.item));
  if (!item) return null;
  const entry = index.data.kanji?.[item];
  const match = [...entry?.kunReadings ?? [], ...entry?.onReadings ?? []].find((candidate) => normalizeKana(candidate).replaceAll(".", "") === reading);
  return match ? { item, type: "kanji", reading: match.replaceAll(".", ""), meanings: entry.meanings ?? [] } : null;
};
var confusionRank = (card, candidate, index, events) => {
  const left = text2(card.item), right = text2(candidate.item);
  const differences = [...left].filter((ch, position) => ch !== right[position]);
  const visual = left.length === right.length && differences.length === 1 && [...left].every((ch, position) => ch === right[position] || index.data.kanji?.[ch]?.similar?.includes(right[position]) || index.data.kanji?.[right[position]]?.similar?.includes(ch));
  const relatedSpelling = kanjiSkeleton(left) && kanjiSkeleton(left) === kanjiSkeleton(right) && oneEditApart(left, right);
  const leftReadings = acceptedReadings(card, events).map((reading) => normalizeKana(reading).replaceAll(".", ""));
  const rightReadings = acceptedReadings(candidate, events).map((reading) => normalizeKana(reading).replaceAll(".", ""));
  const sameSound = leftReadings.some((reading) => reading && rightReadings.includes(reading));
  const nearSound = card.type === "vocabulary" && leftReadings.some((a) => rightReadings.some((b) => Math.min(a.length, b.length) >= 3 && oneEditApart(a, b)));
  return visual ? 0 : relatedSpelling ? 1 : sameSound ? 2 : nearSound ? 3 : null;
};
var likelyConfusions = ({ card, feedback, cards, cardStates = {}, events: history = [], index }) => {
  const meaning = feedback.meaningCorrect === false ? normalizeEnglish(feedback.submittedMeaning) : "";
  const reading = feedback.readingCorrect === false ? normalizeKana(feedback.submittedReading) : "";
  const reverse = feedback.correct === false ? text2(feedback.submittedReverse) : "";
  const studied = (candidate) => cardStates[candidate.id]?.known || Number.isInteger(cardStates[candidate.id]?.stage);
  if (feedback.correct !== false || !meaning && !reading && !reverse) return [];
  const contrast = card.type === "kanji" && reading ? kanjiContrastHint(card, reading, index) : null;
  if (contrast) return [contrast];
  const events = history.filter(({ type }) => type === "reading_alias_added" || type === "meaning_alias_added");
  return cards.filter((candidate) => candidate.id !== card.id && candidate.item !== card.item && candidate.type === card.type && studied(candidate)).filter((candidate) => meaning && comparableMeanings(acceptedMeanings(candidate, events)).includes(meaning) || reading && acceptedReadings(candidate, events).some((r) => normalizeKana(r).replaceAll(".", "") === reading) || reverse && ([candidate.item, ...candidate.surfaceAliases ?? []].some((surface) => text2(surface) === reverse) || acceptedReadings(candidate, events).some((r) => normalizeKana(r) === normalizeKana(reverse)))).map((candidate) => ({ candidate, rank: confusionRank(card, candidate, index, events) })).filter(({ rank }) => rank !== null && (meaning || reverse || rank < 2 || rank === 3 && card.type === "vocabulary")).toSorted((a, b) => a.rank - b.rank || a.candidate.item.localeCompare(b.candidate.item, "ja")).filter(({ candidate }, position, matches) => matches.findIndex((match) => match.candidate.item === candidate.item) === position).slice(0, 1).map(({ candidate }) => ({
    id: candidate.id,
    item: candidate.item,
    type: candidate.type,
    reading: acceptedReadings(candidate, events)[0] ?? "",
    meanings: acceptedMeanings(candidate, events)
  }));
};

// web/browser-reference.mjs
var json = (path) => readBytes(path).then(
  (bytes) => new Response(bytes[0] === 31 && bytes[1] === 139 ? new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")) : bytes).json()
);
var references = /* @__PURE__ */ new Map();
var shards = /* @__PURE__ */ new Map();
var cachedIndex = (cache, path, load, limit) => {
  const existing = cache.get(path);
  const value = existing ?? load(path).catch((error3) => {
    if (cache.get(path) === value) cache.delete(path);
    throw error3;
  });
  cache.delete(path);
  cache.set(path, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value);
  return value;
};
var readStudyReference = (path) => cachedIndex(
  references,
  path,
  (file) => json(file).then(createReferenceIndex),
  1
);
var readReferenceForCard = (path, card) => readStudyReference(path).then((index) => {
  if (card.type !== "vocabulary" || !index.data.wordShards) return index;
  const forms = referenceLookupKeys(card, index.data);
  const buckets = [...new Set(forms.map(
    (form) => createHash("sha256").update(form).digest()[0] % index.data.wordShards
  ))];
  return Promise.all(buckets.map((bucket) => {
    const shard = join(dirname(path), "reference-words", `${String(bucket).padStart(2, "0")}.json.gz`);
    return cachedIndex(shards, shard, (file) => json(file).then((words) => createReferenceIndex({ words }).byForm), 4);
  })).then((maps) => ({
    ...index,
    byForm: new Map(forms.map((form) => [form, [...new Set(maps.flatMap((map) => map.get(form) ?? []))]]))
  }));
});

// scripts/lib/storage.mjs
var errorResult = (code) => (error3) => ({
  ok: false,
  error: { code, message: error3 instanceof Error ? error3.message : String(error3) }
});
var parseJsonLines = (text4, callback) => Promise.resolve().then(() => callback(String(text4).split(/\r?\n/u).reduce((result, line, index) => {
  if (!result.ok || !line.trim()) return result;
  try {
    result.value.push(JSON.parse(line));
    return result;
  } catch {
    return { ok: false, error: { code: "INVALID_JSONL", line: index + 1 } };
  }
}, { ok: true, value: [] })));
var remember = (cache, path, entry, limit) => {
  cache.delete(path);
  cache.set(path, entry);
  if (cache.size > limit) cache.delete(cache.keys().next().value);
};
var jsonDocuments = /* @__PURE__ */ new Map();
var parseStoredJson = (path, text4, callback) => {
  const cached = jsonDocuments.get(path);
  return cached?.text === text4 ? callback(cached.result) : parseJsonResult(text4, (result) => {
    if (result.ok) remember(jsonDocuments, path, { text: text4, result }, 16);
    return callback(result);
  });
};
var eventLogs = /* @__PURE__ */ new Map();
var parseStoredEvents = (path, text4, callback) => {
  const cached = eventLogs.get(path);
  if (cached?.text === text4) return callback({ ok: true, value: cached.events });
  const append = cached?.text.endsWith("\n") && text4.startsWith(cached.text);
  return parseJsonLines(append ? text4.slice(cached.text.length) : text4, (result) => {
    if (!result.ok) return callback(append ? { ...result, error: { ...result.error, line: result.error.line + cached.lineCount } } : result);
    const events = append ? cached.events.concat(result.value) : result.value;
    const addedText = append ? text4.slice(cached.text.length) : text4;
    const lineCount = (append ? cached.lineCount : 0) + (addedText.match(/\n/gu)?.length ?? 0);
    remember(eventLogs, path, { text: text4, events, lineCount }, 3);
    return callback({ ok: true, value: events });
  });
};
var readJsonLines = (path, callback) => readFile(path, "utf8", (error3, text4) => error3?.code === "ENOENT" ? callback({ ok: true, value: [] }) : error3 ? callback(errorResult("READ_FAILED")(error3)) : parseStoredEvents(path, text4, callback));
var appendJsonLine = (path, value, callback) => Promise.resolve(value).then(JSON.stringify).then((line) => mkdir(dirname(path), { recursive: true }, (directoryError) => directoryError ? callback(errorResult("CREATE_STATE_DIRECTORY_FAILED")(directoryError)) : appendFile(path, `${line}
`, { encoding: "utf8", flag: "a" }, (appendError) => callback(
  appendError ? errorResult("APPEND_FAILED")(appendError) : { ok: true, value }
)))).catch((error3) => callback(errorResult("SERIALIZE_FAILED")(error3)));

// scripts/lib/settings-core.mjs
var gateModes = /* @__PURE__ */ new Set(["off", "prompt", "redirect"]);
var freeze = (value) => value && typeof value === "object" ? (Object.values(value).map(freeze), Object.freeze(value)) : value;
var defaults = Object.freeze({
  version: 2,
  requiredDailyCount: 100,
  studyListDailyNew: Object.freeze({ "n5-vocabulary": 10 }),
  gateMode: "off",
  gatedApplications: Object.freeze([]),
  onboardingComplete: false
});
var issue = (field, message) => ({ field, message });
var legacyDeckId = (value) => String(value ?? "n5").trim();
var migratedDeckId = (value) => /^n[1-5]$/u.test(legacyDeckId(value)) ? `${legacyDeckId(value)}-vocabulary` : legacyDeckId(value);
var migrateVersion1 = (value) => ({
  version: 2,
  requiredDailyCount: value.requiredDailyCount,
  studyListDailyNew: { [migratedDeckId(value.deckId)]: 10 },
  gateMode: value.gateMode,
  gatedApplications: value.gatedApplications,
  onboardingComplete: value.onboardingComplete
});
var migratedSettings = (value) => Number(value?.version ?? 2) === 1 ? migrateVersion1({ ...defaults, ...value }) : value;
var validStudyListDailyNew = (value) => Boolean(
  value && typeof value === "object" && !Array.isArray(value) && Object.entries(value).every(([id, count]) => id.trim().length > 0 && Number.isInteger(count) && count >= 0 && count <= 100)
);
var settingsIssues = (value) => [
  ...!value || typeof value !== "object" || Array.isArray(value) ? [issue("settings", "Settings must be an object.")] : [],
  ...value?.version !== void 0 && value.version !== 2 ? [issue("version", "Only settings version 2 is supported after migration.")] : [],
  ...!Number.isInteger(value?.requiredDailyCount) || value.requiredDailyCount < 1 ? [issue("requiredDailyCount", "Required daily count must be a positive integer.")] : [],
  ...!validStudyListDailyNew(value?.studyListDailyNew) ? [issue("studyListDailyNew", "Study-list daily counts must be whole numbers from 0 to 100.")] : [],
  ...!gateModes.has(value?.gateMode) ? [issue("gateMode", "Gate mode must be off, prompt, or redirect.")] : [],
  ...!Array.isArray(value?.gatedApplications) || value.gatedApplications.some(
    (application) => typeof application !== "string" || application.trim().length === 0
  ) ? [issue("gatedApplications", "Gated application identifiers must be non-empty strings.")] : [],
  ...typeof value?.onboardingComplete !== "boolean" ? [issue("onboardingComplete", "Onboarding state must be boolean.")] : []
];
var defaultLearnerSettings = () => freeze(structuredClone(defaults));
var normalizeLearnerSettings = (input = {}) => ((inputIsObject) => ((candidate) => ((issues) => issues.length > 0 ? { ok: false, error: { code: "INVALID_SETTINGS", issues } } : {
  ok: true,
  value: freeze({
    version: 2,
    requiredDailyCount: candidate.requiredDailyCount,
    studyListDailyNew: Object.fromEntries(Object.entries(candidate.studyListDailyNew).map(([id, count]) => [id.trim(), count])),
    gateMode: candidate.gateMode,
    gatedApplications: [...new Set(candidate.gatedApplications.map((application) => application.trim()))],
    onboardingComplete: candidate.onboardingComplete
  })
})([
  ...inputIsObject ? [] : [issue("settings", "Settings must be an object.")],
  ...settingsIssues(candidate)
]))({ ...defaultLearnerSettings(), ...migratedSettings(inputIsObject ? input : {}) }))(
  Boolean(input && typeof input === "object" && !Array.isArray(input))
);

// scripts/lib/data-transfer.mjs
var freeze2 = (value) => value && typeof value === "object" ? (Object.values(value).map(freeze2), Object.freeze(value)) : value;
var error = (code, message, details = []) => ({ ok: false, error: { code, message, details } });
var hash2 = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);
var parseJson = (text4, callback) => Promise.resolve(text4).then(JSON.parse).then((value) => callback({ ok: true, value })).catch((parseError) => callback(error("INVALID_JSON", parseError.message)));
var parseDelimitedRows = (source, delimiter) => ((characters) => ((state) => [
  ...state.rows,
  [...state.row, state.cell]
])(
  characters.reduce(
    (state, character, index) => state.skip ? { ...state, skip: false } : character === '"' && state.quoted && characters[index + 1] === '"' ? { ...state, cell: `${state.cell}"`, skip: true } : character === '"' ? { ...state, quoted: !state.quoted } : character === delimiter && !state.quoted ? { ...state, row: [...state.row, state.cell], cell: "" } : character === "\n" && !state.quoted ? { ...state, rows: [...state.rows, [...state.row, state.cell]], row: [], cell: "" } : { ...state, cell: `${state.cell}${character}` },
    { rows: [], row: [], cell: "", quoted: false, skip: false }
  )
))(Array.from(String(source ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n")));
var headerNames = Object.freeze({
  item: /* @__PURE__ */ new Set(["japanese", "word", "term", "item"]),
  reading: /* @__PURE__ */ new Set(["reading", "kana"]),
  meaning: /* @__PURE__ */ new Set(["meaning", "meanings", "english"]),
  type: /* @__PURE__ */ new Set(["type", "kind"])
});
var normalizedCell = (value) => String(value ?? "").trim();
var headerIndex = (header, field) => header.findIndex((cell) => headerNames[field].has(normalizedCell(cell).toLowerCase()));
var tableShape = (rows) => ((header, hasHeader) => ({
  rows: hasHeader ? rows.slice(1) : rows,
  indexes: hasHeader ? {
    item: headerIndex(header, "item"),
    reading: headerIndex(header, "reading"),
    meaning: headerIndex(header, "meaning"),
    type: headerIndex(header, "type")
  } : { item: 0, reading: 1, meaning: 2, type: 3 }
}))(
  rows[0] ?? [],
  headerIndex(rows[0] ?? [], "item") >= 0 && headerIndex(rows[0] ?? [], "meaning") >= 0
);
var inferredType = (item, explicit) => ["kanji", "vocabulary"].includes(explicit.toLowerCase()) ? explicit.toLowerCase() : /^[\u3400-\u9fff\uf900-\ufaff]$/u.test(item) ? "kanji" : "vocabulary";
var rowValue = (row, index) => index >= 0 ? normalizedCell(row[index]) : "";
var importedRows = ({ rows, indexes }) => rows.map((row, index) => ({
  rowNumber: index + 1,
  item: rowValue(row, indexes.item),
  reading: rowValue(row, indexes.reading),
  meaning: rowValue(row, indexes.meaning),
  type: rowValue(row, indexes.type)
})).filter(({ item, reading, meaning, type }) => [item, reading, meaning, type].some(Boolean));
var rowIssues = (rows) => rows.flatMap(({ rowNumber, item, reading, meaning }) => [
  ...item ? [] : [{ row: rowNumber, field: "item", message: "Japanese item is required." }],
  ...reading ? [] : [{ row: rowNumber, field: "reading", message: "Reading is required." }],
  ...meaning ? [] : [{ row: rowNumber, field: "meaning", message: "Meaning is required." }]
]);
var importDelimitedCatalog = (text4, { label } = {}) => ((trimmedLabel, delimiter) => ((rows) => ((issues) => issues.length > 0 ? error("INVALID_IMPORT", "Every imported row needs Japanese, reading, and meaning values.", issues) : rows.length === 0 ? error("EMPTY_IMPORT", "The import contains no cards.") : ((listId) => ((cards) => ({
  ok: true,
  value: freeze2({
    cards,
    customList: { id: listId, label: trimmedLabel, cardIds: cards.map(({ id }) => id) }
  })
}))(rows.map((row, index) => ({
  id: `custom:${hash2(`${listId}:${index}:${row.item}:${row.reading}:${row.meaning}`)}`,
  type: inferredType(row.item, row.type),
  item: row.item,
  reading: row.reading,
  readings: [row.reading],
  meanings: row.meaning.split(";").map((meaning) => meaning.trim()).filter(Boolean),
  meaningAliases: [],
  provenance: { customListId: listId }
}))))(`custom:${hash2(`${trimmedLabel}
${JSON.stringify(rows)}`)}`))(rowIssues(rows)))(
  importedRows(tableShape(parseDelimitedRows(text4, delimiter)))
))(
  normalizedCell(label),
  String(text4 ?? "").split(/\r?\n/u)[0]?.includes("	") ? "	" : ","
);
var mergeCatalogImport = ({ catalog, customLists = [], imported }) => ((existingIds) => ({
  catalog: freeze2({
    ...catalog ?? { version: 1 },
    cards: [
      ...Array.isArray(catalog?.cards) ? catalog.cards : [],
      ...imported.cards.filter(({ id }) => !existingIds.has(id))
    ]
  }),
  customLists: freeze2([
    ...customLists.filter(({ id }) => id !== imported.customList.id),
    imported.customList
  ])
}))(new Set((Array.isArray(catalog?.cards) ? catalog.cards : []).map(({ id }) => id)));
var validCatalog = (catalog) => Boolean(
  catalog && typeof catalog === "object" && Number(catalog.version ?? 1) === 1 && Array.isArray(catalog.cards) && catalog.cards.every((card) => card && typeof card.id === "string" && typeof card.type === "string")
);
var validCustomLists = (customLists) => Array.isArray(customLists) && customLists.every(
  (list) => list && typeof list.id === "string" && typeof list.label === "string" && Array.isArray(list.cardIds)
);
var validEvents = (events) => Array.isArray(events) && events.every(
  (event) => event && typeof event === "object" && typeof event.type === "string"
);
var record = (value) => value && typeof value === "object" && !Array.isArray(value);
var validGrammar = (grammar) => Boolean(
  record(grammar) && Number(grammar.version) === 1 && Array.isArray(grammar.points) && grammar.points.every((point) => record(point) && typeof point.id === "string")
);
var validStudyLibrary = (library) => Boolean(
  record(library) && library.version === 1 && Array.isArray(library.knownIds) && library.knownIds.every((id) => typeof id === "string") && Array.isArray(library.decks) && new Set(library.decks.map((deck) => deck?.id)).size === library.decks.length && library.decks.every((deck) => record(deck) && typeof deck.id === "string" && deck.id.startsWith("jlpt-") && typeof deck.title === "string" && Array.isArray(deck.items) && deck.items.every((item) => record(item) && typeof item._id === "string" && typeof item.item === "string" && ["kanji", "vocabulary"].includes(item.type) && [item._key, item.reading, item.mainReading, item.meaning].every((value) => typeof value === "string")))
);
var validStudyPlan = (studyPlan) => Boolean(
  record(studyPlan) && Number(studyPlan.version) === 2 && record(studyPlan.dailyLimits) && Array.isArray(studyPlan.customLists) && record(studyPlan.customAdditions) && (studyPlan.library === void 0 || validStudyLibrary(studyPlan.library))
);
var has = (value, key) => Boolean(value && Object.hasOwn(value, key));
var validateBackup = (backup) => ((settingsResult) => ((details) => details.length > 0 ? error("INVALID_BACKUP", "Backup validation failed.", details) : {
  ok: true,
  value: freeze2({
    version: backup.version,
    exportedAt: backup.exportedAt ?? null,
    settings: settingsResult.value,
    catalog: structuredClone(backup.catalog),
    customLists: structuredClone(backup.customLists),
    events: structuredClone(backup.events),
    ...has(backup, "grammar") ? { grammar: structuredClone(backup.grammar) } : {},
    ...has(backup, "studyPlan") ? { studyPlan: structuredClone(backup.studyPlan) } : {}
  })
})([
  ...[1, 2].includes(backup?.version) ? [] : ["Only backup versions 1 and 2 are supported."],
  ...backup?.version === 1 && (has(backup, "grammar") || has(backup, "studyPlan")) ? ["Grammar and study-plan documents require backup version 2."] : [],
  ...backup && Object.hasOwn(backup, "settings") ? [] : ["Settings are missing."],
  ...settingsResult.ok ? [] : ["Settings are invalid."],
  ...validCatalog(backup?.catalog) ? [] : ["Catalog is invalid."],
  ...validCustomLists(backup?.customLists) ? [] : ["Custom lists are invalid."],
  ...validEvents(backup?.events) ? [] : ["Events are invalid."],
  ...has(backup, "grammar") && !validGrammar(backup.grammar) ? ["Grammar catalog is invalid."] : [],
  ...has(backup, "studyPlan") && !validStudyPlan(backup.studyPlan) ? ["Study plan is invalid."] : []
]))(normalizeLearnerSettings(backup?.settings));
var createBackup = ({
  settings,
  catalog,
  customLists = [],
  events = [],
  grammar,
  studyPlan,
  exportedAt = (/* @__PURE__ */ new Date()).toISOString()
}) => validateBackup({
  version: 2,
  exportedAt,
  settings,
  catalog,
  customLists,
  events,
  ...grammar === void 0 ? {} : { grammar },
  ...studyPlan === void 0 ? {} : { studyPlan }
}).value;
var readOptional = (path, fallback, parser, callback) => readFile(path, "utf8", (readError, text4) => readError?.code === "ENOENT" ? callback({ ok: true, value: structuredClone(fallback) }) : readError ? callback(error("READ_FAILED", readError.message)) : parser(text4, callback));
var readConfiguredJson = (path, callback) => typeof path !== "string" ? callback({ ok: true, value: void 0 }) : readFile(path, "utf8", (readError, text4) => readError?.code === "ENOENT" ? callback({ ok: true, value: void 0 }) : readError ? callback(error("READ_FAILED", readError.message)) : parseJson(text4, callback));
var readParityDocuments = (files2, callback) => readConfiguredJson(files2.grammarFile, (grammarResult) => grammarResult.ok ? readConfiguredJson(files2.studyPlanFile, (planResult) => callback(planResult.ok ? {
  ok: true,
  value: {
    ...grammarResult.value === void 0 ? {} : { grammar: grammarResult.value },
    ...planResult.value === void 0 ? {} : { studyPlan: planResult.value }
  }
} : planResult)) : callback(grammarResult));
var readLearnerState = ({ files: files2 }, callback) => readOptional(
  files2.settingsFile,
  {},
  parseJson,
  (settingsResult) => settingsResult.ok ? readOptional(files2.catalogFile, { version: 1, cards: [] }, parseJson, (catalogResult) => catalogResult.ok ? readOptional(files2.customListsFile, [], parseJson, (listsResult) => listsResult.ok ? readJsonLines(files2.eventsFile, (eventsResult) => eventsResult.ok ? readParityDocuments(files2, (parityResult) => callback(parityResult.ok ? validateBackup({
    version: 2,
    settings: settingsResult.value,
    catalog: catalogResult.value,
    customLists: listsResult.value,
    events: eventsResult.value,
    ...parityResult.value
  }) : parityResult)) : callback(error(
    eventsResult.error.code === "INVALID_JSONL" ? "INVALID_EVENTS" : "READ_FAILED",
    eventsResult.error.message ?? `Invalid JSON on event line ${eventsResult.error.line}.`
  ))) : callback(listsResult)) : callback(catalogResult)) : callback(settingsResult)
);
var mapSeries = (items, transform, callback, values = []) => items.length === 0 ? callback({ ok: true, value: values }) : transform(items[0], (result) => result.ok ? mapSeries(items.slice(1), transform, callback, [...values, result.value]) : callback({ ...result, completed: values }));
var ensureDirectories = (paths, callback) => mapSeries(
  [...new Set(paths.map(dirname))],
  (directory, next) => mkdir(directory, { recursive: true }, (directoryError) => next(
    directoryError ? error("CREATE_DIRECTORY_FAILED", directoryError.message) : { ok: true, value: directory }
  )),
  callback
);
var removeFiles = (paths, callback) => mapSeries(
  paths,
  (path, next) => rm(path, { force: true }, () => next({ ok: true, value: path })),
  () => callback()
);
var readSnapshots = (entries, callback) => mapSeries(
  entries,
  ({ path }, next) => readFile(path, "utf8", (readError, text4) => next(
    readError?.code === "ENOENT" ? { ok: true, value: { path, exists: false, text: "" } } : readError ? error("SNAPSHOT_FAILED", readError.message) : { ok: true, value: { path, exists: true, text: text4 } }
  )),
  callback
);
var restoreSnapshots = (snapshots, callback) => mapSeries(
  snapshots,
  ({ path, exists, text: text4 }, next) => exists ? writeFile(path, text4, "utf8", (writeError) => next(
    writeError ? error("ROLLBACK_FAILED", writeError.message) : { ok: true, value: path }
  )) : rm(path, { force: true }, (removeError) => next(
    removeError ? error("ROLLBACK_FAILED", removeError.message) : { ok: true, value: path }
  )),
  callback
);
var transactionalWrite = (entries, callback) => ((staged) => readSnapshots(entries, (snapshotResult) => snapshotResult.ok ? ensureDirectories(entries.map(({ path }) => path), (directoryResult) => directoryResult.ok ? mapSeries(staged, ({ temporary, text: text4 }, next) => writeFile(temporary, text4, "utf8", (writeError) => next(
  writeError ? error("STAGE_FAILED", writeError.message) : { ok: true, value: temporary }
)), (stageResult) => stageResult.ok ? mapSeries(staged, ({ path, temporary }, next) => rename(temporary, path, (renameError) => next(
  renameError ? error("COMMIT_FAILED", renameError.message) : { ok: true, value: path }
)), (commitResult) => commitResult.ok ? callback({ ok: true, value: entries.map(({ path }) => path) }) : restoreSnapshots(snapshotResult.value, (rollbackResult) => removeFiles(
  staged.map(({ temporary }) => temporary),
  () => callback(rollbackResult.ok ? commitResult : rollbackResult)
))) : removeFiles(staged.map(({ temporary }) => temporary), () => callback(stageResult))) : callback(directoryResult)) : callback(snapshotResult)))(entries.map(({ path, text: text4 }) => ({
  path,
  text: text4,
  temporary: `${path}.${randomUUID()}.tmp`
})));
var stateEntries = (files2, backup) => [
  { path: files2.settingsFile, text: `${JSON.stringify(backup.settings, null, 2)}
` },
  { path: files2.catalogFile, text: `${JSON.stringify(backup.catalog, null, 2)}
` },
  { path: files2.customListsFile, text: `${JSON.stringify(backup.customLists, null, 2)}
` },
  { path: files2.eventsFile, text: backup.events.length === 0 ? "" : `${backup.events.map(JSON.stringify).join("\n")}
` },
  ...typeof files2.grammarFile === "string" && has(backup, "grammar") ? [{ path: files2.grammarFile, text: `${JSON.stringify(backup.grammar, null, 2)}
` }] : [],
  ...typeof files2.studyPlanFile === "string" && has(backup, "studyPlan") ? [{ path: files2.studyPlanFile, text: `${JSON.stringify(backup.studyPlan, null, 2)}
` }] : []
];
var writeLearnerState = ({ files: files2, state }, callback) => ((validated) => validated.ok ? transactionalWrite(stateEntries(files2, validated.value), callback) : callback(validated))(validateBackup({ ...state, version: 2 }));
var restoreBackup = ({ backup, files: files2, now = (/* @__PURE__ */ new Date()).toISOString() }, callback) => ((validated) => validated.ok ? readLearnerState({ files: files2 }, (current) => current.ok ? ((preRestoreBackupFile) => transactionalWrite(
  [{ path: preRestoreBackupFile, text: `${JSON.stringify(createBackup({ ...current.value, exportedAt: now }), null, 2)}
` }],
  (preserved) => preserved.ok ? transactionalWrite(stateEntries(files2, validated.value), (restored) => callback(
    restored.ok ? { ok: true, value: { backup: validated.value, preRestoreBackupFile } } : restored
  )) : callback(preserved)
))(join(dirname(files2.settingsFile), "backups", `pre-restore-${now.replaceAll(":", "-")}.json`)) : callback(current)) : callback(validated))(validateBackup(backup));

// scripts/lib/kanji-lexicon.mjs
var hasKanji2 = (value) => /[\u4e00-\u9fff]/u.test(String(value ?? ""));
var uniqueText = (valuesToNormalize) => [...new Set(valuesToNormalize.map((value) => String(value ?? "").trim()).filter(Boolean))];
var kanjiReference = (literal, lexicon = {}) => ({
  literal: String(literal ?? ""),
  ...lexicon?.[String(literal ?? "")] ?? {}
});
var kanjiComponents = (card, lexicon = {}) => [...new Set(
  [...String(card?.item ?? "")].filter(hasKanji2)
)].map((literal) => kanjiReference(literal, lexicon));
var enrichKanjiReference = (catalog, lexicon = {}) => ({
  ...catalog,
  cards: (Array.isArray(catalog?.cards) ? catalog.cards : []).map((card) => card.type === "kanji" && [...String(card.item ?? "")].length === 1 ? ((reference) => ({
    ...card,
    meanings: uniqueText([
      ...Array.isArray(card.meanings) ? card.meanings : [],
      ...reference.meanings ?? []
    ]),
    readings: uniqueText([
      ...Array.isArray(card.readings) ? card.readings : [card.reading],
      ...reference.onReadings ?? [],
      ...reference.kunReadings ?? []
    ])
  }))(lexicon[String(card.item)] ?? {}) : card)
});

// scripts/lib/runtime.mjs
var error2 = (message) => ({ ok: false, error: message });
var emptyCatalog = Object.freeze({ version: 1, cards: Object.freeze([]) });
var writeCatalog = (path, catalog, callback) => ((temporary) => writeFile(
  temporary,
  `${JSON.stringify(catalog, null, 2)}
`,
  "utf8",
  (writeError) => writeError ? callback(error2(writeError.message)) : rename(temporary, path, (renameError) => callback(
    renameError ? error2(renameError.message) : { ok: true, value: catalog }
  ))
))(`${path}.tmp`);
var readJson = (path, callback) => readFile(path, "utf8", (readError, text4) => readError ? callback(error2(readError.message)) : parseStoredJson(path, text4, callback));
var readCatalog = (path, callback) => readFile(path, "utf8", (readError, text4) => readError?.code === "ENOENT" ? callback({ ok: true, value: structuredClone(emptyCatalog) }) : readError ? callback(error2(readError.message)) : parseStoredJson(path, text4, (result) => callback(
  result.ok && Array.isArray(result.value?.cards) ? result : error2(result.ok ? "Catalog cards must be an array." : result.error)
)));
var readSettings = (path, callback) => path ? readFile(path, "utf8", (readError, text4) => readError?.code === "ENOENT" ? callback({ ok: true, value: defaultLearnerSettings() }) : readError ? callback(error2(readError.message)) : parseStoredJson(path, text4, (result) => ((normalized) => callback(
  result.ok && normalized.ok ? normalized : error2(result.ok ? normalized.error.issues.map(({ message }) => message).join(" ") : result.error)
))(result.ok ? normalizeLearnerSettings(result.value) : result))) : callback({ ok: true, value: defaultLearnerSettings() });
var projectStudy = (catalog, events, lexicon) => {
  const enriched = enrichKanjiReference(catalog, lexicon);
  const effective = effectiveReviewEvents(events);
  return { enriched, effective, folded: foldLearningEvents(enriched, effective) };
};
var createStudyProjector = () => {
  const projectCards = createCardStateProjector();
  let previous;
  return (catalog, events, lexicon) => {
    const enriched = previous?.catalog === catalog && previous.lexicon === lexicon ? previous.enriched : enrichKanjiReference(catalog, lexicon);
    const effective = previous?.events === events ? previous.effective : effectiveReviewEvents(events);
    previous = { catalog, events, lexicon, enriched, effective };
    return { enriched, effective, folded: projectCards(enriched, effective) };
  };
};
var dailyContext = ({ catalog, events, kanjiLexicon = {}, now, settings, studyPlan, timeZone, project }) => {
  const { enriched, effective, folded } = project(catalog, events, kanjiLexicon);
  const view = buildDailyView({
    cards: enriched.cards,
    cardStates: folded,
    events: effective,
    now,
    requiredDailyCount: settings.requiredDailyCount,
    timeZone
  });
  return view.ok ? {
    ok: true,
    value: {
      catalog: enriched,
      settings,
      studyPlan,
      kanjiLexicon,
      events: effective,
      cardStates: folded,
      ...view.value,
      access: gateAccess(view.value.status)
    }
  } : error2(view.error);
};
var loadDailyContext = ({ catalogFile, eventsFile, kanjiLexicon, settingsFile, studyPlan, now = (/* @__PURE__ */ new Date()).toISOString(), timeZone, project = projectStudy }, callback) => readCatalog(catalogFile, (catalogResult) => catalogResult.ok ? readSettings(settingsFile, (settingsResult) => settingsResult.ok ? readJsonLines(eventsFile, (eventsResult) => callback(
  eventsResult.ok ? dailyContext({ catalog: catalogResult.value, events: eventsResult.value, kanjiLexicon, now, settings: settingsResult.value, studyPlan, timeZone, project }) : error2(eventsResult.error.message)
)) : callback(settingsResult)) : callback(catalogResult));
var loadReadingContext = ({ catalogFile, eventsFile, kanjiLexicon, cardId }, callback) => readCatalog(catalogFile, (catalog) => !catalog.ok ? callback(catalog) : readJsonLines(eventsFile, (events) => callback(events.ok ? {
  ok: true,
  value: {
    cards: enrichKanjiReference({ cards: catalog.value.cards.filter(({ id }) => id === cardId) }, kanjiLexicon).cards,
    events: events.value.filter((event) => event?.type === "reading_alias_added" && event.cardId === cardId)
  }
} : error2(events.error.message))));
var extraSessionFor = (events, extraSessionId) => [...events].filter((event) => event.type === "extra_session_started" && event.extraSessionId === extraSessionId).sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)).map((event) => event.session).find((session) => session) ?? null;
var loadExtraContext = ({ context, extraSessionId }, callback) => {
  const extraSession = extraSessionFor(context.events, extraSessionId);
  return callback(extraSession ? {
    ok: true,
    value: buildExtraView({
      cards: context.catalog.cards,
      cardStates: context.cardStates,
      extraSession,
      events: context.events
    })
  } : error2("Extra-review batch is missing or invalid."));
};
var resumableExtraView = (context) => ((latest) => latest?.queue.length > 0 ? latest : null)([...context.events].filter((event) => event.type === "extra_session_started" && event.studyDate === context.session.studyDate && !event.session?.lesson && !event.session?.practice).toSorted((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)).map(({ session }) => buildExtraView({
  cards: context.catalog.cards,
  cardStates: context.cardStates,
  extraSession: session,
  events: context.events
})).at(0) ?? null);
var startExtraSession = ({ context, eventsFile, limit = 100, now = (/* @__PURE__ */ new Date()).toISOString() }, callback) => ((resumable) => resumable ? callback({ ok: true, value: resumable, created: false }) : ((event) => appendJsonLine(eventsFile, event, (appendResult) => callback(
  appendResult.ok ? {
    ok: true,
    created: true,
    value: buildExtraView({
      cards: context.catalog.cards,
      cardStates: context.cardStates,
      extraSession: event.session,
      events: [...context.events, event]
    })
  } : error2(appendResult.error.message)
)))(createExtraSessionEvent({
  cards: context.catalog.cards,
  cardStates: context.cardStates,
  session: context.session,
  now,
  limit
})))(resumableExtraView(context));
var startPracticeSession = ({ context, eventsFile, cardIds, scope: scope2, now = (/* @__PURE__ */ new Date()).toISOString() }, callback) => ((event) => appendJsonLine(eventsFile, event, (appendResult) => callback(
  appendResult.ok ? {
    ok: true,
    created: true,
    value: buildExtraView({
      cards: context.catalog.cards,
      cardStates: context.cardStates,
      extraSession: event.session,
      events: [...context.events, event]
    })
  } : error2(appendResult.error.message)
)))(createPracticeSessionEvent({
  cards: context.catalog.cards,
  cardIds,
  now,
  studyDate: context.session.studyDate,
  scope: scope2
}));
var lessonCard = (deckIds, kanjiLexicon = {}) => (item) => ((dictionary) => ({
  id: String(item._id),
  type: String(item.type ?? "vocabulary").toLowerCase(),
  item: String(item.item),
  reading: String(item.reading ?? item.mainReading ?? ""),
  readings: [...new Set([item.reading, item.mainReading, ...dictionary.onReadings ?? [], ...dictionary.kunReadings ?? []].map((reading) => String(reading ?? "").trim()).filter(Boolean))],
  onReadings: [...new Set([item.reading, ...dictionary.onReadings ?? []].map((reading) => String(reading ?? "").trim()).filter(Boolean))],
  kunReadings: [...new Set([item.mainReading, ...dictionary.kunReadings ?? []].map((reading) => String(reading ?? "").trim()).filter(Boolean))],
  meanings: [...new Set([String(item.meaning ?? "").split(/[;,]/u), dictionary.meanings ?? []].flat().map((meaning) => meaning.trim()).filter(Boolean))],
  provenance: { marumoriKey: String(item._key), marumori: { level: 1, status: "lesson", studyLists: [], sources: [...new Set(deckIds)] }, jlpt: { deckIds: [...new Set(deckIds)], baselineKnown: false } }
}))(String(item.type ?? "").toLowerCase() === "kanji" ? kanjiLexicon[String(item.item)] ?? {} : {});
var lessonEvent = ({ cards, dailyPlan = false, more = false, studyDate: studyDate2, now }) => ((occurredAt) => ((extraSessionId) => ((entries) => ({
  type: "extra_session_started",
  studyDate: studyDate2,
  occurredAt,
  extraSessionId,
  session: { sessionVersion: 1, extraSessionId, lesson: true, dailyPlan, more, studyDate: studyDate2, startedAt: occurredAt, entries, presentationOrder: shuffledPresentationOrder(entries, extraSessionId) }
}))(cards.map(({ id, type }) => ({ cardId: id, type, source: "extra", promptDirection: "recognition" }))))(`lesson:${studyDate2}:${occurredAt}`))(new Date(now).toISOString());
var normalizedLessonPlans = ({ deckFile, deckId, limit, plans }) => plans ?? [{ deckFile, deckId, limit }];
var readLessonDecks = (plans) => Promise.all(plans.map(
  (plan) => plan.items ? Promise.resolve({ plan, result: { ok: true, value: { items: plan.items } } }) : new Promise((resolve) => readJson(plan.deckFile, (result) => resolve({
    plan,
    result: result.ok ? { ...result, value: { ...result.value, items: [...result.value.items ?? [], ...plan.extraItems ?? []] } } : result
  })))
));
var plannedLessonEntries = (decks) => decks.flatMap(({ plan, result }) => result.ok ? (Array.isArray(result.value?.items) ? result.value.items : []).map((item) => ({ deckId: plan.deckId, item })) : []);
var plannedLessonCards = (decks, kanjiLexicon) => new Map(
  [...Map.groupBy(plannedLessonEntries(decks), ({ item }) => String(item._id)).entries()].map(([id, entries]) => [id, lessonCard(entries.map(({ deckId }) => deckId), kanjiLexicon)(entries[0].item)])
);
var reconcileJlptMemberships = (catalog, cardsById) => ({
  ...catalog,
  cards: catalog.cards.map((card) => ((planned) => planned ? {
    ...card,
    provenance: {
      ...card.provenance,
      jlpt: {
        ...card.provenance?.jlpt,
        deckIds: [.../* @__PURE__ */ new Set([...card.provenance?.jlpt?.deckIds ?? [], ...planned.provenance.jlpt.deckIds ?? []])],
        baselineKnown: card.provenance?.jlpt?.baselineKnown ?? true
      }
    }
  } : card)(cardsById.get(String(card.id))))
});
var selectableLessonItems = ({ plan, result }, existingIds, reofferableIds, knownIds, selectedIds) => result.ok && Number(plan.limit) > 0 ? (Array.isArray(result.value?.items) ? result.value.items : []).filter((item) => item?._id && item?.item && (!existingIds.has(String(item._id)) || reofferableIds.has(String(item._id))) && !knownIds.has(String(item._id)) && !selectedIds.has(String(item._id))).slice(0, Number(plan.limit)) : [];
var selectLessonCards = ({ cardsById, decks, existingIds, reofferableIds, knownIds }) => decks.reduce(
  ({ cards, selectedIds }, deck) => ((selected) => ({
    cards: [...cards, ...selected.map((item) => cardsById.get(String(item._id))).filter(Boolean)],
    selectedIds: /* @__PURE__ */ new Set([...selectedIds, ...selected.map((item) => String(item._id))])
  }))(selectableLessonItems(deck, existingIds, reofferableIds, knownIds, selectedIds)),
  { cards: [], selectedIds: /* @__PURE__ */ new Set() }
).cards;
var readKnownItems = (file, ids, callback) => ids ? callback({ ok: true, value: { ids } }) : readJson(file, callback);
var startLesson = ({ context, catalogFile, dailyPlan = false, more = false, eventsFile, deckFile, knownFile, knownIds, deckId, limit = 10, now = (/* @__PURE__ */ new Date()).toISOString(), plans }, callback) => readKnownItems(knownFile, knownIds, (knownResult) => readLessonDecks(normalizedLessonPlans({ deckFile, deckId, limit, plans })).then((decks) => {
  const deckError = decks.map(({ result }) => result).find(({ ok }) => !ok);
  const cardsById = plannedLessonCards(decks, context.kanjiLexicon);
  const reconciledCatalog = reconcileJlptMemberships(context.catalog, cardsById);
  const existingIds = new Set(reconciledCatalog.cards.map(({ id }) => id));
  const reofferableIds = new Set(reconciledCatalog.cards.filter((card) => context.cardStates.cardsById?.[card.id]?.status === "unscheduled" && context.cardStates.cardsById?.[card.id]?.known !== true && card.provenance?.jlpt?.baselineKnown !== true).map(({ id }) => id));
  const existingLesson = dailyPlan ? existingDailyLesson(context) : more ? existingMoreLesson(context) : null;
  const selected = knownResult.ok && !deckError ? selectLessonCards({
    cardsById,
    decks,
    existingIds,
    reofferableIds,
    knownIds: new Set(Array.isArray(knownResult.value?.ids) ? knownResult.value.ids.map(String) : [])
  }) : [];
  const updatedCatalog = {
    ...reconciledCatalog,
    cards: [...reconciledCatalog.cards, ...selected.filter(({ id }) => !existingIds.has(id))]
  };
  const event = lessonEvent({ cards: selected, dailyPlan, more, studyDate: context.session.studyDate, now });
  return !knownResult.ok ? callback(error2(`MaruMori known-item history is unavailable: ${knownResult.error}`)) : deckError ? callback(deckError) : more && !lessonComplete(context, existingDailyLesson(context)) ? callback(error2("Complete the daily vocab and kanji lesson before learning more.")) : existingLesson ? callback({ ok: true, created: false, value: { ...buildExtraView({ cards: context.catalog.cards, cardStates: context.cardStates, extraSession: existingLesson.session, events: context.events }), catalog: context.catalog } }) : selected.length === 0 ? callback(error2("No genuinely new cards remain in the selected study lists.")) : writeCatalog(catalogFile, updatedCatalog, (written) => written.ok ? appendJsonLine(eventsFile, event, (appended) => callback(
    appended.ok ? { ok: true, created: true, value: { ...buildExtraView({ cards: updatedCatalog.cards, cardStates: context.cardStates, extraSession: event.session, events: [...context.events, event] }), catalog: updatedCatalog } } : error2(appended.error.message)
  )) : callback(written));
}));
var dailyLessonEvent = ({ cards, dailyPlan = true, more = false, studyDate: studyDate2, now }) => ((occurredAt) => ((extraSessionId) => ((entries) => ({
  type: "extra_session_started",
  studyDate: studyDate2,
  occurredAt,
  extraSessionId,
  session: {
    sessionVersion: 1,
    extraSessionId,
    lesson: true,
    dailyPlan,
    more,
    studyDate: studyDate2,
    startedAt: occurredAt,
    entries,
    presentationOrder: shuffledPresentationOrder(entries, extraSessionId)
  }
}))(cards.map(({ id, type }) => ({ cardId: id, type, source: "extra", promptDirection: "recognition" }))))(
  `lesson:${studyDate2}:${occurredAt}`
))(new Date(now).toISOString());
var cardDeckIds = (card) => [
  ...Array.isArray(card?.provenance?.jlpt?.deckIds) ? card.provenance.jlpt.deckIds : [],
  ...card?.provenance?.customListId ? [card.provenance.customListId] : []
];
var genuinelyNew = (context, card) => context.cardStates.cardsById?.[card.id]?.status === "unscheduled" && context.cardStates.cardsById?.[card.id]?.known !== true && card?.provenance?.jlpt?.baselineKnown !== true;
var dailyLessonCards = (context) => Object.entries(
  context.studyPlan?.dailyLimits ?? context.settings.studyListDailyNew ?? {}
).reduce(
  ({ cards, selectedIds }, [deckId, dailyNew]) => ((selected) => ({
    cards: [...cards, ...selected],
    selectedIds: /* @__PURE__ */ new Set([...selectedIds, ...selected.map(({ id }) => id)])
  }))(context.catalog.cards.filter((card) => !selectedIds.has(card.id) && cardDeckIds(card).includes(deckId) && genuinelyNew(context, card)).slice(0, dailyNew)),
  { cards: [], selectedIds: /* @__PURE__ */ new Set() }
).cards;
var existingDailyLesson = (context) => context.events.findLast(
  (event) => event.type === "extra_session_started" && event.studyDate === context.session.studyDate && event.session?.lesson && event.session?.dailyPlan
);
var lessonView = (context, session, events) => buildExtraView({
  cards: context.catalog.cards,
  cardStates: context.cardStates,
  extraSession: session,
  events
});
var lessonComplete = (context, event) => Boolean(
  event && lessonView(context, event.session, context.events).queue.length === 0
);
var latestMoreLesson = (context) => context.events.findLast((event) => event.type === "extra_session_started" && event.studyDate === context.session.studyDate && event.session?.lesson && event.session?.more);
var existingMoreLesson = (context) => ((latest) => latest && !lessonComplete(context, latest) ? latest : null)(latestMoreLesson(context));
var startDailyLesson = ({ context, eventsFile, more = false, now = (/* @__PURE__ */ new Date()).toISOString() }, callback) => ((daily, existing) => more && !lessonComplete(context, daily) ? callback(error2("Complete the daily vocab and kanji lesson before learning more.")) : existing ? callback({ ok: true, created: false, value: lessonView(context, existing.session, context.events) }) : ((cards) => cards.length === 0 ? callback(error2("No genuinely new cards remain in the enabled study lists.")) : ((event) => appendJsonLine(eventsFile, event, (appendResult) => callback(
  appendResult.ok ? { ok: true, created: true, value: lessonView(context, event.session, [...context.events, event]) } : error2(appendResult.error.message)
)))(dailyLessonEvent({
  cards,
  dailyPlan: !more,
  more,
  studyDate: context.session.studyDate,
  now
})))(dailyLessonCards(context)))(
  existingDailyLesson(context),
  more ? existingMoreLesson(context) : existingDailyLesson(context)
);
var hasFrozenSession = (context) => context.events.some(
  (event) => event.type === "session_started" && event.studyDate === context.session.studyDate
);
var sessionStartedEvent = (context) => ({
  type: "session_started",
  studyDate: context.session.studyDate,
  occurredAt: context.session.startedAt,
  session: context.session
});
var appendReview = ({ context, eventsFile, review, callback }) => review.event ? appendJsonLine(eventsFile, review.event, (appendResult) => callback(
  appendResult.ok ? { ok: true, value: review } : error2(appendResult.error.message)
)) : callback({ ok: true, value: review });
var recordReview = ({ context, eventsFile, input, now = (/* @__PURE__ */ new Date()).toISOString() }, callback) => {
  const reviewResult = createReviewEvent({
    cards: context.catalog.cards,
    cardStates: context.cardStates,
    session: context.session,
    events: context.events,
    eventId: randomUUID(),
    input,
    now
  });
  const append = () => appendReview({ context, eventsFile, review: reviewResult.value, callback });
  return !reviewResult.ok ? callback(reviewResult) : hasFrozenSession(context) ? append() : appendJsonLine(
    eventsFile,
    sessionStartedEvent(context),
    (sessionResult) => sessionResult.ok ? append() : callback(error2(sessionResult.error.message))
  );
};
var recordBypass = ({ context, durationMinutes, eventsFile, now = (/* @__PURE__ */ new Date()).toISOString(), timeZone }, callback) => {
  const bypass = createBypassEvent({ durationMinutes, now, timeZone });
  const append = () => appendJsonLine(eventsFile, bypass.event, (appendResult) => callback(
    appendResult.ok ? { ok: true, value: { event: bypass.event } } : error2(appendResult.error.message)
  ));
  return bypass.ok ? (context && !hasFrozenSession(context) ? appendJsonLine(eventsFile, sessionStartedEvent(context), (sessionResult) => sessionResult.ok ? append() : callback(error2(sessionResult.error.message))) : append(), bypass) : bypass;
};
var recordExtraReview = ({ context, eventsFile, input, now = (/* @__PURE__ */ new Date()).toISOString() }, callback) => {
  const extraSession = extraSessionFor(context.events, input?.extraSessionId);
  const review = createExtraReviewEvent({
    cards: context.catalog.cards,
    cardStates: context.cardStates,
    events: context.events,
    eventId: randomUUID(),
    extraSession,
    input,
    studyDate: extraSession?.studyDate,
    now
  });
  return extraSession && review.ok ? appendReview({ context, eventsFile, review: review.value, callback }) : callback(extraSession ? review : error2("Extra-review batch is missing or invalid."));
};
var recordRedo = ({ context, eventsFile, input, now = (/* @__PURE__ */ new Date()).toISOString() }, callback) => ((redo) => redo.ok ? appendJsonLine(eventsFile, redo.value.event, (appendResult) => callback(
  appendResult.ok ? redo : error2(appendResult.error.message)
)) : callback(redo))(createRedoEvent({
  events: context.events,
  input,
  studyDate: context.session.studyDate,
  now
}));
var recordAnswerAlias = ({ context, eventsFile, input, now = (/* @__PURE__ */ new Date()).toISOString() }, callback) => {
  const alias = createAnswerAliasEvent({
    cards: context.catalog.cards,
    input,
    studyDate: context.session.studyDate,
    now
  });
  return alias.ok ? appendJsonLine(eventsFile, alias.value.event, (appendResult) => callback(
    appendResult.ok ? alias : error2(appendResult.error.message)
  )) : callback(alias);
};
var recordKnownCard = ({ context, eventsFile, input, now = (/* @__PURE__ */ new Date()).toISOString() }, callback) => ((change) => change.ok ? appendJsonLine(eventsFile, change.value.event, (appendResult) => callback(
  appendResult.ok ? change : error2(appendResult.error.message)
)) : callback(change))(createKnownCardEvent({
  cards: context.catalog.cards,
  input,
  studyDate: context.session.studyDate,
  now
}));

// scripts/lib/grammar-drill.mjs
var grammarDrillDefaults = Object.freeze({
  // Half of the drill's usual 20-question session.
  minimum: 10,
  drillUrl: "https://daiwa-scholars-two-thousand-twenty-vibe.github.io/n2-grammar-drill/"
});
var httpsUrl = (value) => {
  try {
    return new URL(String(value)).protocol === "https:" ? String(value) : null;
  } catch {
    return null;
  }
};
var normalizeGrammarDrillConfig = (value) => ((progressUrl) => progressUrl ? {
  ok: true,
  value: Object.freeze({
    progressUrl,
    drillUrl: httpsUrl(value.drillUrl) ?? grammarDrillDefaults.drillUrl
  })
} : { ok: false, error: "Grammar drill config needs an https progressUrl." })(httpsUrl(value?.progressUrl));
var drillCalendarDate = (now, timeZone) => new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date(now));
var isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
var grammarDrillRequirement = ({ document, today }) => {
  const state = document?.state;
  if (!isRecord(state) || !isRecord(state.points)) {
    return { ok: false, error: "Grammar drill progress has no grammar points." };
  }
  const due = Object.values(state.points).filter((point) => Number(point?.seen) > 0 && typeof point.due === "string" && point.due <= today).length;
  const answeredToday = Math.max(0, Number(state.days?.[today]?.n) || 0);
  const { minimum } = grammarDrillDefaults;
  const remaining = Math.max(0, minimum - answeredToday);
  return {
    ok: true,
    value: Object.freeze({ today, due, answeredToday, minimum, remaining, cleared: remaining === 0 })
  };
};
var grammarDrillStatus = ({ snapshot, now, timeZone }) => {
  if (!snapshot?.configured) return null;
  const base = { drillUrl: snapshot.config?.drillUrl ?? grammarDrillDefaults.drillUrl, checkedAt: snapshot.checkedAt ?? null };
  if (!snapshot.ok) return { ...base, available: false, cleared: true, error: snapshot.error };
  const requirement = grammarDrillRequirement({
    document: snapshot.document,
    today: drillCalendarDate(now, timeZone)
  });
  return requirement.ok ? { ...base, available: true, ...requirement.value } : { ...base, available: false, cleared: true, error: requirement.error };
};
var withGrammarDrillAccess = ({ complete, access, bypass }, drill) => ((grammarPending) => ({
  reviewsComplete: Boolean(complete),
  complete: Boolean(complete) && !grammarPending,
  access: grammarPending ? gateAccess({ bypass }) : access
}))(access?.reason === "study_complete" && Boolean(drill?.available) && drill.cleared === false);
var createGrammarDrillSource = ({ readConfig, fetchJson, clock = Date.now, maxAgeMs = 3e4 }) => {
  let snapshot = null;
  let pending = null;
  const load = () => readConfig().then((config) => !config ? { configured: false } : !config.ok ? { configured: true, ok: false, error: config.error } : fetchJson(config.value.progressUrl).then((document) => ({ configured: true, ok: true, config: config.value, document })).catch((error3) => ({ configured: true, ok: false, config: config.value, error: error3?.message ?? String(error3) }))).catch((error3) => ({ configured: true, ok: false, error: error3?.message ?? String(error3) })).then((loaded) => {
    snapshot = { ...loaded, checkedAt: new Date(clock()).toISOString(), loadedAt: clock() };
    pending = null;
    return snapshot;
  });
  const fresh = () => snapshot && clock() - snapshot.loadedAt < maxAgeMs;
  const refresh = () => fresh() ? Promise.resolve(snapshot) : pending ?? (pending = load());
  return {
    refresh,
    current: () => (fresh() ? null : refresh(), snapshot)
  };
};

// scripts/lib/stats-core.mjs
var day2 = 24 * 60 * 60 * 1e3;
var historyImportType = "marumori_history_imported";
var cardsArray3 = (catalog) => Array.isArray(catalog?.cards) ? catalog.cards : [];
var statesArray3 = (cardStates) => Array.isArray(cardStates) ? cardStates : Object.values(cardStates?.cardsById ?? cardStates ?? {});
var eventStudyDate2 = (event, timeZone) => typeof event?.studyDate === "string" ? event.studyDate : studyDate(event?.occurredAt, timeZone);
var studyDays = (count, now, timeZone) => Array.from(
  { length: count },
  (_, index) => studyDate(new Date(Date.parse(now) - (count - index - 1) * day2), timeZone)
);
var activityStudyDays = (today, recordedDates) => {
  const last = Date.parse(`${today}T00:00:00.000Z`);
  const first = recordedDates.reduce((earliest, date) => {
    const timestamp = Date.parse(`${date}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? Math.min(earliest, timestamp) : earliest;
  }, last - 29 * day2);
  return Array.from({ length: (last - first) / day2 + 1 }, (_, index) => new Date(first + index * day2).toISOString().slice(0, 10));
};
var validTime = (value) => Number.isFinite(Date.parse(value ?? ""));
var levelFor = (state) => Number.isInteger(state?.stage) ? Math.min(9, Math.max(1, state.stage)) : null;
var activeLevelFor = (state) => state?.known ? null : levelFor(state);
var progressBands = Object.freeze([
  Object.freeze({ id: "learning", label: "Learning", detail: "levels 1 to 4", levels: Object.freeze([1, 2, 3, 4]) }),
  Object.freeze({ id: "familiar", label: "Familiar", detail: "levels 5 to 6", levels: Object.freeze([5, 6]) }),
  Object.freeze({ id: "strong", label: "Strong", detail: "levels 7 to 8", levels: Object.freeze([7, 8]) }),
  Object.freeze({ id: "retired", label: "Retired", detail: "level 9, no more reviews", levels: Object.freeze([9]) })
]);
var progressBandFor = (bandId) => progressBands.find(({ id }) => id === bandId) ?? null;
var progressBandCards = ({ catalog, cardStates, type, bandId }) => ((band) => band ? ((states) => cardsArray3(catalog).filter(
  (card) => card.type === type && band.levels.includes(activeLevelFor(states[card.id]))
))(Object.fromEntries(statesArray3(cardStates).map((state) => [state.cardId ?? state.id, state]))) : [])(progressBandFor(bandId));
var answeredFor = (events) => effectiveLearningEvents(events).filter(isLearningAnswerEvent);
var accuracyFor = (events) => ({
  attempts: events.length,
  correct: events.filter((event) => event.correct).length,
  rate: events.length === 0 ? null : events.filter((event) => event.correct).length / events.length
});
var sessionsByDate = (events, timeZone) => Object.fromEntries(
  events.filter((event) => event.type === "session_started" && event.session).map((event) => [eventStudyDate2(event, timeZone), event.session])
);
var completionByDate = (events, sessions, answersByDate, now, timeZone) => ((knownChanges) => Object.fromEntries(
  Object.entries(sessions).map(([date, session]) => [
    date,
    deriveDailyStatus({ session, events: [...knownChanges, ...answersByDate[date] ?? []], now, timeZone }).complete
  ])
))(events.filter((event) => knownChangeTypes.has(event.type)));
var streakFor = (completeByDate, now, timeZone) => ((days) => days.reduce(
  ({ count, open }, date) => open && completeByDate[date] ? { count: count + 1, open: true } : { count, open: false },
  { count: 0, open: true }
).count)(studyDays(365, completeByDate[studyDate(now, timeZone)] ? now : new Date(Date.parse(now) - day2).toISOString(), timeZone).toReversed());
var completedReviews = (answers2) => Object.values(Object.groupBy(
  answers2.filter(({ correct }) => correct),
  (event) => `${event.cardId}\0${reviewCycleKey(event)}`
)).map((events) => events[0]);
var activityFor = (days, answersByDate, cardsById, completeByDate) => days.map((date) => ((dayAnswers) => ((completed) => ({
  studyDate: date,
  attempts: dayAnswers.length,
  completed: completed.length,
  correct: dayAnswers.filter((event) => event.correct).length,
  cards: new Set(dayAnswers.map((event) => event.cardId)).size,
  kanji: completed.filter((event) => cardsById[event.cardId]?.type === "kanji").length,
  vocabulary: completed.filter((event) => cardsById[event.cardId]?.type === "vocabulary").length,
  complete: Boolean(completeByDate[date])
}))(completedReviews(dayAnswers)))(answersByDate[date] ?? []));
var historyDays = (events, now) => Math.min(365, Math.max(1, Math.floor(
  (Date.parse(now) - Math.min(...events.map((event) => Date.parse(event.occurredAt ?? now)).filter(Number.isFinite), Date.parse(now))) / day2
) + 1));
var knownChangeTypes = /* @__PURE__ */ new Set(["card_marked_known", "card_known_restored"]);
var masteryEventOrder = (left, right) => Number(knownChangeTypes.has(left.type)) - Number(knownChangeTypes.has(right.type)) || (isLearningAnswerEvent(left) && isLearningAnswerEvent(right) ? Date.parse(left.occurredAt) - Date.parse(right.occurredAt) : 0);
var applicableMasteryEvent = (event, cardsById) => typeof event?.cardId === "string" && Object.hasOwn(cardsById, event.cardId) && (isLearningAnswerEvent(event) ? typeof event.correct === "boolean" && validTime(event.occurredAt) : knownChangeTypes.has(event.type) && validTime(event.occurredAt));
var applyMasteryEvent = (state, event) => isLearningAnswerEvent(event) ? scheduleReview(state, event) : { ...state, known: event.type === "card_marked_known" };
var cardMasteryTransitions = ({ card, events, initialState, timeZone }) => Object.entries(Object.groupBy(
  events,
  (event) => eventStudyDate2(event, timeZone)
)).toSorted(([left], [right]) => left.localeCompare(right)).reduce(
  ({ state, transitions }, [date, dailyEvents]) => ((nextState) => ((delta) => ({
    state: nextState,
    transitions: delta === 0 ? transitions : [...transitions, { date, delta, type: card.type }]
  }))(Number((activeLevelFor(nextState) ?? 0) >= 5) - Number((activeLevelFor(state) ?? 0) >= 5)))(
    dailyEvents.toSorted(masteryEventOrder).reduce(applyMasteryEvent, state)
  ),
  { state: initialState, transitions: [] }
).transitions;
var masteryHistory = (catalog, events, now, timeZone) => ((cards) => ((cardsById) => ((baselineStates) => ((transitionsByDate) => studyDays(historyDays(events, now), now, timeZone).reduce(
  ({ entries, kanji, vocabulary }, date) => ((deltas) => ((nextKanji, nextVocabulary) => ({
    entries: [...entries, { studyDate: date, kanji: nextKanji, vocabulary: nextVocabulary }],
    kanji: nextKanji,
    vocabulary: nextVocabulary
  }))(
    kanji + deltas.filter(({ type }) => type === "kanji").reduce((total, { delta }) => total + delta, 0),
    vocabulary + deltas.filter(({ type }) => type === "vocabulary").reduce((total, { delta }) => total + delta, 0)
  ))(transitionsByDate[date] ?? []),
  {
    entries: [],
    kanji: cards.filter((card) => card.type === "kanji" && (activeLevelFor(baselineStates[card.id]) ?? 0) >= 5).length,
    vocabulary: cards.filter((card) => card.type === "vocabulary" && (activeLevelFor(baselineStates[card.id]) ?? 0) >= 5).length
  }
).entries)(((eventsByCardId) => Object.groupBy(
  cards.flatMap((card) => cardMasteryTransitions({
    card,
    events: eventsByCardId[card.id] ?? [],
    initialState: baselineStates[card.id],
    timeZone
  })),
  ({ date }) => date
))(Object.groupBy(
  events.filter((event) => event.type !== "marumori_baseline" && applicableMasteryEvent(event, cardsById)),
  ({ cardId }) => cardId
))))(foldLearningEvents(catalog, events.filter((event) => event.type === "marumori_baseline")).cardsById))(
  Object.fromEntries(cards.map((card) => [card.id, card]))
))(cardsArray3(catalog).filter((card) => ["kanji", "vocabulary"].includes(card.type)));
var validImportedMastery = (entry) => /^\d{4}-\d{2}-\d{2}$/u.test(entry?.studyDate ?? "") && Number.isInteger(entry?.kanji) && entry.kanji >= 0 && Number.isInteger(entry?.vocabulary) && entry.vocabulary >= 0;
var withImportedMastery = (events, localHistory) => ((firstLocalDate) => [
  ...Object.values(Object.fromEntries(
    events.filter((event) => event?.type === historyImportType).flatMap((event) => Array.isArray(event?.mastery) ? event.mastery : []).filter(validImportedMastery).filter(({ studyDate: date }) => !firstLocalDate || date < firstLocalDate).map((entry) => [entry.studyDate, entry])
  )).toSorted((left, right) => left.studyDate.localeCompare(right.studyDate)),
  ...localHistory
])(localHistory[0]?.studyDate ?? null);
var progressFor2 = (type, cards, states, answeredIds, now) => ((typedCards) => ((levels) => ({
  total: typedCards.length,
  known: typedCards.filter((card) => states[card.id]?.known).length,
  started: typedCards.filter((card) => states[card.id]?.known || answeredIds.has(card.id)).length,
  expert: typedCards.filter((card) => activeLevelFor(states[card.id]) === 9).length,
  dueNow: typedCards.filter((card) => !states[card.id]?.known && ["wanikani", "marumori"].includes(states[card.id]?.status) && validTime(states[card.id]?.dueAt) && Date.parse(states[card.id].dueAt) <= Date.parse(now)).length,
  levels,
  bands: progressBands.map(({ id, label, detail, levels: bandLevels }) => ({
    id,
    label,
    detail,
    count: bandLevels.map((level) => levels[level - 1] ?? 0).reduce((total, count) => total + count, 0)
  }))
}))(Array.from(
  { length: 9 },
  (_, index) => typedCards.filter((card) => activeLevelFor(states[card.id]) === index + 1).length
)))(cards.filter((card) => card.type === type));
var jlptLevel = (deck) => String(deck?.level ?? "").toUpperCase();
var jlptDeckProgress = ({ catalog, cardStates }) => {
  const cards = cardsArray3(catalog);
  const states = Object.fromEntries(statesArray3(cardStates).map((state) => [state.cardId ?? state.id, state]));
  const decks = Array.isArray(catalog?.jlpt?.decks) ? catalog.jlpt.decks : [];
  return decks.map((deck) => {
    const deckCards = cards.filter((card) => card?.provenance?.jlpt?.deckIds?.includes(deck.id));
    const total = Number(deck.total ?? 0);
    const stages = Array.from(
      { length: 9 },
      (_, index) => deckCards.filter((card) => activeLevelFor(states[card.id]) === index + 1).length
    );
    const known = Math.min(deckCards.filter((card) => states[card.id]?.known).length, total);
    const learning = stages.reduce((sum, count) => sum + count, 0);
    const started = Math.min(known + learning, total);
    const unstarted = Math.max(0, total - started);
    return {
      id: deck.id,
      known,
      started,
      unstarted,
      learning,
      total,
      unseen: unstarted,
      stages
    };
  });
};
var jlptProgress = (catalog, cards, states) => {
  const levels = ["N5", "N4", "N3", "N2", "N1"];
  const progressByDeck = Object.fromEntries(jlptDeckProgress({ catalog, cardStates: states }).map((progress) => [progress.id, progress]));
  const progressForDeck = (deck) => (({ known, started, total, unseen, stages }) => ({ known, started, total, unseen, stages }))(
    progressByDeck[deck.id] ?? { known: 0, started: 0, total: 0, unseen: 0, stages: Array(9).fill(0) }
  );
  const decks = Array.isArray(catalog?.jlpt?.decks) ? catalog.jlpt.decks : [];
  return levels.map((level) => ({
    level,
    kanji: progressForDeck(decks.find((deck) => jlptLevel(deck) === level && deck.type === "kanji") ?? {}),
    vocabulary: progressForDeck(decks.find((deck) => jlptLevel(deck) === level && deck.type === "vocabulary") ?? {})
  }));
};
var deriveStats = ({ catalog, cardStates, events = [], now = (/* @__PURE__ */ new Date()).toISOString(), timeZone }) => {
  const cards = cardsArray3(catalog);
  const cardsById = Object.fromEntries(cards.map((card) => [card.id, card]));
  const states = Object.fromEntries(statesArray3(cardStates).map((state) => [state.cardId ?? state.id, state]));
  const masteryEvents = effectiveLearningEvents(events);
  const learningEvents = masteryEvents.filter((event) => event?.type !== historyImportType);
  const answers2 = answeredFor(learningEvents);
  const answersByDate = Object.groupBy(answers2, (event) => eventStudyDate2(event, timeZone));
  const sessions = sessionsByDate(learningEvents, timeZone);
  const completeByDate = completionByDate(learningEvents, sessions, answersByDate, now, timeZone);
  const activityDays = activityStudyDays(studyDate(now, timeZone), [...Object.keys(answersByDate), ...Object.keys(sessions)]);
  const answeredIds = new Set(answers2.map((event) => event.cardId));
  const within = (count) => new Set(studyDays(count, now, timeZone));
  return {
    activity: { days: activityFor(activityDays, answersByDate, cardsById, completeByDate) },
    mastery: withImportedMastery(masteryEvents, masteryHistory(catalog, learningEvents, now, timeZone)),
    streak: streakFor(completeByDate, now, timeZone),
    accuracy: {
      sevenDays: accuracyFor([...within(7)].flatMap((date) => answersByDate[date] ?? [])),
      thirtyDays: accuracyFor([...within(30)].flatMap((date) => answersByDate[date] ?? []))
    },
    progress: {
      kanji: progressFor2("kanji", cards, states, answeredIds, now),
      vocabulary: progressFor2("vocabulary", cards, states, answeredIds, now)
    },
    jlpt: jlptProgress(catalog, cards, states)
  };
};

// web/browser-speech.mjs
var createReviewSpeech = () => ({
  available: false,
  request: (_text, callback) => callback({ ok: false })
});

// scripts/lib/study-pairs.mjs
var pairType = (value) => value === "kanji" || value === "vocabulary";
var text3 = (value) => typeof value === "string" ? value.normalize("NFKC").trim() : "";
var kanjiLiteral = (value) => /^\p{Script=Han}$/u.test(text3(value)) ? text3(value) : null;
var unique3 = (values) => [...new Set(values.flat().map(text3).filter(Boolean))];
var readingKey = (reading) => normalizeKana(reading).replace(/[.\-]/gu, "");
var readingVariants2 = (reading) => [readingKey(reading), readingKey(reading.split(".")[0])].filter(Boolean);
var readingsOf = (entry) => unique3([
  entry.kunReadings ?? [],
  entry.onReadings ?? [],
  entry.readings ?? [],
  entry.reading,
  entry.mainReading
]);
var meaningsOf = (entry) => unique3([entry.meanings ?? String(entry.meaning ?? "").split(/[;,]/u)]);
var sameEntry = (left, right) => left.item === right.item && left.readings.join("\0") === right.readings.join("\0") && left.meanings.join("\0") === right.meanings.join("\0");
var kanjiEntries = (cards, kanji, lexicon) => {
  const byItem = cards.reduce((index, card) => {
    const literal = card.type === "kanji" && kanjiLiteral(card.item);
    if (literal) index.set(literal, [...index.get(literal) ?? [], card]);
    return index;
  }, /* @__PURE__ */ new Map());
  const ids = unique3([[...byItem.keys()], Object.keys(kanji), Object.keys(lexicon)]).filter(kanjiLiteral);
  return new Map(ids.map((id) => {
    const entries = [...byItem.get(id) ?? [], kanji[id], lexicon[id]].filter(Boolean);
    return [id, {
      id,
      item: id,
      meanings: unique3(entries.map(meaningsOf)),
      readings: unique3(entries.map(readingsOf))
    }];
  }));
};
var vocabularyEntries2 = (cards, words) => [...cards, ...words].reduce((entries, word) => {
  const id = word.id ?? word._id;
  const item = text3(word.item);
  if (typeof id !== "string" || !id || !item || entries.has(id) || String(word.type ?? "vocabulary").toLowerCase() !== "vocabulary") return entries;
  entries.set(id, {
    id,
    item,
    meanings: meaningsOf(word),
    readings: readingsOf(word),
    surfaces: unique3([item, word.surfaceAliases ?? []])
  });
  return entries;
}, /* @__PURE__ */ new Map());
var createPairDictionary = ({ type, cards, kanji = {}, lexicon = {}, words = [] }) => {
  const entries = type === "kanji" ? kanjiEntries(cards, kanji, lexicon) : vocabularyEntries2(cards, words);
  const entry = (id) => entries.get(type === "kanji" ? kanjiLiteral(id) : id);
  const search = (query, source) => {
    const original = entry(source);
    const lookup = text3(query);
    const reading = readingKey(lookup);
    const meaning = normalizeEnglish(lookup);
    if (!lookup) return [];
    return [...entries.values()].filter((candidate) => candidate.id !== source && (!original || !sameEntry(original, candidate))).map((candidate) => {
      const meanings = comparableMeanings(candidate.meanings);
      const surfaces = candidate.surfaces ?? [candidate.item];
      const exact = surfaces.includes(lookup);
      const exactReading = candidate.readings.flatMap(readingVariants2).includes(reading);
      const exactMeaning = Boolean(meaning) && meanings.includes(meaning);
      const partial = type === "vocabulary" && surfaces.some((surface) => surface.startsWith(lookup)) || Boolean(meaning) && meanings.some((value) => value.split(/\s+/u).includes(meaning));
      return { candidate, rank: exact ? 3 : exactReading || exactMeaning ? 2 : partial ? 1 : 0 };
    }).filter(({ rank }) => rank > 0).sort((left, right) => right.rank - left.rank).reduce((results, { candidate }) => {
      if (results.length < 8 && !results.some((result) => sameEntry(result, candidate))) results.push(candidate);
      return results;
    }, []);
  };
  return { entry, search };
};
var studyPairKey = (type, left, right) => pairType(type) && left && right && left !== right ? JSON.stringify([type, ...[left, right].sort()]) : null;
var validEntry = (entry) => typeof entry?.id === "string" && typeof entry.item === "string" && [entry.meanings, entry.readings].every((values) => Array.isArray(values) && values.every((value) => typeof value === "string"));
var savedStudyPairs = (events) => {
  const removed = new Set(events.filter((event) => event?.type === "study_pair_removed").flatMap((event) => Array.isArray(event.savedEventIds) ? event.savedEventIds : []));
  return events.filter((event) => event?.type === "study_pair_saved" && typeof event.eventId === "string" && typeof event.occurredAt === "string" && !removed.has(event.eventId)).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.eventId.localeCompare(left.eventId)).reduce((pairs, event) => {
    const [left, right] = Array.isArray(event.items) ? event.items : [];
    if (!validEntry(left) || !validEntry(right)) return pairs;
    const key = studyPairKey(event.itemType, left.id, right.id);
    if (!key) return pairs;
    const existing = pairs.get(key);
    if (existing) existing.savedEventIds.push(event.eventId);
    else pairs.set(key, { key, type: event.itemType, items: [left, right], savedEventIds: [event.eventId] });
    return pairs;
  }, /* @__PURE__ */ new Map());
};
var studyGroups = (pairs) => {
  const nodes = /* @__PURE__ */ new Map();
  const nodeFor = (type, entry) => {
    const key = JSON.stringify([type, entry.id]);
    if (!nodes.has(key)) nodes.set(key, { type, entry, links: [] });
    return nodes.get(key);
  };
  for (const pair of pairs) {
    const left = nodeFor(pair.type, pair.items[0]);
    const right = nodeFor(pair.type, pair.items[1]);
    left.links.push({ pair, neighbor: right });
    right.links.push({ pair, neighbor: left });
  }
  const visited = /* @__PURE__ */ new Set();
  return [...nodes.values()].flatMap((start) => {
    if (visited.has(start)) return [];
    const members = [start];
    const links = /* @__PURE__ */ new Set();
    visited.add(start);
    for (const member of members) {
      for (const { pair, neighbor } of member.links) {
        links.add(pair);
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          members.push(neighbor);
        }
      }
    }
    const byId = new Map(members.map(({ entry }) => [entry.id, entry]));
    const ids = [...byId.keys()].sort();
    return [{
      key: JSON.stringify([start.type, ...ids]),
      type: start.type,
      items: ids.map((id) => byId.get(id)),
      links: [...links]
    }];
  });
};
var questionFor = (target, alternatives, items, key, showReadings) => {
  const otherMeanings = new Set(comparableMeanings(alternatives.flatMap(({ meanings }) => meanings)));
  const meaning = target.meanings.find((value) => {
    const variants2 = comparableMeanings([value]);
    return variants2.length && variants2.every((variant) => !otherMeanings.has(variant));
  });
  const question = { key, items, answer: target.id, showReadings };
  if (meaning) return { ...question, kind: "meaning", clue: meaning };
  if (showReadings) return null;
  const otherReadings = new Set(alternatives.flatMap(({ readings }) => readings.flatMap(readingVariants2)));
  const reading = target.readings.find((value) => {
    const variants2 = readingVariants2(value);
    return variants2.length && variants2.every((variant) => !otherReadings.has(variant));
  });
  return reading ? { ...question, kind: "reading", clue: reading.replaceAll(".", "") } : null;
};
var studyGroupQuestions = (groups) => groups.flatMap(({ items, key }) => {
  const showReadings = new Set(items.map(({ item }) => item)).size < items.length;
  const choiceLabel = (entry) => JSON.stringify([entry.item, showReadings ? readingKey(entry.readings[0]) : ""]);
  const questions = items.map((target) => {
    const alternatives = items.filter((entry) => entry.id !== target.id);
    if (alternatives.some((entry) => choiceLabel(entry) === choiceLabel(target))) return null;
    return questionFor(target, alternatives, items, key, showReadings);
  }).filter(Boolean);
  return questions.length ? questions : [{ key, items, kind: "compare" }];
});
var studyPairLessonCard = (type, entry) => ({
  type,
  item: entry.item,
  readings: entry.readings,
  meanings: entry.meanings,
  surfaceAliases: (entry.surfaces ?? []).filter((surface) => surface !== entry.item)
});
var studyPairLessonNotes = (card, index) => {
  const reference = studyReference({ card, index });
  if (card.type === "kanji") return {
    components: reference.components.map(({ literal, position, paths, meaning }) => ({ literal, position, paths, meaning })),
    radical: reference.radicalInfo ?? null,
    ...reference.story ? { story: reference.story } : {}
  };
  const example = reference.entries.flatMap(({ senses }) => senses.filter(({ matchesCard }) => matchesCard).flatMap(({ examples }) => examples)).find(({ ja, en }) => ja && en);
  return { example: example ?? null };
};

// scripts/lib/grammar-core.mjs
var furiganaBraces = /\{([^|{}]*)\|[^{}]*\}/gu;
var circledIndex = /[①-⓿]/gu;
var fullwidthReading = /（[぀-ヿー]+）/gu;
var leadingTildes = /^[〜～]+/u;
var trailingPunct = /[。、．，！？…\s]+$/u;
var normalizeSurface = (value) => String(value ?? "").replace(furiganaBraces, "$1").replace(circledIndex, "").replace(fullwidthReading, "").trim().replace(leadingTildes, "").replace(trailingPunct, "").trim();
var pickCloze = (point, random = Math.random) => ((list) => list.length === 0 ? null : ((index) => ({ ...list[index], index }))(Math.floor(random() * list.length)))(
  Array.isArray(point?.cloze) ? point.cloze : []
);
var checkClozeAnswer = (cloze, submitted) => ((value) => value.length > 0 && (value === normalizeSurface(cloze?.surface) || value === normalizeSurface(cloze?.reading)))(normalizeSurface(submitted));
var validDate2 = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
var initialGrammarState = (cardId) => ({
  cardId,
  status: "unscheduled",
  stage: null,
  dueAt: null,
  lastReviewedAt: null,
  reviewCount: 0,
  lastRating: null,
  reviewAttempt: null
});
var applicableGrammarAnswer = (event, cardId) => event?.type === "grammar_review_answered" && event.cardId === cardId && typeof event.correct === "boolean" && validDate2(event.occurredAt);
var grammarPoolIds = (points, events) => /* @__PURE__ */ new Set([
  ...(Array.isArray(points) ? points : []).filter((point) => point.studied).map((point) => point.id),
  ...(Array.isArray(events) ? events : []).filter((event) => event?.type === "grammar_pool_added" && typeof event.cardId === "string").map((event) => event.cardId)
]);
var grammarCatalogCards = (points, poolIds) => (Array.isArray(points) ? points : []).filter((point) => poolIds.has(point.id) && Array.isArray(point.cloze) && point.cloze.length > 0).map((point) => ({ id: point.id, type: "grammar", item: point.japanese, meanings: [point.english].filter(Boolean) }));
var foldGrammar = (cards, events) => ((list) => Object.fromEntries(
  (Array.isArray(cards) ? cards : []).map(({ id }) => [
    id,
    list.filter((event) => applicableGrammarAnswer(event, id)).toSorted((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)).reduce(scheduleReview, initialGrammarState(id))
  ])
))(Array.isArray(events) ? events : []);
var gradeOf = (state) => ((dueAt) => ({
  isNew: !state || state.status === "unscheduled" || Number(state.reviewCount ?? 0) === 0,
  dueAt: Number.isFinite(dueAt) ? dueAt : Infinity
}))(Date.parse(state?.dueAt ?? ""));
var dueGrammarCardIds = ({ cards, cardStates, now, limit = 20 }) => ((moment) => ((scored) => [
  ...scored.filter(({ grade }) => !grade.isNew && grade.dueAt <= moment).toSorted((left, right) => left.grade.dueAt - right.grade.dueAt),
  ...scored.filter(({ grade }) => grade.isNew)
].slice(0, Math.max(0, limit)).map(({ card }) => card.id))(
  (Array.isArray(cards) ? cards : []).map((card) => ({ card, grade: gradeOf(cardStates?.[card.id]) }))
))(Date.parse(now));
var grammarAnswerEvent = ({ cardId, correct, eventId, now }) => ({
  type: "grammar_review_answered",
  cardId,
  correct,
  eventId,
  occurredAt: new Date(now).toISOString()
});
var grammarPoolAddedEvent = ({ cardId, studyDate: studyDate2, now }) => ({
  type: "grammar_pool_added",
  cardId,
  studyDate: studyDate2,
  occurredAt: new Date(now).toISOString()
});
var jlptLevels = Object.freeze(["N5", "N4", "N3", "N2", "N1"]);
var levelRank = (level) => jlptLevels.indexOf(level);
var nextNewGrammar = (points, poolIds, limit) => (Array.isArray(points) ? points : []).filter((point) => !poolIds.has(point.id) && Array.isArray(point.cloze) && point.cloze.length > 0).toSorted((left, right) => levelRank(left.level) - levelRank(right.level) || left.index - right.index).slice(0, Math.max(0, limit));
var newGrammarAvailable = (points, poolIds) => nextNewGrammar(points, poolIds, Number.MAX_SAFE_INTEGER).length;
var grammarLevelSummary = (points, poolIds) => jlptLevels.map((level) => ((inLevel) => ({
  level,
  total: inLevel.length,
  studied: inLevel.filter((point) => point.studied).length,
  inPool: inLevel.filter((point) => poolIds.has(point.id)).length
}))((Array.isArray(points) ? points : []).filter((point) => point.level === level)));

// public/sync-core.mjs
var conflict = (message) => Object.assign(new Error(message), { code: "SYNC_CONFLICT" });
var ordered = (value) => Array.isArray(value) ? value.map(ordered) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])])) : value;
var syncJson = (value) => JSON.stringify(ordered(value));
var isStudyCard = (card) => ["vocabulary", "kanji"].includes(card.type);
var isStudyEvent = (event) => !event.type.startsWith("grammar_");
var limitsOf = (limits, grammar) => Object.fromEntries(
  Object.entries(limits ?? {}).filter(([key]) => key.startsWith("grammar-") === grammar)
);
var portableStudy = ({ version, settings, catalog, customLists, events, studyPlan }) => {
  const { gateMode, gatedApplications, studyListDailyNew, ...portableSettings } = settings;
  return {
    version,
    settings: { ...portableSettings, studyListDailyNew: limitsOf(studyListDailyNew, false) },
    catalog: { ...catalog, cards: catalog.cards.filter(isStudyCard) },
    customLists,
    events: events.filter(isStudyEvent),
    ...studyPlan === void 0 ? {} : {
      studyPlan: { ...studyPlan, dailyLimits: limitsOf(studyPlan.dailyLimits, false) }
    }
  };
};
var retainLocalStudy = (study, local) => {
  const localStudyEvents = local.events.filter(isStudyEvent);
  const events = appendStudyEvents(localStudyEvents, study.events);
  return {
    ...study,
    settings: {
      ...study.settings,
      gateMode: local.settings.gateMode,
      gatedApplications: local.settings.gatedApplications,
      studyListDailyNew: {
        ...study.settings.studyListDailyNew,
        ...limitsOf(local.settings.studyListDailyNew, true)
      }
    },
    catalog: {
      ...study.catalog,
      cards: [...study.catalog.cards, ...local.catalog.cards.filter((card) => !isStudyCard(card))]
    },
    events: [...local.events, ...events.slice(localStudyEvents.length)],
    ...study.studyPlan === void 0 ? {} : {
      studyPlan: {
        ...study.studyPlan,
        dailyLimits: { ...study.studyPlan.dailyLimits, ...limitsOf(local.studyPlan?.dailyLimits, true) }
      }
    }
  };
};
var identity = (event, body) => event.eventId ? `id:${event.eventId}` : `body:${body}`;
var eventBody = (event, cache) => {
  if (!cache || typeof event !== "object" || event === null) return syncJson(event);
  if (!cache.has(event)) cache.set(event, syncJson(event));
  return cache.get(event);
};
var indexEvents = (events, eventBodies) => events.reduce((index, event) => {
  const body = eventBody(event, eventBodies);
  const id = identity(event, body);
  if (index.has(id) && index.get(id).body !== body) throw conflict("One review record differs between devices.");
  if (!index.has(id)) index.set(id, { event, body });
  return index;
}, /* @__PURE__ */ new Map());
var includesEvents = (all, subset) => [...subset].every(([key, { body }]) => all.get(key)?.body === body);
var unionEvents = (first, index, other) => {
  if ([...other].some(([key, { body }]) => index.has(key) && index.get(key).body !== body)) {
    throw conflict("One review record differs between devices.");
  }
  return [...first, ...[...other].filter(([key]) => !index.has(key)).map(([, { event }]) => event)];
};
var appendStudyEvents = (local, incoming) => {
  const localEvents = indexEvents(local);
  const incomingEvents = indexEvents(incoming);
  if (!includesEvents(incomingEvents, localEvents)) {
    throw conflict("Sync paused because the incoming copy is missing local review history.");
  }
  return unionEvents(local, localEvents, incomingEvents);
};

// scripts/review-server.mjs
var syncPath = "/api/sync/state";
var syncRevision = (state) => createHash("sha256").update(syncJson(state)).digest("hex");
var home = define_process_env_default.HOME ?? ".";
var dataHome = define_process_env_default.XDG_DATA_HOME ?? join(home, ".local", "share");
var defaultStateDir = define_process_env_default.LEARNER_STATE_DIR ?? join(dataHome, "leo-sensei-no-nonsense-nihongo");
var defaultPublicDir = fileURLToPath(new URL("../public/", import.meta.url));
var defaultDecksDir = fileURLToPath(new URL("../decks/", import.meta.url));
var defaultWanakanaFile = fileURLToPath(new URL("../node_modules/wanakana/esm/index.js", import.meta.url));
var contentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
});
var emptyStudyPlan = Object.freeze({ version: 2, dailyLimits: {}, customLists: [], customAdditions: {} });
var emptyLexicon = Object.freeze({});
var createSerialQueue = () => /* @__PURE__ */ ((operations) => {
  const runNext = () => operations[0]?.(() => (operations.shift(), runNext()));
  return (operation) => (operations.push(operation), operations.length === 1 ? runNext() : null);
})([]);
var validStudyDateValue = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) && ((timestamp) => Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value)(
  Date.parse([value, "T00:00:00.000Z"].join(""))
);
var recoveryEventIsInspectable = (event) => event && typeof event === "object" && !Array.isArray(event) && typeof event.type === "string" && event.type.length > 0 && (!["bypass_started", "emergency_unlock_granted"].includes(event.type) || typeof event.expiresAt === "string" && Number.isFinite(Date.parse(event.expiresAt)) && (Object.hasOwn(event, "studyDate") ? validStudyDateValue(event.studyDate) : typeof event.occurredAt === "string" && Number.isFinite(Date.parse(event.occurredAt))));
var normalizedStudyPlan = (value = {}) => ({
  version: 2,
  dailyLimits: value?.dailyLimits && typeof value.dailyLimits === "object" ? value.dailyLimits : {},
  customLists: Array.isArray(value?.customLists) ? value.customLists : [],
  customAdditions: value?.customAdditions && typeof value.customAdditions === "object" ? value.customAdditions : {},
  ...value?.library?.version === 1 ? { library: value.library } : {}
});
var deckIdForFile = (file) => String(file ?? "").replace(/\.json$/u, "").replaceAll("---", "-");
var normalizedDecks = (manifest) => (Array.isArray(manifest?.decks) ? manifest.decks : []).map((deck) => ({
  ...deck,
  id: String(deck.id ?? deckIdForFile(deck.file)),
  title: String(deck.title ?? deck.label ?? deck.id ?? deckIdForFile(deck.file))
}));
var dailyLimit = (value) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100 ? Number(value) : null;
var grammarLevels = Object.freeze(["N5", "N4", "N3", "N2", "N1"]);
var grammarStudyListId = (level) => `grammar-${level.toLowerCase()}`;
var grammarStudyListIds = new Set(grammarLevels.map(grammarStudyListId));
var grammarDailyLimits = (limits, fallback) => ((configured) => Object.fromEntries(grammarLevels.map((level, index) => [
  grammarStudyListId(level),
  configured ? dailyLimit(limits?.[grammarStudyListId(level)]) ?? 0 : index === 0 ? fallback : 0
])))(grammarLevels.some((level) => Object.hasOwn(limits ?? {}, grammarStudyListId(level))));
var tableRows = (table) => String(table ?? "").trim().split(/\r?\n/u).map((line) => line.split(String(table ?? "").includes("	") ? "	" : ",").map((cell) => cell.trim())).filter((row) => !/^(japanese|japanese word|word|term)$/iu.test(row[0] ?? ""));
var customItems = (id, offset, table) => tableRows(table).filter((row) => row[0] && row[1] && row[2]).map((row, index) => ({
  _id: `${id}:${offset + index + 1}`,
  _key: `${id}:${offset + index + 1}`,
  type: ["kanji", "vocabulary"].includes(String(row[3] ?? "").toLowerCase()) ? String(row[3]).toLowerCase() : /^[\u4e00-\u9fff]$/u.test(row[0]) ? "kanji" : "vocabulary",
  item: row[0],
  reading: row[1],
  meaning: row[2],
  status: null
}));
var parseCustomList = ({ label, table }) => ((id) => ({
  id,
  label: String(label ?? "").trim(),
  items: customItems(id, 0, table)
}))(`custom-${randomUUID()}`);
var sendJson = (response, status, payload) => (response.writeHead(status, {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8"
}), response.end(JSON.stringify(payload)));
var sendAudio = (response, contentType, body) => (response.writeHead(200, {
  "Cache-Control": "no-store",
  "Content-Length": body.length,
  "Content-Type": contentType
}), response.end(body));
var sendFile = (response, path) => readFile(path, (readError, body) => readError ? sendJson(response, 404, { error: "NOT_FOUND" }) : (response.writeHead(200, { "Content-Type": contentTypes[extname(path)] ?? "application/octet-stream" }), response.end(body)));
var cardSpeechText = (card) => (Array.isArray(card?.readings) ? card.readings : [card?.reading]).flatMap((reading) => String(reading ?? "").split(";")).map((reading) => reading.trim()).find(Boolean) ?? String(card?.item ?? "").trim();
var queuedSpeechTexts = (context) => context.queue.map(({ id }) => context.catalog.cards.find((card) => card.id === id)).map(cardSpeechText).filter(Boolean);
var extraReviewsDoneCount = (context) => ((events) => ((lessonSessionIds) => new Set(events.filter((event) => event.type === "extra_review_answered" && event.correct === true && event.studyDate === context.status.studyDate && !lessonSessionIds.has(event.extraSessionId)).map(({ cardId }) => cardId)).size)(new Set(events.filter((event) => event.type === "extra_session_started" && event.session?.lesson).map(({ extraSessionId }) => extraSessionId))))(effectiveLearningEvents(context.events));
var dailyBase = (context, mode, bypassMinutes, speechAvailable = false, now = (/* @__PURE__ */ new Date()).toISOString()) => ({
  studyDate: context.status.studyDate,
  complete: context.status.complete,
  accessAllowed: context.access.allowed,
  accessReason: context.access.reason,
  bypassUntil: context.access.expiresAt,
  bypassMinutes,
  failOpen: context.status.failOpen,
  error: context.status.error,
  mode: mode ?? context.settings?.gateMode ?? "off",
  speechAvailable,
  progress: context.status.progress,
  firstTry: context.firstTry,
  makeupReviews: context.status.makeupReviews,
  makeupTomorrow: context.status.makeupTomorrow,
  availableReviews: availableExtraReviewCount({
    cards: context.catalog.cards,
    cardStates: context.cardStates,
    session: context.session,
    now
  }),
  extraReviewsDone: extraReviewsDoneCount(context),
  reviewBatchSize: 100,
  todayLesson: ((lesson) => lesson ? {
    total: lesson.session.entries.length,
    completed: (/* @__PURE__ */ new Set([
      ...context.events.filter((event) => event.type === "extra_review_answered" && event.extraSessionId === lesson.extraSessionId && event.correct).map(({ cardId }) => cardId),
      ...Object.values(context.cardStates.cardsById ?? {}).filter(({ cardId, known }) => known && lesson.session.entries.some((entry) => entry.cardId === cardId)).map(({ cardId }) => cardId)
    ])).size
  } : { total: 0, completed: 0 })(context.events.findLast(
    (event) => event.type === "extra_session_started" && event.studyDate === context.status.studyDate && event.session?.lesson && event.session?.dailyPlan
  )),
  queue: context.queue
});
var publicDaily = (context, mode, bypassMinutes, speechAvailable = false, now = (/* @__PURE__ */ new Date()).toISOString(), grammarDrill = null) => ((gate) => ({
  ...dailyBase(context, mode, bypassMinutes, speechAvailable, now),
  complete: gate.complete,
  reviewsComplete: gate.reviewsComplete,
  accessAllowed: gate.access.allowed,
  accessReason: gate.access.reason,
  bypassUntil: gate.access.expiresAt,
  grammarDrill
}))(withGrammarDrillAccess({ complete: context.status.complete, access: context.access, bypass: context.status.bypass }, grammarDrill));
var publicExtra = (context, extra, mode, bypassMinutes, speechAvailable = false, now = (/* @__PURE__ */ new Date()).toISOString(), grammarDrill = null) => ((daily) => ({
  ...daily,
  complete: extra.queue.length === 0,
  reviewsComplete: extra.queue.length === 0,
  dailyComplete: daily.complete,
  accessAllowed: true,
  accessReason: "extra_review",
  extra: true,
  practice: Boolean(extra.practice),
  lesson: Boolean(extra.lesson),
  more: Boolean(extra.more),
  extraSessionId: extra.extraSessionId,
  firstTry: extra.firstTry,
  progress: {
    scheduled: {
      required: extra.required,
      attempted: extra.attempted,
      eventuallyCorrect: extra.correct,
      accuracy: extra.required === 0 ? 1 : extra.correct / extra.required
    },
    reactivations: { required: 0, attempted: 0, eventuallyCorrect: 0, accuracy: 1 }
  },
  queue: extra.queue,
  lessonGroup: extra.lessonGroup,
  lessonCards: extra.lesson ? extra.lessonGroup.cardIds.map((id) => context.catalog.cards.find((card) => card.id === id)).filter(Boolean).map((card) => ({
    id: card.id,
    type: card.type,
    item: card.item,
    readings: card.readings ?? [card.reading].filter(Boolean),
    onReadings: card.onReadings ?? context.kanjiLexicon?.[String(card.item)]?.onReadings ?? [],
    kunReadings: card.kunReadings ?? context.kanjiLexicon?.[String(card.item)]?.kunReadings ?? [],
    meanings: card.meanings ?? [],
    components: kanjiComponents(card, context.kanjiLexicon)
  })) : []
}))(publicDaily(context, mode, bypassMinutes, speechAvailable, now, grammarDrill));
var readJsonBody = (request, callback) => text(request).then((body) => parseJsonResult(body || "{}", callback)).catch((bodyError) => callback({ ok: false, error: bodyError.message }));
var readJsonFile = (path, callback) => readFile(path, "utf8", (readError, source) => readError ? callback({ ok: false, error: readError.message }) : parseStoredJson(path, source, callback));
var readOptionalJsonFile = (path, fallback, callback) => readFile(path, "utf8", (readError, source) => readError?.code === "ENOENT" ? callback({ ok: true, value: structuredClone(fallback) }) : readError ? callback({ ok: false, error: readError.message }) : parseStoredJson(path, source, callback));
var readStudyPlan = (path, callback) => readOptionalJsonFile(path, emptyStudyPlan, (result) => callback(
  result.ok ? { ok: true, value: normalizedStudyPlan(result.value) } : result
));
var readKanjiLexicon = (path, callback) => readOptionalJsonFile(path, null, (result) => callback(
  result.ok ? { ok: true, value: result.value?.entries ?? result.value ?? emptyLexicon } : result
));
var publicDeckManifest = (manifest) => ({
  version: manifest.version,
  disclaimer: manifest.disclaimer,
  source: manifest.source,
  decks: normalizedDecks(manifest).map((deck, index, decks) => ({
    ...deck,
    cumulativeCards: decks.slice(0, index + 1).reduce((total, candidate) => total + Number(candidate.cards ?? 0), 0),
    includedDeckIds: decks.slice(0, index + 1).map(({ id }) => id)
  }))
});
var safeDeckFile = (file) => typeof file === "string" && normalize(file) === file && !file.startsWith("..") && !file.includes("/") && !file.includes("\\");
var readDeckDocuments = (decksDir, decks, callback, documents = []) => decks.length === 0 ? callback({ ok: true, value: documents }) : safeDeckFile(decks[0].file) ? readJsonFile(join(decksDir, decks[0].file), (result) => result.ok ? readDeckDocuments(decksDir, decks.slice(1), callback, [...documents, result.value]) : callback(result)) : callback({ ok: false, error: "Deck manifest contains an unsafe file path." });
var targetDecks = (manifest, deckId) => ((index) => index < 0 ? { ok: false, error: "Unknown bundled deck." } : { ok: true, value: normalizedDecks(manifest).slice(0, index + 1) })(
  normalizedDecks(manifest).findIndex(({ id }) => id === deckId)
);
var installedDeckState = (state, deckEntries, documents, studyPlan) => ((cards, deckIds) => ({
  ok: true,
  value: {
    ...state,
    studyPlan,
    catalog: {
      ...state.catalog,
      cards: [...new Map([
        ...state.catalog.cards ?? [],
        ...cards
      ].map((card) => [card.id, card])).values()],
      jlpt: {
        decks: [
          ...(state.catalog.jlpt?.decks ?? []).filter(({ id }) => !deckIds.has(id)),
          ...documents.filter(({ cards: cards2 }) => Array.isArray(cards2)).map((deck) => ({
            id: deck.id,
            level: deck.level,
            type: deck.type,
            total: deck.cards.length,
            knownAtImport: 0
          }))
        ]
      }
    }
  }
}))(documents.flatMap((deck) => deck.cards ?? []), new Set(deckEntries.map(({ id }) => id)));
var selectedStudyListDecks = (manifest, plan, dailyLimits) => ((entries, unknown) => unknown ? { ok: false, error: `Unknown bundled deck: ${unknown}` } : { ok: true, value: entries.filter(({ id }) => Number(dailyLimits[id] ?? 0) > 0) })(
  studyDecks(manifest, plan).filter(({ file }) => file),
  Object.keys(dailyLimits ?? {}).find((id) => !grammarStudyListIds.has(id) && !studyDecks(manifest, plan).some((deck) => deck.id === id))
);
var deckProgress = (context, deck) => ((cards) => ((states) => ((total) => ((stages) => ((started) => ({
  known: Math.min(cards.filter((card) => states[card.id]?.known).length, total),
  learning: stages.reduce((sum, count) => sum + count, 0),
  unstarted: Math.max(0, total - started),
  total,
  stages
}))(Math.min(total, cards.filter((card) => states[card.id]?.known).length + stages.reduce((sum, count) => sum + count, 0))))(
  Array.from({ length: 9 }, (_, index) => cards.filter((card) => !states[card.id]?.known && Number(states[card.id]?.stage) === index + 1).length)
))(Number(deck.cards ?? cards.length) + Number(deck.extraItems?.length ?? 0)))(context.cardStates.cardsById ?? {}))(
  context.catalog.cards.filter((card) => card.provenance?.jlpt?.deckIds?.includes(deck.id) || card.provenance?.customListId === deck.id)
);
var syncedLibrary = (manifest, plan) => usesLegacyDeckDocuments(manifest) ? void 0 : plan.library;
var studyLibraryPending = (manifest, plan) => !usesLegacyDeckDocuments(manifest) && !syncedLibrary(manifest, plan) && Object.keys(plan.dailyLimits).some((id) => id.startsWith("jlpt-"));
var studyDecks = (manifest, plan) => [
  ...(syncedLibrary(manifest, plan)?.decks.map((deck) => ({ ...deck, cards: deck.items.length })) ?? normalizedDecks(manifest)).map((deck) => ({
    ...deck,
    extraItems: plan.customAdditions[deck.id] ?? []
  })),
  ...plan.customLists.map((list) => ({
    id: list.id,
    title: list.label,
    cards: list.items.length,
    items: list.items,
    custom: true
  }))
];
var validStudyListLimits = (manifest, plan, limits) => limits !== null && typeof limits === "object" && !Array.isArray(limits) && ((allowedIds) => Object.entries(limits).every(([id, limit]) => allowedIds.has(id) && dailyLimit(limit) !== null))(
  /* @__PURE__ */ new Set([...studyDecks(manifest, plan).map(({ id }) => id), ...grammarStudyListIds])
);
var publicStudyLists = (context, manifest, plan = emptyStudyPlan) => ({
  libraryPending: studyLibraryPending(manifest, plan),
  lists: studyDecks(manifest, plan).map((deck) => ({
    id: deck.id,
    label: deck.title,
    custom: Boolean(deck.custom),
    ...deck.custom ? { items: deck.items } : {},
    dailyNew: Number(plan.dailyLimits[deck.id] ?? context.settings.studyListDailyNew?.[deck.id] ?? 0),
    progress: deckProgress(context, deck)
  }))
});
var itemMeanings = (item) => (Array.isArray(item?.meanings) ? item.meanings : String(item?.meaning ?? "").split(/[;,]/u)).map((meaning) => String(meaning ?? "").trim()).filter(Boolean);
var studyListItem = (context, cardsById = new Map(context.catalog.cards.map((card) => [card.id, card]))) => (item) => ((id) => ((card) => ((state) => ({
  id,
  item: String(card?.item ?? item?.item ?? ""),
  reading: String(card?.reading ?? item?.reading ?? item?.mainReading ?? ""),
  meanings: Array.isArray(card?.meanings) ? card.meanings : itemMeanings(item),
  type: String(card?.type ?? item?.type ?? "vocabulary").toLowerCase(),
  level: Number.isInteger(state?.stage) ? state.stage : null
}))(context.cardStates.cardsById?.[id]))(cardsById.get(id)))(String(item?._id ?? item?.id ?? ""));
var validProgressType = (type) => ["kanji", "vocabulary"].includes(type);
var progressItems = (context, type, bandId) => ((band) => band && validProgressType(type) ? {
  ok: true,
  value: {
    id: `${type}:${band.id}`,
    label: `${type === "kanji" ? "Kanji" : "Vocabulary"} \xB7 ${band.label}`,
    custom: false,
    practice: true,
    type,
    band: band.id,
    items: progressBandCards({
      catalog: context.catalog,
      cardStates: context.cardStates,
      type,
      bandId: band.id
    }).map(studyListItem(context))
  }
} : { ok: false, error: "Progress category not found." })(progressBandFor(bandId));
var readStudyListItems = (decksDir, deck, callback) => Array.isArray(deck?.items) ? callback({ ok: true, value: [...deck.items, ...deck.extraItems ?? []] }) : safeDeckFile(deck?.file) ? readJsonFile(join(decksDir, deck.file), (result) => callback(result.ok ? { ok: true, value: [...result.value.items ?? result.value.cards ?? [], ...deck.extraItems ?? []] } : result)) : callback({ ok: false, error: "Study list has an unsafe file path." });
var configuredLessonPlans = (manifest, plan, decksDir) => studyDecks(manifest, plan).map((deck) => ({ ...deck, limit: dailyLimit(plan.dailyLimits[deck.id]) ?? 0 })).map(({ file, id, items, extraItems, limit }) => Array.isArray(items) ? { deckId: id, items: [...items, ...extraItems ?? []], limit } : { deckFile: join(decksDir, file), deckId: id, extraItems, limit });
var usesLegacyDeckDocuments = (manifest) => (manifest.decks ?? []).some((deck) => typeof deck.id !== "string");
var portableDeckItem = (item) => ({
  _id: String(item._id),
  _key: String(item._key ?? ""),
  item: String(item.item),
  type: String(item.type ?? "vocabulary").toLowerCase(),
  reading: String(item.reading ?? item.mainReading ?? ""),
  mainReading: String(item.mainReading ?? ""),
  meaning: String(item.meaning ?? "")
});
var readLocalStudyLibrary = (decksDir, knownFile, callback) => readJsonFile(join(decksDir, "manifest.json"), (manifest) => !manifest.ok || !usesLegacyDeckDocuments(manifest.value) ? callback({ ok: true, value: void 0 }) : ((decks) => readDeckDocuments(decksDir, decks, (documents) => !documents.ok ? callback(documents) : readJsonFile(knownFile, (known) => {
  if (!known.ok) return callback(known);
  const value = {
    version: 1,
    knownIds: Array.isArray(known.value.ids) ? known.value.ids.map(String) : [],
    decks: decks.map(({ id, title }, index) => ({
      id,
      title,
      items: (documents.value[index].items ?? []).filter((item) => item?._id && item?.item).map(portableDeckItem)
    }))
  };
  return callback(validStudyLibrary(value) ? { ok: true, value } : { ok: false, error: "The local study library is invalid." });
})))(normalizedDecks(manifest.value)));
var grammarReviewableCount = (value, now) => dueGrammarCardIds({
  cards: value.cards,
  cardStates: value.cardStates,
  now,
  limit: Number.MAX_SAFE_INTEGER
}).length;
var grammarDueNow = (value, now) => value.cards.filter((card) => ((state) => state && Number(state.reviewCount ?? 0) > 0 && Number.isFinite(Date.parse(state.dueAt ?? "")) && Date.parse(state.dueAt) <= Date.parse(now))(value.cardStates[card.id])).length;
var grammarNewCount = (value) => value.cards.filter((card) => ((state) => !state || Number(state.reviewCount ?? 0) === 0)(value.cardStates[card.id])).length;
var grammarProgress = (value) => ((levels) => ((reviewed) => ({
  total: value.points.length,
  added: value.poolIds.size,
  notAdded: Math.max(0, value.points.length - value.poolIds.size),
  reviewable: value.cards.length,
  awaitingReview: Math.max(0, value.cards.length - reviewed),
  reviewed,
  lessonOnly: Math.max(0, value.poolIds.size - value.cards.length),
  levels
}))(levels.reduce((total, count) => total + count, 0)))(Array.from(
  { length: 9 },
  (_, index) => value.cards.filter((card) => Number(value.cardStates[card.id]?.stage) === index + 1).length
));
var grammarAddedByLevel = (value, date) => ((addedIds) => Object.fromEntries(grammarLevels.map((level) => [
  grammarStudyListId(level),
  [...addedIds].filter((id) => value.byId[id]?.level === level).length
])))(new Set(value.events.filter((event) => event?.type === "grammar_pool_added" && event.studyDate === date).map((event) => event.cardId)));
var nextNewGrammarByLevel = (points, poolIds, limits) => grammarLevels.flatMap((level) => nextNewGrammar(
  points.filter((point) => point.level === level),
  poolIds,
  limits[grammarStudyListId(level)] ?? 0
));
var grammarClozeQuestion = (point) => ((cloze) => cloze ? {
  cardId: point.id,
  level: point.level,
  label: point.japanese,
  meaning: point.english,
  hint: point.englishHint ?? "",
  clozeIndex: cloze.index,
  before: cloze.before,
  after: cloze.after
} : null)(pickCloze(point));
var grammarQuestionsFor = (value, ids) => ids.map((id) => grammarClozeQuestion(value.byId[id])).filter(Boolean);
var routeKey = (request, url) => `${request.method ?? "GET"} ${url.pathname}`;
var mutationTokenMatches = (request, expected) => ((received) => typeof received === "string" && Buffer.byteLength(received) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(received), Buffer.from(expected)))(request.headers["x-leo-sensei-mutation-token"]);
var loopbackHost = (request) => /^127\.0\.0\.1(?::\d+)?$/u.test(String(request.headers.host ?? ""));
var jsonMutation = (request, url) => request.method === "GET" || !url.pathname.startsWith("/api/") || String(request.headers["content-type"] ?? "").toLowerCase().split(";", 1)[0].trim() === "application/json";
var apiHandler = ({
  bypassMinutes,
  catalogFile,
  customListsFile,
  decksDir,
  deferReviewNotes,
  eventsFile,
  grammarDrill,
  grammarFile,
  grammarNewLimit,
  kanjiLexiconFile,
  referenceFile,
  referenceIndex,
  project,
  recentReviewReferences,
  knownItemsFile,
  settingsFile,
  studyPlanFile,
  now,
  mode,
  mutationToken,
  serializeBypass,
  speech,
  resolveTimeZone
}) => (request, response, url) => {
  const timeZone = resolveTimeZone();
  const files2 = { catalogFile, customListsFile, eventsFile, grammarFile, settingsFile, studyPlanFile };
  const drillStatus = () => grammarDrillStatus({ snapshot: grammarDrill.current(), now: now(), timeZone });
  const dailyPayload = (context) => publicDaily(context, mode, bypassMinutes, speech.available, now(), drillStatus());
  const extraPayload = (context, extra) => publicExtra(context, extra, mode, bypassMinutes, speech.available, now(), drillStatus());
  const withFreshDrill = (callback) => grammarDrill.refresh().then(() => callback(), () => callback());
  const feedbackPayload = (recorded, updated, cardId) => ({
    ...recorded.value.feedback,
    ...recorded.value.feedback.retry ? {} : { level: Number.isInteger(updated.cardStates.cardsById?.[cardId]?.stage) ? updated.cardStates.cardsById[cardId].stage : null }
  });
  const reference = () => referenceIndex ? Promise.resolve(referenceIndex) : readStudyReference(referenceFile);
  const cardReference = (card) => referenceIndex ? reference() : readReferenceForCard(referenceFile, card);
  const studiedItems = (context) => new Set(context.catalog.cards.filter((card) => context.cardStates.cardsById?.[card.id]?.known || Number.isInteger(context.cardStates.cardsById?.[card.id]?.stage)).map((card) => card.item));
  const referenceContext = (context) => ({ kanjiLexicon: context.kanjiLexicon, studied: studiedItems(context) });
  const confusionsFor = (card, feedback, context, index) => likelyConfusions({
    card,
    feedback,
    cards: context.catalog.cards,
    cardStates: context.cardStates.cardsById,
    events: context.events,
    index
  });
  const sendFeedback = (recorded, updated, cardId, daily) => {
    const feedback = feedbackPayload(recorded, updated, cardId);
    const card = updated.catalog.cards.find(({ id }) => id === cardId);
    if (card && feedback.answerEventId && !feedback.retry) {
      recentReviewReferences.set(feedback.answerEventId, { card, feedback, context: updated });
      if (recentReviewReferences.size > 4) recentReviewReferences.delete(recentReviewReferences.keys().next().value);
    }
    const send = (index) => sendJson(response, 200, {
      ...feedback,
      daily,
      confusions: feedback.retry ? [] : confusionsFor(card, feedback, updated, index)
    });
    return feedback.correct === false && !feedback.retry && !deferReviewNotes ? reference().then(send).catch(() => send(createReferenceIndex())) : sendJson(response, 200, { ...feedback, daily, confusions: [] });
  };
  const load = (callback) => readStudyPlan(studyPlanFile, (planResult) => planResult.ok ? readKanjiLexicon(kanjiLexiconFile, (lexiconResult) => lexiconResult.ok ? loadDailyContext({
    catalogFile,
    eventsFile,
    kanjiLexicon: lexiconResult.value,
    settingsFile,
    studyPlan: planResult.value,
    now: now(),
    timeZone,
    project
  }, callback) : callback(lexiconResult)) : callback(planResult));
  const readPairWords = () => Promise.all([
    new Promise((resolve) => readStudyPlan(studyPlanFile, resolve)),
    new Promise((resolve) => readJsonFile(join(decksDir, "manifest.json"), resolve))
  ]).then(([plan, manifest]) => manifest.ok && plan.ok ? Promise.all(studyDecks(manifest.value, plan.value).map(
    (deck) => new Promise((resolve) => readStudyListItems(decksDir, deck, resolve))
  )).then((results) => results.flatMap((result) => result.ok ? result.value : [])) : []);
  const withPairDictionary = (type, callback) => readOptionalJsonFile(catalogFile, { cards: [] }, (catalog) => {
    if (!catalog.ok || !Array.isArray(catalog.value?.cards)) {
      return sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: "Could not read the study catalog." });
    }
    const sources = type === "kanji" ? Promise.all([
      reference().catch(() => null),
      new Promise((resolve) => readKanjiLexicon(kanjiLexiconFile, resolve))
    ]).then(([index, lexicon]) => ({ kanji: index?.data.kanji, lexicon: lexicon.value })) : readPairWords().then((words) => ({ words }));
    return sources.then((data) => callback(createPairDictionary({ type, cards: catalog.value.cards, ...data })));
  });
  const withSavedPairs = (callback) => readJsonLines(eventsFile, (result) => result.ok ? callback(savedStudyPairs(result.value)) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: "Could not read your saved pairs." }));
  const publicPair = ({ key, type, items }) => ({ key, type, items });
  const publicGroup = ({ links, ...group }) => ({
    ...group,
    links: links.map(({ key, items }) => ({ key, labels: items.map(({ item }) => item) }))
  });
  const groupContaining = (pairs, type, id) => studyGroups(pairs).find((group) => group.type === type && group.items.some((entry) => entry.id === id));
  const getStudyPairs = () => withSavedPairs((saved) => {
    const item = url.searchParams.get("item");
    const type = url.searchParams.get("type");
    if (url.searchParams.has("groups")) {
      const groups = studyGroups(saved.values());
      if (url.searchParams.has("summary")) return sendJson(response, 200, { count: groups.length });
      if (item && pairType(type)) {
        const group = groups.find((candidate) => candidate.type === type && candidate.items.some(({ id }) => id === item));
        return sendJson(response, 200, { group: group ? publicGroup(group) : null });
      }
      return sendJson(response, 200, { groups: groups.map(publicGroup), questions: studyGroupQuestions(groups) });
    }
    if (url.searchParams.has("summary")) return sendJson(response, 200, { count: saved.size });
    const pairs = [...saved.values()].map(publicPair);
    return sendJson(response, 200, item && pairType(type) ? { pairs: pairs.filter((pair) => pair.type === type && pair.items.some(({ id }) => id === item)) } : { pairs, questions: studyGroupQuestions(pairs) });
  });
  const getStudyPairLesson = () => withSavedPairs((saved) => {
    const key = url.searchParams.get("key");
    const group = url.searchParams.has("groups") ? studyGroups(saved.values()).find((candidate) => candidate.key === key) : saved.get(key);
    if (!group) return sendJson(response, 404, { error: "STUDY_GROUP_NOT_FOUND", message: "This selection is no longer saved." });
    return Promise.all(group.items.map((entry) => {
      const card = studyPairLessonCard(group.type, entry);
      return cardReference(card).then((index) => studyPairLessonNotes(card, index)).catch(() => ({}));
    })).then((notes) => sendJson(response, 200, { notes }));
  });
  const searchStudyPairs = () => {
    const query = String(url.searchParams.get("q") ?? "").trim();
    const item = url.searchParams.get("item");
    const type = url.searchParams.get("type");
    return !pairType(type) || !query || query.length > 64 ? sendJson(response, 200, { matches: [] }) : withPairDictionary(type, (dictionary) => sendJson(response, 200, { matches: dictionary.search(query, item) }));
  };
  const writeStudyPair = (event, status, value) => appendJsonLine(eventsFile, {
    ...event,
    eventId: randomUUID(),
    occurredAt: now()
  }, (result) => result.ok ? sendJson(response, status, value) : sendJson(response, 503, { error: "SAVE_FAILED", message: "Could not save this change. Try again." }));
  const saveStudyPair = () => readJsonBody(request, (result) => {
    const { type, item, other } = result.value ?? {};
    const key = typeof item === "string" && typeof other === "string" && studyPairKey(type, item, other);
    if (!key) return sendJson(response, 400, { error: "INVALID_STUDY_PAIR", message: "Choose two different items." });
    return withSavedPairs((saved) => {
      const resultWithGroup = (pair) => {
        if (!url.searchParams.has("groups")) return { pair: publicPair(pair) };
        const group = groupContaining(new Map(saved).set(pair.key, pair).values(), type, pair.items[0].id);
        return { pair: publicPair(pair), group: publicGroup(group) };
      };
      const existing = saved.get(key);
      if (existing) return sendJson(response, 200, resultWithGroup(existing));
      return withPairDictionary(type, (dictionary) => {
        const items = [item, other].sort().map(dictionary.entry);
        if (!items.every(Boolean)) {
          return sendJson(response, 404, { error: "STUDY_ITEM_NOT_FOUND", message: "Could not find both items in the study catalog." });
        }
        if (items[0].id === items[1].id) {
          return sendJson(response, 400, { error: "INVALID_STUDY_PAIR", message: "Choose two different items." });
        }
        const pair = { key: studyPairKey(type, ...items.map(({ id }) => id)), type, items };
        return writeStudyPair({ type: "study_pair_saved", itemType: type, items }, 201, resultWithGroup(pair));
      });
    });
  });
  const removeStudyPair = () => readJsonBody(request, (result) => {
    const key = result.value?.key;
    if (typeof key !== "string") return sendJson(response, 400, { error: "INVALID_STUDY_PAIR", message: "Choose a pair to remove." });
    return withSavedPairs((saved) => {
      const existing = saved.get(key);
      return existing ? writeStudyPair({ type: "study_pair_removed", savedEventIds: existing.savedEventIds }, 200, { key }) : sendJson(response, 200, { key });
    });
  });
  const prewarmSpeechQueue = (context) => speech.available ? queuedSpeechTexts(context).reduce(
    (ready, text4) => ready.then(() => new Promise((resolve) => speech.request(text4, resolve))),
    Promise.resolve()
  ) : null;
  const getDaily = () => withFreshDrill(() => load((result) => result.ok ? (sendJson(response, 200, dailyPayload(result.value)), prewarmSpeechQueue(result.value)) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: result.error, failOpen: true })));
  const getStatus = () => withFreshDrill(() => load((result) => result.ok ? sendJson(response, 200, dailyPayload(result.value)) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: result.error, failOpen: true })));
  const getSettings = () => readOptionalJsonFile(settingsFile, defaultLearnerSettings(), (result) => ((settings) => result.ok && settings.ok ? sendJson(response, 200, settings.value) : sendJson(response, 503, {
    error: "SETTINGS_UNAVAILABLE",
    message: result.ok ? settings.error.issues.map(({ message }) => message).join(" ") : result.error
  }))(result.ok ? normalizeLearnerSettings(result.value) : result));
  const getDecks = () => readJsonFile(join(decksDir, "manifest.json"), (manifestResult) => manifestResult.ok ? sendJson(response, 200, publicDeckManifest(manifestResult.value)) : sendJson(response, 503, { error: "DECKS_UNAVAILABLE", message: manifestResult.error }));
  const getStudyLists = () => load((contextResult) => contextResult.ok ? readJsonFile(join(decksDir, "manifest.json"), (manifestResult) => manifestResult.ok ? sendJson(response, 200, publicStudyLists(contextResult.value, manifestResult.value, contextResult.value.studyPlan)) : sendJson(response, 503, { error: "DECKS_UNAVAILABLE", message: manifestResult.error })) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: contextResult.error }));
  const getStudyListItems = (listId) => load((contextResult) => contextResult.ok ? readJsonFile(join(decksDir, "manifest.json"), (manifestResult) => ((deck) => !manifestResult.ok ? sendJson(response, 503, { error: "DECKS_UNAVAILABLE", message: manifestResult.error }) : !deck ? sendJson(response, 404, { error: "STUDY_LIST_NOT_FOUND" }) : readStudyListItems(decksDir, deck, (itemsResult) => itemsResult.ok ? sendJson(response, 200, {
    id: deck.id,
    label: deck.title,
    custom: Boolean(deck.custom),
    items: itemsResult.value.map(studyListItem(contextResult.value))
  }) : sendJson(response, 503, { error: "STUDY_LIST_UNAVAILABLE", message: itemsResult.error })))(
    manifestResult.ok ? studyDecks(manifestResult.value, contextResult.value.studyPlan).find(({ id }) => id === listId) : null
  )) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: contextResult.error }));
  const getProgressItems = (type, bandId) => load((loaded) => ((result) => !loaded.ok ? sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error }) : result.ok ? sendJson(response, 200, result.value) : sendJson(response, 404, { error: "PROGRESS_CATEGORY_NOT_FOUND", message: result.error }))(
    loaded.ok ? progressItems(loaded.value, type, bandId) : loaded
  ));
  const sendReference = (card, { kanjiLexicon, studied }, decorate = (detail) => detail) => cardReference(card).then((index) => sendJson(response, 200, decorate(studyReference({
    card,
    index,
    lexicon: kanjiLexicon,
    studied
  }), index))).catch(() => sendJson(response, 503, { error: "REFERENCE_UNAVAILABLE", message: "The study reference could not be loaded. Close this panel and try again." }));
  const getKanji = () => ((literal) => !/^[\p{Script=Han}⺀-⻳]$/u.test(literal) ? sendJson(response, 400, { error: "INVALID_KANJI" }) : load((result) => !result.ok ? sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: result.error }) : sendReference({ item: literal, type: "kanji" }, referenceContext(result.value))))(String(url.searchParams.get("literal") ?? ""));
  const sendCardReference = (card, context, decorate) => !card ? sendJson(response, 404, { error: "CARD_NOT_FOUND" }) : !card.item || [...card.item].length > 128 || !["kanji", "vocabulary"].includes(card.type) ? sendJson(response, 400, { error: "INVALID_REFERENCE_ITEM" }) : sendReference(card, context, decorate);
  const sendAnswerReference = (card, context, feedback) => sendCardReference(card, referenceContext(context), (detail, index) => ({
    ...detail,
    confusions: feedback.correct ? [] : confusionsFor(card, feedback, context, index)
  }));
  const getReference = () => {
    const id = url.searchParams.get("id");
    const answer = url.searchParams.get("answer");
    const recent = recentReviewReferences.get(answer);
    if (recent && recent.card.id === id) return sendCardReference(recent.card, referenceContext(recent.context));
    return load((result) => {
      if (!result.ok) return sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: result.error });
      const card = id ? result.value.catalog.cards.find((candidate) => candidate.id === id) : {
        item: String(url.searchParams.get("item") ?? "").trim(),
        type: url.searchParams.get("type") ?? "vocabulary",
        reading: String(url.searchParams.get("reading") ?? "").trim()
      };
      const event = deferReviewNotes && card && answer && result.value.events.findLast((candidate) => candidate.eventId === answer && candidate.cardId === id && isReviewAnswerEvent(candidate));
      if (event) return sendAnswerReference(card, result.value, {
        correct: event.correct,
        readingCorrect: event.readingCorrect,
        meaningCorrect: event.meaningCorrect,
        submittedReading: event.answers?.reading,
        submittedMeaning: event.answers?.meaning,
        submittedReverse: event.answers?.reverse
      });
      return sendCardReference(card, referenceContext(result.value));
    });
  };
  const getReviewNotes = () => {
    const recent = recentReviewReferences.get(url.searchParams.get("answer"));
    if (!recent || recent.card.id !== url.searchParams.get("id")) return sendJson(response, 404, { error: "ANSWER_NOT_CACHED" });
    const { card, context, feedback } = recent;
    return sendAnswerReference(card, context, feedback);
  };
  const persistStudyPlan = (plan, callback) => readLearnerState({ files: files2 }, (stateResult) => stateResult.ok ? writeLearnerState({ files: files2, state: { ...stateResult.value, studyPlan: normalizedStudyPlan(plan) } }, callback) : callback(stateResult));
  const respondWithStudyLists = (status, plan, callback = () => void 0) => persistStudyPlan(plan, (written) => written.ok ? load((loaded) => loaded.ok ? readJsonFile(join(decksDir, "manifest.json"), (manifestResult) => manifestResult.ok ? (sendJson(response, status, publicStudyLists(loaded.value, manifestResult.value, normalizedStudyPlan(plan))), callback()) : sendJson(response, 503, { error: "DECKS_UNAVAILABLE", message: manifestResult.error })) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error })) : sendJson(response, 500, { error: "STUDY_PLAN_WRITE_FAILED", message: written.error?.message ?? written.error }));
  const postStudyLists = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? readStudyPlan(studyPlanFile, (planResult) => !planResult.ok ? sendJson(response, 503, { error: "STUDY_PLAN_UNAVAILABLE", message: planResult.error }) : readJsonFile(join(decksDir, "manifest.json"), (manifestResult) => ((selection) => !manifestResult.ok ? sendJson(response, 503, { error: "DECKS_UNAVAILABLE", message: manifestResult.error }) : studyLibraryPending(manifestResult.value, planResult.value) ? sendJson(response, 409, { error: "STUDY_LIBRARY_PENDING", message: "Sync your study lists before changing the daily plan." }) : !selection.ok ? sendJson(response, 400, { error: "INVALID_STUDY_LISTS", message: selection.error }) : readDeckDocuments(decksDir, selection.value, (documentsResult) => documentsResult.ok ? readLearnerState({ files: files2 }, (stateResult) => stateResult.ok ? validStudyListLimits(manifestResult.value, normalizedStudyPlan(stateResult.value.studyPlan), bodyResult.value.dailyLimits) ? ((installed) => installed.ok ? writeLearnerState({ files: files2, state: installed.value }, (writeResult) => writeResult.ok ? sendJson(response, 200, {
    installedCards: installed.value.catalog.cards.length - stateResult.value.catalog.cards.length,
    settings: installed.value.settings,
    studyPlan: installed.value.studyPlan
  }) : sendJson(response, 500, { error: "DECK_INSTALL_FAILED", message: writeResult.error.message })) : sendJson(response, 400, { error: "INVALID_STUDY_LISTS", message: installed.error }))(
    installedDeckState(
      stateResult.value,
      selection.value,
      documentsResult.value,
      {
        ...normalizedStudyPlan(stateResult.value.studyPlan),
        dailyLimits: Object.fromEntries(Object.entries(bodyResult.value.dailyLimits).map(([id, limit]) => [id, dailyLimit(limit)]))
      }
    )
  ) : sendJson(response, 400, { error: "INVALID_STUDY_LISTS", message: "Study-list limits are invalid." }) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: stateResult.error.message })) : sendJson(response, 503, { error: "DECKS_UNAVAILABLE", message: documentsResult.error })))(manifestResult.ok ? selectedStudyListDecks(manifestResult.value, planResult.value, bodyResult.value.dailyLimits ?? {}) : manifestResult))) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const postCustomStudyList = () => readJsonBody(request, (bodyResult) => ((list) => !bodyResult.ok ? sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }) : !list.label || list.items.length === 0 ? sendJson(response, 400, { error: "INVALID_CUSTOM_LIST" }) : readStudyPlan(studyPlanFile, (planResult) => planResult.ok ? respondWithStudyLists(201, {
    ...planResult.value,
    customLists: [...planResult.value.customLists, list]
  }) : sendJson(response, 503, { error: "STUDY_PLAN_UNAVAILABLE", message: planResult.error })))(
    bodyResult.ok ? parseCustomList(bodyResult.value) : { label: "", items: [] }
  ));
  const postCustomWords = (listId) => readJsonBody(request, (bodyResult) => readStudyPlan(studyPlanFile, (planResult) => readJsonFile(join(decksDir, "manifest.json"), (manifestResult) => ((list, deck, existing) => ((items) => !bodyResult.ok ? sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }) : !planResult.ok || !manifestResult.ok ? sendJson(response, 503, { error: "STUDY_LISTS_UNAVAILABLE" }) : !(list || deck) || items.length === 0 ? sendJson(response, 400, { error: "INVALID_CUSTOM_WORD" }) : respondWithStudyLists(200, list ? {
    ...planResult.value,
    customLists: planResult.value.customLists.map((candidate) => candidate.id === listId ? { ...candidate, items: [...candidate.items, ...items] } : candidate)
  } : {
    ...planResult.value,
    customAdditions: { ...planResult.value.customAdditions, [listId]: [...existing, ...items] }
  }))(customItems(list?.id ?? `addition:${listId}`, existing.length, bodyResult.value?.table)))(
    planResult.ok ? planResult.value.customLists.find(({ id }) => id === listId) : null,
    manifestResult.ok && planResult.ok ? studyDecks(manifestResult.value, planResult.value).find(({ id }) => id === listId) : null,
    planResult.ok ? planResult.value.customLists.find(({ id }) => id === listId)?.items ?? planResult.value.customAdditions[listId] ?? [] : []
  ))));
  const patchCustomStudyList = (listId) => readJsonBody(request, (bodyResult) => readStudyPlan(studyPlanFile, (planResult) => ((label, list) => !bodyResult.ok ? sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }) : !planResult.ok ? sendJson(response, 503, { error: "STUDY_PLAN_UNAVAILABLE", message: planResult.error }) : !list ? sendJson(response, 404, { error: "CUSTOM_LIST_NOT_FOUND" }) : !label ? sendJson(response, 400, { error: "INVALID_CUSTOM_LIST" }) : respondWithStudyLists(200, {
    ...planResult.value,
    customLists: planResult.value.customLists.map((candidate) => candidate.id === listId ? { ...candidate, label } : candidate)
  }))(
    String(bodyResult.value?.label ?? "").trim(),
    planResult.ok ? planResult.value.customLists.find(({ id }) => id === listId) : null
  )));
  const deleteCustomWord = (listId, itemId) => readStudyPlan(studyPlanFile, (planResult) => ((list, exists) => !planResult.ok ? sendJson(response, 503, { error: "STUDY_PLAN_UNAVAILABLE", message: planResult.error }) : !list || !exists ? sendJson(response, 404, { error: "CUSTOM_WORD_NOT_FOUND" }) : respondWithStudyLists(200, {
    ...planResult.value,
    customLists: planResult.value.customLists.map((candidate) => candidate.id === listId ? { ...candidate, items: candidate.items.filter(({ _id }) => _id !== itemId) } : candidate)
  }))(
    planResult.ok ? planResult.value.customLists.find(({ id }) => id === listId) : null,
    planResult.ok ? planResult.value.customLists.find(({ id }) => id === listId)?.items.some(({ _id }) => _id === itemId) : false
  ));
  const deleteCustomStudyList = (listId) => readStudyPlan(studyPlanFile, (planResult) => ((exists) => !planResult.ok ? sendJson(response, 503, { error: "STUDY_PLAN_UNAVAILABLE", message: planResult.error }) : !exists ? sendJson(response, 404, { error: "CUSTOM_LIST_NOT_FOUND" }) : respondWithStudyLists(200, {
    ...planResult.value,
    dailyLimits: Object.fromEntries(Object.entries(planResult.value.dailyLimits).filter(([id]) => id !== listId)),
    customLists: planResult.value.customLists.filter(({ id }) => id !== listId)
  }))(
    planResult.ok && planResult.value.customLists.some(({ id }) => id === listId)
  ));
  const postDeckSelection = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? readJsonFile(join(decksDir, "manifest.json"), (manifestResult) => ((selection) => !manifestResult.ok ? sendJson(response, 503, { error: "DECKS_UNAVAILABLE", message: manifestResult.error }) : !selection.ok ? sendJson(response, 400, { error: "INVALID_DECK", message: selection.error }) : readDeckDocuments(decksDir, selection.value, (documentsResult) => documentsResult.ok ? readLearnerState({ files: files2 }, (stateResult) => stateResult.ok ? ((installed) => installed.ok ? writeLearnerState({ files: files2, state: installed.value }, (writeResult) => writeResult.ok ? sendJson(response, 200, {
    deckId: bodyResult.value.deckId,
    includedDeckIds: selection.value.map(({ id }) => id),
    installedCards: installed.value.catalog.cards.length - stateResult.value.catalog.cards.length
  }) : sendJson(response, 500, { error: "DECK_INSTALL_FAILED", message: writeResult.error.message })) : sendJson(response, 400, { error: "INVALID_DECK", message: installed.error }))(
    installedDeckState(stateResult.value, selection.value, documentsResult.value, {
      ...normalizedStudyPlan(stateResult.value.studyPlan),
      dailyLimits: { [bodyResult.value.deckId]: 10 }
    })
  ) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: stateResult.error.message })) : sendJson(response, 503, { error: "DECKS_UNAVAILABLE", message: documentsResult.error })))(manifestResult.ok ? targetDecks(manifestResult.value, bodyResult.value.deckId) : manifestResult)) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const getLesson = () => load((loaded) => loaded.ok ? ((event) => event ? loadExtraContext({ context: loaded.value, extraSessionId: event.extraSessionId }, (lesson) => lesson.ok ? sendJson(response, 200, extraPayload(loaded.value, lesson.value)) : sendJson(response, 404, { error: "LESSON_NOT_FOUND", message: lesson.error })) : sendJson(response, 404, { error: "LESSON_NOT_FOUND" }))(loaded.value.events.findLast(
    (event) => event.type === "extra_session_started" && event.studyDate === loaded.value.session.studyDate && event.session?.lesson && event.session?.dailyPlan
  )) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error }));
  const postTodayLesson = () => readJsonBody(request, (bodyResult) => !bodyResult.ok ? sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }) : load((loaded) => loaded.ok ? readJsonFile(join(decksDir, "manifest.json"), (manifestResult) => !manifestResult.ok ? sendJson(response, 503, { error: "DECKS_UNAVAILABLE", message: manifestResult.error }) : usesLegacyDeckDocuments(manifestResult.value) || syncedLibrary(manifestResult.value, loaded.value.studyPlan) ? startLesson({
    context: loaded.value,
    catalogFile,
    dailyPlan: bodyResult.value?.more !== true,
    more: bodyResult.value?.more === true,
    eventsFile,
    knownFile: knownItemsFile,
    knownIds: syncedLibrary(manifestResult.value, loaded.value.studyPlan)?.knownIds,
    now: now(),
    plans: configuredLessonPlans(manifestResult.value, loaded.value.studyPlan, decksDir)
  }, (lesson) => lesson.ok ? (sendJson(
    response,
    lesson.created ? 201 : 200,
    extraPayload({ ...loaded.value, catalog: lesson.value.catalog }, lesson.value)
  ), prewarmSpeechQueue({ catalog: lesson.value.catalog, queue: lesson.value.queue })) : sendJson(response, 400, { error: "LESSON_UNAVAILABLE", message: lesson.error })) : startDailyLesson(
    {
      context: loaded.value,
      eventsFile,
      more: bodyResult.value?.more === true,
      now: now()
    },
    (lesson) => lesson.ok ? (sendJson(response, lesson.created ? 201 : 200, extraPayload(loaded.value, lesson.value)), prewarmSpeechQueue({ catalog: loaded.value.catalog, queue: lesson.value.queue })) : sendJson(response, 400, { error: "LESSON_UNAVAILABLE", message: lesson.error })
  )) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error })));
  const putSettings = () => readJsonBody(request, (bodyResult) => ((settingsResult) => !bodyResult.ok ? sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }) : !settingsResult.ok ? sendJson(response, 400, { error: settingsResult.error.code, details: settingsResult.error.issues }) : readLearnerState({ files: files2 }, (stateResult) => stateResult.ok ? writeLearnerState(
    { files: files2, state: { ...stateResult.value, settings: settingsResult.value } },
    (writeResult) => writeResult.ok ? sendJson(response, 200, settingsResult.value) : sendJson(response, 500, { error: "SETTINGS_WRITE_FAILED", message: writeResult.error.message })
  ) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: stateResult.error.message })))(bodyResult.ok ? normalizeLearnerSettings(bodyResult.value) : bodyResult));
  const getBackup = () => readLearnerState({ files: files2 }, (stateResult) => stateResult.ok ? sendJson(response, 200, createBackup({ ...stateResult.value, exportedAt: now() })) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: stateResult.error.message }));
  const getSyncState = () => readLearnerState({ files: files2 }, (result) => {
    if (!result.ok) return sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: result.error.message });
    const state = portableStudy(result.value);
    return readLocalStudyLibrary(decksDir, knownItemsFile, (library) => library.ok ? sendJson(response, 200, {
      state: library.value ? { ...state, studyPlan: { ...normalizedStudyPlan(state.studyPlan), library: library.value } } : state,
      revision: syncRevision(state)
    }) : sendJson(response, 503, { error: "STUDY_LIBRARY_UNAVAILABLE", message: library.error }));
  });
  const postSyncState = () => readJsonBody(request, (bodyResult) => {
    if (!bodyResult.ok || !bodyResult.value?.state?.settings) {
      return sendJson(response, 400, { error: "INVALID_SYNC", message: "The sync copy is incomplete." });
    }
    return readLearnerState({ files: files2 }, (current) => {
      if (!current.ok) return sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: current.error.message });
      if (syncRevision(portableStudy(current.value)) !== bodyResult.value.revision) {
        return sendJson(response, 409, { error: "SYNC_RETRY", message: "Local study data changed during sync." });
      }
      const next = validateBackup(bodyResult.value.state);
      if (!next.ok) return sendJson(response, 400, { error: "INVALID_SYNC", message: next.error.message });
      try {
        const state = retainLocalStudy(portableStudy(next.value), current.value);
        return writeLearnerState({ files: files2, state }, (saved) => saved.ok ? sendJson(response, 200, { synced: true }) : sendJson(response, 500, { error: "SYNC_WRITE_FAILED", message: saved.error.message }));
      } catch (error3) {
        return sendJson(response, 409, { error: "SYNC_CONFLICT", message: error3.message });
      }
    });
  });
  const postRestore = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? restoreBackup({ backup: bodyResult.value, files: files2, now: now() }, (restoreResult) => restoreResult.ok ? sendJson(response, 200, {
    restored: true,
    preRestoreBackupFile: restoreResult.value.preRestoreBackupFile
  }) : sendJson(response, 400, { error: restoreResult.error.code, message: restoreResult.error.message })) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const postImport = () => readJsonBody(request, (bodyResult) => ((importResult) => !bodyResult.ok ? sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }) : !importResult.ok ? sendJson(response, 400, { error: importResult.error.code, message: importResult.error.message, details: importResult.error.details }) : readLearnerState({ files: files2 }, (stateResult) => stateResult.ok ? ((merged) => writeLearnerState(
    { files: files2, state: { ...stateResult.value, ...merged } },
    (writeResult) => writeResult.ok ? sendJson(response, 201, {
      importedCards: importResult.value.cards.length,
      customList: importResult.value.customList
    }) : sendJson(response, 500, { error: "IMPORT_WRITE_FAILED", message: writeResult.error.message })
  ))(mergeCatalogImport({
    catalog: stateResult.value.catalog,
    customLists: stateResult.value.customLists,
    imported: importResult.value
  })) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: stateResult.error.message })))(bodyResult.ok ? importDelimitedCatalog(bodyResult.value.table, { label: bodyResult.value.label }) : bodyResult));
  const getStats = () => load((result) => result.ok ? sendJson(response, 200, deriveStats({ ...result.value, now: now(), timeZone })) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: result.error }));
  const getSpeech = () => ((text4) => text4 && [...text4].length <= 100 ? speech.request(text4, (result) => result.ok && result.body.length > 0 ? sendAudio(response, result.contentType, result.body) : sendJson(response, 502, { error: "SPEECH_UPSTREAM_FAILED" })) : sendJson(response, 400, { error: "INVALID_SPEECH_TEXT" }))(String(url.searchParams.get("text") ?? "").trim());
  const postReview = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? load((loaded) => loaded.ok ? recordReview(
    { context: loaded.value, eventsFile, input: bodyResult.value, now: now() },
    (recorded) => recorded.ok ? load((updated) => updated.ok ? sendFeedback(recorded, updated.value, bodyResult.value.cardId, dailyPayload(updated.value)) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: updated.error, failOpen: true })) : sendJson(response, 400, { error: "INVALID_REVIEW", message: recorded.error })
  ) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error, failOpen: true })) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const postReadingCheck = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? readKanjiLexicon(kanjiLexiconFile, (lexicon) => ((check) => lexicon.ok ? loadReadingContext({ catalogFile, eventsFile, kanjiLexicon: lexicon.value, cardId: bodyResult.value?.cardId }, check) : check(lexicon))((loaded) => {
    const checked = loaded.ok ? createReadingCheck({ ...loaded.value, input: bodyResult.value }) : loaded;
    return !loaded.ok ? sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error, failOpen: true }) : checked.ok ? sendJson(response, 200, { correct: checked.value.correct }) : sendJson(response, 400, { error: "INVALID_READING", message: checked.error });
  })) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const postExtra = () => load((loaded) => loaded.ok ? startExtraSession(
    { context: loaded.value, eventsFile, limit: 100, now: now() },
    (extra) => extra.ok ? ((view) => (sendJson(response, extra.created ? 201 : 200, view), prewarmSpeechQueue({ catalog: loaded.value.catalog, queue: view.queue })))(extraPayload(loaded.value, extra.value)) : sendJson(response, 500, { error: "EXTRA_SESSION_WRITE_FAILED", message: extra.error })
  ) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error, failOpen: true }));
  const postPractice = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? load((loaded) => ((detail) => !loaded.ok ? sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error, failOpen: true }) : !detail.ok ? sendJson(response, 400, { error: "INVALID_PROGRESS_CATEGORY", message: detail.error }) : startPracticeSession(
    {
      context: loaded.value,
      eventsFile,
      cardIds: detail.value.items.map(({ id }) => id),
      scope: { type: detail.value.type, band: detail.value.band },
      now: now()
    },
    (practice) => practice.ok ? sendJson(response, 201, extraPayload(loaded.value, practice.value)) : sendJson(response, 500, { error: "PRACTICE_SESSION_WRITE_FAILED", message: practice.error })
  ))(loaded.ok ? progressItems(loaded.value, String(bodyResult.value?.type ?? ""), String(bodyResult.value?.band ?? "")) : loaded)) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const postExtraReview = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? load((loaded) => loaded.ok ? recordExtraReview(
    { context: loaded.value, eventsFile, input: bodyResult.value, now: now() },
    (recorded) => recorded.ok ? load((updated) => updated.ok ? loadExtraContext(
      { context: updated.value, extraSessionId: bodyResult.value.extraSessionId },
      (extra) => extra.ok ? sendFeedback(recorded, updated.value, bodyResult.value.cardId, extraPayload(updated.value, extra.value)) : sendJson(response, 400, { error: "INVALID_EXTRA_SESSION", message: extra.error })
    ) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: updated.error, failOpen: true })) : sendJson(response, 400, { error: "INVALID_EXTRA_REVIEW", message: recorded.error })
  ) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error, failOpen: true })) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const postRedo = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? load((loaded) => loaded.ok ? recordRedo(
    { context: loaded.value, eventsFile, input: bodyResult.value, now: now() },
    (redone) => redone.ok ? load((updated) => updated.ok ? redone.value.target.type === "extra_review_answered" ? loadExtraContext(
      { context: updated.value, extraSessionId: redone.value.target.extraSessionId },
      (extra) => extra.ok ? sendJson(response, 200, {
        redone: true,
        cardId: redone.value.target.cardId,
        daily: extraPayload(updated.value, extra.value)
      }) : sendJson(response, 400, { error: "INVALID_EXTRA_SESSION", message: extra.error })
    ) : sendJson(response, 200, {
      redone: true,
      cardId: redone.value.target.cardId,
      daily: dailyPayload(updated.value)
    }) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: updated.error, failOpen: true })) : sendJson(response, redone.conflict ? 409 : 400, { error: "REDO_CONFLICT", message: redone.error })
  ) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error, failOpen: true })) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const finishBypass = (release, status, payload) => (release(), sendJson(response, status, payload));
  const alreadyAllowedBypass = (release, daily) => finishBypass(release, 200, {
    alreadyAllowed: true,
    accessReason: daily.accessReason,
    bypassUntil: daily.bypassUntil
  });
  const recordSerializedBypass = (release, context) => ((bypass) => bypass.ok ? bypass : finishBypass(release, 400, { error: "INVALID_BYPASS", message: bypass.error }))(recordBypass(
    { context, durationMinutes: bypassMinutes, eventsFile, now: now(), timeZone },
    (recorded) => recorded.ok ? finishBypass(release, 201, {
      bypassUntil: recorded.value.event.expiresAt,
      makeupStudyDate: recorded.value.event.makeupStudyDate,
      makeupReviews: recorded.value.event.makeupReviews
    }) : finishBypass(release, 500, { error: "BYPASS_WRITE_FAILED", message: recorded.error })
  ));
  const recoverBypassWithoutProjection = (release) => readJsonLines(eventsFile, (eventsResult) => eventsResult.ok && eventsResult.value.every(recoveryEventIsInspectable) ? ((activeBypass) => activeBypass ? alreadyAllowedBypass(release, {
    accessReason: activeBypass.type === "emergency_unlock_granted" ? "emergency_unlock" : "temporary_bypass",
    bypassUntil: activeBypass.expiresAt
  }) : recordSerializedBypass(release, null))(((currentTime) => activeBypassEvent({
    events: eventsResult.value,
    currentStudyDate: studyDate(currentTime, timeZone),
    now: currentTime,
    timeZone
  }))(now())) : finishBypass(release, 503, {
    error: "STATE_UNAVAILABLE",
    message: eventsResult.ok ? "Learner event stream contains a non-event value." : eventsResult.error?.message ?? eventsResult.error,
    failOpen: true
  }));
  const postBypass = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? serializeBypass((release) => withFreshDrill(() => load((loaded) => loaded.ok ? ((daily) => daily.accessAllowed ? alreadyAllowedBypass(release, daily) : recordSerializedBypass(release, loaded.value))(dailyPayload(loaded.value)) : finishBypass(release, 503, {
    error: "STATE_UNAVAILABLE",
    message: loaded.error,
    failOpen: true
  })))) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const postEmergencyUnlock = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? serializeBypass((release) => withFreshDrill(() => load((loaded) => ((daily) => daily?.accessAllowed ? alreadyAllowedBypass(release, daily) : loaded.ok ? recordSerializedBypass(release, loaded.value) : recoverBypassWithoutProjection(release))(
    loaded.ok ? dailyPayload(loaded.value) : null
  )))) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const postAlias = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? load((loaded) => loaded.ok ? recordAnswerAlias(
    { context: loaded.value, eventsFile, input: bodyResult.value, now: now() },
    (recorded) => recorded.ok ? sendJson(response, 201, { saved: true, alias: recorded.value.event }) : sendJson(response, 400, { error: "INVALID_ALIAS", message: recorded.error })
  ) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error, failOpen: true })) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const postKnown = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? load((loaded) => loaded.ok ? recordKnownCard(
    { context: loaded.value, eventsFile, input: bodyResult.value, now: now() },
    (recorded) => recorded.ok ? load((updated) => updated.ok ? bodyResult.value?.extraSessionId ? loadExtraContext(
      { context: updated.value, extraSessionId: bodyResult.value.extraSessionId },
      (extra) => extra.ok ? sendJson(response, 200, { daily: extraPayload(updated.value, extra.value) }) : sendJson(response, 400, { error: "INVALID_EXTRA_SESSION", message: extra.error })
    ) : sendJson(response, 200, { daily: dailyPayload(updated.value) }) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: updated.error, failOpen: true })) : sendJson(response, 400, { error: "INVALID_KNOWN_CARD", message: recorded.error })
  ) : sendJson(response, 503, { error: "STATE_UNAVAILABLE", message: loaded.error, failOpen: true })) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const loadGrammar = (callback) => readJsonFile(grammarFile, (grammarResult) => !grammarResult.ok ? callback(grammarResult) : readStudyPlan(studyPlanFile, (planResult) => !planResult.ok ? callback(planResult) : readJsonLines(eventsFile, (eventsResult) => !eventsResult.ok ? callback({ ok: false, error: eventsResult.error.message }) : ((points) => ((poolIds) => ((cards) => callback({
    ok: true,
    value: {
      points,
      byId: Object.fromEntries(points.map((point) => [point.id, point])),
      poolIds,
      cards,
      cardStates: foldGrammar(cards, eventsResult.value),
      events: eventsResult.value,
      dailyLimits: grammarDailyLimits(planResult.value.dailyLimits, grammarNewLimit)
    }
  }))(grammarCatalogCards(points, poolIds)))(grammarPoolIds(points, eventsResult.value)))(
    Array.isArray(grammarResult.value?.points) ? grammarResult.value.points : []
  ))));
  const getGrammar = () => loadGrammar((result) => result.ok ? ((addedByLevel) => ((newLimit) => sendJson(response, 200, {
    levels: grammarLevelSummary(result.value.points, result.value.poolIds).map((level) => ({
      ...level,
      dailyNew: result.value.dailyLimits[grammarStudyListId(level.level)],
      newToday: addedByLevel[grammarStudyListId(level.level)]
    })),
    pool: result.value.poolIds.size,
    available: grammarReviewableCount(result.value, now()),
    dueNow: grammarDueNow(result.value, now()),
    newCount: grammarNewCount(result.value),
    newLimit,
    newToday: Math.min(newLimit, Object.values(addedByLevel).reduce((sum, count) => sum + count, 0)),
    newAvailable: newGrammarAvailable(result.value.points, result.value.poolIds),
    progress: grammarProgress(result.value)
  }))(Object.values(result.value.dailyLimits).reduce((sum, limit) => sum + limit, 0)))(
    grammarAddedByLevel(result.value, studyDate(now(), timeZone))
  ) : sendJson(response, 503, { error: "GRAMMAR_UNAVAILABLE", message: result.error }));
  const postGrammarLesson = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? loadGrammar((result) => !result.ok ? sendJson(response, 503, { error: "GRAMMAR_UNAVAILABLE", message: result.error }) : ((today, more) => ((addedByLevel) => ((newLimit, addedToday) => more && addedToday < newLimit ? sendJson(response, 409, {
    error: "GRAMMAR_DAILY_INCOMPLETE",
    message: "Complete the daily grammar batch before learning more."
  }) : ((cards) => sendJson(response, 200, {
    added: 0,
    more,
    cards: cards.map((point) => ({
      id: point.id,
      level: point.level,
      japanese: point.japanese,
      english: point.english,
      englishHint: point.englishHint,
      content: point.content
    }))
  }))(nextNewGrammarByLevel(
    result.value.points,
    result.value.poolIds,
    more ? result.value.dailyLimits : Object.fromEntries(Object.entries(result.value.dailyLimits).map(([id, limit]) => [id, Math.max(0, limit - addedByLevel[id])]))
  )))(
    Object.values(result.value.dailyLimits).reduce((sum, limit) => sum + limit, 0),
    Object.values(addedByLevel).reduce((sum, count) => sum + count, 0)
  ))(grammarAddedByLevel(result.value, today)))(
    studyDate(now(), timeZone),
    bodyResult.value?.more === true
  )) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const getGrammarLessons = () => loadGrammar((result) => result.ok ? ((level) => ((filter) => sendJson(response, 200, {
    level,
    filter,
    points: result.value.points.filter((point) => level === "all" || point.level === level).filter((point) => filter === "studied" ? point.studied : filter === "pool" ? result.value.poolIds.has(point.id) : true).map((point) => ({
      id: point.id,
      key: point.key,
      level: point.level,
      japanese: point.japanese,
      english: point.english,
      studied: point.studied,
      inPool: result.value.poolIds.has(point.id),
      reviewable: Array.isArray(point.cloze) && point.cloze.length > 0,
      hasLesson: point.content.length > 0
    }))
  }))(url.searchParams.get("filter") ?? "all"))(url.searchParams.get("level") ?? "all") : sendJson(response, 503, { error: "GRAMMAR_UNAVAILABLE", message: result.error }));
  const getGrammarLesson = () => loadGrammar((result) => ((point) => !result.ok ? sendJson(response, 503, { error: "GRAMMAR_UNAVAILABLE", message: result.error }) : !point ? sendJson(response, 404, { error: "GRAMMAR_POINT_NOT_FOUND" }) : sendJson(response, 200, {
    id: point.id,
    level: point.level,
    japanese: point.japanese,
    english: point.english,
    prompt: point.prompt,
    englishHint: point.englishHint,
    japaneseHint: point.japaneseHint,
    content: point.content,
    studied: point.studied,
    inPool: result.value.poolIds.has(point.id),
    reviewable: Array.isArray(point.cloze) && point.cloze.length > 0,
    hasLesson: point.content.length > 0
  }))(result.ok ? result.value.byId[String(url.searchParams.get("id") ?? "")] : null));
  const getGrammarReview = () => loadGrammar((result) => result.ok ? ((ids) => sendJson(response, 200, {
    queue: grammarQuestionsFor(result.value, ids),
    remaining: Math.max(0, grammarReviewableCount(result.value, now()) - ids.length)
  }))(dueGrammarCardIds({
    cards: result.value.cards,
    cardStates: result.value.cardStates,
    now: now(),
    limit: Number(url.searchParams.get("limit")) || 20
  })) : sendJson(response, 503, { error: "GRAMMAR_UNAVAILABLE", message: result.error }));
  const postGrammarAnswer = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? loadGrammar((result) => !result.ok ? sendJson(response, 503, { error: "GRAMMAR_UNAVAILABLE", message: result.error }) : ((point) => ((cloze) => !point || !result.value.poolIds.has(point.id) || !cloze ? sendJson(response, 404, { error: "GRAMMAR_POINT_NOT_FOUND" }) : ((correct) => appendJsonLine(
    eventsFile,
    grammarAnswerEvent({ cardId: point.id, correct, eventId: randomUUID(), now: now() }),
    (appended) => appended.ok ? loadGrammar((updated) => updated.ok ? sendJson(response, 200, {
      correct,
      surface: cloze.surface,
      reading: cloze.reading,
      english: cloze.english,
      japanese: point.japanese,
      meaning: point.english,
      englishHint: point.englishHint,
      lessonKey: point.lessonKey,
      hasLesson: point.content.length > 0,
      stage: updated.value.cardStates[point.id]?.stage ?? null,
      available: grammarReviewableCount(updated.value, now())
    }) : sendJson(response, 503, { error: "GRAMMAR_UNAVAILABLE", message: updated.error })) : sendJson(response, 500, { error: "GRAMMAR_WRITE_FAILED", message: appended.error.message })
  ))(checkClozeAnswer(cloze, bodyResult.value?.answer)))(
    (point?.cloze ?? [])[Number(bodyResult.value?.clozeIndex)]
  ))(
    result.value.byId[String(bodyResult.value?.cardId ?? "")]
  )) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const postGrammarAdd = () => readJsonBody(request, (bodyResult) => bodyResult.ok ? loadGrammar((result) => !result.ok ? sendJson(response, 503, { error: "GRAMMAR_UNAVAILABLE", message: result.error }) : ((today) => ((addedByLevel) => ((point) => !point ? sendJson(response, 404, { error: "GRAMMAR_POINT_NOT_FOUND" }) : !Array.isArray(point.cloze) || point.cloze.length === 0 ? sendJson(response, 400, {
    error: "GRAMMAR_NOT_REVIEWABLE",
    message: "This grammar lesson does not have a review exercise yet."
  }) : result.value.poolIds.has(point.id) ? sendJson(response, 200, { added: false, inPool: true }) : bodyResult.value?.more === true && Object.values(addedByLevel).reduce((sum, count) => sum + count, 0) < Object.values(result.value.dailyLimits).reduce((sum, limit) => sum + limit, 0) ? sendJson(response, 409, {
    error: "GRAMMAR_DAILY_INCOMPLETE",
    message: "Complete the daily grammar batch before learning more."
  }) : bodyResult.value?.more !== true && addedByLevel[grammarStudyListId(point.level)] >= result.value.dailyLimits[grammarStudyListId(point.level)] ? sendJson(response, 409, { error: "GRAMMAR_DAILY_LIMIT", message: "Daily grammar limit reached." }) : appendJsonLine(
    eventsFile,
    grammarPoolAddedEvent({ cardId: point.id, studyDate: today, now: now() }),
    (appended) => appended.ok ? sendJson(response, 201, { added: true, inPool: true }) : sendJson(response, 500, { error: "GRAMMAR_WRITE_FAILED", message: appended.error.message })
  ))(result.value.byId[String(bodyResult.value?.id ?? "")]))(
    grammarAddedByLevel(result.value, today)
  ))(studyDate(now(), timeZone))) : sendJson(response, 400, { error: "INVALID_JSON", message: bodyResult.error }));
  const routes = {
    "GET /api/backup": getBackup,
    [`GET ${syncPath}`]: getSyncState,
    [`POST ${syncPath}`]: postSyncState,
    "GET /api/daily": getDaily,
    "GET /api/decks": getDecks,
    "GET /api/grammar": getGrammar,
    "GET /api/grammar/lesson": getGrammarLesson,
    "GET /api/grammar/lessons": getGrammarLessons,
    "GET /api/grammar/review": getGrammarReview,
    "GET /api/kanji": getKanji,
    "GET /api/reference": getReference,
    "GET /api/review/notes": getReviewNotes,
    "GET /api/lesson": getLesson,
    "GET /api/study-pairs": getStudyPairs,
    "GET /api/study-pairs/search": searchStudyPairs,
    "GET /api/study-pairs/lesson": getStudyPairLesson,
    "POST /api/study-pairs": saveStudyPair,
    "DELETE /api/study-pairs": removeStudyPair,
    "GET /api/settings": getSettings,
    "GET /api/speech": getSpeech,
    "GET /api/stats": getStats,
    "GET /api/status": getStatus,
    "GET /api/study-lists": getStudyLists,
    "POST /api/extra": postExtra,
    "POST /api/emergency-unlock": postEmergencyUnlock,
    "POST /api/grammar/add": postGrammarAdd,
    "POST /api/grammar/answer": postGrammarAnswer,
    "POST /api/grammar/lesson": postGrammarLesson,
    "POST /api/practice": postPractice,
    "POST /api/review": postReview,
    "POST /api/review/redo": postRedo,
    "POST /api/reading-check": postReadingCheck,
    "POST /api/extra-review": postExtraReview,
    "POST /api/bypass": postBypass,
    "POST /api/decks/select": postDeckSelection,
    "POST /api/import": postImport,
    "POST /api/lesson/today": postTodayLesson,
    "POST /api/restore": postRestore,
    "POST /api/study-lists": postStudyLists,
    "POST /api/study-lists/custom": postCustomStudyList,
    "POST /api/alias": postAlias,
    "POST /api/known": postKnown,
    "PUT /api/settings": putSettings
  };
  const customListId = url.pathname.match(/^\/api\/study-lists\/custom\/([^/]+)$/u)?.[1] ?? null;
  const customWordRoute = url.pathname.match(/^\/api\/study-lists\/custom\/([^/]+)\/items\/([^/]+)$/u);
  const studyListId = url.pathname.match(/^\/api\/study-lists\/([^/]+)\/items$/u)?.[1] ?? null;
  const progressItemsRoute = url.pathname.match(/^\/api\/progress\/(kanji|vocabulary)\/([^/]+)\/items$/u);
  const customRoute = request.method === "DELETE" && customWordRoute ? () => deleteCustomWord(decodeURIComponent(customWordRoute[1]), decodeURIComponent(customWordRoute[2])) : request.method === "POST" && customListId ? () => postCustomWords(decodeURIComponent(customListId)) : request.method === "PATCH" && customListId ? () => patchCustomStudyList(decodeURIComponent(customListId)) : request.method === "DELETE" && customListId ? () => deleteCustomStudyList(decodeURIComponent(customListId)) : null;
  const studyListRoute = request.method === "GET" && studyListId ? () => getStudyListItems(decodeURIComponent(studyListId)) : null;
  const progressRoute = request.method === "GET" && progressItemsRoute ? () => getProgressItems(
    decodeURIComponent(progressItemsRoute[1]),
    decodeURIComponent(progressItemsRoute[2])
  ) : null;
  return ((key) => mutationToken && request.method !== "GET" && !mutationTokenMatches(request, mutationToken) ? sendJson(response, 403, { error: "MUTATION_FORBIDDEN" }) : (routes[key] ?? customRoute ?? studyListRoute ?? progressRoute ?? (() => sendJson(response, 404, { error: "NOT_FOUND" })))())(routeKey(request, url));
};
var staticHandler = (publicDir, wanakanaFile) => (_request, response, url) => {
  const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const relative = normalize(requested);
  return relative.startsWith("..") ? sendJson(response, 404, { error: "NOT_FOUND" }) : sendFile(response, url.pathname === "/vendor/wanakana.mjs" ? wanakanaFile : join(publicDir, relative));
};
var readGrammarDrillConfig = (path) => new Promise((resolve) => readFile(path, "utf8", (readError, text4) => readError?.code === "ENOENT" ? resolve(null) : readError ? resolve({ ok: false, error: readError.message }) : parseJsonResult(text4, (parsed) => resolve(parsed.ok ? normalizeGrammarDrillConfig(parsed.value) : parsed))));
var fetchDrillProgress = (progressUrl) => ((url) => (url.searchParams.set("checked", String(Date.now())), fetch(url, {
  cache: "no-store",
  signal: AbortSignal.timeout(5e3)
})))(new URL(progressUrl)).then((response) => response.ok ? response.json() : Promise.reject(new Error(`Grammar drill progress returned HTTP ${response.status}.`)));
var createReviewServer = (options = {}) => {
  const stateDirectory = options.stateDirectory ?? (options.catalogFile ? dirname(options.catalogFile) : options.settingsFile ? dirname(options.settingsFile) : defaultStateDir);
  const catalogFile = options.catalogFile ?? define_process_env_default.LEARNER_CATALOG_FILE ?? join(stateDirectory, "catalog.json");
  const eventsFile = options.eventsFile ?? define_process_env_default.LEARNER_EVENTS_FILE ?? join(stateDirectory, "events.jsonl");
  const grammarFile = options.grammarFile ?? define_process_env_default.LEARNER_GRAMMAR_FILE ?? join(stateDirectory, "grammar.json");
  const grammarNewLimit = options.grammarNewLimit ?? (Number(define_process_env_default.LEARNER_GRAMMAR_NEW_LIMIT) > 0 ? Number(define_process_env_default.LEARNER_GRAMMAR_NEW_LIMIT) : 5);
  const grammarDrillFile = options.grammarDrillFile ?? define_process_env_default.LEARNER_GRAMMAR_DRILL_FILE ?? join(stateDirectory, "grammar-drill.json");
  const kanjiLexiconFile = options.kanjiLexiconFile ?? define_process_env_default.LEARNER_KANJI_LEXICON_FILE ?? join(stateDirectory, "kanji-lexicon.json");
  const decksDir = options.decksDir ?? define_process_env_default.LEARNER_DECKS_DIR ?? defaultDecksDir;
  const referenceFile = options.referenceFile ?? join(defaultDecksDir, "study-reference.json.gz");
  const knownItemsFile = options.knownItemsFile ?? define_process_env_default.LEARNER_KNOWN_ITEMS_FILE ?? join(decksDir, "..", "marumori-known-item-ids.json");
  const settingsFile = options.settingsFile ?? define_process_env_default.LEARNER_SETTINGS_FILE ?? join(stateDirectory, "settings.json");
  const customListsFile = options.customListsFile ?? define_process_env_default.LEARNER_CUSTOM_LISTS_FILE ?? join(stateDirectory, "custom-lists.json");
  const studyPlanFile = options.studyPlanFile ?? define_process_env_default.LEARNER_STUDY_PLAN_FILE ?? join(stateDirectory, "study-plan.json");
  const publicDir = options.publicDir ?? define_process_env_default.LEARNER_PUBLIC_DIR ?? defaultPublicDir;
  const wanakanaFile = options.wanakanaFile ?? define_process_env_default.LEARNER_WANAKANA_FILE ?? defaultWanakanaFile;
  const now = options.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const bypassMinutes = options.bypassMinutes ?? (Number(define_process_env_default.LEARNER_BYPASS_MINUTES) > 0 ? Number(define_process_env_default.LEARNER_BYPASS_MINUTES) : defaultBypassMinutes);
  const mode = options.mode ?? define_process_env_default.LANGUAGE_GATE_MODE;
  const mutationToken = options.mutationToken ?? "";
  const resolveTimeZone = typeof options.timeZone === "function" ? options.timeZone : () => options.timeZone ?? define_process_env_default.LEARNER_TIME_ZONE ?? systemTimeZone();
  const handleApi = apiHandler({
    bypassMinutes,
    catalogFile,
    customListsFile,
    decksDir,
    deferReviewNotes: options.deferReviewNotes === true,
    eventsFile,
    grammarDrill: createGrammarDrillSource({
      readConfig: () => readGrammarDrillConfig(grammarDrillFile),
      fetchJson: options.grammarDrillFetch ?? fetchDrillProgress,
      maxAgeMs: options.grammarDrillMaxAgeMs
    }),
    grammarFile,
    grammarNewLimit,
    kanjiLexiconFile,
    referenceFile,
    referenceIndex: options.referenceData ? createReferenceIndex(options.referenceData) : null,
    project: createStudyProjector(),
    recentReviewReferences: /* @__PURE__ */ new Map(),
    knownItemsFile,
    settingsFile,
    studyPlanFile,
    now,
    mode,
    mutationToken,
    serializeBypass: createSerialQueue(),
    speech: createReviewSpeech(options, stateDirectory),
    resolveTimeZone
  });
  const serializeState = createSerialQueue();
  const handleStateRequest = (request, response, url) => request.method === "GET" && url.pathname !== syncPath ? handleApi(request, response, url) : serializeState((release) => {
    const end = response.end.bind(response);
    response.end = (...args) => {
      response.end = end;
      try {
        return end(...args);
      } finally {
        queueMicrotask(release);
      }
    };
    try {
      return handleApi(request, response, url);
    } catch {
      return sendJson(response, 500, { error: "REQUEST_FAILED" });
    }
  });
  const handleStatic = staticHandler(publicDir, wanakanaFile);
  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    return !loopbackHost(request) ? sendJson(response, 403, { error: "HOST_FORBIDDEN" }) : !jsonMutation(request, url) ? sendJson(response, 415, { error: "JSON_CONTENT_TYPE_REQUIRED" }) : url.pathname.startsWith("/api/") ? handleStateRequest(request, response, url) : handleStatic(request, response, url);
  });
};
var isMain = define_process_argv_default[1] && fileURLToPath(import.meta.url) === define_process_argv_default[1];
isMain ? createReviewServer().listen(
  Number.parseInt(define_process_env_default.PORT ?? "8787", 10),
  "127.0.0.1",
  () => console.log(`Japanese review: http://127.0.0.1:${define_process_env_default.PORT ?? "8787"}`)
) : null;

// web/worker.mjs
var scope = new URL(self.registration.scope);
var cachePrefix = `leo-sensei:${scope.href}:`;
var cacheName = cachePrefix + "234663f3af3568f6f731bfc0";
var assets = define_ASSETS_default.map((path) => new URL(path, scope).href);
var shell = new URL("index.html", scope);
var handle = createReviewServer({
  stateDirectory: "/learner",
  decksDir: "/decks",
  referenceFile: "/decks/study-reference.json.gz",
  deferReviewNotes: true,
  mode: "off",
  ttsEndpoint: ""
});
var jsonError = (status, error3, message) => Response.json({ error: error3, message }, { status });
var dispatch = (request, route) => new Promise((resolve, reject) => {
  let status;
  let headers;
  const result = handle({
    url: route,
    method: request.method,
    headers: { ...Object.fromEntries(request.headers), host: "127.0.0.1" },
    body: request
  }, {
    writeHead: (code, responseHeaders) => {
      status = code;
      headers = responseHeaders;
    },
    end: (body) => resolve(new Response(body, { status, headers }))
  });
  Promise.resolve(result).catch(reject);
});
var requests = Promise.resolve();
var reviewRequest = (request, route) => {
  const run = requests.then(() => beginFiles()).then(() => dispatch(request, route)).then(
    (response) => finishFiles(response.ok).then(() => response),
    (error3) => finishFiles(false).then(() => {
      throw error3;
    })
  ).catch(() => jsonError(503, "STORAGE_UNAVAILABLE", "Could not open or save study data in this browser. Check that site storage is enabled and try again."));
  requests = run.then(() => void 0);
  return run;
};
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets.map(
    (url) => new Request(url, { cache: "reload" })
  ))));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const route = url.pathname.slice(scope.pathname.length);
  if (route.startsWith("api/")) {
    event.respondWith(event.request.mode === "navigate" || !event.clientId ? jsonError(403, "APP_REQUIRED", "Open Leo Sensei to use study data.") : route === "api/review/notes" && event.request.method === "GET" ? dispatch(event.request, `/${route}${url.search}`).catch(() => jsonError(503, "REFERENCE_UNAVAILABLE", "Study notes could not load.")) : reviewRequest(event.request, `/${route}${url.search}`));
  } else if (event.request.mode === "navigate" && (route === "" || route === "index.html")) {
    event.respondWith(caches.open(cacheName).then((cache) => cache.match(shell)));
  } else if (assets.includes(url.href)) {
    event.respondWith(caches.open(cacheName).then((cache) => cache.match(url)));
  }
});
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
