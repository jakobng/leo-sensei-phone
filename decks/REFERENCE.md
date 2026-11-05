# Offline study reference

`study-reference.json.gz` and `reference-words/*.json.gz` form a deterministic,
version 1 reference document. Vocabulary is loaded by spelling into a bounded
four-shard cache, so the full dictionary never needs to enter memory. The reference is
read-only dictionary material, separate from card definitions, accepted answers,
learner events and backups. No WaniKani account or network connection is required.

Sources recorded by `scripts/build-study-reference.py`:

- **Kanjium**, Uros O. and EDRDG, commit
  `9ebca4589565c696e7c39e089e2e928ad65f678c`: classical radicals and variants,
  kanji meanings/readings, curated look-alikes and phonetic components.
  [Source](https://github.com/mifunetoshiro/kanjium), CC BY-SA 4.0.
  The pitch accent notation, verb particle data, phonetics, homonyms and other
  additions or modifications to EDICT, KANJIDIC or KRADFILE were provided by
  Uros O. through his free database. No pitch data is bundled in this extract.
- **KanjiVG**, © 2009–2026 Ulrich Apel, commit
  `610091ce618cf757ed1357a8954cd65283e015d6`: standard glyph SVG paths and
  component groups, extracted without scripts, styling or stroke-number labels.
  [Source](https://kanjivg.tagaini.net/), CC BY-SA 3.0.
- **similar-kanji**, siikamiika, commit
  `0edcfebd5204676dec72b6b12fa26c148489bb1c`: human-curated visual-similarity
  links from `kanji.tgz_similars.ut8`, merged with Kanjium's look-alikes.
  [Source](https://github.com/siikamiika/similar-kanji), MIT; see
  `LICENSE.similar-kanji`. Links are made reciprocal; sharing parts alone
  does not create a visual-similarity link.
- **JMdict**, Electronic Dictionary Research and Development Group and
  contributors, via **jmdict-simplified** release `3.6.2+20261102210542`,
  `jmdict-examples-eng` archive: written forms, restricted readings, senses,
  usage labels, cross-references and linked examples.
  [Source](https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20261102210542),
  CC BY-SA 4.0. Dictionary entries remain identifiable by their JMdict IDs.
- **Tanaka Corpus / Tatoeba contributors**: Japanese–English example pairs
  supplied with JMdict, the indexed WWWJDIC corpus, and linked Japanese/English
  sentence exports, CC BY 2.0 FR. The additional exports are the 2026-10-31
  snapshot. The download URLs track current exports; input hashes identify the
  snapshot used in a build. Preserve the downloaded inputs for exact rebuilding.
  Each retained example links to its Tatoeba source. Indexed examples retain
  reading and sense restrictions. Full-corpus matches must span complete tokenizer
  tokens and have the dictionary reading. Examples without an exact sense link
  are presented separately as word examples. No example is invented.
- **Reviewed supplemental annotations**, in `assets/reference-supplements.json`:
  usage notes for 26 study-list forms without a direct dictionary match, plus
  16 phonetic-component facts checked against Wiktionary and KanjiPedia. Each
  phonetic annotation retains its source URL; notes use original prose. Additional
  unambiguous phonetic annotations come from KanjiVG. Historical components in
  simplified characters are identified explicitly.

Derived data retains the respective source terms above and is not ISC-licensed.
The gzip document includes the source revisions and SHA-256 hashes of all inputs.
The UI names its sources and links each example to the original sentence.

The bundled 8,131 vocabulary cards all have a dictionary match or a specific
usage note and related dictionary forms. 7,843 have a linked bilingual sentence.
All 1,975 distinct Han characters in those cards (including the iteration mark
々) have diagrams; 1,415 have sound-component annotations and 1,913 have curated
look-alike links. Every bundled character classified as a phono-semantic compound
has an identified sound component. Other character types may have no separate
phonetic component. These figures describe the bundled lists, not arbitrary imports.

Rebuild from public inputs only, from the repository root with its existing Node
dependencies available:

```sh
python3 scripts/build-study-reference.py --source-dir /tmp/sensei-reference-source --fetch --output-dir decks
python3 scripts/build-study-reference.py --source-dir /tmp/sensei-reference-source --prepare-pairs > /tmp/sensei-pairs.jsonl
node scripts/enrich-reference-examples.mjs /tmp/sensei-pairs.jsonl > /tmp/sensei-extra-examples.json
python3 scripts/build-study-reference.py --source-dir /tmp/sensei-reference-source --extra-examples /tmp/sensei-extra-examples.json --output-dir decks
```

Omit `--fetch` to rebuild from already-downloaded inputs. The first build must be
the base reference without `--extra-examples`, because enrichment targets words
still lacking examples. The source directory
must never be a learner-state directory. Curated look-alike coverage is incomplete;
shared components are not substituted for missing visual-similarity judgments.
Diagrams describe visual components, not historical etymology.
