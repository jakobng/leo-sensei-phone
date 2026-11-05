import { bind } from "./vendor/wanakana.mjs";
import {
  cancelJapaneseSpeech,
  japaneseSpeechText,
  playNeuralJapaneseSpeech,
  primeNeuralJapaneseSpeech,
} from "./speech.mjs";
import { gatedApplicationOptions, onboardingSettings } from "./onboarding-core.mjs";
import { initialUiState, reduceUi, reviewReserve } from "./ui-core.mjs";
import { confusionMarkup, inlineReferenceMarkup, referenceContentMarkup } from "./reference-content.mjs";
import { jsonMutationOptions } from "./http.mjs";
import { createStudySync, syncPanelMarkup } from "./sync-client.mjs";
import {
  copyVoiceCustomizationPrompt,
  voiceCustomizationContentMarkup,
} from "./voice-customization.mjs";

const browserBuild = globalThis.leoSenseiWeb;
const syncEnabled = browserBuild ? browserBuild.syncEnabled : !globalThis.desktop;
const root = document.querySelector("#app");
const neuralAudio = new Audio();
const heardLessonCardIds = new Set();
// Read-only display cache; learner progress remains in the server event stream.
const feedbackReferences = new Map();
const pendingFeedbackReferences = new Map();

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const browserSpeechAvailability = (payload) => {
  if (!browserBuild) return payload;
  const daily = (value) => value && Object.hasOwn(value, "speechAvailable")
    ? { ...value, speechAvailable: browserBuild.speechAvailable } : value;
  return payload?.daily ? { ...payload, daily: daily(payload.daily) } : daily(payload);
};

const appUrl = (path) => browserBuild ? new URL(path.slice(1), import.meta.url) : path;

const fetchJson = (url, options, callback) =>
  fetch(appUrl(url), options)
    .then((response) => response.json().then((payload) => ({ response, payload })))
    .then(({ response, payload }) =>
      response.ok
        ? (options?.method && options.method !== "GET" && url !== "/api/reading-check"
            ? studySync?.schedule() : null,
          callback({ ok: true, value: browserSpeechAvailability(payload) }))
        : callback({ ok: false, code: payload.error, error: payload.message ?? payload.error ?? response.statusText }))
    .catch((requestError) => callback({ ok: false, error: requestError.message }));

const postJson = (url, body, callback) => fetchJson(
  url,
  jsonMutationOptions("POST", body),
  callback,
);

const putJson = (url, body, callback) => fetchJson(
  url,
  jsonMutationOptions("PUT", body),
  callback,
);

const patchJson = (url, body, callback) => fetchJson(
  url,
  jsonMutationOptions("PATCH", body),
  callback,
);

const deleteJson = (url, callback) => fetchJson(
  url,
  jsonMutationOptions("DELETE", {}),
  callback,
);

const fetchValue = (url, options) => new Promise((resolve) => fetchJson(url, options, resolve));

let syncView;
let allowSyncApply = false;
const studySync = syncEnabled ? createStudySync({
  scope: new URL(".", import.meta.url).href,
  readLocal: () => fetchValue("/api/sync/state"),
  applyLocal: (data) => fetchValue("/api/sync/state", jsonMutationOptions("POST", data)),
  canApply: () => allowSyncApply,
  onApplied: () => allowSyncApply ? bootstrap("Study progress synced.", syncView === "settings" ? "settings" : null) : null,
}) : null;

const phaseName = (phase) => ({ reading: "Reading", meaning: "Meaning", reverse: "Japanese" })[phase] ?? "Answer";

const kindName = (type) => ({ kanji: "Kanji", vocabulary: "Vocabulary" })[type] ?? "Review";

const activeCard = (state) => state.daily?.queue?.find(({ id }) => id === state.currentId) ?? state.daily?.queue?.[0] ?? null;

const kanjiLiterals = (value) => [...new Set(
  [...String(value ?? "")].filter((character) => /[\u4e00-\u9fff]/u.test(character)),
)];

const kanjiLinksMarkup = (value) => ((literals) => literals.length > 0
  ? `<div class="review-kanji-links">${literals.map((literal) => `<button class="kanji-link" type="button" data-kanji="${escapeHtml(literal)}" lang="ja" title="Open kanji reference for ${escapeHtml(literal)}">${escapeHtml(literal)}</button>`).join("")}</div>`
  : "")(kanjiLiterals(value));

const speak = (text) => browserBuild
  ? browserBuild.speak(text)
  : playNeuralJapaneseSpeech({ player: neuralAudio, text });

const speakFeedback = (feedback) => speak(japaneseSpeechText(feedback));

const speakCard = (card) => speak(card?.speech ?? card?.readings?.[0] ?? card?.item ?? card?.prompt);

const cancelSpeech = () => browserBuild ? browserBuild.cancelSpeech() : cancelJapaneseSpeech({ player: neuralAudio });

const dailyLessonComplete = (daily) => Number(daily?.todayLesson?.total ?? 0) > 0
  && Number(daily?.todayLesson?.completed ?? 0) >= Number(daily?.todayLesson?.total ?? 0);

const progressValues = (daily) => {
  const scheduled = daily.progress.scheduled;
  const reactivations = daily.progress.reactivations;
  const attempted = scheduled.attempted + reactivations.attempted;
  const required = scheduled.required + reactivations.required;
  const cleared = scheduled.eventuallyCorrect + reactivations.eventuallyCorrect;
  return {
    attempted,
    cleared,
    required,
    width: required === 0 ? 100 : Math.min(100, cleared / required * 100),
  };
};

const headerMarkup = (state) => `
  <header class="topbar">
    <button id="homeButton" class="brand brand-button" data-view="home" type="button" aria-label="Japanese Study home">
      <span class="brand-mark" lang="ja">日</span><span>Japanese Study</span>
    </button>
    <div class="topbar-status">
      <button class="statistics-button" data-view="lists" type="button" title="Open study lists"><span aria-hidden="true">≡</span><span>Study lists</span></button>
      ${browserBuild || state.daily.complete ? "" : '<button id="bypassButton" class="quiet-button" type="button">Emergency unlock</button>'}
      <details class="utility-menu"><summary class="icon-button" title="More" aria-label="More"><span aria-hidden="true">•••</span></summary><div>${browserBuild ? "" : '<button data-view="voice" type="button">Voice</button>'}<button data-view="settings" type="button">Settings</button><button data-view="sources" type="button">Sources</button></div></details>
    </div>
  </header>`;

const previousAnswerMarkup = (state) => state.previousAnswer
  ? `<div class="review-history-nav"><button id="previousAnswerButton" class="quiet-button" type="button" ${state.submitting || state.aliasSaving ? "disabled" : ""}><span aria-hidden="true">←</span> Previous answer</button></div>`
  : "";

const answerMarkup = (state, card) => `
  <section class="review-stage kind-${escapeHtml(card.type)} phase-${escapeHtml(state.phase)}">
    <div class="review-context">
      <span class="kind-label">${kindName(card.type)}</span>
      <span class="queue-count">${state.daily.queue.length} remaining</span>
    </div>
    ${previousAnswerMarkup(state)}
    <div class="prompt-wrap">
      <div class="prompt-label">${phaseName(state.phase)}</div>
      <h1 class="study-prompt ${card.promptDirection === "reverse" ? "reverse" : ""}" lang="${card.promptDirection === "reverse" ? "en" : "ja"}">${escapeHtml(card.prompt)}</h1>
      ${card.promptHint ? `<p class="prompt-hint">${escapeHtml(card.promptHint)}</p>` : ""}
      ${state.retryNotice ? `<p class="retry-notice" role="status">${escapeHtml(state.retryNotice)}</p>` : ""}
    </div>
    <form id="answerForm" class="answer-form">
      <label for="answerInput">${phaseName(state.phase)}</label>
      <div class="answer-control">
        <input
          id="answerInput"
          name="answer"
          lang="${state.phase === "meaning" ? "en" : "ja"}"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="${state.phase === "meaning"}"
          required
        />
        <button class="primary-button" type="submit" ${state.submitting ? "disabled" : ""}>${state.phase === "reading" ? "Next" : "Check"}</button>
      </div>
    </form>
    <button id="finishEarlyButton" class="finish-early" type="button">Finish for now</button>
  </section>`;

const aliasFormMarkup = (state, { cardId, kind, label, lang }) => `
  <form class="personal-alias-form" data-alias-form data-alias-card-id="${escapeHtml(cardId)}" data-alias-kind="${kind}">
    <label><span>${label}</span><div><input name="value" lang="${lang}" autocomplete="off" autocapitalize="none" spellcheck="${kind === "meaning"}" required /><button class="alias-button" type="submit" ${state.aliasSaving ? "disabled" : ""}>Add</button></div></label>
    ${state.savedAlias?.cardId === cardId && state.savedAlias?.kind === kind ? `<span class="alias-saved">${kind === "reading" ? "Reading" : "Meaning"} added for future reviews</span>` : ""}
  </form>`;

const personalAliasesMarkup = (state, cardId, includeReading = true) => `
  <div class="personal-alias-editor">
    <span class="personal-alias-heading">Add your own accepted answer</span>
    <div class="personal-alias-grid">
      ${includeReading ? aliasFormMarkup(state, { cardId, kind: "reading", label: "Add accepted reading", lang: "ja" }) : ""}
      ${aliasFormMarkup(state, { cardId, kind: "meaning", label: "Add accepted meaning", lang: "en" })}
    </div>
  </div>`;

