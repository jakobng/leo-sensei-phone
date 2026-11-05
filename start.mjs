import { playJapaneseSpeech } from "./speech.mjs";

const root = document.querySelector("#app");
const showStartupError = () => {
  root.textContent = "Leo Sensei could not finish preparing offline study. Check your connection and browser storage, then reload.";
};

const waitForController = (registration) => {
  if (navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const controlled = () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.removeEventListener("controllerchange", controlled);
        resolve();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", controlled);
    const installing = registration.installing;
    const checkInstall = () => {
      if (installing?.state === "redundant") {
        navigator.serviceWorker.removeEventListener("controllerchange", controlled);
        reject(new Error("Offline install failed."));
      }
    };
    installing?.addEventListener("statechange", checkInstall);
    checkInstall();
    controlled();
  });
};

const syncOrigin = document.querySelector('meta[name="leo-sensei-sync-origin"]')?.content;
globalThis.leoSenseiWeb = Object.freeze({
  syncEnabled: location.origin === syncOrigin || ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname),
  speechAvailable: Boolean(globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance),
  speak: (text) => playJapaneseSpeech({ synthesis: globalThis.speechSynthesis, Utterance: globalThis.SpeechSynthesisUtterance, text }),
  cancelSpeech: () => globalThis.speechSynthesis?.cancel(),
});
if (!navigator.serviceWorker) showStartupError();
else navigator.serviceWorker.register("./worker.mjs", { type: "module" })
  .then(waitForController)
  .then(() => import("./app.js"))
  .catch(showStartupError);
