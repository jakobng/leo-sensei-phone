const api = "https://api.github.com";
const encoder = new TextEncoder();
const header = 1;
const ivLength = 12;
const error = (message, code) => Object.assign(new Error(message), { code });

const toBase64 = (bytes) => Array.from({ length: Math.ceil(bytes.length / 12288) }, (_, index) =>
  btoa(String.fromCharCode(...bytes.subarray(index * 12288, (index + 1) * 12288))),
).join("");
const fromBase64 = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const keyBytes = (key) => fromBase64(key.replaceAll("-", "+").replaceAll("_", "/"));
export const newSyncKey = () => toBase64(crypto.getRandomValues(new Uint8Array(32)))
  .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");

const vaultKey = (key) => {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(key)) throw error("Enter the sync key from the device you connected first.");
  return crypto.subtle.importKey("raw", keyBytes(key), "AES-GCM", false, ["encrypt", "decrypt"]);
};

const gzip = (text) => new Response(
  new Blob([text]).stream().pipeThrough(new CompressionStream("gzip")),
).arrayBuffer();

const seal = (value, key, additionalData) => {
  const iv = crypto.getRandomValues(new Uint8Array(ivLength));
  return gzip(JSON.stringify(value))
    .then((bytes) => crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, key, bytes))
    .then((bytes) => {
      const output = new Uint8Array(1 + iv.length + bytes.byteLength);
      output[0] = header;
      output.set(iv, 1);
      output.set(new Uint8Array(bytes), 1 + iv.length);
      return output;
    });
};

const unseal = (payload, key, additionalData) => {
  if (payload[0] !== header || payload.length <= 1 + ivLength + 16) {
    throw error("The cloud file is not a supported Leo Sensei sync file.");
  }
  return crypto.subtle.decrypt({
    name: "AES-GCM", iv: payload.slice(1, 1 + ivLength), additionalData,
  }, key, payload.slice(1 + ivLength)).catch(() => {
    throw error("Could not open the cloud copy. Check that both devices use the same sync key.");
  }).then((bytes) => new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).json());
};

export const createGitHubVault = ({ repository, token, key }, fetcher = globalThis.fetch) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(repository)
    || !/^github_pat_[A-Za-z0-9_]+$/u.test(token)) {
    throw error("Enter a private GitHub repository and a fine-grained GitHub token.");
  }
  const root = `/repos/${repository}`;
  const file = `${root}/contents/leo-sensei-progress.enc`;
  const additionalData = encoder.encode(`Leo Sensei sync 1:\n${repository.toLowerCase()}`);
  const imported = vaultKey(key);
  const request = (path, { method = "GET", body, missing = false, accept = "application/vnd.github+json" } = {}) =>
    fetcher(api + path, {
      method, cache: "no-store", credentials: "omit", redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { Accept: accept, Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).then((response) => {
      if (missing && response.status === 404) return null;
      if (method === "PUT" && [409, 422].includes(response.status)) throw error("The cloud copy changed during sync.", "SYNC_RETRY");
      if (!response.ok) throw error("Could not reach your private sync repository. Check the token and repository permissions.");
      return response.json();
    });
  const ready = () => request(root).then((repo) => {
    if (repo.private !== true) throw error("Choose a private GitHub repository for sync.");
  });
  const read = () => ready().then(() => request(file, { missing: true, accept: "application/vnd.github.object+json" }))
    .then((entry) => {
      if (!entry) return null;
      if (!/^[a-f0-9]{40}$/u.test(entry.sha)) throw error("GitHub returned an invalid sync file.");
      const object = entry.encoding === "base64" && entry.content
        ? Promise.resolve(entry) : request(`${root}/git/blobs/${entry.sha}`);
      return Promise.all([imported, object]).then(([cryptoKey, blob]) => {
        if (blob.encoding !== "base64" || typeof blob.content !== "string") throw error("GitHub returned an unreadable sync file.");
        return unseal(fromBase64(blob.content), cryptoKey, additionalData)
          .then((state) => ({ sha: entry.sha, state }));
      });
    });
  const write = (state, sha) => imported.then((cryptoKey) => seal(state, cryptoKey, additionalData))
    .then((payload) => request(file, {
      method: "PUT",
      body: { message: "Sync encrypted Leo Sensei progress", content: toBase64(payload), ...(sha ? { sha } : {}) },
    }));
  return { read, write };
};