const lessonPreviewMarkup = (state) => ((cards, card) => ((composition) => card ? `
  <section class="review-stage lesson-preview">
    ${previousAnswerMarkup(state)}
    <div class="lesson-position">${state.lessonPreviewIndex + 1} of ${cards.length}</div>
    <div class="prompt-wrap"><h1 class="study-prompt" lang="ja">${escapeHtml(card.item)}</h1></div>
    <div class="lesson-details">
      ${card.type === "kanji"
        ? `<div class="lesson-detail lesson-detail-on"><span>On readings <small lang="ja">音読み</small></span><strong lang="ja">${escapeHtml(card.onReadings?.join(" · ") || "-")}</strong></div><div class="lesson-detail lesson-detail-kun"><span>Kun readings <small lang="ja">訓読み</small></span><strong lang="ja">${escapeHtml(card.kunReadings?.join(" · ") || "-")}</strong></div>`
        : `<div class="lesson-detail lesson-detail-reading"><span>Reading</span><strong lang="ja">${escapeHtml(card.readings?.join(" · ") || card.reading || "-")}</strong></div>`}
      <div class="lesson-detail lesson-detail-meanings"><span>Meanings</span><strong>${escapeHtml(card.meanings?.join("; ") || "-")}</strong></div>
    </div>
    ${composition}
    <button class="quiet-button reference-explain" type="button" data-reference-id="${escapeHtml(card.id)}" data-reference-type="${escapeHtml(card.type)}" data-reference-item="${escapeHtml(card.item)}">Explore this ${card.type === "kanji" ? "kanji" : "word"}</button>
    ${personalAliasesMarkup(state, card.id)}
    <div class="feedback-actions"><button id="lessonAudioButton" class="quiet-button" type="button">Hear</button><button id="lessonMarkKnownButton" class="quiet-button lesson-known-button" type="button" ${state.aliasSaving ? "disabled" : ""}>Mark known</button><button id="lessonNextButton" class="primary-button" type="button" data-enter-next ${state.aliasSaving ? "disabled" : ""}>${state.lessonPreviewIndex + 1 === cards.length ? "Start test" : "Next"}</button></div>
  </section>` : "")(card?.components?.length > 0
    ? `<div class="word-composition"><span class="composition-label">Kanji</span><div class="component-list">${card.components.map((component) => `
      <button class="kanji-component" type="button" data-kanji="${escapeHtml(component.literal)}">
        <strong class="component-literal" lang="ja">${escapeHtml(component.literal)}</strong>
        <div><span>${escapeHtml(component.meanings?.[0] || "Kanji")}</span><small lang="ja">${escapeHtml(component.onReadings?.[0] ?? component.kunReadings?.[0] ?? "-")}</small></div>
      </button>`).join("")}</div></div>`
    : ""))(state.daily.lessonCards ?? [], (state.daily.lessonCards ?? [])[state.lessonPreviewIndex]);

const answerResult = (label, submitted, correct) => submitted
  ? `<span class="feedback-submission ${correct ? "correct" : "wrong"}">
      <span>${escapeHtml(label)}:</span><strong lang="${label === "Meaning" ? "en" : "ja"}">${escapeHtml(submitted)}</strong>
      <span class="submission-mark" aria-label="${correct ? "Correct" : "Incorrect"}">${correct ? "✓" : "×"}</span>
    </span>`
  : "";

const aliasButton = (kind, value, saved, saving) => saved === kind
  ? `<span class="alias-saved">Accepted for future reviews</span>`
  : `<button class="alias-button" type="button" data-alias-kind="${kind}" data-alias-value="${escapeHtml(value)}" ${saving ? "disabled" : ""}>Accept “${escapeHtml(value)}”</button>`;

const displayedAnswer = (state) => state.answerReturn ? state.previousAnswer : { cardId: state.currentId, feedback: state.feedback };

const feedbackMarkup = (state, reference = null, comparisonOpen = []) => {
  const { cardId, feedback } = displayedAnswer(state);
  const readOnly = Boolean(state.answerReturn);
  const readingAlias = !feedback.readingCorrect && feedback.submittedReading
    ? aliasButton("reading", feedback.submittedReading, feedback.aliasSaved, state.aliasSaving)
    : "";
  const meaningAlias = !feedback.meaningCorrect && feedback.submittedMeaning
    ? aliasButton("meaning", feedback.submittedMeaning, feedback.aliasSaved, state.aliasSaving)
    : "";
  const resultClass = feedback.correct ? "correct" : "wrong";
  return `
    <div class="feedback-page"><section class="feedback-stage ${resultClass} kind-${escapeHtml(feedback.cardType)}">
      ${readOnly ? '<p class="previous-answer-label">Previous answer <span>· Read only</span></p>' : previousAnswerMarkup(state)}
      <div class="feedback-heading${feedback.confusions?.length ? " has-confusion" : ""}">
        <span class="feedback-symbol" aria-hidden="true">${feedback.correct ? "✓" : "×"}</span>
        <div class="feedback-answer">
          <button class="feedback-word" type="button" lang="ja" title="Open explanation" data-reference-id="${escapeHtml(cardId)}" data-reference-type="${escapeHtml(feedback.cardType)}" data-reference-item="${escapeHtml(feedback.expectedSurface)}">${escapeHtml(feedback.expectedSurface)}</button>
          ${feedback.expectedReading ? `<p class="feedback-reading" lang="ja">${escapeHtml(feedback.expectedReading)}</p>` : ""}
          <ul class="feedback-meanings" aria-label="Correct meanings">${feedback.expectedMeanings.map((meaning) => `<li>${escapeHtml(meaning)}</li>`).join("")}</ul>
        </div>
        <div class="feedback-context">${Number.isInteger(feedback.level) ? `<span class="feedback-level">Level ${feedback.level}</span>` : ""}${confusionMarkup(feedback.confusions)}</div>
      </div>
      <div class="feedback-submitted">
        <span class="feedback-submitted-label">You entered</span>
        <div>${answerResult("Reading", feedback.submittedReading, feedback.readingCorrect)}
          ${answerResult("Meaning", feedback.submittedMeaning, feedback.meaningCorrect)}
          ${feedback.submittedReading || feedback.submittedMeaning ? "" : answerResult("Japanese", feedback.submittedReverse, feedback.correct)}</div>
      </div>
      <div class="feedback-tools">${state.daily.speechAvailable ? `<button id="audioButton" class="audio-button" type="button" title="Play Japanese pronunciation"><span aria-hidden="true">▶</span><span>Hear again</span></button>` : ""}</div>
      ${readOnly ? '<div class="feedback-actions single"><button id="returnToReviewButton" class="primary-button continue-button" type="button" data-enter-next>Return to review</button></div>' : `
      <details class="feedback-editor" ${state.aliasSaving || feedback.aliasSaved || state.savedAlias?.cardId === state.currentId ? "open" : ""}>
        <summary>Edit accepted answers</summary>
        ${readingAlias || meaningAlias ? `<div class="alias-actions">${readingAlias}${meaningAlias}</div>` : ""}
        ${personalAliasesMarkup(state, state.currentId, Boolean(feedback.expectedReading))}
        ${state.daily.practice ? "" : `<button id="markKnownButton" class="quiet-button known-button" type="button" ${state.submitting || state.aliasSaving ? "disabled" : ""}>Mark known</button>`}
      </details>
      <div class="feedback-actions ${feedback.answerEventId ? "" : "single"}">
        ${feedback.answerEventId
          ? `<button id="redoButton" class="quiet-button redo-button" type="button" ${state.submitting || state.aliasSaving ? "disabled" : ""}><span aria-hidden="true">↻</span><span>Redo word</span></button>`
          : ""}
        <button id="continueButton" class="primary-button continue-button" type="button" data-enter-next ${state.submitting || state.aliasSaving ? "disabled" : ""} autofocus>Continue</button>
      </div>
      <button id="finishEarlyButton" class="finish-early" type="button" ${state.aliasSaving ? "disabled" : ""}>Finish for now</button>`}
    </section>
    <section class="feedback-reference" aria-label="Study notes">
      <header><h2>Study notes</h2></header>
      <div id="feedbackReference" data-reference-card-id="${escapeHtml(cardId)}">${reference
        ? inlineReferenceMarkup({ ...reference, comparisonOpen })
        : '<p class="inline-reference-loading" role="status">Loading study notes…</p>'}</div>
    </section></div>`;
};

const firstTryMarkup = (daily) => daily.firstTry
  ? `<div class="first-try-stat"><strong>${Math.round(Number(daily.firstTry.rate ?? 0) * 100)}%</strong><span>right first time</span><small>${Number(daily.firstTry.correct ?? 0)} of ${Number(daily.firstTry.attempted ?? 0)} cards</small></div>`
  : "";

const completeMarkup = (state) => `
  <section class="complete-stage">
    <div class="completion-mark" aria-hidden="true">✓</div>
    <span>${state.daily.lesson ? "New words" : state.daily.practice ? "Practice" : state.daily.extra ? "Extra study" : "Daily study"}</span>
    <h1>${state.daily.lesson ? "Lesson complete" : state.daily.practice ? "Practice complete" : state.daily.extra ? "Batch complete" : "You’re clear for today"}</h1>
    <p>${state.daily.lesson ? "These cards are now in your review schedule." : state.daily.practice ? "Correct answers do not promote cards; mistakes may lower their level." : state.daily.extra ? "Scheduling state updated." : browserBuild ? "Today’s review goal is complete." : "Work access is open."}</p>
    ${state.daily.lesson ? "" : firstTryMarkup(state.daily)}
    <div class="completion-actions">${state.daily.lesson || state.daily.practice || Number(state.daily.availableReviews ?? 0) === 0 ? "" : `<button id="extraButton" class="primary-button" type="button" data-enter-next>Continue reviews (${Number(state.daily.availableReviews).toLocaleString()})</button>`}</div>
    ${previousAnswerMarkup(state)}
  </section>`;

const summaryMarkup = (state) => ((progress) => `
  <section class="complete-stage review-summary">
    <span>Review paused</span>
    <h1>${progress.attempted} words seen · ${progress.cleared} cleared</h1>
    <p>${state.daily.queue.length} still need a correct answer. Missed words repeat; ${state.daily.practice ? "correct answers do not promote cards, while mistakes may lower their level." : "your answers and scheduling are saved."}</p>
    ${firstTryMarkup(state.daily)}
    <button id="resumeButton" class="primary-button" type="button">Resume reviews</button>
    ${previousAnswerMarkup(state)}
  </section>`)(progressValues(state.daily));

