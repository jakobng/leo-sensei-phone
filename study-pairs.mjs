import { jsonMutationOptions } from "./http.mjs";
import { studyPairLessonMarkup } from "./study-pair-lesson.mjs";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const entryDetails = ({ readings, meanings }) => `
  ${readings.length ? `<span lang="ja">${escapeHtml(readings.slice(0, 4).join(" · "))}</span>` : ""}
  ${meanings.length ? `<small>${escapeHtml(meanings.slice(0, 4).join(", "))}</small>` : ""}`;

const entryMarkup = (entry) => `
  <strong lang="ja">${escapeHtml(entry.item)}</strong>
  <div>${entryDetails(entry)}</div>`;

export const studyPairTarget = ({ cardId, feedback }) => {
  const type = feedback?.cardType;
  const label = feedback?.expectedSurface;
  if (typeof label !== "string") return null;
  if (type === "vocabulary" && cardId) return { type, item: cardId, label };
  const item = label.split("; ", 1)[0].trim().normalize("NFKC");
  return type === "kanji" && /^\p{Script=Han}$/u.test(item) ? { type, item, label: item } : null;
};

export const studyPairPickerMarkup = (type) => `
  <details class="feedback-editor study-pair-picker" data-study-pair-picker>
    <summary>Group with other ${type === "kanji" ? "kanji" : "words"}</summary>
    <form class="study-pair-search" role="search">
      <label for="studyPairSearch">Search by ${type === "kanji" ? "kanji" : "word"}, kana reading, or meaning</label>
      <div class="answer-control">
        <input id="studyPairSearch" name="query" type="search" maxlength="64" autocomplete="off" spellcheck="false" />
        <button class="quiet-button" type="submit">Search</button>
      </div>
    </form>
    <div data-study-pair-matches></div>
    <p class="study-pair-saved" data-study-pair-saved></p>
    <p class="study-pair-status" role="status"></p>
  </details>`;

const path = "/api/study-pairs";
const groupsPath = `${path}?groups=1`;

export const studyPairHomeMarkup = () => `
  <section class="home-group study-pair-home" aria-labelledby="studyPairsTitle" data-study-pair-home>
    <div><h2 id="studyPairsTitle">Similar Kanji &amp; Words</h2><p data-pair-count></p></div>
    <div class="study-pair-actions">
      <button class="primary-button" data-view="study-pairs" data-pair-mode="learn" type="button">Learn &amp; review</button>
      <button class="quiet-button" data-view="study-pairs" type="button">Saved groups</button>
    </div>
  </section>`;

let pendingSummary;
export const bindStudyPairHome = (pane, fetchValue) => {
  pendingSummary ??= fetchValue(`${groupsPath}&summary=1`).finally(() => { pendingSummary = null; });
  pendingSummary.then((result) => {
    if (!pane.isConnected || !result.ok) return;
    const { count } = result.value;
    pane.querySelector("[data-pair-count]").textContent = count
      ? `${count.toLocaleString()} saved ${count === 1 ? "group" : "groups"}`
      : "Group similar kanji or words from any answer to practice them here.";
    pane.querySelector("[data-pair-mode]").disabled = count === 0;
  });
};


