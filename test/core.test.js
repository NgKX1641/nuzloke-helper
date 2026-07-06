import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  addOrReplaceMove,
  ballModifier,
  catchChanceGen5,
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
const captureRates = JSON.parse(fs.readFileSync(path.join(root, "src/data/captureRates.gen5.json"), "utf8"));
const evolutionChains = JSON.parse(fs.readFileSync(path.join(root, "src/data/evolutionChains.gen5.json"), "utf8"));
const moveMap = new Map(moves.map((move) => [move.id, move]));
const captureRateMap = new Map(captureRates.map((entry) => [entry.pokemonId, entry.captureRate]));
const evolutionChainMap = new Map(evolutionChains.map((entry) => [entry.pokemonId, entry.chain]));

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

test("fixed-damage moves include effect descriptions", () => {
  assert.match(move("dragonrage").description, /40 HP damage/);
  assert.match(move("dragonrage").effect, /40 points of damage/);
});

test("lookup ranking prefers prefix matches over contained substring matches", () => {
  const ranked = rankLookupItems([move("wingattack"), move("sandattack"), move("tackle")], "tac");
  assert.equal(ranked[0].id, "tackle");
});

test("Nest Ball is stronger at low target levels", () => {
  assert.equal(ballModifier("nest", { level: 5 }), 3.6);
  assert.equal(ballModifier("nest", { level: 30 }), 1);
});

test("Quick Ball uses the Gen 5 first-turn modifier", () => {
  assert.equal(ballModifier("quick", { turn: 1 }), 5);
  assert.equal(ballModifier("quick", { turn: 2 }), 1);
});

test("catch chance improves as HP drops", () => {
  const fullHp = catchChanceGen5({ captureRate: 45, hpPercent: 100, ballBonus: 1, statusBonus: 1 });
  const lowHp = catchChanceGen5({ captureRate: 45, hpPercent: 1, ballBonus: 1, statusBonus: 1 });
  assert.ok(lowHp.chance > fullHp.chance);
});

test("Gen 5 catch-rate data keeps Black/White historical legendary values", () => {
  assert.equal(captureRateMap.get(382), 5);
  assert.equal(captureRateMap.get(383), 5);
  assert.equal(captureRateMap.get(384), 3);
  assert.equal(captureRateMap.get(483), 30);
  assert.equal(captureRateMap.get(484), 30);
  assert.equal(captureRateMap.get(643), 45);
  assert.equal(captureRateMap.get(644), 45);
});

test("evolution chart data maps each Pokemon to its full chain", () => {
  const samurottChain = evolutionChainMap.get(503);
  assert.equal(samurottChain.name, "Oshawott");
  assert.equal(samurottChain.evolvesTo[0].pokemon.name, "Dewott");
  assert.equal(samurottChain.evolvesTo[0].pokemon.evolvesTo[0].pokemon.name, "Samurott");
});

test("evolution chart data keeps Gen 5 Unova location methods", () => {
  const magnetonChain = evolutionChainMap.get(82);
  const magneton = magnetonChain.evolvesTo[0].pokemon;
  assert.equal(magneton.evolvesTo[0].pokemon.name, "Magnezone");
  assert.equal(magneton.evolvesTo[0].condition, "at Chargestone Cave");
});