const durationLabel = (minutes) => ((count) => count % 60 === 0
  ? `${count / 60} hour${count / 60 === 1 ? "" : "s"}`
  : `${count} minutes`)(Number(minutes ?? 240));

const bypassDescription = (state) => state.gateBehavior === "prompt"
  ? `This pauses review reminders for ${durationLabel(state.daily.bypassMinutes)}. Each unlock adds up to 50 extra reviews tomorrow. If you still do not clear today, up to another 50 will be added.`
  : `This unlocks your selected browsers for ${durationLabel(state.daily.bypassMinutes)}. Each unlock adds up to 50 extra reviews tomorrow. If you still do not clear today, up to another 50 will be added.`;

const bypassMarkup = (state) => state.bypassOpen
  ? `<dialog id="bypassDialog">
      <div class="dialog-header"><h2>Emergency unlock</h2><p>${bypassDescription(state)}</p></div>
      <form id="bypassForm" class="bypass-form">
        <div class="dialog-actions">
          <button id="cancelBypass" class="quiet-button" type="button">Cancel</button>
          <button class="primary-button" type="submit" ${state.submitting ? "disabled" : ""}>Unlock for ${durationLabel(state.daily.bypassMinutes)}</button>
        </div>
      </form>
    </dialog>`
  : "";

const studyListDailyNew = (state, list) => Number(
  list.dailyNew ?? state.settings.studyListDailyNew?.[list.id] ?? 0,
);

const dailyNewMarkup = (state, compact = false, details = false) => `<div class="study-list-inputs ${compact ? "compact" : ""}">
  ${state.studyLists.map((list) => `
    <div class="study-list-input">
      <span><strong>${escapeHtml(list.label)}</strong><small>${Number(list.progress?.total ?? 0).toLocaleString()} words</small></span>
      <div class="study-list-controls">
        ${details ? `<button class="quiet-button" type="button" data-view-study-list="${escapeHtml(list.id)}" data-study-list-label="${escapeHtml(list.label)}">View</button>` : ""}
        <label class="daily-new-control"><span>New / day</span><input name="dailyNew:${escapeHtml(list.id)}" type="number" min="0" max="100" step="1" value="${escapeHtml(studyListDailyNew(state, list))}" aria-label="New cards per day for ${escapeHtml(list.label)}" /></label>
      </div>
    </div>`).join("")}
</div>`;

const applicationOptionsMarkup = ({ applications, hiddenLegend = false, legend, name, settings }) => applications.length > 0
  ? `<fieldset class="application-options">
      <legend class="${hiddenLegend ? "visually-hidden" : ""}">${escapeHtml(legend)}</legend>
      ${applications.map(({ identity, name: applicationName }) => `
        <label class="application-option">
          <input type="checkbox" name="${name}" value="${escapeHtml(identity)}" ${(settings.gatedApplications ?? []).includes(identity) ? "checked" : ""} />
          <span>${escapeHtml(applicationName)}</span>
        </label>`).join("")}
    </fieldset>`
  : "";

const browserModeMarkup = (state, onboarding) => onboarding
  ? `<input name="gateMode" type="hidden" value="${state.gateBehavior === "prompt" ? "prompt" : "redirect"}" />`
  : `<fieldset class="segmented-control">
      <legend>${state.gateBehavior === "prompt" ? "Review reminders" : "Browser blocking"}</legend>
      ${(state.gateBehavior === "prompt"
        ? [["off", "No reminders"], ["prompt", "Remind me"]]
        : [["off", "No blocking"], ["prompt", "Remind me"], ["redirect", "Block selected browsers"]]
      ).map(([value, label]) => `<label><input type="radio" name="gateMode" value="${value}" ${(state.settings.gateMode === "redirect" && state.gateBehavior === "prompt" ? "prompt" : state.settings.gateMode) === value ? "checked" : ""} /><span>${label}</span></label>`).join("")}
    </fieldset>`;

const customListImportMarkup = (formId) => `<form id="${formId}" class="file-form custom-list-form" data-import-form>
  <label for="${formId}Label">List name</label>
  <input id="${formId}Label" name="label" type="text" required />
  <label for="${formId}File">CSV or TSV file</label>
  <input id="${formId}File" name="table" type="file" accept="text/csv,text/tab-separated-values,.csv,.tsv" required />
  <button class="quiet-button" type="submit">Add list</button>
</form>`;

const listImportFieldsMarkup = (buttonLabel) => `
  <p class="list-format-help">One word per line: Japanese, reading, English meaning. Separate each part with a comma or tab. Type is an optional fourth value.</p>
  <textarea name="table" rows="6" placeholder="集まる, あつまる, to gather"></textarea>
  <label class="file-picker">CSV or TSV file<input name="file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" /></label>
  <button class="quiet-button" type="submit">${escapeHtml(buttonLabel)}</button>`;

const readImportTable = (form, callback) => ((data, file, table) => typeof file?.text === "function"
  ? file.text()
      .then((contents) => callback([table, contents].filter(Boolean).join("\n"), null))
      .catch((readError) => callback("", readError.message))
  : callback(table, null))(
  new FormData(form),
  new FormData(form).get("file"),
  String(new FormData(form).get("table") ?? "").trim(),
);

const settingsFieldsMarkup = (state, { formId, onboarding = false, submitLabel }) => `
  <form id="${formId}" class="settings-form">
    <fieldset class="form-section">
      <legend>New words</legend>
      <p>Set New / day for each list. Use 0 to pause a list. You can add your own list after setup.</p>
      ${dailyNewMarkup(state, true)}
      <p class="source-note">Unofficial lists. The JLPT does not publish official vocabulary lists.</p>
    </fieldset>
    <fieldset class="form-section">
      <legend>How many reviews should you finish each day?</legend>
      <label class="number-field" for="requiredDailyCount">
        <span>Reviews</span>
        <input id="requiredDailyCount" name="requiredDailyCount" type="number" min="1" step="1" value="${escapeHtml(state.settings.requiredDailyCount)}" required />
      </label>
    </fieldset>
    ${browserBuild ? '<input name="gateMode" type="hidden" value="off" />' : `<fieldset class="form-section">
      <legend>Browsers</legend>
      <p>${state.gateBehavior === "prompt"
        ? "Linux Wayland cannot block browser windows. Leo Sensei will remind you to finish today’s reviews instead. You can still choose browsers for an X11 session."
        : "Choose your main browser. Leo Sensei will block it until you finish today’s reviews. You can choose more than one."}</p>
      ${browserModeMarkup(state, onboarding)}
      ${applicationOptionsMarkup({ applications: state.browserCandidates, hiddenLegend: true, legend: "Browser choices", name: "selectedBrowsers", settings: state.settings })}
      <p>Other apps are optional. Codex or Claude running in Terminal count as Terminal. To block another app, ask your AI coding agent to add it.</p>
      ${applicationOptionsMarkup({ applications: state.applicationCandidates, legend: "Other apps (optional)", name: "selectedApplications", settings: state.settings })}
    </fieldset>`}
    ${state.error ? `<div class="form-error" role="alert">${escapeHtml(state.error)}</div>` : ""}
    <div class="form-submit"><button class="primary-button" type="submit" ${state.submitting ? "disabled" : ""}>${submitLabel}</button></div>
  </form>`;

const restoreFormMarkup = `<form id="restoreForm" class="file-form"><label for="restoreFile">Restore backup</label><input id="restoreFile" name="backup" type="file" accept="application/json,.json" required /><button class="quiet-button" type="submit">Restore</button></form>`;

const onboardingMarkup = (state) => `
  <main class="onboarding-shell">
    <div class="onboarding-form-wrap">
      <header class="onboarding-heading"><span class="onboarding-mark" aria-hidden="true">日</span><h1>Leo Sensei <span lang="ja">の-nonsense 日本語</span></h1><p>Choose what you want to study and how many reviews you want to do each day.</p></header>
      ${settingsFieldsMarkup(state, { formId: "onboardingForm", onboarding: true, submitLabel: "Start studying" })}
      ${browserBuild ? `<details><summary>Bring your study progress from your laptop</summary><p>Download a backup from Settings on your laptop, then choose that file here.</p>${restoreFormMarkup}</details>` : ""}
      ${syncEnabled ? syncPanelMarkup : ""}
      <button class="source-link" data-view="sources" type="button">Sources and licenses</button>
    </div>
  </main>`;

const managementHeaderMarkup = (state, title) => `${headerMarkup(state)}<div class="management-title"><h1>${escapeHtml(title)}</h1></div>`;

const compactDate = (value) => String(value ?? "").slice(5).replace("-", "/");

const activityMarkup = (days) => ((maximum) => `
  <section class="activity-panel" aria-labelledby="activityTitle">
    <div class="detail-heading"><span>Completed reviews</span><h2 id="activityTitle">Study history</h2></div>
    <div class="activity-chart">${days.map((entry, index) => `
      <div class="activity-day">
        <span class="activity-value">${entry.completed || ""}</span>
        <div class="activity-bar-track"><div class="activity-bar ${entry.complete ? "complete" : ""}" style="height:${Math.max(4, entry.completed / maximum * 100)}%"></div></div>
        <span class="activity-date ${index % 2 === 1 ? "alternate" : ""}">${compactDate(entry.studyDate)}</span>
      </div>`).join("")}</div>
  </section>`)(Math.max(1, ...days.map(({ completed }) => completed)));

const metricMarkup = (label, value, detail) => `
  <div class="stat-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`;

const journeyDate = (value) => value ? value.slice(5, 10).replace("-", "/") : "";

