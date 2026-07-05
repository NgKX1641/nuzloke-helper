import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  addOrReplaceMove,
  effectivePower,
  effectiveness,
  getMoveSuggestions,
  rankLookupItems,
  rankSelectedMoves,
  validateMember,
} from "../src/core.js";

const root = path.resolve(import.meta.dirname, "..");
const moves = JSON.parse(fs.readFileSync(path.join(root, "src/data/moves.gen5.json"), "utf8"));
const learnsets = JSON.parse(fs.readFileSync(path.join(root, "src/data/learnsets.black-white.json"), "utf8"));
const typeChart = JSON.parse(fs.readFileSync(path.join(root, "src/data/typeChart.gen5.json"), "utf8"));
const moveMap = new Map(moves.map((move) => [move.id, move]));

function move(id) {
  return moveMap.get(id);
}

function samurott(overrides = {}) {
  return {
    id: "samurott",
    pokemonId: 503,
    pokemonName: "Samurott",
    level: 36,
    types: ["Water"],
    moves: [],
    ...overrides,
  };
}

test("Samurott at level 36 suggests Slash", () => {
  const suggestions = getMoveSuggestions(samurott(), learnsets, moveMap, false);
  assert.ok(suggestions.recent.some((entry) => entry.moveId === "slash" && entry.learnMethod === "evolution"));
});

test("Slash is not automatically added to the active moveset", () => {
  const member = samurott();
  getMoveSuggestions(member, learnsets, moveMap, false);
  assert.deepEqual(member.moves, []);
});

test("Selecting Slash adds it only after user confirmation", () => {
  const member = samurott();
  const result = addOrReplaceMove(member, move("slash"));
  assert.equal(result.ok, true);
  assert.deepEqual(member.moves, []);
  assert.deepEqual(result.member.moves.map((entry) => entry.id), ["slash"]);
});

test("A Pokemon cannot have more than four active moves", () => {
  const member = samurott({
    moves: [move("razorshell"), move("aquajet"), move("furycutter"), move("slash")],
  });
  const result = addOrReplaceMove(member, move("surf"));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "full");
});

test("Randomized-move mode allows any Gen 5 move", () => {
  const member = samurott({ moves: [move("thunderbolt")] });
  const validation = validateMember(member, moveMap, learnsets, true);
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.warnings, []);
});

test("Normal mode warns about moves outside the normal Black/White learnset", () => {
  const member = samurott({ moves: [move("thunderbolt")] });
  const validation = validateMember(member, moveMap, learnsets, false);
  assert.equal(validation.errors.length, 0);
  assert.ok(validation.warnings.some((warning) => warning.includes("Thunderbolt")));
});

test("Razor Shell against Rock/Ground returns 4x effectiveness", () => {
  assert.equal(effectiveness(move("razorshell").type, ["Rock", "Ground"], typeChart), 4);
});

test("Electric moves against Ground return 0x effectiveness", () => {
  assert.equal(effectiveness(move("thunderbolt").type, ["Ground"], typeChart), 0);
});

test("STAB applies a 1.5 multiplier", () => {
  const score = effectivePower(move("razorshell"), ["Water"], ["Normal"], typeChart);
  assert.equal(score, 75 * 1 * 1.5 * 0.95);
});

test("Status moves are excluded from damage ranking", () => {
  const member = samurott({ moves: [move("swordsdance"), move("razorshell")] });
  const ranked = rankSelectedMoves(member, { types: ["Rock", "Ground"] }, typeChart);
  assert.deepEqual(ranked.damaging.map((entry) => entry.move.id), ["razorshell"]);
  assert.deepEqual(ranked.status.map((entry) => entry.move.id), ["swordsdance"]);
});

test("lookup ranking prefers prefix matches over contained substring matches", () => {
  const ranked = rankLookupItems([move("wingattack"), move("sandattack"), move("tackle")], "tac");
  assert.equal(ranked[0].id, "tackle");
});
