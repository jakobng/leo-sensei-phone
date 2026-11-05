# Bundled JLPT-Oriented Vocabulary

These are unofficial community approximations. The JLPT does not publish official vocabulary lists.

- Source: [`jamsinclair/open-anki-jlpt-decks`](https://github.com/jamsinclair/open-anki-jlpt-decks)
- Pinned commit: `1ad66734417aca9dbcca6b2d5ee440cb13ab3ba0`
- Source files: `src/n5.csv` through `src/n1.csv`
- License: MIT, Copyright (c) 2020 Jamie Sinclair

Each checked-in JSON file is produced from one source CSV using the stream filter:

```sh
node scripts/build-jlpt-deck.mjs --level N5 < src/n5.csv > decks/n5-vocabulary.json
```

Repeat with `N4` through `N1`. `manifest.json` records the expected output SHA-256 digests.