const masteryGraphMarkup = (label, entries, key) => ((values) => ((maximum) => ((points) => `
  <section class="mastery-graph" aria-label="${escapeHtml(label)} lifetime journey">
    <span>${escapeHtml(label)}</span><strong>${values.at(-1) ?? 0}</strong>
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" /></svg>
    <small>${journeyDate(entries[0]?.studyDate)} - today</small>
  </section>`)(values.map((value, index) => `${index / Math.max(1, values.length - 1) * 100},${36 - value / maximum * 32}`).join(" ")))(Math.max(1, ...values)))(
  entries.map((entry) => Number(entry[key] ?? 0)),
);

const stageMetrics = (levels) => [
  { id: "learning", label: "Learning", count: levels.slice(0, 4).reduce((total, count) => total + count, 0), detail: "levels 1 to 4" },
  { id: "familiar", label: "Familiar", count: levels.slice(4, 6).reduce((total, count) => total + count, 0), detail: "levels 5 to 6" },
  { id: "strong", label: "Strong", count: levels.slice(6, 8).reduce((total, count) => total + count, 0), detail: "levels 7 to 8" },
  { id: "retired", label: "Retired", count: levels[8] ?? 0, detail: "level 9, no more reviews" },
];

const progressBandMarkup = (cardType, band) => `
  <button class="stat-metric progress-band" type="button" data-progress-type="${escapeHtml(cardType)}" data-progress-band="${escapeHtml(band.id)}" data-progress-label="${escapeHtml(band.label)}" aria-label="View ${escapeHtml(band.label)} ${escapeHtml(kindName(cardType).toLowerCase())}"><span>${escapeHtml(band.label)}</span><strong>${Number(band.count ?? 0)}</strong><small>${escapeHtml(band.detail)}</small></button>`;

const levelMarkup = (levels) => ((maximum) => `
  <div class="level-grid">${levels.map((count, index) => `
    <div class="level-row"><span class="level-number">${index + 1}</span><div class="level-track"><div class="level-fill level-${index + 1}" style="width:${count / maximum * 100}%"></div></div><strong>${count}</strong></div>`).join("")}</div>`)(Math.max(1, ...levels));

const cardProgressMarkup = (state) => ((progress) => ((levels) => `
      <div class="progress-summary">${(Array.isArray(progress?.bands) ? progress.bands : stageMetrics(levels)).map((band) => progressBandMarkup(state.statsTab, band)).join("")}</div>
      <div class="level-section"><h3>Levels 1 to 9</h3>${levelMarkup(levels)}</div>`)(progress?.levels ?? Array(9).fill(0)))(state.stats.progress?.[state.statsTab]);

const detailedStatsMarkup = (state) => state.stats ? ((mastery, days) => `
  <section class="stats-detail" aria-label="Detailed study statistics">
    <h2 class="statistics-title">Statistics</h2>
    <section class="stats-overview">${metricMarkup("Daily streak", String(state.stats.streak), "required queues cleared")}${masteryGraphMarkup("Kanji level 5+", mastery, "kanji")}${masteryGraphMarkup("Vocabulary level 5+", mastery, "vocabulary")}</section>
    ${activityMarkup(days)}
    <section class="progress-panel" aria-labelledby="progressTitle">
      <div class="detail-heading"><h2 id="progressTitle">Card progress</h2></div>
      <div class="stats-tabs" role="tablist" aria-label="Card type">${["kanji", "vocabulary"].map((type) => `<button class="stats-tab ${state.statsTab === type ? "active" : ""}" type="button" role="tab" aria-selected="${state.statsTab === type}" data-stats-tab="${type}">${kindName(type)}</button>`).join("")}</div>
      ${cardProgressMarkup(state)}
    </section>
  </section>`)(
  Array.isArray(state.stats.mastery) ? state.stats.mastery : [],
  Array.isArray(state.stats.activity?.days) ? state.stats.activity.days.slice(-30) : [],
) : "";

const homeMarkup = (state) => ((reviews, plannedNew) => `
  ${managementHeaderMarkup(state, "Today")}
  <main class="home-main">
    <section class="home-actions-groups" aria-label="Today's study">
      <div class="home-group vocab-home-group"><div class="home-group-label">Vocab &amp; Kanji</div><div class="home-pair">
        <button id="homeReviewButton" class="home-action review-action review-state-${reviews.unlocked ? reviews.backlogRemaining > 0 ? "unlocked" : "complete" : "pending"}" type="button"><span>Reviews</span><strong>${reviews.completed.toLocaleString()} / ${reviews.total.toLocaleString()}</strong><div class="review-reserve-track" aria-label="${reviews.completed} of ${reviews.total} reviews cleared${browserBuild ? "" : `, unlock at ${reviews.threshold}`}"><div class="review-reserve-fill" style="width:${reviews.fillPct}%"></div>${browserBuild ? "" : `<div class="review-unlock-marker" style="left:${reviews.markerPct}%" title="Unlock at ${reviews.threshold}">${reviews.threshold}</div>`}</div><small>${browserBuild ? `${reviews.backlogRemaining.toLocaleString()} reviews remain` : reviews.unlocked ? reviews.backlogRemaining === 0 ? "All reviews cleared · laptop unlocked" : `Laptop unlocked · ${reviews.backlogRemaining.toLocaleString()} reviews remain` : `Clear ${Math.max(0, reviews.threshold - reviews.gateCleared)} more to unlock your computer`}</small></button>
        <button id="homeLessonButton" class="home-action lesson-action" type="button" ${plannedNew === 0 || state.submitting ? "disabled" : ""}><span>${dailyLessonComplete(state.daily) ? "Learn more words" : "Learn new words"}</span><strong>${state.daily.todayLesson?.completed ?? 0} / ${state.daily.todayLesson?.total || plannedNew}</strong><div class="review-reserve-track"><div class="review-reserve-fill" style="width:${state.daily.todayLesson?.total ? Number(state.daily.todayLesson.completed ?? 0) / Number(state.daily.todayLesson.total) * 100 : 0}%"></div></div><small>${plannedNew === 0 ? "Set a study list" : dailyLessonComplete(state.daily) ? "Add another batch" : state.daily.todayLesson?.total > 0 ? "Lesson in progress" : "Ready when you are"}</small></button>
      </div></div>
    </section>
    ${detailedStatsMarkup(state)}
  </main>`)(reviewReserve(state.daily), state.studyLists.reduce((total, list) => total + studyListDailyNew(state, list), 0));

const studyListLevelLabel = (level) => Number.isInteger(level) ? `Level ${level}` : "Not learned yet";

const sortedStudyListItems = (items, sort) => sort === "default"
  ? items
  : [...items].toSorted((left, right) => ((leftLevel, rightLevel) => leftLevel === rightLevel
    ? String(left.item).localeCompare(String(right.item), "ja")
    : sort === "level-high" ? rightLevel - leftLevel : leftLevel - rightLevel)(
    Number.isInteger(left.level) ? left.level : sort === "level-high" ? -1 : 10,
    Number.isInteger(right.level) ? right.level : sort === "level-high" ? -1 : 10,
  ));

const studyListDetailMarkup = (state) => ((detail) => `
  ${managementHeaderMarkup(state, detail.practice ? "Card progress" : "Study lists")}
  <main class="management-main study-list-browser">
    <div class="study-list-detail-heading">
      <button id="backStudyListButton" class="icon-button" type="button" title="Back to ${detail.practice ? "card progress" : "study lists"}" aria-label="Back to ${detail.practice ? "card progress" : "study lists"}"><span aria-hidden="true">←</span></button>
      <div><span>${detail.practice ? "Progress" : "Study list"}</span><h2>${escapeHtml(detail.label)}</h2></div>
    </div>
    ${state.error ? `<div class="form-error" role="alert">${escapeHtml(state.error)}</div>` : ""}
    ${detail.loading
      ? '<div class="study-list-loading" role="status">Loading list</div>'
      : `${detail.custom ? `<form id="renameStudyListForm" class="rename-study-list-form"><label>List name<input name="label" value="${escapeHtml(detail.label)}" required /></label><button class="quiet-button" type="submit">Save name</button></form>` : ""}
        <div class="study-list-browser-toolbar"><div class="study-list-browser-actions"><span>${detail.items.length} words</span>${detail.practice ? `<button id="practiceAllButton" class="primary-button" type="button" ${detail.items.length === 0 || state.submitting ? "disabled" : ""}>Review all</button>` : ""}</div><label>Order <select id="studyListSort"><option value="default" ${state.studyListSort === "default" ? "selected" : ""}>Default</option><option value="level-high" ${state.studyListSort === "level-high" ? "selected" : ""}>Level high to low</option><option value="level-low" ${state.studyListSort === "level-low" ? "selected" : ""}>Level low to high</option></select></label></div>
        <div class="study-list-items" role="table" aria-label="${escapeHtml(detail.label)} words">
          <div class="study-list-item-head ${detail.custom ? "editable" : ""}" role="row"><span>Japanese</span><span>Reading</span><span>Meaning</span><span>Type</span><span>Level</span>${detail.custom ? "<span>Remove</span>" : ""}</div>
          ${sortedStudyListItems(detail.items, state.studyListSort).map((item) => `<div class="study-list-item-row ${detail.custom ? "editable" : ""}" role="row">
            <div class="study-list-item-japanese"><strong lang="ja">${escapeHtml(item.item)}</strong>${kanjiLinksMarkup(item.item)}<button class="quiet-button reference-explain" type="button" data-reference-item="${escapeHtml(item.item)}" data-reference-type="${escapeHtml(item.type)}" data-reference-reading="${escapeHtml(item.reading)}">Details</button></div>
            <span lang="ja">${escapeHtml(item.reading || "-")}</span>
            <span>${escapeHtml(item.meanings.join("; "))}</span>
            <span>${escapeHtml(kindName(item.type))}</span>
            <span class="study-list-level ${Number.isInteger(item.level) ? `level-${item.level}` : "unstarted"}">${escapeHtml(studyListLevelLabel(item.level))}</span>
            ${detail.custom ? `<button class="icon-button remove-study-list-item" type="button" data-remove-study-list-item="${escapeHtml(item.id)}" title="Remove ${escapeHtml(item.item)}" aria-label="Remove ${escapeHtml(item.item)}">×</button>` : ""}
          </div>`).join("")}
        </div>
        ${detail.custom ? `<section class="detail-list-editor"><h2>Add words</h2><form id="addStudyListWordsForm" class="custom-study-list-form">${listImportFieldsMarkup("Add words")}</form><button id="deleteStudyListButton" class="quiet-button delete-study-list" type="button">Delete list</button></section>` : ""}`}
  </main>`)(state.studyListDetail);

