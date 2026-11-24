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

export const referenceDiagramMarkup = (parts, literal, isShared = () => false) => parts?.length
  ? `<svg class="reference-diagram" viewBox="0 0 109 109" role="img" aria-label="Components of ${escapeHtml(literal)}">
      ${parts.map((part, i) => `<g class="${isShared(part) ? "part-shared" : `part-${i % 5}`}">
        ${(part.paths ?? []).map((path) => `<path d="${escapeHtml(path)}" />`).join("")}</g>`).join("")}</svg>`
  : `<strong class="reference-glyph" lang="ja">${escapeHtml(literal)}</strong>`;

export const comparisonKey = (other) => other.id || other.item;

const readingKey = (reading) => String(reading ?? "").normalize("NFKC").replace(/[.\-]/gu, "")
  .replace(/[ァ-ヶ]/gu, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

const sharedPrefix = (left, right) => {
  const mismatch = left.findIndex((ch, i) => ch !== right[i]);
  return mismatch < 0 ? left.length : mismatch;
};

const vocabularyComparisonBody = (current, other) => {
  const currentKanji = current.components?.length === 1 && current.components[0].item === current.item
    ? current.components[0] : null;
  const bothKanjiDiagrams = Boolean(currentKanji?.diagram?.length && other.diagram?.length);
  const currentReading = current.readings?.length ? current.readings.join(" · ") : (current.reading ?? "");
  const currentMeanings = current.meanings?.length
    ? current.meanings : (current.entries?.[0]?.senses?.slice(0, 2).flatMap((sense) => sense.meanings).slice(0, 4) ?? []);
  const otherReading = other.reading ?? (other.readings ?? []).join(" · ");
  const exploreLink = referenceLinkMarkup(
    { item: other.item, type: "vocabulary", reading: other.readings?.[0] ?? other.reading ?? "" },
    `Explore <span lang="ja">${escapeHtml(other.item)}</span>`,
  );

  if (bothKanjiDiagrams) {
    const shared = (currentKanji.diagram ?? []).map((part) => part.literal)
      .filter((literal) => literal && other.parts?.includes(literal));
    const pair = [
      { item: current.item, diagram: currentKanji.diagram, meanings: currentMeanings, reading: currentReading },
      other,
    ];
    return `<div class="comparison-pair">${pair.map((entry) => `
      <figure>${referenceDiagramMarkup(entry.diagram, entry.item, (part) => shared.includes(part.literal))}<figcaption>
        <strong lang="ja">${escapeHtml(entry.item)}</strong><span>${meanings(entry)}</span>
        <small lang="ja">${escapeHtml(entry.reading ?? "")}</small></figcaption></figure>`).join("")}</div>
      <p class="reference-note">${shared.length ? "Shared parts are grey; different parts are coloured." : "Compare the coloured parts, readings and meanings."}</p>
      ${exploreLink}`;
  }

  const leftChars = [...String(current.item ?? "")];
  const rightChars = [...String(other.item ?? "")];
  const prefix = sharedPrefix(leftChars, rightChars);
  const suffix = sharedPrefix(leftChars.slice(prefix).reverse(), rightChars.slice(prefix).reverse());
  const highlightWord = (chars) => {
    const end = chars.length - suffix;
    const diff = chars.slice(prefix, end).join("");
    const marked = diff && (prefix > 0 || suffix > 0) ? `<mark>${escapeHtml(diff)}</mark>` : escapeHtml(diff);
    return `<strong class="comparison-word" lang="ja">${escapeHtml(chars.slice(0, prefix).join(""))}${marked}${escapeHtml(chars.slice(end).join(""))}</strong>`;
  };
  const currentKeys = new Set((current.readings?.length ? current.readings : [current.reading]).map(readingKey).filter(Boolean));
  const otherReadings = other.readings?.length ? other.readings : String(other.reading ?? "").split(/\s*·\s*/u);
  const sharesReading = otherReadings.some((r) => currentKeys.has(readingKey(r)));
  const note = current.item === other.item
    ? "Same spelling. Compare the readings and meanings."
    : sharesReading ? "These can sound the same. Compare the spelling and meanings."
      : prefix > 0 || suffix > 0 ? "Different characters are highlighted."
        : "Compare the spellings, readings and meanings.";

  return `<div class="comparison-pair">${[
    { chars: leftChars, meanings: currentMeanings, reading: currentReading },
    { chars: rightChars, meanings: other.meanings, reading: otherReading },
  ].map((entry) => `<figure>${highlightWord(entry.chars)}<figcaption>
    <span>${meanings(entry)}</span><small lang="ja">${escapeHtml(entry.reading ?? "")}</small></figcaption></figure>`).join("")}</div>
    <p class="reference-note">${note}</p>
    ${exploreLink}`;
};

const comparison = (current, other) => {
  const key = comparisonKey(other);
  const isOpen = Boolean(current.comparisonOpen?.includes(key) || current.comparisonOpen?.includes(other.item));
  const badge = other.inGroup ? "In your group · Compare" : `Compare${other.studied ? " · in your reviews" : ""}`;
  let body;
  if (current.type === "vocabulary") {
    body = vocabularyComparisonBody(current, other);
  } else {
    const shared = (current.components ?? []).map((part) => part.literal).filter((literal) => literal && other.parts?.includes(literal));
    const pair = [
      { item: current.item, diagram: current.components, meanings: current.meanings,
        reading: [...(current.onReadings ?? []), ...(current.kunReadings ?? [])].join(" · ") },
      other,
    ];
    body = `<div class="comparison-pair">${pair.map((entry) => `<figure>${referenceDiagramMarkup(entry.diagram, entry.item, (part) => shared.includes(part.literal))}<figcaption><strong lang="ja">${escapeHtml(entry.item)}</strong>
      <span>${meanings(entry)}</span><small lang="ja">${escapeHtml(entry.reading ?? "")}</small></figcaption></figure>`).join("")}</div>
      <p class="reference-note">${shared.length ? "Shared parts are grey; different parts are coloured." : "Compare the coloured parts, readings and meanings."}</p>
      ${referenceLinkMarkup(other, `Explore <span lang="ja">${escapeHtml(other.item)}</span>`)}`;
  }
  return `<details class="reference-comparison${other.inGroup ? " is-grouped" : ""}" data-comparison="${escapeHtml(key)}"${isOpen ? " open" : ""}><summary>
    <strong lang="ja">${escapeHtml(other.item)}</strong><span>${meanings(other)}</span>
    <small>${badge}</small></summary>${body}</details>`;
};

const similarSection = (entry) => {
  const similar = entry.similar ?? [];
  const grouped = similar.filter((other) => other.inGroup);
  const hasGrouped = grouped.length > 0;
  const isWrong = Boolean(entry.wrong);
  if (!similar.length) {
    return entry.type === "vocabulary" ? ""
      : section("Looks similar", '<p>No curated look-alikes are listed for this character. Shared-component links, when available, are shown separately below.</p>');
  }
  const names = grouped.map((other) => `<strong lang="ja">${escapeHtml(other.item)}</strong>`).join("、");
  const lead = hasGrouped
    ? `<p class="reference-similar-lead">In your group with ${names}${isWrong ? " — compare them before continuing." : "."}</p>`
    : "";
  return `<section class="reference-section reference-similar-section${hasGrouped ? " has-grouped" : ""}${hasGrouped && isWrong ? " is-wrong" : ""}"><h3>Looks similar</h3>${lead}${similar.map((other) => comparison(entry, other)).join("")}</section>`;
};

export const groupCompareBannerMarkup = (entry, { wrong = false } = {}) => {
  const grouped = (entry?.similar ?? []).filter((other) => other.inGroup);
  if (!grouped.length) return "";
  return `<aside class="group-compare-callout${wrong ? " is-wrong" : ""}" aria-label="Looks similar — your group">
    <div class="group-compare-header">
      <strong>Looks similar · in your group</strong>
      <span>${wrong ? "Compare these before continuing" : "Quick compare"}</span>
    </div>
    <div class="group-compare-buttons">${grouped.map((other) => `<button class="group-compare-button" type="button" data-open-comparison="${escapeHtml(comparisonKey(other))}">
      <strong lang="ja">${escapeHtml(other.item)}</strong>
      ${other.meanings?.length ? `<span>${escapeHtml(other.meanings.slice(0, 2).join(", "))}</span>` : ""}
      <small>Compare</small>
    </button>`).join("")}</div>
  </aside>`;
};

export const kanjiStoryMarkup = (story) => story ? `<p class="kanji-story">
  <strong>Memory story</strong>
  ${story.split(/([\p{Script=Han}\p{Script=Katakana}⺀-⻳]+)/u).map((part, i) => i % 2
    ? `<b lang="ja">${escapeHtml(part)}</b>` : escapeHtml(part)).join("")}</p>` : "";

const kanjiMarkup = (entry, inline = false) => {
  const similarBlock = similarSection(entry);
  const hasGrouped = (entry.similar ?? []).some((other) => other.inGroup);
  return `
  ${hasGrouped && inline ? similarBlock : ""}
  <div class="reference-overview">${referenceDiagramMarkup(entry.components, entry.item)}<div>
    ${inline ? '<h3>Structure & readings</h3>' : `<h2 lang="ja">${escapeHtml(entry.item)}</h2><p class="reference-meaning">${meanings(entry)}</p>`}
    <dl><dt>On readings</dt><dd lang="ja">${escapeHtml(entry.onReadings?.join(" · ") || "—")}</dd>
      <dt>Kun readings</dt><dd lang="ja">${escapeHtml(entry.kunReadings?.join(" · ") || "—")}</dd></dl>
    ${entry.nanoriReadings?.length ? `<details><summary>Name readings</summary><p lang="ja">${escapeHtml(entry.nanoriReadings.join(" · "))}</p></details>` : ""}
  </div></div>
  ${kanjiStoryMarkup(entry.story)}
  ${hasGrouped && !inline ? similarBlock : ""}
  ${section("Components", entry.components?.length ? `<div class="reference-components">${entry.components.filter((part) => part.literal).map((part, i) => `
    <div class="reference-part part-${i % 5}">${referenceLinkMarkup({ ...part, item: part.item || part.original || part.literal, type: "kanji" },
      `<strong lang="ja">${escapeHtml(part.literal)}</strong><span>${escapeHtml(part.meaning)}</span><small>${escapeHtml(part.position)}</small>`)}</div>`).join("")}</div>
    <p class="reference-note">Visual components help you recognise the shape; they are not an account of the character’s historical origin.</p>` : "")}
  ${section("Classical radical", entry.radicalInfo ? `<p class="reference-radical"><strong lang="ja">${escapeHtml(entry.radicalInfo.literal)}</strong>
    <span>${escapeHtml(entry.radicalInfo.meaning)}<small lang="ja">${escapeHtml(entry.radicalInfo.names)}</small></span></p>` : "")}
  ${hasGrouped ? "" : similarBlock}
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
};

const exampleMarkup = (example) => `<blockquote class="reference-example"><p lang="ja">${escapeHtml(example.ja)}</p>
  <p>${escapeHtml(example.en)}</p><a href="${escapeHtml(example.url)}" target="_blank" rel="noopener noreferrer">Sentence source</a></blockquote>`;
const senseMarkup = (sense) => `<div class="reference-sense"><p class="reference-meaning">${meanings(sense)}</p>
  <div class="reference-tags">${sense.tags.map((tag) => `<span>${escapeHtml(tagLabel(tag))}</span>`).join("")}</div>
  ${sense.info.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}
  ${sense.examples.map(exampleMarkup).join("")}
  ${sense.related.length ? `<div class="reference-relations">${sense.related.map((related) => referenceLinkMarkup(related)).join("")}</div>` : ""}</div>`;

const kanjiCards = (entry) => section("Kanji in this word", entry.components?.length ? `<div class="inline-kanji-grid">${entry.components.map((part) => `
  <article class="inline-kanji-card">
    ${referenceLinkMarkup(part, `${referenceDiagramMarkup(part.diagram, part.item)}<span><strong lang="ja">${escapeHtml(part.item)}</strong><small>${meanings(part)}</small></span>`)}
    <dl><dt>On</dt><dd lang="ja">${escapeHtml(part.onReadings?.join(" · ") || "—")}</dd>
      <dt>Kun</dt><dd lang="ja">${escapeHtml(part.kunReadings?.join(" · ") || "—")}</dd>
      ${part.radicalInfo ? `<dt>Radical</dt><dd><span lang="ja">${escapeHtml(part.radicalInfo.literal)}</span> · ${escapeHtml(part.radicalInfo.meaning)}<small lang="ja">${escapeHtml(part.radicalInfo.names)}</small></dd>` : ""}
    </dl>
    ${part.phonetic ? `<p class="inline-sound">Sound part <strong lang="ja">${escapeHtml(part.phonetic.part)}</strong>${part.phonetic.readings?.length ? ` · <span lang="ja">${escapeHtml(part.phonetic.readings.join(" · "))}</span>` : ""}${part.phonetic.sourceNote ? `<small>${escapeHtml(part.phonetic.sourceNote)}</small>` : ""}</p>` : ""}
    ${part.lookalikes?.length ? `<div class="inline-lookalikes"><span>Looks similar</span>${part.lookalikes.map((other) => referenceLinkMarkup(other, escapeHtml(other.item))).join("")}</div>` : ""}
  </article>`).join("")}</div>` : "");

const vocabularyMarkup = (entry, inline = false) => {
  const similarBlock = similarSection(entry);
  return `${inline ? similarBlock : `<div class="reference-vocabulary-heading"><h2 lang="ja">${escapeHtml(entry.item)}</h2>
  <p lang="ja">${escapeHtml(entry.readings?.join(" · ") || entry.reading)}</p><p class="reference-meaning">${meanings(entry)}</p></div>
  ${similarBlock}
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
};

export const referenceContentMarkup = (entry, { inline = false } = {}) => `${entry.type === "vocabulary" ? vocabularyMarkup(entry, inline) : kanjiMarkup(entry, inline)}
  <footer class="reference-sources">${entry.type === "vocabulary"
    ? 'Dictionary: EDRDG JMdict via jmdict-simplified (CC BY-SA 4.0). Examples: Tanaka Corpus / Tatoeba contributors (CC BY 2.0 FR).'
    : 'Diagrams and phonetic annotations: KanjiVG, © Ulrich Apel (CC BY-SA 3.0). Radical and phonetic data: Kanjium / Uros O. and EDRDG (CC BY-SA 4.0). Additional component facts link to their dictionary sources. Look-alikes: Kanjium and similar-kanji / siikamiika (MIT).'}
  </footer>`;

export const inlineReferenceMarkup = (entry) => `<div class="inline-reference ${entry.type === "vocabulary" ? "is-vocabulary" : "is-kanji"}">${referenceContentMarkup(entry, { inline: true })}</div>`;

export const confusionMarkup = (items) => items?.length ? `<aside class="reference-confusions" aria-label="Possible mix-up"><h3>Thinking of…?</h3>
  ${items.slice(0, 1).map((entry) => referenceLinkMarkup(entry, `<strong lang="ja">${escapeHtml(entry.item)}</strong>
    <span lang="ja">${escapeHtml(entry.reading ?? "")}</span><small>${escapeHtml((entry.meanings ?? []).slice(0, 1).join("; "))}</small>`)).join("")}</aside>` : "";
