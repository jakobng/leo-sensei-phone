import { mergeStudy, portableStudy, studyContains } from "./sync-core.mjs";
import { createGitHubVault, newSyncKey } from "./sync-vault.mjs";

export const syncPanelMarkup = `
  <section data-sync-panel>
    <div class="pane-heading"><span>Devices</span><h2>Sync kanji and vocabulary</h2></div>
    <p data-sync-status role="status">Checking sync settings…</p>
    <form class="file-form" data-sync-connect hidden>
      <p>Connect your Mac first. Use the same private GitHub repository, token and sync key on your phone.</p>
      <label>Private GitHub repository <input name="repository" placeholder="your-name/leo-sensei-sync" autocomplete="off" required /></label>
      <label>GitHub token <input name="token" type="password" autocomplete="off" required /></label>
      <label>Sync key <input name="key" type="password" autocomplete="off" required /></label>
      <button type="button" class="quiet-button" data-sync-generate>Generate a new key</button>
      <button type="submit" class="primary-button">Connect</button>
    </form>
    <div data-sync-connected hidden>
      <button type="button" class="quiet-button" data-sync-now>Sync now</button>
      <button type="button" class="quiet-button" data-sync-disconnect>Disconnect this browser</button>
    </div>
  </section>`;

const createConfigStore = (name) => {
  let opened;
  const open = () => opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("sync");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    opened = undefined;
    throw error;
  });
  const run = (mode, operation) => open().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction("sync", mode);
    const request = operation(transaction.objectStore("sync"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  }));
  return {
    read: () => run("readonly", (store) => store.get("current")),
    save: (config) => run("readwrite", (store) => store.put(config, "current")),
    clear: () => run("readwrite", (store) => store.delete("current")),
  };
};

const syncError = (result) => Object.assign(new Error(result.error), { code: result.code });
const validState = (state) => state?.version === 2 && Array.isArray(state.events)
  && Array.isArray(state.catalog?.cards) && Array.isArray(state.customLists) && state.settings;
const uploadDelay = 8000;
const cloudCheckInterval = 20000;
const fullCheckInterval = 90000;

export const syncStudyOnce = ({ config, readLocal, applyLocal, canApply, canStart = () => true, checkLocal = true,
  vault = createGitHubVault(config) }, retries = 2) =>
  vault.read({ sha: config.remoteSha, state: config.base })
    .then((remote) => {
      if (!canStart()) return { deferred: true };
      if (!checkLocal && remote && config.base && remote.sha === config.remoteSha) return { unchanged: true };
      return readLocal().then((local) => ({ local, remote }));
    })
    .then((snapshot) => {
      if (!canStart()) return { deferred: true };
      if (snapshot.deferred || snapshot.unchanged) return snapshot;
      const { local, remote } = snapshot;
      if (!local.ok) throw syncError(local);
      if (remote && !validState(remote.state)) throw new Error("The cloud copy is incomplete.");
      const remoteStudy = remote && portableStudy(remote.state);
      const eventBodies = new WeakMap();
      const merged = mergeStudy(config.base, local.value.state, remoteStudy, eventBodies);
      const changedLocal = !studyContains(local.value.state, merged, eventBodies);
      const changedRemote = !remoteStudy || !studyContains(remoteStudy, merged, eventBodies);
      const push = changedRemote ? vault.write(merged, remote?.sha) : Promise.resolve();
      return push.then((written) => {
        const remoteSha = changedRemote ? written?.content?.sha : remote?.sha;
        if (!changedLocal) return { base: merged, changedLocal, remoteSha };
        // The cloud has this device's changes. Keep the old merge base until
        // the local copy has also received the other device's changes.
        if (!canApply()) return { deferred: true, localChangesSynced: true };
        return applyLocal({ revision: local.value.revision, state: merged }).then((applied) => {
          if (!applied.ok) throw syncError(applied);
          return { base: merged, changedLocal, remoteSha };
        });
      });
    }).catch((error) => {
      if (error.code === "SYNC_RETRY" && retries > 0 && canStart()) {
        return syncStudyOnce({ config, readLocal, applyLocal, canApply, canStart, checkLocal, vault }, retries - 1);
      }
      throw error;
    });