const studyListGridMarkup = (state) => `<div class="study-list-grid">
  ${state.studyLists.map((list) => ((progress, total, stages) => `<section class="study-list-row">
    <div class="study-list-heading">
      <button class="study-list-name-link" type="button" data-view-study-list="${escapeHtml(list.id)}" data-study-list-label="${escapeHtml(list.label)}">${escapeHtml(list.label)}</button>
      <div class="study-list-actions">
        <label><span>New / day</span><input name="dailyNew:${escapeHtml(list.id)}" type="number" min="0" max="100" step="1" value="${escapeHtml(studyListDailyNew(state, list))}" aria-label="New cards per day for ${escapeHtml(list.label)}" /></label>
      </div>
    </div>
    <div class="study-list-progress" aria-label="${progress.known} known, ${progress.learning} in review, ${progress.unstarted} not added, out of ${total}">
      <div class="study-list-track">${stages.map((count, index) => count === 0 ? "" : `<span class="study-list-segment level-${index + 1}" style="width:${count / Math.max(1, total) * 100}%"></span>`).join("")}${progress.unstarted === 0 ? "" : `<span class="study-list-segment unstarted" style="width:${progress.unstarted / Math.max(1, total) * 100}%"></span>`}</div>
      <div class="study-list-counts"><span><strong>${progress.known}</strong> known</span><span>${progress.learning} in review</span><span>${progress.unstarted} not added</span></div>
    </div>
  </section>`)(
    list.progress ?? {},
    Number(list.progress?.total ?? 0),
    Array.from({ length: 9 }, (_, index) => Number(list.progress?.stages?.[index] ?? 0)),
  )).join("")}
</div>`;

const studyListsMarkup = (state) => state.studyListDetail
  ? studyListDetailMarkup(state)
  : `${managementHeaderMarkup(state, "Study lists")}
    <main class="management-main study-lists-main">
      ${state.notice ? `<div class="notice-band" role="status">${escapeHtml(state.notice)}</div>` : ""}
      <form id="studyListsForm" class="study-lists-form">
        <section class="study-list-group"><div class="study-list-group-heading"><h2>Vocab &amp; Kanji</h2><span>New cards per day by list</span></div>${studyListGridMarkup(state)}</section>
        ${state.error ? `<div class="form-error" role="alert">${escapeHtml(state.error)}</div>` : ""}
        <div class="form-submit"><button class="primary-button" type="submit">Save daily plan</button></div>
      </form>
      <section class="add-list-section"><h2>Add your own list</h2><form id="customStudyListForm" class="custom-study-list-form"><label>List name<input name="name" placeholder="Travel words" required /></label>${listImportFieldsMarkup("Create list")}</form></section>
    </main>`;

const settingsMarkup = (state) => `
  ${managementHeaderMarkup(state, "Settings")}
  <main class="management-main">
    ${state.notice ? `<div class="notice-band" role="status">${escapeHtml(state.notice)}</div>` : ""}
    <div class="management-layout">
      <section class="settings-pane"><div class="pane-heading"><h2>Daily setup</h2></div>${settingsFieldsMarkup(state, { formId: "settingsForm", submitLabel: "Save settings" })}</section>
      <aside class="data-pane">
        ${syncEnabled ? syncPanelMarkup : ""}
        <section><div class="pane-heading"><span>Backup</span><h2>Learner data</h2></div><button id="backupButton" class="quiet-button full-button" type="button">Download backup</button>${restoreFormMarkup}</section>
        <section><div class="pane-heading"><h2>Add your own list</h2></div>${customListImportMarkup("settingsImportForm")}</section>
      </aside>
    </div>
  </main>`;

const kanjiDetailMarkup = (kanji) => kanji
  ? `<dialog id="kanjiDialog" class="kanji-dialog" aria-label="${kanji.type === "vocabulary" ? "Vocabulary" : "Kanji"} reference">
      <div class="kanji-dialog-header">${kanji.hasPrevious ? '<button id="referenceBackButton" class="icon-button" type="button" aria-label="Back to previous item">←</button>' : ""}
        <span>${kanji.type === "vocabulary" ? "Vocabulary" : "Kanji"} reference</span><button id="closeKanjiButton" class="icon-button" type="button" title="Close reference" aria-label="Close reference">×</button></div>
      ${kanji.loading
        ? `<div class="kanji-loading"><strong lang="ja">${escapeHtml(kanji.item || kanji.literal)}</strong><span>Loading reference…</span></div>`
        : kanji.referenceError ? `<p class="reference-error" role="alert">${escapeHtml(kanji.referenceError)}</p>`
        : referenceContentMarkup(kanji)}
    </dialog>`
  : "";

const sourcesMarkup = (state) => `
  ${managementHeaderMarkup(state, "Sources")}
  <main class="sources-main">
    <header><span>About</span><h2>Built for direct, local study.</h2><p>Leo Sensei の-nonsense 日本語 keeps progress on this computer as an append-only learning history.</p></header>
    <section><span>Vocabulary decks</span><h3>Unofficial JLPT approximations</h3><p>N5-N1 vocabulary is derived from <strong>open-anki-jlpt-decks</strong>, pinned at commit <code>1ad66734417aca9dbcca6b2d5ee440cb13ab3ba0</code>. MIT License, Copyright (c) 2020 Jamie Sinclair.</p><p>The JLPT does not publish official vocabulary lists. Each list has its own New / day setting.</p></section>
    <section><span>Dictionary material</span><h3>EDRDG acknowledgement</h3><p>This product may use material from the JMdict and KANJIDIC2 dictionary files. Copyright is held by the Electronic Dictionary Research and Development Group and contributors. Dictionary material is used under CC BY-SA 4.0.</p></section>
    <section><span>Kanji reference</span><h3>Components, look-alikes and sound families</h3><p>Component diagrams use KanjiVG, © Ulrich Apel, under CC BY-SA 3.0. Radical and phonetic information comes from Kanjium; look-alike links also use similar-kanji by siikamiika (MIT). The phonetics and other additions to EDICT, KANJIDIC and KRADFILE were provided by Uros O. through his free database, under CC BY-SA 4.0.</p></section>
    <section><span>Vocabulary reference</span><h3>Dictionary senses and examples</h3><p>English dictionary senses and usage labels use EDRDG JMdict via jmdict-simplified (CC BY-SA 4.0). Linked examples come from the Tanaka Corpus / Tatoeba contributors (CC BY 2.0 FR); each example links to its source.</p></section>
    <section><span>Runtime</span><h3>Open components</h3><p>Review progress uses a nine-stage schedule. Japanese input uses WanaKana. Pronunciation is unavailable by default and appears only when an optional external loopback service is configured.</p></section>
  </main>`;

const voiceMarkup = (state) => `${managementHeaderMarkup(state, "Voice")}${voiceCustomizationContentMarkup}`;

const pageMarkup = (state, reference = null, comparisonOpen = []) => {
  const card = activeCard(state);
  const content = state.answerReturn
    ? feedbackMarkup(state, reference, comparisonOpen)
    : state.summaryOpen
    ? summaryMarkup(state)
    : state.feedback
      ? feedbackMarkup(state, reference, comparisonOpen)
      : state.lessonPreviewIndex >= 0
        ? lessonPreviewMarkup(state)
    : state.daily.complete
      ? completeMarkup(state)
      : card
        ? answerMarkup(state, card)
        : '<section class="complete-stage"><h1>Queue unavailable</h1></section>';
  const page = state.view === "onboarding"
    ? onboardingMarkup(state)
    : state.view === "home"
      ? homeMarkup(state)
      : state.view === "lists"
        ? studyListsMarkup(state)
    : state.view === "settings"
      ? settingsMarkup(state)
      : state.view === "voice"
        ? voiceMarkup(state)
        : state.view === "sources"
          ? sourcesMarkup(state)
          : `
          ${headerMarkup(state)}
          ${state.error ? `<div class="error-band" role="alert">${escapeHtml(state.error)}</div>` : ""}
          <main class="review-main">${content}</main>`;
  return `${page}${bypassMarkup(state)}${kanjiDetailMarkup(state.kanjiDetail)}`;
};

const reviewPayload = (state, answer) => ({
  extraSessionId: state.daily.extraSessionId,
  cardId: state.currentId,
  readingAnswer: state.readingAnswer,
  meaningAnswer: state.phase === "meaning" ? answer : undefined,
  reverseAnswer: state.phase === "reverse" ? answer : undefined,
});

const submitReview = ({ state, answer, transition }) => postJson(
  state.daily.extra || state.daily.practice ? "/api/extra-review" : "/api/review",
  reviewPayload(state, answer),
  (result) => result.ok
    ? result.value.retry
      ? transition({ type: "review_retry", daily: result.value.daily, message: result.value.message })
      : (speakFeedback(result.value),
        transition({ type: "review_recorded", daily: result.value.daily, feedback: result.value }))
    : transition({ type: "request_failed", error: result.error }),
);

const dailyLimitsFromForm = (form) => ((data) => Object.fromEntries(
  [...data.entries()]
    .filter(([name]) => name.startsWith("dailyNew:"))
    .map(([name, value]) => [name.slice("dailyNew:".length), Number(value)]),
))(new FormData(form));

const settingsFromForm = (form) => ((data) => onboardingSettings({
  studyListDailyNew: dailyLimitsFromForm(form),
  requiredDailyCount: data.get("requiredDailyCount"),
  gateMode: data.get("gateMode"),
  selectedBrowsers: data.getAll("selectedBrowsers"),
  selectedApplications: data.getAll("selectedApplications"),
}))(new FormData(form));

