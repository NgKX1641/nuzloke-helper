const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const tmp = path.join(root, "tmp-data");
const out = path.join(root, "src", "data");

const TYPE_NAMES = {
  1: "Normal",
  2: "Fighting",
  3: "Flying",
  4: "Poison",
  5: "Ground",
  6: "Rock",
  7: "Bug",
  8: "Ghost",
  9: "Steel",
  10: "Fire",
  11: "Water",
  12: "Grass",
  13: "Electric",
  14: "Psychic",
  15: "Ice",
  16: "Dragon",
  17: "Dark",
};

const DAMAGE_CLASSES = {
  1: "status",
  2: "physical",
  3: "special",
};

const LEARN_METHODS = {
  1: "level-up",
  2: "egg",
  3: "tutor",
  4: "machine",
};

const BLACK_WHITE_VERSION_GROUP = 11;
const GEN_5 = 5;

const EVOLUTION_MOVE_OVERRIDES = [
  {
    pokemonId: 503,
    moveId: "slash",
    learnMethod: "evolution",
    levelLearnedAt: 36,
    versionGroup: "black-white",
    note: "Offered when Dewott evolves into Samurott.",
  },
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  const [headers, ...data] = rows;
  return data.filter((line) => line.length === headers.length).map((line) => (
    Object.fromEntries(headers.map((header, index) => [header, line[index]]))
  ));
}

function readCsv(file) {
  return parseCsv(fs.readFileSync(path.join(tmp, file), "utf8"));
}

function toMoveId(identifier) {
  return identifier.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nullableNumber(value) {
  if (value === "" || value === "0") return null;
  return Number(value);
}

function main() {
  const moveNames = new Map(
    readCsv("move_names.csv")
      .filter((row) => row.local_language_id === "9")
      .map((row) => [row.move_id, row.name])
  );

  const moves = readCsv("moves.csv")
    .filter((row) => Number(row.generation_id) <= GEN_5)
    .filter((row) => TYPE_NAMES[row.type_id])
    .map((row) => ({
      id: toMoveId(row.identifier),
      sourceMoveId: Number(row.id),
      name: moveNames.get(row.id) || row.identifier,
      type: TYPE_NAMES[row.type_id],
      category: DAMAGE_CLASSES[row.damage_class_id],
      power: nullableNumber(row.power),
      accuracy: nullableNumber(row.accuracy),
      priority: Number(row.priority || 0),
    }))
    .filter((move) => move.category);

  const moveIdBySource = new Map(moves.map((move) => [move.sourceMoveId, move.id]));
  const learnsets = readCsv("pokemon_moves.csv")
    .filter((row) => Number(row.version_group_id) === BLACK_WHITE_VERSION_GROUP)
    .filter((row) => Number(row.pokemon_id) >= 1 && Number(row.pokemon_id) <= 649)
    .map((row) => ({
      pokemonId: Number(row.pokemon_id),
      moveId: moveIdBySource.get(Number(row.move_id)),
      learnMethod: LEARN_METHODS[row.pokemon_move_method_id],
      levelLearnedAt: row.level ? Number(row.level) : null,
      versionGroup: "black-white",
    }))
    .filter((entry) => entry.moveId && entry.learnMethod);

  const dedupe = new Map();
  for (const entry of [...learnsets, ...EVOLUTION_MOVE_OVERRIDES]) {
    const key = `${entry.pokemonId}:${entry.moveId}:${entry.learnMethod}:${entry.levelLearnedAt ?? ""}`;
    dedupe.set(key, entry);
  }

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, "moves.gen5.json"),
    JSON.stringify(moves.map(({ sourceMoveId, ...move }) => move), null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(out, "learnsets.black-white.json"),
    JSON.stringify([...dedupe.values()], null, 2) + "\n"
  );

  console.log(`Wrote ${moves.length} Gen 5 moves and ${dedupe.size} Black/White learnset entries.`);
}

main();