export const bindStudyPairPicker = (picker, { fetchValue, type, item, label, hint, onChange }) => {
  const input = picker.querySelector("input");
  const results = picker.querySelector("[data-study-pair-matches]");
  const savedList = picker.querySelector("[data-study-pair-saved]");
  const status = picker.querySelector("[role=status]");
  const saved = new Map();
  let requested = 0;
  let timer;
  let saving = false;

  const renderSaved = () => {
    savedList.textContent = saved.size ? `In this group with ${[...saved.values()].join("、")}` : "";
  };
  const remember = (group) => {
    group?.items.filter(({ id }) => id !== item).forEach((entry) => saved.set(entry.id, entry.item));
    results.querySelectorAll("[data-pair-with]").forEach((button) => {
      if (saved.has(button.dataset.pairWith)) {
        button.disabled = true;
        button.lastElementChild.textContent = "In group";
      }
    });
    renderSaved();
  };
  const add = (other, button) => {
    if (saving || saved.has(other)) return;
    saving = true;
    button.disabled = true;
    status.textContent = "Saving…";
    const query = input.value;
    fetchValue(groupsPath, jsonMutationOptions("POST", { type, item, other })).then((result) => {
      if (!picker.isConnected) return;
      saving = false;
      if (!result.ok) {
        button.disabled = false;
        status.textContent = result.error;
        return;
      }
      remember(result.value.group);
      onChange?.(result.value.group);
      if (input.value === query) {
        input.value = "";
        showHint();
        if (picker.open) input.focus({ preventScroll: true });
      }
      status.textContent = `Added ${saved.get(other)} to the group with ${label}.`;
    });
  };
  const renderMatches = (matches, message = "") => {
    results.innerHTML = matches.length ? `<ul class="study-pair-matches">${matches.map((entry) => `
      <li><button class="quiet-button" data-pair-with="${escapeHtml(entry.id)}" type="button"
        ${saved.has(entry.id) ? "disabled" : ""}>
        ${entryMarkup(entry)}<span>${saved.has(entry.id) ? "In group" : "Add"}</span>
      </button></li>`).join("")}</ul>` : message ? `<p>${escapeHtml(message)}</p>` : "";
    results.querySelectorAll("[data-pair-with]").forEach((button) =>
      button.addEventListener("click", () => add(button.dataset.pairWith, button)));
  };
  const showHint = () => {
    const suggestion = hint();
    const id = type === "kanji" ? suggestion?.item : suggestion?.id;
    renderMatches(suggestion?.type === type && id && id !== item ? [{
      id, item: suggestion.item,
      readings: suggestion.reading ? [suggestion.reading] : [],
      meanings: suggestion.meanings ?? [],
    }] : []);
  };
  const search = () => {
    clearTimeout(timer);
    const query = input.value.trim();
    const request = ++requested;
    if (!query) {
      showHint();
      return;
    }
    renderMatches([], "Searching…");
    fetchValue(`${path}/search?${new URLSearchParams({ type, item, q: query })}`).then((result) => {
      if (!picker.isConnected || request !== requested || input.value.trim() !== query) return;
      if (!result.ok) return renderMatches([], result.error);
      const matchesOwnSpelling = label.split("; ").some((spelling) =>
        spelling.normalize("NFKC").trim() === query.normalize("NFKC"));
      const emptyMessage = matchesOwnSpelling
        ? "That’s the answer on this card. Search for the one you mix it up with."
        : type === "kanji" ? "No matching kanji." : "No matching words.";
      return renderMatches(result.value.matches, emptyMessage);
    });
  };
  picker.addEventListener("toggle", () => {
    if (!picker.open) return;
    if (!input.value.trim()) showHint();
    fetchValue(`${groupsPath}&${new URLSearchParams({ type, item })}`).then((result) => {
      if (!picker.isConnected || !picker.open) return;
      if (result.ok) {
        remember(result.value.group);
        if (!input.value.trim()) showHint();
      } else status.textContent = result.error;
    });
  });
  input.addEventListener("input", (event) => {
    clearTimeout(timer);
    if (!event.isComposing) timer = setTimeout(search, 180);
  });
  picker.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    search();
  });
};

const shuffled = (items) => items.map((item) => ({ item, order: Math.random() }))
  .sort((left, right) => left.order - right.order).map(({ item }) => item);

const removeLinkMarkup = ({ key, labels }) => `<button class="quiet-button" type="button"
  data-pair-remove="${escapeHtml(key)}" aria-label="Remove link between ${escapeHtml(labels.join(" and "))}">Remove link</button>`;

const groupsMarkup = (groups) => groups.length ? `
  <div class="study-pair-actions">
    <button class="primary-button" type="button" data-pair-start>Learn &amp; review</button>
    <button class="quiet-button" type="button" data-pair-review-only>Review only</button>
  </div>
  <h2>Saved groups</h2>
  <ul class="study-pair-list">${groups.map(({ items, key, links }) => `
    <li><div class="study-pair-entries">${items.map((entry) => `<div>${entryMarkup(entry)}</div>`).join("")}</div>
      <div class="study-pair-actions study-pair-list-actions">
        <button class="quiet-button" type="button" data-group-learn="${escapeHtml(key)}"
          aria-label="Study ${escapeHtml(items.map(({ item }) => item).join(" and "))}">Study group</button>
        ${links.length === 1 ? removeLinkMarkup(links[0]) : ""}
      </div>
      ${links.length > 1 ? `<details class="feedback-editor study-group-links">
        <summary>Edit links</summary>
        <ul>${links.map((link) => `<li><span lang="ja">${escapeHtml(link.labels.join(" ↔ "))}</span>${removeLinkMarkup(link)}</li>`).join("")}</ul>
      </details>` : ""}
    </li>`).join("")}</ul>`
  : "<p>On any kanji or vocabulary answer, use <strong>Group with other kanji</strong> or <strong>Group with other words</strong> to save a group here.</p>";