const stateWithDaily = (state, daily, settings = state.settings) => ({
  ...initialUiState(daily),
  previousAnswer: state.daily?.studyDate === daily.studyDate ? state.previousAnswer : null,
  settings,
  decks: state.decks,
  studyLists: state.studyLists,
  browserCandidates: state.browserCandidates,
  applicationCandidates: state.applicationCandidates,
  gateBehavior: state.gateBehavior,
  stats: state.stats,
  statsTab: state.statsTab,
  studyListDetail: state.studyListDetail,
  studyListSort: state.studyListSort,
  kanjiDetail: state.kanjiDetail,
  referenceHistory: state.referenceHistory,
  notice: state.notice,
  view: state.view,
});

const persistSettings = ({ state, form, nextView }) => ((settingsResult) => settingsResult.ok
  ? (render({ ...state, submitting: true, error: null }), postJson(
      "/api/study-lists",
      { dailyLimits: settingsResult.value.studyListDailyNew },
      (listResult) => listResult.ok
        ? putJson("/api/settings", browserBuild && state.settings.onboardingComplete
          ? { ...settingsResult.value, gateMode: state.settings.gateMode, gatedApplications: state.settings.gatedApplications }
          : settingsResult.value, (saveResult) => saveResult.ok
            ? bootstrap(nextView === "settings" ? "Settings saved." : null, nextView)
            : render({ ...state, submitting: false, error: saveResult.error }))
        : render({ ...state, submitting: false, error: listResult.error }),
    ))
  : render({ ...state, submitting: false, error: settingsResult.error.join(" ") }))(settingsFromForm(form));

const openView = (state, view) => view === "review"
    ? fetchValue("/api/daily").then((daily) => daily.ok
      ? render({ ...stateWithDaily(state, daily.value), view: "review", error: null, notice: null })
      : render({ ...state, error: daily.error }))
  : ["settings", "lists"].includes(view)
    ? Promise.all([fetchValue("/api/daily"), fetchValue("/api/study-lists")])
      .then(([daily, lists]) => daily.ok && lists.ok
        ? render({
            ...stateWithDaily(state, daily.value),
            view,
            studyLists: lists.value.lists,
            studyListDetail: view === "lists" ? null : state.studyListDetail,
            studyListSort: view === "lists" ? "default" : state.studyListSort,
            error: null,
            notice: null,
          })
        : render({ ...state, error: [daily, lists].find((result) => !result.ok)?.error }))
  : view === "home"
    ? ((statsRequest) => Promise.all([fetchValue("/api/daily"), fetchValue("/api/study-lists")])
      .then(([daily, lists]) => daily.ok && lists.ok
        ? ((homeState) => (
            render(homeState),
            ((homeNode) => statsRequest.then((stats) => stats.ok && root.querySelector(".home-main") === homeNode
              ? render({ ...homeState, stats: stats.value, error: null })
              : null))(root.querySelector(".home-main"))
          ))({
            ...stateWithDaily(state, daily.value),
            view,
            studyLists: lists.value.lists,
            error: null,
            notice: null,
          })
        : render({ ...state, error: [daily, lists].find((result) => !result.ok)?.error })))(fetchValue("/api/stats"))
    : render({ ...state, view, error: null, notice: null });

const downloadBackup = (state) => fetchJson("/api/backup", undefined, (result) => result.ok
  ? ((url) => ((link) => (
      link.click(),
      setTimeout(() => URL.revokeObjectURL(url), 0),
      render({ ...state, notice: "Backup created.", error: null })
    ))(Object.assign(document.createElement("a"), {
        download: `leo-sensei-backup-${result.value.exportedAt.slice(0, 10)}.json`,
        href: url,
      })))(URL.createObjectURL(new Blob([`${JSON.stringify(result.value, null, 2)}\n`], { type: "application/json" })))
  : render({ ...state, error: result.error }));

const loadDesktopFocusApplications = () => typeof globalThis.desktop?.focusApplications === "function"
  ? globalThis.desktop.focusApplications().then(gatedApplicationOptions).catch(() => [])
  : Promise.resolve([]);

const loadDesktopBrowsers = () => typeof globalThis.desktop?.browserApplications === "function"
  ? globalThis.desktop.browserApplications().then(gatedApplicationOptions).catch(() => [])
  : Promise.resolve([]);

const loadDesktopGateBehavior = () => typeof globalThis.desktop?.gateBehavior === "function"
  ? globalThis.desktop.gateBehavior().catch(() => "prompt")
  : Promise.resolve("redirect");

const bindReferenceLinks = (container, state) => [...container.querySelectorAll("[data-kanji], [data-reference-item]")].map((button) => button.addEventListener("click", () => {
    const query = button.dataset.kanji
      ? `/api/kanji?literal=${encodeURIComponent(button.dataset.kanji)}`
      : button.dataset.referenceId
        ? `/api/reference?id=${encodeURIComponent(button.dataset.referenceId)}`
        : `/api/reference?${new URLSearchParams({ item: button.dataset.referenceItem,
            type: button.dataset.referenceType || "vocabulary", reading: button.dataset.referenceReading || "" })}`;
    const opened = reduceUi(state, { type: "reference_opened", requestKey: query,
      pageScroll: window.scrollY,
      item: button.dataset.kanji || button.dataset.referenceItem,
      cardType: button.dataset.kanji ? "kanji" : button.dataset.referenceType,
      previousScroll: root.querySelector("#kanjiDialog")?.scrollTop ?? 0,
      previousComparisons: [...root.querySelectorAll("[data-comparison][open]")].map((node) => node.dataset.comparison),
    });
    render(opened);
    const expectedDialog = root.querySelector("#kanjiDialog");
    fetchJson(query, undefined, (result) => root.querySelector("#kanjiDialog") !== expectedDialog ? null
      : render(reduceUi(opened, result.ok
        ? { type: "reference_loaded", requestKey: query, detail: result.value }
        : { type: "reference_failed", requestKey: query, error: result.error })));
  }));

const feedbackReferenceRequest = (cardId, answerEventId) => pendingFeedbackReferences.get(cardId) ?? ((pending) => (
  pendingFeedbackReferences.set(cardId, pending), pending
))(new Promise((resolve) => fetchJson(`/api/reference?${new URLSearchParams({ id: cardId, ...(answerEventId ? { answer: answerEventId } : {}) })}`, undefined, resolve))
  .then((result) => {
    pendingFeedbackReferences.delete(cardId);
    if (result.ok) {
      feedbackReferences.set(cardId, result.value);
      feedbackReferences.size > 4 ? feedbackReferences.delete(feedbackReferences.keys().next().value) : null;
    }
    return result;
  }));

const loadFeedbackReference = (target, state) => {
  const { cardId, feedback } = displayedAnswer(state);
  target.innerHTML = '<p class="inline-reference-loading" role="status">Loading study notes…</p>';
  return feedbackReferenceRequest(cardId, feedback?.answerEventId).then((result) => {
    // A late note must never restore a previous review or overwrite a newer screen.
    if (root.querySelector("#feedbackReference") !== target) return;
    target.innerHTML = result.ok ? inlineReferenceMarkup(result.value)
      : '<p class="inline-reference-loading">Study notes could not load. <button class="quiet-button" type="button" data-feedback-reference-retry>Retry</button></p>';
    bindReferenceLinks(target, state);
    target.querySelector("[data-feedback-reference-retry]")?.addEventListener("click", () => loadFeedbackReference(target, state));
  });
};

