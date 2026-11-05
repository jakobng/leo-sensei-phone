# Third-Party Notices

Leo Sensei の-nonsense 日本語 is ISC-licensed. The following components and data are not relicensed under ISC.

## Runtime Libraries

| Component | Purpose | License |
| --- | --- | --- |
| [noble-hashes](https://github.com/paulmillr/noble-hashes) | Browser study engine hashing | MIT |
| [WanaKana](https://github.com/WaniKani/WanaKana) | Romaji and kana conversion | MIT |
| [Kuromoji.js](https://github.com/takuyaa/kuromoji.js) | Build-time Japanese tokenization and furigana generation | Apache-2.0 |

The exact JavaScript dependency graph and versions are recorded in `package-lock.json`.

## Dictionary Data

Release builds that include data derived from **JMdict** or **KANJIDIC2** must retain the source attribution and ShareAlike terms required by the Electronic Dictionary Research and Development Group (EDRDG). Those files are provided under Creative Commons Attribution-ShareAlike 4.0.

- [EDRDG General Dictionary Licence Statement](https://www.edrdg.org/edrdg/licence.html)
- [JMdict/EDICT Dictionary Project](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project)
- [KANJIDIC Project](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project)

Suggested in-app acknowledgement:

> This product uses material from the JMdict and/or KANJIDIC2 dictionary files. Copyright is held by the Electronic Dictionary Research and Development Group and contributors. The dictionary material is used under CC BY-SA 4.0.

The application must expose this acknowledgement from an About or Sources view whenever it distributes a significant extract or derived vocabulary list. Do not claim copyright over EDRDG material. Keep derived dictionary data identifiable so its ShareAlike obligations do not become ambiguous.

The bundled JLPT vocabulary decks are derived from [jamsinclair/open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) at commit `1ad66734417aca9dbcca6b2d5ee440cb13ab3ba0`, licensed under MIT. Copyright (c) 2020 Jamie Sinclair. See `decks/SOURCE.md` for the exact derivation and upstream license.

The bundled offline study reference in `decks/study-reference.json.gz` additionally
uses **Kanjium** by Uros O. and EDRDG (CC BY-SA 4.0), **KanjiVG** by Ulrich Apel
(CC BY-SA 3.0), **similar-kanji** by siikamiika (MIT; full notice in
`decks/LICENSE.similar-kanji`), and **JMdict** via jmdict-simplified (CC BY-SA 4.0). Its example
sentences come from the **Tanaka Corpus / Tatoeba contributors** (CC BY 2.0 FR),
including the indexed WWWJDIC corpus and linked Japanese–English sentence exports.
Additional phonetic-component facts were checked against **Wiktionary** and
**KanjiPedia**; each annotation retains its source link. No dictionary prose was
copied into those annotations.
The phonetics and other additions or modifications to EDICT, KANJIDIC or KRADFILE
were provided by Uros O. through his free database. See [decks/REFERENCE.md](decks/REFERENCE.md)
for pinned sources, extraction details, attribution and reproducible build instructions.
The reference data retains these source terms; it is not relicensed under ISC.

## Grammar Data

The vendored JLPT N1 grammar source in `assets/hanabira-n1.json` is a reduced extract from [Hanabira.org](https://hanabira.org) and its [source repository](https://github.com/tristcoil/hanabira.org). The content is licensed under CC BY-SA; it is not relicensed under this application's ISC license. See `assets/ATTRIBUTION.md` for the retained fields and transformation details.

MaruMori exports are user-supplied runtime inputs. They are not bundled with the application or stored in this repository.

## Release Check

Before publishing an installer, generate the dependency license inventory from the locked build, compare it with this notice, and inspect the final artifact. A lock file is reproducibility metadata; it is not a substitute for the notices that must accompany redistributed binaries, data, models, or voices.
