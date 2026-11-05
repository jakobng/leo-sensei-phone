const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const section = (title, content) => content ? `<section class="reference-section"><h3>${title}</h3>${content}</section>` : "";
const meanings = (entry) => escapeHtml((entry.meanings ?? []).join("; "));
const tagLabel = (tag) => ({
  "noun (common) (futsuumeishi)": "noun",
  "noun or participle which takes the aux. verb suru": "suru verb",
}[tag] ?? tag);

export const referenceLinkMarkup = (entry, label = null) => `<button class="reference-link" type="button"
  data-reference-item="${escapeHtml(entry.item)}" data-reference-type="${escapeHtml(entry.type ?? "vocabulary")}"
  data-reference-reading="${escapeHtml(entry.reading ?? "")}">${label ?? `<strong lang="ja">${escapeHtml(entry.item)}</strong>
  <span lang="ja">${escapeHtml(entry.reading ?? "")}</span><small>${meanings(entry)}</small>`}</button>`;

const diagram = (parts, literal, shared = null) => parts?.length
  ? `<svg class="reference-diagram" viewBox="0 0 109 109" role="img" aria-label="Components of ${escapeHtml(literal)}">
      ${parts.map((part, i) => `<g class="${shared?.includes(part.literal) ? "part-shared" : `part-${i % 5}`}">
        ${(part.paths ?? []).map((path) => `<path d="${escapeHtml(path)}" />`).join("")}</g>`).join("")}</svg>`
  : `<strong class="reference-glyph" lang="ja">${escapeHtml(literal)}</strong>`;

const comparison = (current, other) => ((shared) => `<details class="reference-comparison" data-comparison="${escapeHtml(other.item)}" ${current.comparisonOpen?.includes(other.item) ? "open" : ""}><summary>
    <strong lang="ja">${escapeHtml(other.item)}</strong><span>${meanings(other)}</span>
    <small>Compare${other.studied ? " · in your reviews" : ""}</small></summary>
    <div class="comparison-pair">${[
      { item: current.item, diagram: current.components, meanings: current.meanings,
        reading: [...(current.onReadings ?? []), ...(current.kunReadings ?? [])].join(" · ") }, other,
    ].map((entry) => `<figure>${diagram(entry.diagram, entry.item, shared)}<figcaption><strong lang="ja">${escapeHtml(entry.item)}</strong>
      <span>${meanings(entry)}</span><small lang="ja">${escapeHtml(entry.reading ?? "")}</small></figcaption></figure>`).join("")}</div>
    <p class="reference-note">Shared parts are grey; different parts are coloured.</p>
    ${referenceLinkMarkup(other, `Explore <span lang="ja">${escapeHtml(other.item)}</span>`)}</details>`)(
  (current.components ?? []).map((part) => part.literal).filter((literal) => literal && other.parts?.includes(literal)),
);