export const bindStudyPairPage = (panel, { fetchValue, mode, speak, onChange }) => {
  const lessons = new Map();
  let groups = [];
  let questions = [];

  const showGroups = (focus = false) => {
    panel.innerHTML = groupsMarkup(groups) + '<p role="status" class="study-pair-status"></p>';
    const start = panel.querySelector("[data-pair-start]");
    start?.addEventListener("click", () => learn(shuffled(groups)));
    panel.querySelector("[data-pair-review-only]")?.addEventListener("click", () => practice(questions));
    panel.querySelectorAll("[data-group-learn]").forEach((button) =>
      button.addEventListener("click", () => learn(groups.filter(({ key }) => key === button.dataset.groupLearn))));
    panel.querySelectorAll("[data-pair-remove]").forEach((button) =>
      button.addEventListener("click", () => remove(button)));
    if (focus) (start ?? panel).focus({ preventScroll: true });
  };
  const load = (startMode = mode, focus = false) => fetchValue(groupsPath).then((result) => {
    if (!panel.isConnected) return;
    if (result.ok) {
      ({ groups, questions } = result.value);
      if (startMode === "learn" && groups.length) learn(shuffled(groups));
      else showGroups(focus);
    } else {
      panel.innerHTML = `<p role="alert">${escapeHtml(result.error)}</p><button class="quiet-button" type="button">Retry</button>`;
      panel.querySelector("button").addEventListener("click", () => load(startMode, focus));
    }
  });
  const remove = (button) => {
    const key = button.dataset.pairRemove;
    const buttons = [...panel.querySelectorAll("button")];
    buttons.forEach((candidate) => { candidate.disabled = true; });
    fetchValue(path, jsonMutationOptions("DELETE", { key })).then((result) => {
      if (!panel.isConnected) return;
      if (result.ok) {
        onChange?.();
        load("groups", true);
      } else {
        buttons.forEach((candidate) => { candidate.disabled = false; });
        panel.querySelector("[role=status]").textContent = result.error;
      }
    });
  };

  const fillLesson = (target, group) => {
    const render = (notes) => {
      if (!target.isConnected) return;
      target.innerHTML = studyPairLessonMarkup(group, notes, { canSpeak: Boolean(speak) });
      target.querySelectorAll("[data-pair-listen]").forEach((button) =>
        button.addEventListener("click", () => speak(button.dataset.pairListen)));
    };
    if (lessons.has(group.key)) {
      lessons.get(group.key).then(render);
      return;
    }
    render([]);
    const loading = fetchValue(`${path}/lesson?${new URLSearchParams({ groups: "1", key: group.key })}`)
      .then((result) => result.ok ? result.value.notes : []);
    lessons.set(group.key, loading);
    if (lessons.size > 5) lessons.delete(lessons.keys().next().value);
    loading.then(render);
  };

  const learn = (selection) => {
    const batch = selection.slice(0, 5);
    const remaining = selection.slice(batch.length);
    const keys = new Set(batch.map(({ key }) => key));
    const startReview = () => practice(questions.filter(({ key, kind }) => keys.has(key) && kind !== "compare"),
      remaining.length ? () => learn(remaining) : null);
    const show = (position) => {
      panel.innerHTML = `
        <section aria-label="Group lesson">
          <div class="study-pair-round-heading">
            <span>Group ${position + 1} of ${batch.length}</span>
            <button class="quiet-button" type="button" data-pair-back>Saved groups</button>
          </div>
          <h2 class="study-pair-lesson-title" tabindex="-1">Compare the group</h2>
          <div data-pair-lesson-content></div>
          <div class="study-pair-actions study-pair-lesson-actions">
            ${position > 0 ? '<button class="quiet-button" type="button" data-pair-previous>Previous group</button>' : ""}
            <button class="primary-button" type="button" data-pair-next>${position + 1 === batch.length ? "Start review" : "Next group"}</button>
          </div>
        </section>`;
      fillLesson(panel.querySelector("[data-pair-lesson-content]"), batch[position]);
      panel.querySelector("h2").focus();
      panel.querySelector("[data-pair-back]").addEventListener("click", () => showGroups(true));
      panel.querySelector("[data-pair-previous]")?.addEventListener("click", () => show(position - 1));
      panel.querySelector("[data-pair-next]").addEventListener("click", position + 1 === batch.length ? startReview : () => show(position + 1));
    };
    show(0);
  };

  const practice = (questionsToReview, nextBatch = null) => {
    const order = shuffled(questionsToReview);
    const missed = [];
    const show = (position) => {
      const question = order[position];
      if (!question) {
        panel.innerHTML = `
          <h2>Practice complete</h2>
          <div class="study-pair-actions">
            ${nextBatch ? '<button class="primary-button" type="button" data-pair-next-batch>Next batch</button>' : ""}
            ${missed.length ? `<button class="${nextBatch ? "quiet" : "primary"}-button" type="button" data-pair-retry>Retry missed (${missed.length})</button>` : ""}
            <button class="quiet-button" type="button" data-pair-back>Saved groups</button>
          </div>`;
        panel.querySelector("[data-pair-next-batch]")?.addEventListener("click", nextBatch);
        panel.querySelector("[data-pair-retry]")?.addEventListener("click", () => practice(missed, nextBatch));
        panel.querySelector("[data-pair-back]").addEventListener("click", () => showGroups(true));
        panel.querySelector("button").focus();
        return;
      }
      const { items, answer, clue, kind, showReadings } = question;
      const choices = shuffled(items);
      const optionLabel = ({ item, readings }) => JSON.stringify([item, showReadings ? readings[0] : ""]);
      const options = kind === "compare" ? choices
        : [...new Map(choices.map((choice) => [optionLabel(choice), choice])).values()];
      panel.innerHTML = `
        <section class="study-pair-round" aria-label="Group practice">
          <div class="study-pair-round-heading">
            <span>${position + 1} of ${order.length}</span>
            <button class="quiet-button" type="button" data-pair-back>Saved groups</button>
          </div>
          <div class="study-pair-prompt" tabindex="-1">
            <h2>${kind === "compare" ? "Compare this group" : kind === "reading" ? "Which has this reading?" : "Which has this meaning?"}</h2>
            ${clue ? `<p lang="${kind === "reading" ? "ja" : "en"}">${escapeHtml(clue)}</p>` : ""}
          </div>
          <div class="study-pair-choices">${options.map(({ id, item, readings }) => kind === "compare"
            ? `<strong lang="ja">${escapeHtml(item)}</strong>`
            : `<button class="quiet-button" type="button" lang="ja" data-pair-answer="${escapeHtml(id)}">
              <span>${escapeHtml(item)}</span>${showReadings ? `<small>${escapeHtml(readings[0] ?? "")}</small>` : ""}
            </button>`).join("")}</div>
          ${kind === "compare" ? '<button class="primary-button" type="button" data-pair-reveal>Show readings and meanings</button>' : ""}
          <div data-pair-feedback></div>
        </section>`;
      panel.querySelector("[data-pair-back]").addEventListener("click", () => showGroups(true));
      panel.querySelector(".study-pair-prompt").focus({ preventScroll: true });
      const reveal = (selected = null) => {
        if (selected && selected !== answer) missed.push(question);
        panel.querySelector(".study-pair-choices").hidden = true;
        panel.querySelector("[data-pair-reveal]")?.remove();
        const feedback = panel.querySelector("[data-pair-feedback]");
        const correct = items.find(({ id }) => id === answer);
        feedback.innerHTML = `
          <p class="study-pair-result" role="status">${selected === answer ? "Correct" : correct ? `Answer <strong lang="ja">${escapeHtml(correct.item)}${showReadings && correct.readings[0] ? ` (${escapeHtml(correct.readings[0])})` : ""}</strong>` : "Readings and meanings"}</p>
          <div class="study-pair-entries">${choices.map((entry) => `
            <div class="${entry.id === answer ? "study-pair-correct" : ""}">${entryMarkup(entry)}</div>`).join("")}</div>
          <button class="primary-button" type="button">${position + 1 === order.length ? "Finish" : "Next"}</button>`;
        const next = feedback.querySelector("button");
        next.addEventListener("click", () => show(position + 1));
        next.focus({ preventScroll: true });
      };
      panel.querySelectorAll("[data-pair-answer]").forEach((button) =>
        button.addEventListener("click", () => reveal(button.dataset.pairAnswer)));
      panel.querySelector("[data-pair-reveal]")?.addEventListener("click", () => reveal());
    };
    show(0);
  };
  load();
};
