import { kanjiStoryMarkup, referenceDiagramMarkup } from "./reference-content.mjs";

const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const japanese = (value) => `<span lang="ja">${escapeHtml(value)}</span>`;
const joinedJapanese = (values) => values.length < 2 ? japanese(values[0])
  : `${values.slice(0, -1).map(japanese).join(", ")} and ${japanese(values.at(-1))}`;

const positions = {
  left: "on the left", right: "on the right", top: "at the top", bottom: "at the bottom",
  middle: "in the middle", inside: "on the inside",
};

const positionOf = (part) => positions[part.position] ?? "";
const sameComponent = (a, b) => a.literal && a.literal === b.literal && a.position && a.position === b.position;

const kanjiComparison = (items, notes) => {
  const diagrams = items.map((_, i) => notes[i]?.components ?? []);
  const partContains = (part, other) => part.literal === items[other].item && part.paths?.length > 0
    && part.paths.length === diagrams[other].flatMap(({ paths }) => paths ?? []).length;
  const embeddedIn = items.length === 2
    ? diagrams.findIndex((parts, i) => parts.some((part) => partContains(part, 1 - i))) : -1;
  const shared = (part, i) => embeddedIn >= 0
    ? embeddedIn !== i || partContains(part, 1 - i)
    : diagrams.every((parts, j) => i === j || parts.some((other) => sameComponent(part, other)));
  const differences = diagrams.map((parts, i) => parts.filter((part) =>
    part.literal && part.literal !== items[i].item && !shared(part, i)));
  const commonPart = diagrams[0].find((part) => shared(part, 0) && positionOf(part));
  const distinct = differences[0][0];
  const matchingPosition = distinct && differences.every((parts) => parts.length === 1 && parts[0].position === distinct.position)
    && positionOf(distinct);
  const radicals = [...new Set(notes.map(({ radical }) => radical?.literal).filter(Boolean))];

  let cue = "";
  if (embeddedIn >= 0) {
    const embedded = diagrams[embeddedIn].find((part) => partContains(part, 1 - embeddedIn));
    cue = `${japanese(embedded.literal)} appears ${positionOf(embedded) || "as a component"} in ${japanese(items[embeddedIn].item)}. The extra strokes are coloured.`;
  } else if (matchingPosition) {
    const parts = [...new Set(differences.map(([part]) => part.literal))];
    cue = `Look ${matchingPosition} for ${joinedJapanese(parts)}.`;
    if (commonPart) cue += ` ${items.length === 2 ? "Both" : "All"} have ${japanese(commonPart.literal)} ${positionOf(commonPart)}.`;
  } else if (radicals.length > 1) {
    cue = `Compare the radicals ${joinedJapanese(radicals)}.`;
  } else if (diagrams.every((parts) => parts.length) && differences.some((parts) => parts.length)) {
    cue = "Compare the highlighted parts of each shape.";
  }
  return {
    cue,
    entries: items.map((item, i) => ({
      face: referenceDiagramMarkup(diagrams[i], item.item, (part) => shared(part, i)),
      radical: notes[i]?.radical,
      differences: differences[i].slice(0, 3),
    })),
  };
};

const sharedPrefix = (left, right) => {
  const mismatch = left.findIndex((character, i) => character !== right[i]);
  return mismatch < 0 ? left.length : mismatch;
};

const wordComparison = (items) => {
  const spellings = items.map(({ item }) => [...item]);
  const [first, ...others] = spellings;
  const prefix = Math.min(...others.map((characters) => sharedPrefix(first, characters)));
  const reversed = first.slice(prefix).reverse();
  const suffix = Math.min(...others.map((characters) => sharedPrefix(reversed, characters.slice(prefix).reverse())));
  const sameSpelling = items.every(({ item }) => item === items[0].item);
  const readingKey = (reading) => reading.normalize("NFKC").replace(/[ァ-ヶ]/gu, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  const readings = items.flatMap((item) => [...new Set(item.readings.filter(Boolean).map(readingKey))]);
  const sameReading = new Set(readings).size < readings.length;
  const cue = sameSpelling
    ? "Same spelling. Compare the readings and meanings."
    : sameReading ? `${items.length === 2 ? "These can sound the same." : "Some of these share a reading."} Notice the highlighted spelling and how the meanings differ.`
      : "Compare the highlighted spelling and the readings.";

  return { cue, entries: spellings.map((characters) => {
    const end = characters.length - suffix;
    const different = characters.slice(prefix, end).join("");
    return { face: `<strong class="study-pair-spelling" lang="ja">${escapeHtml(characters.slice(0, prefix).join(""))}${different ? `<mark>${escapeHtml(different)}</mark>` : ""}${escapeHtml(characters.slice(end).join(""))}</strong>` };
  }) };
};

const partLabel = (part) => `${japanese(part.literal)}${positionOf(part) ? ` ${positionOf(part)}` : ""}${part.meaning && part.meaning !== "Component" ? ` · ${escapeHtml(part.meaning)}` : ""}`;

export const studyPairLessonMarkup = ({ type, items }, notes = [], { canSpeak = false } = {}) => {
  const { cue, entries } = type === "kanji" ? kanjiComparison(items, notes) : wordComparison(items);
  return `
    ${cue ? `<p class="study-pair-cue">${cue}</p>` : ""}
    <div class="study-pair-lesson-grid">
      ${entries.map(({ face, radical, differences }, i) => {
        const { item, readings, meanings } = items[i];
        const { example, story } = notes[i] ?? {};
        return `<article class="study-pair-lesson-card" aria-label="${escapeHtml(item)}">
          <div class="study-pair-lesson-face">${face}</div>
          ${readings.length ? `<p class="study-pair-lesson-reading" lang="ja">${escapeHtml(readings.slice(0, 4).join(" · "))}</p>` : ""}
          ${meanings.length ? `<p class="study-pair-lesson-meaning">${escapeHtml(meanings.slice(0, 4).join(", "))}</p>` : ""}
          ${canSpeak && readings[0] ? `<button class="quiet-button" type="button" data-pair-listen="${escapeHtml(readings[0].replaceAll(".", ""))}" aria-label="Hear ${escapeHtml(item)}">Hear</button>` : ""}
          ${radical ? `<p class="study-pair-radical"><span>Radical</span> ${japanese(radical.literal)}${radical.meaning ? ` · ${escapeHtml(radical.meaning)}` : ""}</p>` : ""}
          ${differences?.length ? `<ul class="study-pair-components">${differences.map((part) => `<li>${partLabel(part)}</li>`).join("")}</ul>` : ""}
          ${kanjiStoryMarkup(story)}
          ${example ? `<blockquote class="study-pair-example"><p lang="ja">${escapeHtml(example.ja)}</p><p>${escapeHtml(example.en)}</p>${/^https?:\/\//u.test(example.url ?? "") ? `<a href="${escapeHtml(example.url)}" target="_blank" rel="noopener noreferrer">Example source</a>` : ""}</blockquote>` : ""}
        </article>`;
      }).join("")}
    </div>`;
};