const kanjiMarkup = (entry, inline = false) => `
  <div class="reference-overview">${diagram(entry.components, entry.item)}<div>
    ${inline ? '<h3>Structure & readings</h3>' : `<h2 lang="ja">${escapeHtml(entry.item)}</h2><p class="reference-meaning">${meanings(entry)}</p>`}
    <dl><dt>On readings</dt><dd lang="ja">${escapeHtml(entry.onReadings?.join(" · ") || "—")}</dd>
      <dt>Kun readings</dt><dd lang="ja">${escapeHtml(entry.kunReadings?.join(" · ") || "—")}</dd></dl>
    ${entry.nanoriReadings?.length ? `<details><summary>Name readings</summary><p lang="ja">${escapeHtml(entry.nanoriReadings.join(" · "))}</p></details>` : ""}
  </div></div>
  ${section("Components", entry.components?.length ? `<div class="reference-components">${entry.components.filter((part) => part.literal).map((part, i) => `
    <div class="reference-part part-${i % 5}">${referenceLinkMarkup({ ...part, item: part.item || part.original || part.literal, type: "kanji" },
      `<strong lang="ja">${escapeHtml(part.literal)}</strong><span>${escapeHtml(part.meaning)}</span><small>${escapeHtml(part.position)}</small>`)}</div>`).join("")}</div>
    <p class="reference-note">Visual components help you recognise the shape; they are not an account of the character’s historical origin.</p>` : "")}
  ${section("Classical radical", entry.radicalInfo ? `<p class="reference-radical"><strong lang="ja">${escapeHtml(entry.radicalInfo.literal)}</strong>
    <span>${escapeHtml(entry.radicalInfo.meaning)}<small lang="ja">${escapeHtml(entry.radicalInfo.names)}</small></span></p>` : "")}
  ${section("Looks similar", (entry.similar ?? []).map((other) => comparison(entry, other)).join("")
    || '<p>No curated look-alikes are listed for this character. Shared-component links, when available, are shown separately below.</p>')}
  ${section("Shares a component", entry.sharedComponents?.length ? `<div class="reference-relations">${entry.sharedComponents.map((other) => referenceLinkMarkup(other,
    `<strong lang="ja">${escapeHtml(other.item)}</strong><span>${meanings(other)}</span><small>Shares <span lang="ja">${escapeHtml(other.shared.join(" + "))}</span></small>`)).join("")}</div>` : "")}
  ${section("Sound family", entry.soundFamily ? `<p>The ${entry.soundFamily.sourceNote?.includes("Historical") ? "historical " : ""}sound component <strong lang="ja">${escapeHtml(entry.soundFamily.part)}</strong>
    ${entry.soundFamily.readings.length ? `is associated with <strong lang="ja">${escapeHtml(entry.soundFamily.readings.join(" · "))}</strong>` : "is recorded in the source"}.</p>
    ${entry.soundFamily.sourceNote ? `<p>${escapeHtml(entry.soundFamily.sourceNote)}</p>` : ""}
    <p>${entry.soundFamily.shared.length ? `This kanji shares <strong lang="ja">${escapeHtml(entry.soundFamily.shared.join(" · "))}</strong>.`
      : "This kanji’s listed on readings differ from that pattern."} These are patterns, not fixed rules.</p>
    <div class="reference-relations">${entry.soundFamily.family.map((other) => referenceLinkMarkup(other,
      `<strong lang="ja">${escapeHtml(other.item)}</strong><span>${meanings(other)}</span><small lang="ja">${escapeHtml(other.shared.join(" · ") || other.reading)}</small>`)).join("")}</div>
    ${entry.soundFamily.sourceUrl ? `<a href="${escapeHtml(entry.soundFamily.sourceUrl)}" target="_blank" rel="noopener noreferrer">Component source</a>` : ""}`
    : `<p>${entry.kind === "Iteration mark" ? "This is an iteration mark: it repeats the preceding kanji and has no independent sound component."
      : entry.kind === "Phono-semantic compound" ? "A sound component is expected for this character, but it is not yet identified in the reference."
      : `No separate phonetic component is recorded${entry.kind ? `; the source classifies this character as ${escapeHtml(entry.kind.toLowerCase())}` : ""}.`}</p>`)}
`;

const exampleMarkup = (example) => `<blockquote class="reference-example"><p lang="ja">${escapeHtml(example.ja)}</p>
  <p>${escapeHtml(example.en)}</p><a href="${escapeHtml(example.url)}" target="_blank" rel="noopener noreferrer">Sentence source</a></blockquote>`;
const senseMarkup = (sense) => `<div class="reference-sense"><p class="reference-meaning">${meanings(sense)}</p>
  <div class="reference-tags">${sense.tags.map((tag) => `<span>${escapeHtml(tagLabel(tag))}</span>`).join("")}</div>
  ${sense.info.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}
  ${sense.examples.map(exampleMarkup).join("")}
  ${sense.related.length ? `<div class="reference-relations">${sense.related.map((related) => referenceLinkMarkup(related)).join("")}</div>` : ""}</div>`;

const kanjiCards = (entry) => section("Kanji in this word", entry.components?.length ? `<div class="inline-kanji-grid">${entry.components.map((part) => `
  <article class="inline-kanji-card">
    ${referenceLinkMarkup(part, `${diagram(part.diagram, part.item)}<span><strong lang="ja">${escapeHtml(part.item)}</strong><small>${meanings(part)}</small></span>`)}
    <dl><dt>On</dt><dd lang="ja">${escapeHtml(part.onReadings?.join(" · ") || "—")}</dd>
      <dt>Kun</dt><dd lang="ja">${escapeHtml(part.kunReadings?.join(" · ") || "—")}</dd>
      ${part.radicalInfo ? `<dt>Radical</dt><dd><span lang="ja">${escapeHtml(part.radicalInfo.literal)}</span> · ${escapeHtml(part.radicalInfo.meaning)}<small lang="ja">${escapeHtml(part.radicalInfo.names)}</small></dd>` : ""}
    </dl>
    ${part.phonetic ? `<p class="inline-sound">Sound part <strong lang="ja">${escapeHtml(part.phonetic.part)}</strong>${part.phonetic.readings?.length ? ` · <span lang="ja">${escapeHtml(part.phonetic.readings.join(" · "))}</span>` : ""}${part.phonetic.sourceNote ? `<small>${escapeHtml(part.phonetic.sourceNote)}</small>` : ""}</p>` : ""}
    ${part.lookalikes?.length ? `<div class="inline-lookalikes"><span>Looks similar</span>${part.lookalikes.map((other) => referenceLinkMarkup(other, escapeHtml(other.item))).join("")}</div>` : ""}
  </article>`).join("")}</div>` : "");

