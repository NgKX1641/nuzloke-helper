# Pokemon Black Nuzlocke Helper

A local, offline-first Gen 5 battle helper for Pokemon Black/White randomized Nuzlocke runs.

## Features

- Save up to six team members in `localStorage`.
- Auto-fill normal Gen 5 Pokemon types, with manual overrides for randomized type runs.
- Track each Pokemon's actual current moveset with zero to four confirmed moves.
- Suggest Black/White learnable moves by level, evolution, TM/HM, and tutor data without adding them automatically.
- Rank only the selected current damaging moves against the opponent.
- Separate status/utility moves from damage rankings.
- Show STAB, type effectiveness, base power, accuracy, priority, immunity warnings, and an approximate effective power score.
- Warn about risky STAB matchups, 4x weaknesses, resisted STAB, and illegal normal-mode moves.

## Run Locally

From this folder:

```powershell
python -m http.server 5177
```

Then open:

```text
http://localhost:5177
```

The app has no backend. It uses static JSON files from `src/data` and browser `localStorage`.

## Tests

```powershell
npm test
```

The tests cover Samurott's level 36 Slash suggestion, manual confirmation, four-move validation, randomized move behavior, illegal move warnings, type effectiveness, STAB scoring, and status move handling.

## Data

Runtime data lives in:

- `src/data/pokemon.gen5.json`
- `src/data/typeChart.gen5.json`
- `src/data/moves.gen5.json`
- `src/data/learnsets.black-white.json`

`moves.gen5.json` and `learnsets.black-white.json` are generated from PokeAPI CSV data for Gen 5 and the `black-white` version group. The app does not call live APIs during normal usage.

To rebuild move data after downloading the CSV files into `tmp-data`:

```powershell
node .\tools\build-move-data.js
```
