export function normalizeId(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function lookupScore(name, query) {
  const normalizedQuery = normalizeId(query);
  if (!normalizedQuery) return 100;
  const normalizedName = normalizeId(name);
  const words = String(name).split(/[^A-Za-z0-9]+/).map(normalizeId).filter(Boolean);
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (words.some((word) => word.startsWith(normalizedQuery))) return 2;
  const index = normalizedName.indexOf(normalizedQuery);
  if (index >= 0) return 10 + index;
  return 1000;
}

export function rankLookupItems(items, query, getName = (item) => item.name) {
  return [...items]
    .map((item, index) => ({ item, index, score: lookupScore(getName(item), query) }))
    .filter((entry) => entry.score < 1000)
    .sort((a, b) => (
      a.score - b.score ||
      getName(a.item).length - getName(b.item).length ||
      a.index - b.index
    ))
    .map((entry) => entry.item);
}

export function getDefendingTypes(entity) {
  if (!entity) return [];
  if (Array.isArray(entity.types)) return entity.types.filter(Boolean);
  return [entity.type1, entity.type2].filter(Boolean);
}

export function effectiveness(moveType, defendingTypes, typeChart) {
  return defendingTypes.reduce((total, defendingType) => {
    const match = typeChart.chart[moveType]?.[defendingType];
    return total * (match ?? 1);
  }, 1);
}

export function effectivenessLabel(multiplier) {
  if (multiplier === 4) return "4x effective";
  if (multiplier === 2) return "2x effective";
  if (multiplier === 1) return "1x neutral";
  if (multiplier === 0.5) return "0.5x resisted";
  if (multiplier === 0.25) return "0.25x heavily resisted";
  if (multiplier === 0) return "0x no effect";
  return `${multiplier}x`;
}

export function moveMatchesPokemonType(move, pokemonTypes) {
  return pokemonTypes.includes(move.type);
}

export function effectivePower(move, pokemonTypes, defendingTypes, typeChart) {
  if (!move || move.category === "status" || move.power == null) return null;
  const typeEffectiveness = effectiveness(move.type, defendingTypes, typeChart);
  const stabMultiplier = moveMatchesPokemonType(move, pokemonTypes) ? 1.5 : 1;
  const accuracyMultiplier = move.accuracy != null ? move.accuracy / 100 : 1;
  return move.power * typeEffectiveness * stabMultiplier * accuracyMultiplier;
}

export function rankSelectedMoves(member, opponent, typeChart) {
  const pokemonTypes = getDefendingTypes(member);
  const defendingTypes = getDefendingTypes(opponent);
  const selectedMoves = (member.moves || []).filter(Boolean);
  const damaging = [];
  const status = [];

  for (const move of selectedMoves) {
    const typeEffectiveness = effectiveness(move.type, defendingTypes, typeChart);
    const stab = moveMatchesPokemonType(move, pokemonTypes);
    const score = effectivePower(move, pokemonTypes, defendingTypes, typeChart);
    const result = { move, typeEffectiveness, stab, score };
    if (move.category === "status" || move.power == null) {
      status.push(result);
    } else {
      damaging.push(result);
    }
  }

  damaging.sort((a, b) => (
    b.score - a.score ||
    b.typeEffectiveness - a.typeEffectiveness ||
    (b.move.priority || 0) - (a.move.priority || 0) ||
    b.move.power - a.move.power
  ));

  return { damaging, status };
}

export function selectedMoveIds(member) {
  return (member.moves || []).filter(Boolean).map((move) => move.id);
}

export function addOrReplaceMove(member, move, slotIndex = null) {
  const moves = [...(member.moves || [])].filter(Boolean);
  if (moves.some((existing) => existing.id === move.id)) {
    return { ok: false, reason: "duplicate", member };
  }
  if (slotIndex != null) {
    if (slotIndex < 0 || slotIndex > 3) return { ok: false, reason: "invalid-slot", member };
    const next = [...moves];
    next[slotIndex] = move;
    return { ok: true, member: { ...member, moves: next.filter(Boolean).slice(0, 4) } };
  }
  if (moves.length >= 4) return { ok: false, reason: "full", member };
  return { ok: true, member: { ...member, moves: [...moves, move] } };
}

export function isMoveLegalForPokemon(member, moveId, learnsets) {
  if (!member?.pokemonId || !moveId) return false;
  return learnsets.some((entry) => entry.pokemonId === member.pokemonId && entry.moveId === moveId);
}

export function validateMember(member, moveMap, learnsets, movesRandomized = false) {
  const warnings = [];
  const errors = [];
  const moves = (member.moves || []).filter(Boolean);
  const seen = new Set();

  if (moves.length > 4) errors.push("A Pokemon cannot have more than four active moves.");
  if (!Number.isInteger(member.level) || member.level < 1 || member.level > 100) {
    errors.push("Pokemon level must be between 1 and 100.");
  }

  for (const move of moves) {
    if (!moveMap.has(move.id)) {
      errors.push(`${move.name || move.id} is not a known Gen 5 move.`);
      continue;
    }
    if (seen.has(move.id)) errors.push(`${move.name} is duplicated.`);
    seen.add(move.id);
    if (!movesRandomized && !isMoveLegalForPokemon(member, move.id, learnsets)) {
      warnings.push(`${move.name} is outside this Pokemon's normal Black/White learnset.`);
    }
  }

  return { errors, warnings };
}

export function getMoveSuggestions(member, learnsets, moveMap, movesRandomized = false) {
  if (!member?.pokemonId || movesRandomized) {
    return { recent: [], previous: [], machinesTutors: [], hidden: movesRandomized };
  }
  const level = Math.max(1, Math.min(100, Number(member.level) || 1));
  const selected = new Set(selectedMoveIds(member));
  const entries = learnsets
    .filter((entry) => entry.pokemonId === member.pokemonId)
    .filter((entry) => moveMap.has(entry.moveId))
    .filter((entry) => !selected.has(entry.moveId));

  const mapEntry = (entry) => ({ ...entry, move: moveMap.get(entry.moveId) });
  const recent = entries
    .filter((entry) => (
      (entry.learnMethod === "evolution" && Number(entry.levelLearnedAt || 0) <= level) ||
      (entry.learnMethod === "level-up" && entry.levelLearnedAt === level)
    ))
    .map(mapEntry);

  const previous = entries
    .filter((entry) => entry.learnMethod === "level-up")
    .filter((entry) => Number(entry.levelLearnedAt) > 0 && Number(entry.levelLearnedAt) <= level)
    .filter((entry) => !recent.some((recentEntry) => recentEntry.moveId === entry.moveId))
    .sort((a, b) => b.levelLearnedAt - a.levelLearnedAt)
    .slice(0, 12)
    .map(mapEntry);

  const machinesTutors = entries
    .filter((entry) => entry.learnMethod === "machine" || entry.learnMethod === "tutor")
    .slice(0, 16)
    .map(mapEntry);

  return { recent, previous, machinesTutors, hidden: false };
}

export function typeAttackResults(opponent, typeChart) {
  const defendingTypes = getDefendingTypes(opponent);
  return typeChart.types
    .map((type) => ({ type, multiplier: effectiveness(type, defendingTypes, typeChart) }))
    .sort((a, b) => b.multiplier - a.multiplier || a.type.localeCompare(b.type));
}

export function teamRisk(member, opponent, typeChart) {
  const memberTypes = getDefendingTypes(member);
  const opponentTypes = getDefendingTypes(opponent);
  const memberStab = memberTypes.map((type) => ({
    type,
    multiplier: effectiveness(type, opponentTypes, typeChart),
  }));
  const incoming = opponentTypes.map((type) => ({
    type,
    multiplier: effectiveness(type, memberTypes, typeChart),
  }));
  const bestStab = Math.max(0, ...memberStab.map((entry) => entry.multiplier));
  const worstIncoming = Math.max(0, ...incoming.map((entry) => entry.multiplier));

  let label = "Safe";
  if (bestStab >= 2 && worstIncoming < 2) label = "Good attacker";
  if (worstIncoming >= 2) label = bestStab >= 2 ? "Strong attacker but risky" : "Risky";
  if (worstIncoming >= 4) label = "Very risky";

  return { label, memberStab, incoming, bestStab, worstIncoming };
}