const render = (state) => {
  const returningFromReference = Boolean(root.querySelector("#kanjiDialog") && !state.kanjiDetail);
  const { cardId: displayedCardId, feedback: visibleFeedback } = displayedAnswer(state);
  const comparisonOpen = root.querySelector("#feedbackReference")?.dataset.referenceCardId === displayedCardId
    ? [...root.querySelectorAll("#feedbackReference [data-comparison][open]")].map((node) => node.dataset.comparison) : [];
  root.innerHTML = state.daily && state.settings ? pageMarkup(state, feedbackReferences.get(displayedCardId), comparisonOpen) : '<div class="loading">Loading today’s session</div>';
  const wasAllowed = allowSyncApply;
  syncView = state.view;
  allowSyncApply = Boolean(state.settings && ["home", "settings", "onboarding"].includes(syncView) && !state.submitting);
  studySync?.attach(root.querySelector("[data-sync-panel]"));
  if (allowSyncApply && !wasAllowed) studySync?.schedule(0);
  const transition = (event) => render(reduceUi(state, event));
  const reloadStudyList = (lists, listId) => fetchJson(
    `/api/study-lists/${encodeURIComponent(listId)}/items`,
    undefined,
    (result) => result.ok
      ? render(reduceUi({ ...state, studyLists: lists }, { type: "study_list_loaded", list: result.value }))
      : transition({ type: "request_failed", error: result.error }),
  );
  [...root.querySelectorAll("[data-view]")].map((button) => button.addEventListener(
    "click",
    () => openView(state, button.dataset.view),
  ));
  root.querySelector("#finishEarlyButton")?.addEventListener("click", () => transition({ type: "summary_opened" }));
  root.querySelector("#resumeButton")?.addEventListener("click", () => transition({ type: "summary_closed" }));
  [...root.querySelectorAll("[data-stats-tab]")].map((button) => button.addEventListener(
    "click",
    () => transition({ type: "stats_tab_selected", statsTab: button.dataset.statsTab }),
  ));
  [...root.querySelectorAll("[data-progress-band]")].map((button) => button.addEventListener("click", () => ((opened) => (
    render(opened),
    fetchJson(`/api/progress/${encodeURIComponent(button.dataset.progressType)}/${encodeURIComponent(button.dataset.progressBand)}/items`, undefined, (result) => result.ok
      ? render(reduceUi(opened, { type: "study_list_loaded", list: result.value }))
      : render(reduceUi(opened, { type: "request_failed", error: result.error })))
  ))(reduceUi(state, {
    type: "study_list_opened",
    id: `${button.dataset.progressType}-${button.dataset.progressBand}`,
    label: `${button.dataset.progressLabel} ${kindName(button.dataset.progressType).toLowerCase()}`,
    view: "lists",
    backView: "home",
    cardType: button.dataset.progressType,
    band: button.dataset.progressBand,
  }))));
  root.querySelector("#onboardingForm")?.addEventListener("submit", (submitEvent) => (
    submitEvent.preventDefault(),
    persistSettings({ state, form: submitEvent.currentTarget, nextView: "home" })
  ));
  root.querySelector("#settingsForm")?.addEventListener("submit", (submitEvent) => (
    submitEvent.preventDefault(),
    persistSettings({ state, form: submitEvent.currentTarget, nextView: "settings" })
  ));
  root.querySelector("#studyListsForm")?.addEventListener("submit", (submitEvent) => (
    submitEvent.preventDefault(),
    postJson("/api/study-lists", { dailyLimits: dailyLimitsFromForm(submitEvent.currentTarget) }, (result) => result.ok
      ? bootstrap("Daily plan saved.", "lists")
      : render({ ...state, error: result.error }))
  ));
  root.querySelector("#customStudyListForm")?.addEventListener("submit", (submitEvent) => (
    submitEvent.preventDefault(),
    readImportTable(submitEvent.currentTarget, (table, readError) => readError
      ? transition({ type: "request_failed", error: readError })
      : postJson(
          "/api/study-lists/custom",
          { label: new FormData(submitEvent.currentTarget).get("name"), table },
          (result) => result.ok
            ? transition({ type: "study_lists_saved", lists: result.value.lists })
            : transition({ type: "request_failed", error: result.error }),
        ))
  ));
  [...root.querySelectorAll("[data-view-study-list]")].map((button) => button.addEventListener("click", () => ((opened) => (
    render(opened),
    fetchJson(`/api/study-lists/${encodeURIComponent(button.dataset.viewStudyList)}/items`, undefined, (result) => result.ok
      ? render(reduceUi(opened, { type: "study_list_loaded", list: result.value }))
      : render(reduceUi(opened, { type: "request_failed", error: result.error })))
  ))(reduceUi(state, {
    type: "study_list_opened",
    id: button.dataset.viewStudyList,
    label: button.dataset.studyListLabel,
  }))));
  root.querySelector("#backStudyListButton")?.addEventListener("click", () => transition({ type: "study_list_closed" }));
  root.querySelector("#studyListSort")?.addEventListener("change", (changeEvent) => transition({
    type: "study_list_sort_selected",
    sort: changeEvent.currentTarget.value,
  }));
  root.querySelector("#practiceAllButton")?.addEventListener("click", () => ((requested) => (
    render(requested),
    postJson(
      "/api/practice",
      { type: state.studyListDetail.cardType, band: state.studyListDetail.band },
      (result) => result.ok
        ? render({ ...stateWithDaily(requested, result.value), view: "review", studyListDetail: null })
        : render(reduceUi(requested, { type: "request_failed", error: result.error })),
    )
  ))(reduceUi(state, { type: "request_started" })));
  root.querySelector("#renameStudyListForm")?.addEventListener("submit", (submitEvent) => (
    submitEvent.preventDefault(),
    patchJson(
      `/api/study-lists/custom/${encodeURIComponent(state.studyListDetail.id)}`,
      { label: new FormData(submitEvent.currentTarget).get("label") },
      (result) => result.ok
        ? reloadStudyList(result.value.lists, state.studyListDetail.id)
        : transition({ type: "request_failed", error: result.error }),
    )
  ));
  root.querySelector("#addStudyListWordsForm")?.addEventListener("submit", (submitEvent) => (
    submitEvent.preventDefault(),
    readImportTable(submitEvent.currentTarget, (table, readError) => readError
      ? transition({ type: "request_failed", error: readError })
      : postJson(
          `/api/study-lists/custom/${encodeURIComponent(state.studyListDetail.id)}`,
          { table },
          (result) => result.ok
            ? reloadStudyList(result.value.lists, state.studyListDetail.id)
            : transition({ type: "request_failed", error: result.error }),
        ))
  ));
  [...root.querySelectorAll("[data-remove-study-list-item]")].map((button) => button.addEventListener("click", () => deleteJson(
    `/api/study-lists/custom/${encodeURIComponent(state.studyListDetail.id)}/items/${encodeURIComponent(button.dataset.removeStudyListItem)}`,
    (result) => result.ok
      ? reloadStudyList(result.value.lists, state.studyListDetail.id)
      : transition({ type: "request_failed", error: result.error }),
  )));
  root.querySelector("#deleteStudyListButton")?.addEventListener("click", () => globalThis.confirm(`Delete ${state.studyListDetail.label}?`)
    ? deleteJson(
        `/api/study-lists/custom/${encodeURIComponent(state.studyListDetail.id)}`,
        (result) => result.ok
          ? render(reduceUi({ ...state, studyLists: result.value.lists }, { type: "study_list_closed" }))
          : transition({ type: "request_failed", error: result.error }),
      )
    : null);
  root.querySelector("#homeReviewButton")?.addEventListener("click", () => openView(state, "review"));
  root.querySelector("#homeLessonButton")?.addEventListener("click", () => (
    state.daily.speechAvailable && !browserBuild ? primeNeuralJapaneseSpeech(neuralAudio) : null,
    ((more, requested) => (
      render(requested),
      postJson(
        "/api/lesson/today",
        { more },
        (result) => result.ok
          ? render({ ...stateWithDaily(requested, result.value), view: "review" })
          : render(reduceUi(requested, { type: "request_failed", error: result.error })),
      )
    ))(dailyLessonComplete(state.daily), reduceUi(state, { type: "request_started" }))
  ));
  root.querySelector("#lessonAudioButton")?.addEventListener("click", () => speakCard(
    state.daily.lessonCards?.[state.lessonPreviewIndex],
  ));
  root.querySelector("#lessonNextButton")?.addEventListener("click", () => (
    state.lessonPreviewIndex + 1 >= (state.daily.lessonCards?.length ?? 0)
      ? transition({ type: "lesson_preview_finished" })
      : transition({ type: "lesson_preview_next" })
  ));
  const markKnown = (cardId) => (
    render(reduceUi(state, { type: "request_started" })),
    postJson(
      "/api/known",
      { cardId, known: true, extraSessionId: state.daily.extraSessionId },
      (result) => result.ok
        ? render({ ...reduceUi(state, { type: "known_recorded", daily: result.value.daily }), view: "review", notice: "Marked known." })
        : transition({ type: "request_failed", error: result.error }),
    )
  );
  root.querySelector("#markKnownButton")?.addEventListener("click", () => markKnown(state.currentId));
  root.querySelector("#lessonMarkKnownButton")?.addEventListener("click", () => markKnown(
    state.daily.lessonCards?.[state.lessonPreviewIndex]?.id,
  ));
  root.querySelector("#backupButton")?.addEventListener("click", () => downloadBackup(state));
  root.querySelector("#copyVoicePrompt")?.addEventListener("click", (clickEvent) => copyVoiceCustomizationPrompt({
    clipboard: globalThis.navigator?.clipboard,
  }).then((copied) => (clickEvent.currentTarget.textContent = copied ? "Copied" : "Copy failed")));
  root.querySelector("#restoreForm")?.addEventListener("submit", (submitEvent) => (
    submitEvent.preventDefault(),
    ((file) => typeof file?.text === "function"
      ? file.text().then((contents) => Promise.resolve(contents).then(JSON.parse).then((backup) => postJson(
          "/api/restore",
          backup,
          (result) => result.ok ? bootstrap("Backup restored.") : render({ ...state, error: result.error }),
        )).catch((restoreError) => render({ ...state, error: restoreError.message })))
      : render({ ...state, error: "Choose a backup file." }))(new FormData(submitEvent.currentTarget).get("backup"))
  ));
  [...root.querySelectorAll("[data-import-form]")].map((form) => form.addEventListener("submit", (submitEvent) => (
      submitEvent.preventDefault(),
      ((data, file) => typeof file?.text === "function"
        ? file.text().then((table) => postJson(
            "/api/import",
            { label: data.get("label"), table },
            (result) => result.ok
              ? bootstrap(`${result.value.importedCards} cards imported.`, state.view)
              : render({ ...state, error: result.error }),
          )).catch((importError) => render({ ...state, error: importError.message }))
        : render({ ...state, error: "Choose a CSV or TSV file." }))(
        new FormData(submitEvent.currentTarget),
        new FormData(submitEvent.currentTarget).get("table"),
      )
    )));
  root.querySelector("#answerForm")?.addEventListener("submit", (submitEvent) => {
    submitEvent.preventDefault();
    state.daily.speechAvailable && !browserBuild ? primeNeuralJapaneseSpeech(neuralAudio) : null;
    const answer = new FormData(submitEvent.currentTarget).get("answer")?.toString().trim() ?? "";
    return state.phase === "reading"
      ? (render(reduceUi(state, { type: "request_started" })),
        postJson(
          "/api/reading-check",
          { cardId: state.currentId, readingAnswer: answer },
          (result) => result.ok
            ? result.value.correct
              ? transition({ type: "reading_entered", answer })
              : submitReview({ state: { ...state, readingAnswer: answer }, answer: "", transition })
            : transition({ type: "request_failed", error: result.error }),
        ))
      : (render(reduceUi(state, { type: "request_started" })), submitReview({ state, answer, transition }));
  });
  [...root.querySelectorAll("[data-alias-value]")].map((button) =>
    button.addEventListener("click", () => (
      render(reduceUi(state, { type: "alias_started" })),
      postJson(
        "/api/alias",
        { cardId: state.currentId, kind: button.dataset.aliasKind, value: button.dataset.aliasValue },
        (result) => result.ok
          ? transition({ type: "alias_saved", cardId: state.currentId, kind: button.dataset.aliasKind })
          : transition({ type: "request_failed", error: result.error }),
      )
    )));
  [...root.querySelectorAll("[data-alias-form]")].map((form) => form.addEventListener("submit", (submitEvent) => (
    submitEvent.preventDefault(),
    ((value) => (
      render(reduceUi(state, { type: "alias_started" })),
      postJson(
        "/api/alias",
        { cardId: form.dataset.aliasCardId, kind: form.dataset.aliasKind, value },
        (result) => result.ok
          ? transition({
              type: "alias_saved",
              cardId: form.dataset.aliasCardId,
              kind: form.dataset.aliasKind,
            })
          : transition({ type: "request_failed", error: result.error }),
      )
    ))(new FormData(form).get("value")?.toString().trim() ?? "")
  )));
  const continueButton = root.querySelector("#continueButton");
  continueButton?.addEventListener("click", () => transition({ type: "continue" }));
  root.querySelector("#previousAnswerButton")?.addEventListener("click", () => {
    const input = root.querySelector("#answerInput");
    transition({ type: "previous_answer_opened", returnView: {
      draft: input?.value ?? "", caret: input?.selectionStart ?? null, scroll: window.scrollY,
    } });
    window.scrollTo(0, 0);
  });
  const returnToReview = root.querySelector("#returnToReviewButton");
  returnToReview?.addEventListener("click", () => {
    const { draft, caret, scroll } = state.answerReturn;
    transition({ type: "previous_answer_closed" });
    const input = root.querySelector("#answerInput");
    if (input) {
      input.value = draft;
      if (caret !== null) input.setSelectionRange(caret, caret);
    }
    window.scrollTo(0, scroll);
  });
  root.querySelector("#redoButton")?.addEventListener("click", () => (
    cancelSpeech(),
    render(reduceUi(state, { type: "request_started" })),
    postJson(
      "/api/review/redo",
      { answerEventId: state.feedback.answerEventId },
      (result) => result.ok
        ? transition({ type: "review_redone", daily: result.value.daily, cardId: result.value.cardId })
        : transition({ type: "request_failed", error: result.error }),
    )
  ));
  root.querySelector("#audioButton")?.addEventListener("click", () => speakFeedback(visibleFeedback));
  root.querySelector("#extraButton")?.addEventListener("click", () =>
    (cancelSpeech(), postJson("/api/extra", {}, (result) => result.ok
      ? render(stateWithDaily(state, result.value))
      : transition({ type: "request_failed", error: result.error }))));
  root.querySelector("#bypassButton")?.addEventListener("click", () => transition({ type: "bypass_opened" }));
  root.querySelector("#cancelBypass")?.addEventListener("click", () => transition({ type: "bypass_closed" }));
  root.querySelector("#bypassDialog")?.addEventListener("cancel", (cancelEvent) => (
    cancelEvent.preventDefault(),
    transition({ type: "bypass_closed" })
  ));
  root.querySelector("#bypassForm")?.addEventListener("submit", (submitEvent) => (
    submitEvent.preventDefault(),
    ((requested) => (
      render(requested),
      postJson("/api/emergency-unlock", {}, (result) => result.ok
        ? fetchJson("/api/daily", undefined, (dailyResult) => dailyResult.ok
          ? render({ ...stateWithDaily(requested, dailyResult.value), view: "review" })
          : render(reduceUi(requested, { type: "request_failed", error: dailyResult.error })))
        : render(reduceUi(requested, { type: "request_failed", error: result.error })))
    ))(reduceUi(state, { type: "request_started" }))
  ));
  bindReferenceLinks(root, state);
  root.querySelector("#referenceBackButton")?.addEventListener("click", () => transition({ type: "reference_back" }));
  root.querySelector("#closeKanjiButton")?.addEventListener("click", () => transition({ type: "kanji_closed" }));
  root.querySelector("#kanjiDialog")?.addEventListener("cancel", (cancelEvent) => (
    cancelEvent.preventDefault(),
    transition({ type: "kanji_closed" })
  ));
  const answerInput = root.querySelector("#answerInput");
  ["reading", "reverse"].includes(state.phase) && answerInput ? bind(answerInput, { IMEMode: "toHiragana" }) : null;
  answerInput?.focus();
  [...root.querySelectorAll('[data-alias-kind="reading"] input')].map((input) =>
    bind(input, { IMEMode: "toHiragana" }));
  continueButton?.focus({ preventScroll: true });
  returnToReview?.focus({ preventScroll: true });
  const lessonNextButton = root.querySelector("#lessonNextButton");
  lessonNextButton?.focus();
  const lessonPreviewCard = state.daily?.lessonCards?.[state.lessonPreviewIndex] ?? null;
  state.daily?.speechAvailable && lessonPreviewCard && !heardLessonCardIds.has(lessonPreviewCard.id)
    ? (heardLessonCardIds.add(lessonPreviewCard.id), speakCard(lessonPreviewCard))
    : null;
  const nextAction = root.querySelector("#lessonNextButton, #continueButton, #returnToReviewButton, #extraButton");
  root.onkeydown = (keyEvent) => keyEvent.key === "Enter"
    && !keyEvent.isComposing
    && !keyEvent.defaultPrevented
    && !root.querySelector("dialog[open]")
    && !(keyEvent.target instanceof Element && keyEvent.target.closest("input, textarea, select, button, a, summary, [contenteditable='true']"))
    && nextAction instanceof HTMLButtonElement
    && !nextAction.disabled
    ? (keyEvent.preventDefault(), nextAction.click())
    : null;
  const bypassDialog = root.querySelector("#bypassDialog");
  bypassDialog && !bypassDialog.open ? bypassDialog.showModal() : null;
  const kanjiDialog = root.querySelector("#kanjiDialog");
  kanjiDialog && !kanjiDialog.open ? kanjiDialog.showModal() : null;
  kanjiDialog && state.kanjiDetail?.scrollTop ? (kanjiDialog.scrollTop = state.kanjiDetail.scrollTop) : null;
  returningFromReference ? window.scrollTo(0, state.referencePageScroll ?? 0) : null;
  const feedbackReference = root.querySelector("#feedbackReference");
  feedbackReference && !feedbackReferences.has(displayedCardId) ? loadFeedbackReference(feedbackReference, state) : null;
  return state;
};