export const createStudySync = ({ scope, readLocal, applyLocal, canApply, onApplied }) => {
  const name = `leo-sensei-sync:${scope}`;
  const supported = Boolean(globalThis.indexedDB && globalThis.crypto?.subtle && navigator.locks
    && globalThis.CompressionStream && globalThis.DecompressionStream);
  const store = createConfigStore(name);
  let currentPanel;
  let running;
  let timer;
  let wakeAt = Infinity;
  let queued = false;
  let changeVersion = 0;
  let syncedVersion = 0;
  let lastFullCheck = 0;
  let configured = false;
  let status = "Sync is off.";
  const hasLocalChanges = () => changeVersion !== syncedVersion;
  const canStart = () => canApply() || hasLocalChanges();
  const syncedStatus = (date) => `Synced at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
  const display = () => {
    if (!currentPanel?.isConnected) return;
    const connect = currentPanel.querySelector("[data-sync-connect]");
    const connected = currentPanel.querySelector("[data-sync-connected]");
    currentPanel.querySelector("[data-sync-status]").textContent = status;
    connect.hidden = !supported || configured;
    connected.hidden = !supported || !configured;
    [...currentPanel.querySelectorAll("button")].map((button) => { button.disabled = Boolean(running); });
  };
  const sync = (newConfig, poll = false) => {
    if (!supported || (newConfig ? !canApply() : !configured || !canStart())) return;
    if (running) {
      if (!poll) queued = true;
      return;
    }
    if (navigator.onLine === false) {
      status = "Sync is offline. Your progress is saved here.";
      display();
      return;
    }
    const version = changeVersion;
    const checkLocal = !poll || hasLocalChanges() || Date.now() - lastFullCheck >= fullCheckInterval;
    if (checkLocal) {
      clearTimeout(timer);
      wakeAt = Infinity;
    }
    status = "Syncing…";
    running = navigator.locks.request(name, () => (
      newConfig ? Promise.resolve(newConfig) : store.read()
    ).then((config) => {
      if (newConfig ? !canApply() : !canStart()) {
        status = "Sync will resume when you return to Today or Settings.";
        return;
      }
      if (!config) {
        configured = false;
        status = "Sync is off.";
        return;
      }
      return syncStudyOnce({ config, readLocal, applyLocal, canApply, canStart, checkLocal }).then((result) => {
        if (result.deferred) {
          if (result.localChangesSynced) syncedVersion = version;
          status = "Sync will resume when you return to Today or Settings.";
          return;
        }
        const syncedAt = new Date();
        if (result.unchanged) {
          status = syncedStatus(syncedAt);
          return;
        }
        const saved = configured && !newConfig && result.remoteSha && result.remoteSha === config.remoteSha && !result.changedLocal
          ? Promise.resolve()
          : store.save({ ...config, base: result.base, remoteSha: result.remoteSha, syncedAt: syncedAt.toISOString() });
        return saved.then(() => {
          configured = true;
          syncedVersion = version;
          lastFullCheck = syncedAt.getTime();
          status = syncedStatus(syncedAt);
          if (result.changedLocal) onApplied();
        });
      });
    })).catch((error) => {
      status = error instanceof TypeError ? "Sync is offline. Your progress is saved here." : error.message;
    }).finally(() => {
      running = undefined;
      display();
      if (queued) {
        queued = false;
        schedule();
      }
    });
    display();
  };
  const schedule = (delay = 0) => {
    if (!configured || !supported || !canStart()) return;
    const due = Date.now() + delay;
    if (due >= wakeAt) return;
    clearTimeout(timer);
    wakeAt = due;
    timer = setTimeout(() => {
      wakeAt = Infinity;
      sync();
    }, delay);
  };
  const noteChange = () => {
    changeVersion += 1;
    schedule(uploadDelay);
  };
  const attach = (panel) => {
    currentPanel = panel;
    if (!panel) return;
    const form = panel.querySelector("[data-sync-connect]");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const config = Object.fromEntries([...new FormData(form)].map(([name, value]) => [name, value.trim()]));
      sync(config);
    });
    panel.querySelector("[data-sync-generate]").addEventListener("click", () => {
      const input = form.elements.namedItem("key");
      input.type = "text";
      input.value = newSyncKey();
      input.select();
      status = "Save this sync key somewhere private. You’ll need it on your other device.";
      display();
    });
    panel.querySelector("[data-sync-now]").addEventListener("click", () => sync());
    panel.querySelector("[data-sync-disconnect]").addEventListener("click", () => {
      navigator.locks.request(name, () => store.clear()).then(() => {
        configured = false;
        status = "Sync is off.";
        display();
      }).catch(() => {
        status = "Could not turn off sync in this browser.";
        display();
      });
    });
    display();
  };
  if (!supported) {
    status = "Sync needs a recent browser with private storage enabled.";
    return { attach, schedule, noteChange };
  }
  store.read().then((config) => {
    configured = Boolean(config);
    if (config) status = "Sync is connected.";
    display();
    schedule();
  }).catch(() => {
    status = "Could not open this browser’s sync settings.";
    display();
  });
  globalThis.addEventListener("online", () => schedule());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || hasLocalChanges()) sync();
  });
  setInterval(() => { if (!document.hidden) sync(undefined, true); }, cloudCheckInterval);
  return { attach, schedule, noteChange };
};
