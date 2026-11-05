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

export const syncStudyOnce = ({ config, readLocal, applyLocal, canApply, vault = createGitHubVault(config) }, retries = 2) =>
  Promise.all([readLocal(), vault.read()]).then(([local, remote]) => {
    if (!local.ok) throw syncError(local);
    if (remote && !validState(remote.state)) throw new Error("The cloud copy is incomplete.");
    const remoteStudy = remote && portableStudy(remote.state);
    const merged = mergeStudy(config.base, local.value.state, remoteStudy);
    const changedLocal = !studyContains(local.value.state, merged);
    const changedRemote = !remoteStudy || !studyContains(remoteStudy, merged);
    if (changedLocal && !canApply()) return { deferred: true };
    const push = changedRemote ? vault.write(merged, remote?.sha) : Promise.resolve();
    return push.then(() => {
      if (!changedLocal) return { base: merged, changedLocal };
      if (!canApply()) return { deferred: true };
      return applyLocal({ revision: local.value.revision, state: merged }).then((applied) => {
        if (!applied.ok) throw syncError(applied);
        return { base: merged, changedLocal };
      });
    });
  }).catch((error) => {
    if (error.code === "SYNC_RETRY" && retries > 0) {
      return syncStudyOnce({ config, readLocal, applyLocal, canApply, vault }, retries - 1);
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
  let configured = false;
  let status = "Sync is off.";
  const display = () => {
    if (!currentPanel?.isConnected) return;
    const connect = currentPanel.querySelector("[data-sync-connect]");
    const connected = currentPanel.querySelector("[data-sync-connected]");
    currentPanel.querySelector("[data-sync-status]").textContent = status;
    connect.hidden = !supported || configured;
    connected.hidden = !supported || !configured;
    [...currentPanel.querySelectorAll("button")].map((button) => { button.disabled = Boolean(running); });
  };
  const sync = (newConfig) => {
    if (!supported || running || (!newConfig && !configured)) return;
    if (navigator.onLine === false) {
      status = "Sync is offline. Your progress is saved here.";
      display();
      return;
    }
    status = "Syncing…";
    running = navigator.locks.request(name, () => (
      newConfig ? Promise.resolve(newConfig) : store.read()
    ).then((config) => {
      if (!config) {
        configured = false;
        status = "Sync is off.";
        return;
      }
      return syncStudyOnce({ config, readLocal, applyLocal, canApply }).then((result) => {
        if (result.deferred) {
          status = "Sync will resume when you return to Today or Settings.";
          return;
        }
        const syncedAt = new Date().toISOString();
        return store.save({ ...config, base: result.base, syncedAt }).then(() => {
          configured = true;
          status = `Synced at ${new Date(syncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
          if (result.changedLocal) onApplied();
        });
      });
    })).catch((error) => {
      status = error instanceof TypeError ? "Sync is offline. Your progress is saved here." : error.message;
    }).finally(() => {
      running = undefined;
      display();
    });
    display();
  };
  const schedule = (delay = 4000) => {
    if (!configured || !supported) return;
    clearTimeout(timer);
    timer = setTimeout(() => sync(), delay);
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
    return { attach, schedule };
  }
  store.read().then((config) => {
    configured = Boolean(config);
    if (config) status = "Sync is connected.";
    display();
    schedule(0);
  }).catch(() => {
    status = "Could not open this browser’s sync settings.";
    display();
  });
  globalThis.addEventListener("online", () => schedule(0));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule(0);
  });
  setInterval(() => { if (!document.hidden && canApply()) sync(); }, 90000);
  return { attach, schedule };
};
