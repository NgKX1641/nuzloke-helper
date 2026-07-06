import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src", "data");
const baseUrl = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const GEN_5_MAX_DEX = 649;

const files = [
  "pokemon_species.csv",
  "pokemon_species_names.csv",
  "pokemon_evolution.csv",
  "evolution_triggers.csv",
  "items.csv",
  "item_game_indices.csv",
  "item_names.csv",
  "locations.csv",
  "location_names.csv",
  "moves.csv",
  "move_names.csv",
  "type_names.csv",
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

async function loadCsv(file) {
  const response = await fetch(`${baseUrl}/${file}`);
  if (!response.ok) throw new Error(`Failed to fetch ${file}: ${response.status}`);
  return parseCsv(await response.text());
}

function englishName(rows, idColumn, nameColumn = "name") {
  return new Map(
    rows
      .filter((row) => row.local_language_id === "9")
      .map((row) => [Number(row[idColumn]), cleanText(row[nameColumn])])
  );
}

function cleanText(value) {
  return String(value || "")
    .replace(/â€™/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function displayIdentifier(value) {
  return String(value || "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function identifierName(rows) {
  return new Map(rows.map((row) => [Number(row.id), displayIdentifier(row.identifier)]));
}

function generationMap(rows, idColumn, generationColumn = "generation_id") {
  return new Map(rows.map((row) => [Number(row[idColumn]), Number(row[generationColumn] || 0)]));
}

function isGen5OrEarlier(id, generationById) {
  return !id || (generationById.get(Number(id)) || 0) <= 5;
}

function isEvolutionAvailableInGen5(evolution, names) {
  return (
    isGen5OrEarlier(evolution.trigger_item_id, names.itemGenerations) &&
    isGen5OrEarlier(evolution.held_item_id, names.itemGenerations) &&
    isGen5OrEarlier(evolution.location_id, names.locationGenerations) &&
    isGen5OrEarlier(evolution.known_move_id, names.moveGenerations)
  );
}

function formatCondition(evolution, names) {
  const parts = [];
  const level = Number(evolution.minimum_level || 0);
  if (level) parts.push(`Lv. ${level}`);
  if (evolution.trigger_item_id) parts.push(`use ${names.items.get(Number(evolution.trigger_item_id)) || "item"}`);
  if (evolution.held_item_id) parts.push(`holding ${names.items.get(Number(evolution.held_item_id)) || "item"}`);
  if (evolution.known_move_id) parts.push(`knows ${names.moves.get(Number(evolution.known_move_id)) || "move"}`);
  if (evolution.known_move_type_id) parts.push(`knows ${names.types.get(Number(evolution.known_move_type_id)) || "type"} move`);
  if (evolution.location_id) parts.push(`at ${names.locations.get(Number(evolution.location_id)) || "specific location"}`);
  if (evolution.minimum_happiness) parts.push(`friendship ${evolution.minimum_happiness}+`);
  if (evolution.minimum_beauty) parts.push(`beauty ${evolution.minimum_beauty}+`);
  if (evolution.minimum_affection) parts.push(`affection ${evolution.minimum_affection}+`);
  if (evolution.time_of_day) parts.push(evolution.time_of_day);
  if (evolution.party_species_id) parts.push(`with ${names.species.get(Number(evolution.party_species_id)) || "specific Pokemon"} in party`);
  if (evolution.party_type_id) parts.push(`with ${names.types.get(Number(evolution.party_type_id)) || "type"} Pokemon in party`);
  if (evolution.trade_species_id) parts.push(`trade for ${names.species.get(Number(evolution.trade_species_id)) || "specific Pokemon"}`);
  if (evolution.needs_overworld_rain === "1") parts.push("during rain");
  if (evolution.turn_upside_down === "1") parts.push("turn system upside down");

  if (parts.length) return parts.join(", ");

  const trigger = names.triggers.get(Number(evolution.evolution_trigger_id)) || "evolution";
  return trigger.charAt(0).toUpperCase() + trigger.slice(1);
}

function mainRowsToChains(speciesRows, evolutionRows, names) {
  const speciesById = new Map(
    speciesRows
      .filter((row) => Number(row.id) <= GEN_5_MAX_DEX)
      .map((row) => [Number(row.id), row])
  );
  const groupedEvolutionDetails = new Map();
  for (const evolution of evolutionRows) {
    if (!isEvolutionAvailableInGen5(evolution, names)) continue;
    const targetId = Number(evolution.evolved_species_id);
    const target = speciesById.get(targetId);
    if (!target?.evolves_from_species_id) continue;
    const sourceId = Number(target.evolves_from_species_id);
    if (!speciesById.has(sourceId)) continue;
    const key = `${sourceId}:${targetId}`;
    const entries = groupedEvolutionDetails.get(key) || [];
    entries.push({
      sourceId,
      to: targetId,
      method: names.triggers.get(Number(evolution.evolution_trigger_id)) || "evolution",
      condition: formatCondition(evolution, names),
      locationRegion: evolution.location_id ? names.locationGenerations.get(Number(evolution.location_id)) : null,
    });
    groupedEvolutionDetails.set(key, entries);
  }

  const evolutionsBySource = new Map();
  for (const entries of groupedEvolutionDetails.values()) {
    const selected = entries.some((entry) => entry.method !== "Use Item" && !entry.condition.startsWith("use "))
      ? entries.filter((entry) => entry.method !== "Use Item" && !entry.condition.startsWith("use "))
      : entries;
    const regionSelected = selected.some((entry) => entry.locationRegion === 5)
      ? selected.filter((entry) => entry.locationRegion === 5 || !entry.locationRegion)
      : selected;
    const [first] = regionSelected;
    const conditions = mergeConditions(regionSelected.map((entry) => entry.condition));
    const sourceEntries = evolutionsBySource.get(first.sourceId) || [];
    sourceEntries.push({
      to: first.to,
      method: first.method,
      condition: conditions.join(" / "),
    });
    evolutionsBySource.set(first.sourceId, sourceEntries);
  }

  function node(speciesId) {
    const species = speciesById.get(speciesId);
    return {
      pokemonId: speciesId,
      name: names.species.get(speciesId) || species.identifier,
      evolvesTo: (evolutionsBySource.get(speciesId) || [])
        .sort((a, b) => a.to - b.to)
        .map((edge) => ({ ...edge, pokemon: node(edge.to) })),
    };
  }

  const roots = [...speciesById.values()]
    .filter((species) => !species.evolves_from_species_id || !speciesById.has(Number(species.evolves_from_species_id)))
    .map((species) => node(Number(species.id)))
    .filter((chain) => hasEvolution(chain))
    .sort((a, b) => a.pokemonId - b.pokemonId);

  const chainByPokemon = new Map();
  for (const chain of roots) {
    for (const pokemonId of collectPokemonIds(chain)) {
      chainByPokemon.set(pokemonId, chain);
    }
  }

  return [...chainByPokemon.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pokemonId, chain]) => ({ pokemonId, chain }));
}

function mergeConditions(conditions) {
  const unique = [...new Set(conditions)];
  const levelNumbers = unique
    .map((condition) => /^Lv\. (\d+)$/.exec(condition))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  if (levelNumbers.length === unique.length) return [`Lv. ${Math.min(...levelNumbers)}`];
  return unique;
}

function hasEvolution(chain) {
  return chain.evolvesTo.length > 0 || chain.evolvesTo.some((edge) => hasEvolution(edge.pokemon));
}

function collectPokemonIds(chain) {
  return [chain.pokemonId, ...chain.evolvesTo.flatMap((edge) => collectPokemonIds(edge.pokemon))];
}

async function main() {
  const data = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await loadCsv(file)])));
  const names = {
    species: englishName(data["pokemon_species_names.csv"], "pokemon_species_id"),
    items: englishName(data["item_names.csv"], "item_id"),
    locations: englishName(data["location_names.csv"], "location_id"),
    moves: englishName(data["move_names.csv"], "move_id"),
    types: englishName(data["type_names.csv"], "type_id"),
    triggers: identifierName(data["evolution_triggers.csv"]),
    itemGenerations: earliestGenerationMap(data["item_game_indices.csv"], "item_id"),
    locationGenerations: generationMap(data["locations.csv"], "id", "region_id"),
    moveGenerations: generationMap(data["moves.csv"], "id"),
  };

  const chains = mainRowsToChains(data["pokemon_species.csv"], data["pokemon_evolution.csv"], names);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "evolutionChains.gen5.json"), JSON.stringify(chains, null, 2) + "\n");
  console.log(`Wrote ${chains.length} Gen 5 evolution chart lookup entries.`);
}

main();

function earliestGenerationMap(rows, idColumn) {
  const generations = new Map();
  for (const row of rows) {
    const id = Number(row[idColumn]);
    const generation = Number(row.generation_id || 0);
    if (!generation) continue;
    generations.set(id, Math.min(generations.get(id) || generation, generation));
  }
  return generations;
}