const vocabularyMarkup = (entry, inline = false) => `${inline ? "" : `<div class="reference-vocabulary-heading"><h2 lang="ja">${escapeHtml(entry.item)}</h2>
  <p lang="ja">${escapeHtml(entry.readings?.join(" · ") || entry.reading)}</p><p class="reference-meaning">${meanings(entry)}</p></div>
  ${section("Kanji in this word", entry.components?.length ? `<div class="reference-relations">${entry.components.map((part) => referenceLinkMarkup(part)).join("")}</div>` : "")}`}
  ${inline ? `<div class="inline-vocab-layout${entry.components?.length ? " has-kanji" : ""}"><div class="inline-word-usage">` : ""}
  ${section("Usage note", entry.referenceNote ? `<p>${escapeHtml(entry.referenceNote)}</p>${(entry.phraseExamples ?? []).map(exampleMarkup).join("")}` : "")}
  ${section("Dictionary meanings and usage", entry.entries?.length ? entry.entries.map((word) => `
    <article class="reference-word">${word.relationship ? `<p class="reference-note">${escapeHtml(word.relationship)}</p>` : ""}
      <p class="reference-note" lang="ja">${escapeHtml(word.forms.join(" · "))} — ${escapeHtml(word.readings.join(" · "))}</p>
      ${word.lookupNote && !entry.referenceNote ? `<p class="reference-note">${escapeHtml(word.lookupNote)}</p>` : ""}
      ${word.senses.slice(0, 3).map(senseMarkup).join("")}
      ${word.senses.length > 3 ? `<details><summary>More dictionary senses (${word.senses.length - 3})</summary>${word.senses.slice(3).map(senseMarkup).join("")}</details>` : ""}
      ${word.examples?.length ? `<h4>Examples of this word</h4>${word.examples.map(exampleMarkup).join("")}` : ""}
    </article>`).join("") : `<p>No dictionary entry matches this spelling and reading in the offline reference.</p>`)}
  ${inline ? `</div>${entry.components?.length ? `<aside class="inline-kanji-section">${kanjiCards(entry)}</aside>` : ""}</div>` : ""}
  <p class="reference-note">Dictionary senses are reference information. Your accepted review answers stay as shown on your card.
    Examples under a sense illustrate that sense. Additional word examples are shown separately.</p>`;

export const referenceContentMarkup = (entry, { inline = false } = {}) => `${entry.type === "vocabulary" ? vocabularyMarkup(entry, inline) : kanjiMarkup(entry, inline)}
  <footer class="reference-sources">${entry.type === "vocabulary"
    ? 'Dictionary: EDRDG JMdict via jmdict-simplified (CC BY-SA 4.0). Examples: Tanaka Corpus / Tatoeba contributors (CC BY 2.0 FR).'
    : 'Diagrams and phonetic annotations: KanjiVG, © Ulrich Apel (CC BY-SA 3.0). Radical and phonetic data: Kanjium / Uros O. and EDRDG (CC BY-SA 4.0). Additional component facts link to their dictionary sources. Look-alikes: Kanjium and similar-kanji / siikamiika (MIT).'}
  </footer>`;

export const inlineReferenceMarkup = (entry) => `<div class="inline-reference ${entry.type === "vocabulary" ? "is-vocabulary" : "is-kanji"}">${referenceContentMarkup(entry, { inline: true })}</div>`;

export const confusionMarkup = (items) => items?.length ? `<aside class="reference-confusions" aria-label="Possible mix-up"><h3>Thinking of…?</h3>
  ${items.slice(0, 1).map((entry) => referenceLinkMarkup(entry, `<strong lang="ja">${escapeHtml(entry.item)}</strong>
    <span lang="ja">${escapeHtml(entry.reading ?? "")}</span><small>${escapeHtml((entry.meanings ?? []).slice(0, 1).join("; "))}</small>`)).join("")}</aside>` : "";