const hydrateBootstrap = (initialState, expectedNode) => Promise.all([
  fetchValue("/api/decks"),
  fetchValue("/api/study-lists"),
  loadDesktopBrowsers(),
  loadDesktopFocusApplications(),
  loadDesktopGateBehavior(),
]).then(([decksResult, listsResult, browserCandidates, candidates, gateBehavior]) => ((browserIds) => ((hydratedState) =>
  root.firstElementChild !== expectedNode
    ? null
    : (render(hydratedState), hydratedState.view === "home"
        ? ((homeNode) => fetchValue("/api/stats").then((stats) => stats.ok && root.querySelector(".home-main") === homeNode
          ? render({ ...hydratedState, stats: stats.value })
          : null))(root.querySelector(".home-main"))
        : null))({
    ...initialState,
    decks: decksResult.ok ? decksResult.value.decks : [],
    studyLists: listsResult.ok ? listsResult.value.lists : [],
    browserCandidates,
    applicationCandidates: candidates.filter(({ identity }) => !browserIds.has(identity)),
    gateBehavior,
    error: [decksResult, listsResult].find((result) => !result.ok)?.error ?? null,
  }))(new Set(browserCandidates.map(({ identity }) => identity))));

const fatalRecoveryMarkup = (message) => `<div class="fatal"><div class="fatal-recovery">
  <h2>Reviews unavailable</h2>
  <p>${escapeHtml(message)}</p>
  <button id="fatalEmergencyUnlock" class="primary-button" type="button">Emergency unlock</button>
  <small>This is the normal Emergency Unlock and adds up to 50 extra reviews tomorrow.</small>
</div></div>`;

const renderFatalRecovery = (message) => browserBuild
  ? (root.innerHTML = `<div class="fatal"><h2>Study unavailable</h2><p>${escapeHtml(message)}</p></div>`)
  : (
  root.innerHTML = fatalRecoveryMarkup(message),
  ((button) => (
    button?.addEventListener("click", () => globalThis.confirm(
      "Emergency unlock? This makes work apps temporarily available and adds up to 50 extra reviews tomorrow.",
    )
      ? (button.disabled = true, postJson("/api/emergency-unlock", {}, (result) => result.ok
          ? (root.innerHTML = result.value.alreadyAllowed
              ? `<div class="fatal"><div class="fatal-recovery"><h2>Work apps already available</h2><p>No additional Emergency Unlock or review charge was recorded.</p></div></div>`
              : `<div class="fatal"><div class="fatal-recovery"><h2>Emergency unlock active</h2><p>Work apps are temporarily available. The normal next-day review charge still applies.</p></div></div>`)
          : renderFatalRecovery(result.error)))
      : null),
    null
  ))(root.querySelector("#fatalEmergencyUnlock"))
);

const bootstrap = (notice = null, preferredView = null) => Promise.all([
  fetchValue("/api/settings"),
  fetchValue("/api/daily"),
]).then(([settingsResult, dailyResult]) => settingsResult.ok && dailyResult.ok
  ? ((initialState) => settingsResult.value.onboardingComplete
      ? (render(initialState), hydrateBootstrap(initialState, root.firstElementChild))
      : hydrateBootstrap(initialState, root.firstElementChild))({
      ...initialUiState(dailyResult.value),
      settings: settingsResult.value,
      decks: [],
      studyLists: [],
      browserCandidates: [],
      applicationCandidates: [],
      gateBehavior: "redirect",
      stats: null,
      notice,
      view: settingsResult.value.onboardingComplete ? preferredView ?? "home" : "onboarding",
    })
  : renderFatalRecovery(
      [settingsResult, dailyResult].find((result) => !result.ok)?.error ?? "Application state unavailable.",
    ));

render(initialUiState());
bootstrap();
