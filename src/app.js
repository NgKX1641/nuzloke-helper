import {
  addOrReplaceMove,
  ballModifier,
  catchChanceGen5,
  effectiveness,
  effectivenessLabel,
  getMoveSuggestions,
  normalizeId,
  rankLookupItems,
  rankSelectedMoves,
  teamRisk,
  typeAttackResults,
  validateMember,
} from "./core.js";

const STORAGE_KEY = "bw-nuzlocke-helper-state-v2";
const LEGACY_KEY = "bw-nuzlocke-helper-state-v1";
const EMPTY_TYPE = "";

const state = {
  team: [],
  opponent: { pokemonName: "", types: [], level: 5 },
  activeMemberId: "",
  collapsedTeamCards: {},
  catchSettings: {
    hpPercent: 25,
    statusBonus: 1,
    turn: 1,
    duskBoost: false,
    diveBoost: false,
    repeatBoost: false,
  },
  settings: {
    game: "Pokemon Black",
    typesRandomized: false,
    movesRandomized: false,
    abilitiesRandomized: false,
    darkMode: true,
  },
};

let pokemon = [];
let typeChart = null;
let moves = [];
let learnsets = [];
let captureRates = [];
let pokemonByName = new Map();
let pokemonByDex = new Map();
let moveByName = new Map();
let moveMap = new Map();
let captureRateByPokemonId = new Map();

const els = {};

async function loadData() {
  const [pokemonData, chartData, movesData, learnsetData, captureRateData] = await Promise.all([
    fetch("./src/data/pokemon.gen5.json").then((response) => response.json()),
    fetch("./src/data/typeChart.gen5.json").then((response) => response.json()),
    fetch("./src/data/moves.gen5.json").then((response) => response.json()),
    fetch("./src/data/learnsets.black-white.json").then((response) => response.json()),
    fetch("./src/data/captureRates.gen5.json").then((response) => response.json()),
  ]);
  pokemon = pokemonData;
  typeChart = chartData;
  moves = movesData;
  learnsets = learnsetData;
  captureRates = captureRateData;
  pokemonByName = new Map(pokemon.map((entry) => [normalizeId(entry.name), entry]));
  pokemonByDex = new Map(pokemon.map((entry) => [entry.dex, entry]));
  moveByName = new Map(moves.map((move) => [normalizeId(move.name), move]));
  moveMap = new Map(moves.map((move) => [move.id, move]));
  captureRateByPokemonId = new Map(captureRates.map((entry) => [entry.pokemonId, entry.captureRate]));
}

function cacheEls() {
  Object.assign(els, {
    teamList: document.querySelector("#team-list"),
    teamCount: document.querySelector("#team-count"),
    addTeamMember: document.querySelector("#add-team-member"),
    openSettings: document.querySelector("#open-settings"),
    settingsDialog: document.querySelector("#settings-dialog"),
    pokemonOptions: document.querySelector("#pokemon-options"),
    opponentName: document.querySelector("#opponent-name"),
    opponentType1: document.querySelector("#opponent-type1"),
    opponentType2: document.querySelector("#opponent-type2"),
    opponentLevel: document.querySelector("#opponent-level"),
    catchHp: document.querySelector("#catch-hp"),
    catchStatus: document.querySelector("#catch-status"),
    catchTurn: document.querySelector("#catch-turn"),
    catchDusk: document.querySelector("#catch-dusk"),
    catchDive: document.querySelector("#catch-dive"),
    catchRepeat: document.querySelector("#catch-repeat"),
    catchResults: document.querySelector("#catch-results"),
    moveTypeResults: document.querySelector("#move-type-results"),
    teamRecommendations: document.querySelector("#team-recommendations"),
    warningsList: document.querySelector("#warnings-list"),
    settingGame: document.querySelector("#setting-game"),
    settingTypesRandomized: document.querySelector("#setting-types-randomized"),
    settingMovesRandomized: document.querySelector("#setting-moves-randomized"),
    settingAbilitiesRandomized: document.querySelector("#setting-abilities-randomized"),
    settingDarkMode: document.querySelector("#setting-dark-mode"),
    activeMember: document.querySelector("#active-member"),
    activeMovePanel: document.querySelector("#active-move-panel"),
    replaceDialog: document.querySelector("#replace-move-dialog"),
    replaceDialogTitle: document.querySelector("#replace-dialog-title"),
    replaceDialogCopy: document.querySelector("#replace-dialog-copy"),
    replaceDialogOptions: document.querySelector("#replace-dialog-options"),
    randomizedTypeNote: document.querySelector("#randomized-type-note"),
    appStatus: document.querySelector("#app-status"),
    template: document.querySelector("#team-card-template"),
  });
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    state.settings = { ...state.settings, ...(saved.settings || {}) };
    state.opponent = saved.opponent || state.opponent;
    state.activeMemberId = saved.activeMemberId || "";
    state.collapsedTeamCards = saved.collapsedTeamCards || {};
    state.catchSettings = { ...state.catchSettings, ...(saved.catchSettings || {}) };
    state.team = (saved.team || []).map(normalizeMember).slice(0, 6);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function normalizeMember(member = {}) {
  const pokemonEntry = pokemonByDex.get(member.pokemonId) || pokemonByName.get(normalizeId(member.pokemonName));
  const pokemonName = member.pokemonName || pokemonEntry?.name || "";
  const types = Array.isArray(member.types)
    ? member.types.filter(Boolean)
    : [member.type1 || pokemonEntry?.type1, member.type2 || pokemonEntry?.type2].filter(Boolean);
  return {
    id: member.id || crypto.randomUUID(),
    pokemonId: member.pokemonId || pokemonEntry?.dex || null,
    pokemonName,
    nickname: member.nickname || "",
    level: Math.max(1, Math.min(100, Number(member.level) || 5)),
    types,
    moves: (member.moves || []).filter((move) => moveMap.has(move.id)).slice(0, 4),
    notes: member.notes || "",
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function optionList(select, includeEmpty = false) {
  select.innerHTML = "";
  if (includeEmpty) {
    const option = document.createElement("option");
    option.value = EMPTY_TYPE;
    option.textContent = "None";
    select.append(option);
  }
  for (const type of typeChart.types) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    select.append(option);
  }
}

function setupAutocomplete() {
  updateLookupOptions(els.pokemonOptions, pokemon, "", (entry) => entry.name);
}

function bindEvents() {
  selectTextOnFocus(els.opponentName);
  bindRankedLookup(els.opponentName, els.pokemonOptions, pokemon, (entry) => entry.name);
  els.openSettings.addEventListener("click", () => {
    els.settingsDialog.showModal();
  });
  els.addTeamMember.addEventListener("click", () => {
    if (state.team.length >= 6) return;
    state.team.push(normalizeMember({ id: crypto.randomUUID(), level: 5, types: ["Normal"], moves: [] }));
    saveState();
    render();
  });
  els.opponentName.addEventListener("change", () => {
    const entry = pokemonByName.get(normalizeId(els.opponentName.value));
    state.opponent.pokemonName = els.opponentName.value;
    if (entry) {
      state.opponent.pokemonId = entry.dex;
      state.opponent.pokemonName = entry.name;
      state.opponent.types = [entry.type1, entry.type2].filter(Boolean);
      state.opponent.captureRate = captureRateByPokemonId.get(entry.dex) ?? null;
    }
    saveState();
    render();
  });
  els.opponentType1.addEventListener("change", () => {
    state.opponent.types = [els.opponentType1.value, els.opponentType2.value].filter(Boolean);
    saveState();
    renderResults();
  });
  els.opponentType2.addEventListener("change", () => {
    state.opponent.types = [els.opponentType1.value, els.opponentType2.value].filter(Boolean);
    saveState();
    renderResults();
  });
  els.opponentLevel.addEventListener("change", () => {
    state.opponent.level = Math.max(1, Math.min(100, Number(els.opponentLevel.value) || 1));
    els.opponentLevel.value = state.opponent.level;
    saveState();
    renderResults();
  });
  for (const element of [els.catchHp, els.catchStatus, els.catchTurn, els.catchDusk, els.catchDive, els.catchRepeat]) {
    element.addEventListener("change", () => {
      saveCatchSettings();
      renderCatchCalculator();
    });
  }
  els.activeMember.addEventListener("change", () => {
    state.activeMemberId = els.activeMember.value;
    saveState();
    renderResults();
  });

  const settingBindings = [
    [els.settingGame, "game", "change", (el) => el.value],
    [els.settingTypesRandomized, "typesRandomized", "change", (el) => el.checked],
    [els.settingMovesRandomized, "movesRandomized", "change", (el) => el.checked],
    [els.settingAbilitiesRandomized, "abilitiesRandomized", "change", (el) => el.checked],
    [els.settingDarkMode, "darkMode", "change", (el) => el.checked],
  ];
  for (const [element, key, event, read] of settingBindings) {
    element.addEventListener(event, () => {
      state.settings[key] = read(element);
      saveState();
      render();
    });
  }
}

function render() {
  renderSettings();
  renderOpponent();
  renderTeam();
  renderResults();
}

function renderSettings() {
  els.settingGame.value = state.settings.game;
  els.settingTypesRandomized.checked = state.settings.typesRandomized;
  els.settingMovesRandomized.checked = state.settings.movesRandomized;
  els.settingAbilitiesRandomized.checked = state.settings.abilitiesRandomized;
  els.settingDarkMode.checked = state.settings.darkMode;
  document.body.classList.toggle("types-randomized", state.settings.typesRandomized);
  document.body.classList.toggle("dark-mode", state.settings.darkMode);
  document.body.classList.toggle("light-mode", !state.settings.darkMode);
  document.documentElement.classList.toggle("dark-mode", state.settings.darkMode);
  document.documentElement.classList.toggle("light-mode", !state.settings.darkMode);
  els.randomizedTypeNote.textContent = state.settings.typesRandomized
    ? "Types randomized is on. Type override fields are highlighted."
    : "Manual type overrides are available for randomized runs.";
}

function renderOpponent() {
  els.opponentName.value = state.opponent.pokemonName || "";
  optionList(els.opponentType1);
  optionList(els.opponentType2, true);
  els.opponentType1.value = state.opponent.types?.[0] || "Normal";
  els.opponentType2.value = state.opponent.types?.[1] || "";
  els.opponentLevel.value = state.opponent.level || 5;
  if (state.opponent.pokemonId && state.opponent.captureRate == null) {
    state.opponent.captureRate = captureRateByPokemonId.get(state.opponent.pokemonId) ?? null;
  }
  renderCatchSettings();
}

function renderCatchSettings() {
  els.catchHp.value = String(state.catchSettings.hpPercent ?? 25);
  els.catchStatus.value = String(state.catchSettings.statusBonus ?? 1);
  els.catchTurn.value = state.catchSettings.turn ?? 1;
  els.catchDusk.checked = Boolean(state.catchSettings.duskBoost);
  els.catchDive.checked = Boolean(state.catchSettings.diveBoost);
  els.catchRepeat.checked = Boolean(state.catchSettings.repeatBoost);
}

function saveCatchSettings() {
  state.catchSettings = {
    hpPercent: Number(els.catchHp.value) || 25,
    statusBonus: Number(els.catchStatus.value) || 1,
    turn: Math.max(1, Math.min(99, Number(els.catchTurn.value) || 1)),
    duskBoost: els.catchDusk.checked,
    diveBoost: els.catchDive.checked,
    repeatBoost: els.catchRepeat.checked,
  };
  els.catchHp.value = String(state.catchSettings.hpPercent);
  els.catchTurn.value = state.catchSettings.turn;
  saveState();
}

function renderTeam() {
  els.teamCount.textContent = String(state.team.length);
  els.addTeamMember.disabled = state.team.length >= 6;
  if (state.team.length && !state.team.some((member) => member.id === state.activeMemberId)) {
    state.activeMemberId = state.team[0].id;
    saveState();
  }
  if (!state.team.length && state.activeMemberId) {
    state.activeMemberId = "";
    saveState();
  }
  const currentIds = new Set(state.team.map((member) => member.id));
  for (const memberId of Object.keys(state.collapsedTeamCards)) {
    if (!currentIds.has(memberId)) delete state.collapsedTeamCards[memberId];
  }
  els.teamList.innerHTML = "";
  if (!state.team.length) {
    els.teamList.innerHTML = '<p class="empty-state">Add your first team member.</p>';
    return;
  }
  state.team.forEach((member, index) => {
    const card = els.template.content.firstElementChild.cloneNode(true);
    fillTeamCard(card, member, index);
    els.teamList.append(card);
  });
}

function fillTeamCard(card, member, index) {
  const details = card.querySelector(".team-details");
  const title = card.querySelector(".team-card-title");
  const meta = card.querySelector(".team-card-meta");
  const name = card.querySelector(".team-name");
  const nickname = card.querySelector(".team-nickname");
  const level = card.querySelector(".team-level");
  const type1 = card.querySelector(".team-type1");
  const type2 = card.querySelector(".team-type2");
  const notes = card.querySelector(".team-notes");
  const moveSlots = card.querySelector(".move-slots");
  const suggestions = card.querySelector(".suggestion-content");
  const displayName = member.nickname || member.pokemonName || "Pokemon";

  details.open = !state.collapsedTeamCards[member.id];
  details.addEventListener("toggle", () => {
    state.collapsedTeamCards[member.id] = !details.open;
    saveState();
  });
  selectTextOnFocus(name);
  bindRankedLookup(name, els.pokemonOptions, pokemon, (entry) => entry.name);
  title.textContent = `${index + 1}. ${displayName}`;
  meta.innerHTML = `Lv. ${member.level || 5} ${typeBadges(member.types)} <span class="move-count">${(member.moves || []).length}/4 moves</span>`;
  name.value = member.pokemonName || "";
  nickname.value = member.nickname || "";
  level.value = member.level || 5;
  notes.value = member.notes || "";
  optionList(type1);
  optionList(type2, true);
  type1.value = member.types[0] || "Normal";
  type2.value = member.types[1] || "";

  card.querySelector(".remove-button").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.team.splice(index, 1);
    saveState();
    render();
  });
  name.addEventListener("change", () => {
    const entry = pokemonByName.get(normalizeId(name.value));
    member.pokemonName = name.value;
    if (entry) {
      member.pokemonId = entry.dex;
      member.pokemonName = entry.name;
      member.types = [entry.type1, entry.type2].filter(Boolean);
    }
    state.team[index] = normalizeMember(member);
    saveState();
    render();
  });
  nickname.addEventListener("input", () => {
    member.nickname = nickname.value;
    saveState();
    renderResults();
  });
  level.addEventListener("change", () => {
    member.level = Math.max(1, Math.min(100, Number(level.value) || 1));
    level.value = member.level;
    saveState();
    render();
  });
  type1.addEventListener("change", () => {
    member.types = [type1.value, type2.value].filter(Boolean);
    saveState();
    renderResults();
  });
  type2.addEventListener("change", () => {
    member.types = [type1.value, type2.value].filter(Boolean);
    saveState();
    renderResults();
  });
  notes.addEventListener("input", () => {
    member.notes = notes.value;
    saveState();
  });

  renderMoveSlots(moveSlots, member, index);
  renderSuggestions(suggestions, member, index);
}

function renderMoveSlots(container, member, memberIndex) {
  container.innerHTML = "";
  for (let slot = 0; slot < 4; slot += 1) {
    const move = member.moves[slot] || null;
    const row = document.createElement("div");
    row.className = "move-slot";
    row.innerHTML = `
      <span class="slot-number">${slot + 1}</span>
      <label class="move-search-field">
        Move
        <input class="move-input" value="${escapeAttr(move?.name || "")}" placeholder="empty" autocomplete="off" role="combobox" aria-expanded="false">
        <div class="move-dropdown" role="listbox"></div>
      </label>
      <div class="move-details">${move ? moveDetail(move) : "Empty slot"}</div>
      <button class="remove-move" type="button">Remove</button>
    `;
    const input = row.querySelector(".move-input");
    const dropdown = row.querySelector(".move-dropdown");
    selectTextOnFocus(input);
    bindMoveDropdown(input, dropdown, memberIndex, slot);
    const commit = () => {
      if (input.dataset.dropdownSelecting === "true") return;
      setMoveFromInput(memberIndex, slot, input.value);
    };
    input.addEventListener("change", commit);
    row.querySelector(".remove-move").addEventListener("click", () => {
      state.team[memberIndex].moves.splice(slot, 1);
      saveState();
      render();
    });
    container.append(row);
  }
}

function renderSuggestions(container, member, memberIndex) {
  const suggestions = getMoveSuggestions(member, learnsets, moveMap, state.settings.movesRandomized);
  const validation = validateMember(member, moveMap, learnsets, state.settings.movesRandomized);
  container.innerHTML = "";

  if (state.settings.movesRandomized) {
    container.innerHTML = '<p class="muted">Moves randomized is on. You can select any Gen 5 move in the four move slots.</p>';
  } else {
    container.append(suggestionGroup("Suggested at current level", suggestions.recent, memberIndex, true));
    container.append(suggestionGroup("Previously available level-up moves", suggestions.previous, memberIndex, false));
  }

  for (const message of validation.errors) {
    const item = document.createElement("p");
    item.className = "validation error";
    item.textContent = message;
    container.append(item);
  }
  for (const message of validation.warnings) {
    const item = document.createElement("p");
    item.className = "validation warning";
    item.textContent = message;
    container.append(item);
  }
}

function suggestionGroup(title, entries, memberIndex, openByDefault = false) {
  const group = document.createElement("div");
  group.className = "suggestion-group";
  const details = document.createElement("details");
  details.open = openByDefault;
  const summary = document.createElement("summary");
  summary.innerHTML = `<span>${escapeHtml(title)}</span><small>${entries.length} move${entries.length === 1 ? "" : "s"}</small>`;
  details.append(summary);
  const body = document.createElement("div");
  body.className = "suggestion-body";
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No suggestions.";
    body.append(empty);
    details.append(body);
    group.append(details);
    return group;
  }
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "suggestion-row";
    row.innerHTML = `
      <span>${escapeHtml(entry.move.name)} <small>${learnLabel(entry)}</small></span>
      <button type="button">Add</button>
    `;
    row.querySelector("button").addEventListener("click", () => addSuggestedMove(memberIndex, entry.move));
    body.append(row);
  }
  details.append(body);
  group.append(details);
  return group;
}

function selectTextOnFocus(input) {
  input.addEventListener("focus", () => {
    requestAnimationFrame(() => input.select());
  });
}

function bindRankedLookup(input, datalist, items, getName) {
  const update = () => updateLookupOptions(datalist, items, input.value, getName);
  input.addEventListener("focus", update);
  input.addEventListener("input", update);
}

function updateLookupOptions(datalist, items, query, getName) {
  datalist.innerHTML = "";
  for (const item of rankLookupItems(items, query, getName).slice(0, 60)) {
    const option = document.createElement("option");
    option.value = getName(item);
    datalist.append(option);
  }
}

function bindMoveDropdown(input, dropdown, memberIndex, slot) {
  const show = () => {
    renderMoveDropdown(input, dropdown, memberIndex, slot);
    input.setAttribute("aria-expanded", "true");
  };
  input.addEventListener("focus", show);
  input.addEventListener("input", show);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      dropdown.hidden = true;
      input.setAttribute("aria-expanded", "false");
      delete input.dataset.dropdownSelecting;
    }
    if (event.key === "Enter" && !dropdown.hidden) {
      const first = dropdown.querySelector(".move-dropdown-option");
      if (first) {
        event.preventDefault();
        selectMoveForSlot(memberIndex, slot, first.dataset.moveId);
      }
    }
  });
  document.addEventListener("click", (event) => {
    if (!dropdown.contains(event.target) && event.target !== input) {
      dropdown.hidden = true;
      input.setAttribute("aria-expanded", "false");
      delete input.dataset.dropdownSelecting;
    }
  });
}

function renderMoveDropdown(input, dropdown, memberIndex, slot) {
  const query = input.value;
  const ranked = rankLookupItems(moves, query, (move) => move.name).slice(0, 12);
  dropdown.innerHTML = "";
  dropdown.hidden = ranked.length === 0;
  for (const move of ranked) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `move-dropdown-option type-${normalizeId(move.type)}`;
    option.dataset.moveId = move.id;
    option.setAttribute("role", "option");
    option.innerHTML = `
      <strong>${escapeHtml(move.name)}</strong>
      <span>${move.type} / ${capitalize(move.category)} / ${move.power ?? "-"} BP / ${move.accuracy ?? "-"}% acc / Priority ${move.priority}</span>
    `;
    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
      input.dataset.dropdownSelecting = "true";
    });
    option.addEventListener("click", () => {
      selectMoveForSlot(memberIndex, slot, move.id);
      delete input.dataset.dropdownSelecting;
    });
    dropdown.append(option);
  }
}

function selectMoveForSlot(memberIndex, slot, moveId) {
  const move = moveMap.get(moveId);
  if (!move) return;
  const member = state.team[memberIndex];
  if (member.moves.some((existing, index) => existing?.id === move.id && index !== slot)) {
    alert(`${move.name} is already selected.`);
    render();
    return;
  }
  const nextMoves = [...member.moves];
  nextMoves[slot] = move;
  member.moves = nextMoves.filter(Boolean).slice(0, 4);
  saveState();
  render();
}

function addSuggestedMove(memberIndex, move) {
  const member = state.team[memberIndex];
  const result = addOrReplaceMove(member, move);
  if (result.ok) {
    state.team[memberIndex] = result.member;
    saveState();
    render();
    return;
  }
  if (result.reason === "duplicate") {
    alert(`${move.name} is already in this moveset.`);
    return;
  }
  openReplaceMoveDialog(memberIndex, move);
}

function openReplaceMoveDialog(memberIndex, move) {
  const member = state.team[memberIndex];
  els.replaceDialogTitle.textContent = `Add ${move.name}`;
  els.replaceDialogCopy.textContent = `${member.nickname || member.pokemonName || "This Pokemon"} already has four moves. Choose one to replace, or cancel.`;
  els.replaceDialogOptions.innerHTML = "";
  member.moves.slice(0, 4).forEach((existingMove, slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "replace-option";
    button.innerHTML = `
      <span class="slot-number">${slot + 1}</span>
      <span>
        <strong>${escapeHtml(existingMove.name)}</strong>
        <small>${escapeHtml(moveDetail(existingMove))}</small>
      </span>
      <span class="replace-arrow">Replace with ${escapeHtml(move.name)}</span>
    `;
    button.addEventListener("click", () => {
      const replacement = addOrReplaceMove(member, move, slot);
      if (!replacement.ok) {
        alert("Could not replace that move.");
        return;
      }
      state.team[memberIndex] = replacement.member;
      saveState();
      els.replaceDialog.close();
      render();
    });
    els.replaceDialogOptions.append(button);
  });
  els.replaceDialog.showModal();
}

function setMoveFromInput(memberIndex, slot, value) {
  if (!value.trim()) {
    state.team[memberIndex].moves.splice(slot, 1);
    saveState();
    render();
    return;
  }
  const move = moveByName.get(normalizeId(value));
  if (!move) {
    alert("Unknown move. Select a Gen 5 move from the dropdown.");
    render();
    return;
  }
  selectMoveForSlot(memberIndex, slot, move.id);
}

function renderResults() {
  renderActiveMemberControls();
  const opponentTypes = state.opponent.types?.length ? state.opponent.types : [];
  if (!opponentTypes.length) {
    els.moveTypeResults.innerHTML = '<p class="empty-state">Select an opponent first.</p>';
    els.activeMovePanel.innerHTML = '<p class="empty-state">Select an opponent to rank the active Pokemon moves.</p>';
    els.catchResults.innerHTML = '<p class="empty-state">Select an opponent to calculate catch odds.</p>';
    els.teamRecommendations.innerHTML = '<p class="empty-state">Team recommendations will appear here.</p>';
    els.warningsList.innerHTML = '<li>Select an opponent to see danger warnings.</li>';
    return;
  }

  renderCatchCalculator();
  renderTypeResults();
  renderActiveMovePanel();
  renderTeamRecommendations();
  renderWarnings();
}

function renderActiveMemberControls() {
  els.activeMember.innerHTML = "";
  if (!state.team.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No team members";
    els.activeMember.append(option);
    els.activeMember.disabled = true;
    return;
  }
  els.activeMember.disabled = false;
  for (const member of state.team) {
    const option = document.createElement("option");
    option.value = member.id;
    option.textContent = member.nickname || member.pokemonName || "Pokemon";
    els.activeMember.append(option);
  }
  els.activeMember.value = state.activeMemberId || state.team[0].id;
}

function renderCatchCalculator() {
  const captureRate = state.opponent.captureRate ?? captureRateByPokemonId.get(state.opponent.pokemonId);
  if (!captureRate) {
    els.catchResults.innerHTML = '<p class="empty-state">No capture-rate data for this opponent.</p>';
    return;
  }
  const level = Math.max(1, Math.min(100, Number(state.opponent.level) || 5));
  const context = {
    level,
    turn: state.catchSettings.turn,
    types: state.opponent.types || [],
    duskBoost: state.catchSettings.duskBoost,
    diveBoost: state.catchSettings.diveBoost,
    repeatBoost: state.catchSettings.repeatBoost,
  };
  const balls = [
    ["quick", "Quick Ball"],
    ["ultra", "Ultra Ball"],
    ["great", "Great Ball"],
    ["poke", "Poke Ball"],
    ["nest", "Nest Ball"],
    ["dusk", "Dusk Ball"],
    ["timer", "Timer Ball"],
    ["net", "Net Ball"],
    ["dive", "Dive Ball"],
    ["repeat", "Repeat Ball"],
    ["heal", "Heal Ball"],
    ["luxury", "Luxury Ball"],
    ["premier", "Premier Ball"],
  ];
  const hpPercent = Number(state.catchSettings.hpPercent) || 25;
  const results = balls.map(([id, name]) => {
    const bonus = ballModifier(id, { ...context, hpPercent });
    const result = catchChanceGen5({
      captureRate,
      hpPercent,
      ballBonus: bonus,
      statusBonus: state.catchSettings.statusBonus,
    });
    return { id, name, bonus, ...result };
  });

  els.catchResults.innerHTML = `
    <div class="catch-summary">
      <span>Base catch rate: <strong>${captureRate}</strong></span>
      <span>Level: <strong>${level}</strong></span>
      <span>HP: <strong>${hpPercent}%</strong></span>
    </div>
    <div class="catch-table">
      <div class="catch-row single-catch-row">
        <strong>Best balls</strong>
        <div class="catch-ball-list">
          ${results.map((result) => `
            <span class="catch-ball">
              <b>${escapeHtml(result.name)}</b>
              <small>${formatPercent(result.chance)}${result.bonus !== 1 ? ` / ${formatMultiplier(result.bonus)}` : ""}</small>
            </span>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderActiveMovePanel() {
  const member = getActiveMember();
  if (!member) {
    els.activeMovePanel.innerHTML = '<p class="empty-state">Add a team member to see active move recommendations.</p>';
    return;
  }
  const ranked = rankSelectedMoves(member, state.opponent, typeChart);
  const best = ranked.damaging[0];
  if (!best) {
    els.activeMovePanel.innerHTML = `
      <div class="active-move-empty">
        <strong>${escapeHtml(member.nickname || member.pokemonName || "Pokemon")}</strong>
        <p class="muted">No damaging current moves selected.</p>
      </div>
    `;
    return;
  }
  els.activeMovePanel.innerHTML = `
    <div class="best-move-card type-${normalizeId(best.move.type)}">
      <span class="eyebrow">Best move now</span>
      <strong>${escapeHtml(best.move.name)}</strong>
      <span>${best.move.type} / ${capitalize(best.move.category)} / ${best.move.power ?? "-"} BP / ${best.move.accuracy ?? "-"}% acc</span>
      <span>${effectivenessLabel(best.typeEffectiveness)}${best.stab ? " / STAB" : ""}${best.move.priority > 0 ? " / priority" : ""}</span>
      <span>Score: ${best.score.toFixed(1)}</span>
    </div>
    ${ranked.status.length ? moveStatusHtml(ranked) : ""}
  `;
}

function getActiveMember() {
  return state.team.find((member) => member.id === state.activeMemberId) || state.team[0] || null;
}

function renderTypeResults() {
  els.moveTypeResults.innerHTML = "";
  const results = typeAttackResults(state.opponent, typeChart);
  const groups = [
    ["Effective", results.filter((result) => result.multiplier >= 2)],
    ["Neutral", results.filter((result) => result.multiplier === 1)],
    ["Resisted / Immune", results.filter((result) => result.multiplier < 1)],
  ];

  for (const [label, groupResults] of groups) {
    const row = document.createElement("section");
    row.className = "type-result-row";
    row.innerHTML = `<h3>${label}</h3><div class="type-result-badges"></div>`;
    const badges = row.querySelector(".type-result-badges");
    for (const result of groupResults) {
      const badge = document.createElement("div");
      badge.className = `result-badge type-${normalizeId(result.type)} mult-${String(result.multiplier).replace(".", "_")}`;
      badge.innerHTML = `<strong>${result.type}</strong><span>${effectivenessLabel(result.multiplier)}</span>`;
      badges.append(badge);
    }
    els.moveTypeResults.append(row);
  }
}

function renderTeamRecommendations() {
  els.teamRecommendations.innerHTML = "";
  if (!state.team.length) {
    els.teamRecommendations.innerHTML = '<p class="empty-state">Add team members to compare matchups.</p>';
    return;
  }

  for (const member of state.team) {
    const risk = teamRisk(member, state.opponent, typeChart);
    const card = document.createElement("article");
    card.className = "recommendation-card";
    card.innerHTML = `
      <div class="recommendation-head">
        <div>
          <strong>${escapeHtml(member.nickname || member.pokemonName || "Pokemon")}</strong>
          <span>${typeBadges(member.types)}</span>
        </div>
        <span class="status-pill ${riskClass(risk.label)}">${risk.label}</span>
      </div>
      <p class="compact-summary">${stabSummary(risk.memberStab)} <span>Takes ${incomingSummary(risk.incoming)} from opponent STAB.</span></p>
    `;
    els.teamRecommendations.append(card);
  }
}

function moveStatusHtml(ranked) {
  const status = ranked.status.map((result) => `
    <li>
      <strong>${escapeHtml(result.move.name)}</strong>
      <span>${result.move.type} / Status / utility move</span>
    </li>
  `).join("");
  return `
    <div class="move-ranking">
      ${status ? `<h3>Status / Utility moves</h3><ul>${status}</ul>` : ""}
    </div>
  `;
}

function renderWarnings() {
  const warnings = [];
  for (const member of state.team) {
    const name = member.nickname || member.pokemonName || "Pokemon";
    const risk = teamRisk(member, state.opponent, typeChart);
    for (const incoming of risk.incoming) {
      if (incoming.multiplier >= 2) {
        warnings.push(`Opponent has ${incoming.type} STAB that is ${incoming.multiplier}x effective against ${name}.`);
      }
    }
    const fourXWeaknesses = typeChart.types
      .map((type) => ({ type, multiplier: effectiveness(type, member.types, typeChart) }))
      .filter((entry) => entry.multiplier >= 4);
    for (const weakness of fourXWeaknesses) warnings.push(`${name} has a 4x weakness to ${weakness.type}.`);
    const coverageRisks = typeChart.types
      .map((type) => ({ type, multiplier: effectiveness(type, member.types, typeChart) }))
      .filter((entry) => entry.multiplier >= 2 && !risk.incoming.some((incoming) => incoming.type === entry.type))
      .sort((a, b) => b.multiplier - a.multiplier || a.type.localeCompare(b.type))
      .slice(0, 4);
    for (const coverage of coverageRisks) {
      warnings.push(`If opponent has ${coverage.type} coverage, ${name} takes ${effectivenessLabel(coverage.multiplier)}.`);
    }
    if (risk.memberStab.length && risk.memberStab.every((entry) => entry.multiplier < 1)) {
      warnings.push(`Opponent resists both of ${name}'s STAB types.`);
    }
    const validation = validateMember(member, moveMap, learnsets, state.settings.movesRandomized);
    warnings.push(...validation.warnings.map((warning) => `${name}: ${warning}`));
  }
  els.warningsList.innerHTML = warnings.length
    ? warnings.map((warning) => `<li>${renderWarningHtml(warning)}</li>`).join("")
    : "<li>No major type warnings.</li>";
}

function renderWarningHtml(warning) {
  const types = [...typeChart.types].sort((a, b) => b.length - a.length);
  const regex = new RegExp(`\\b(${types.map(escapeRegex).join("|")})\\b`, "g");
  let output = "";
  let lastIndex = 0;
  for (const match of warning.matchAll(regex)) {
    output += escapeHtml(warning.slice(lastIndex, match.index));
    const type = match[1];
    output += `<span class="type-badge type-${normalizeId(type)}">${escapeHtml(type)}</span>`;
    lastIndex = match.index + type.length;
  }
  output += escapeHtml(warning.slice(lastIndex));
  return output;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function typeBadges(types) {
  return types
    .filter(Boolean)
    .map((type) => `<span class="type-badge type-${normalizeId(type)}">${escapeHtml(type)}</span>`)
    .join(" ");
}

function moveDetail(move) {
  return `${move.type} / ${capitalize(move.category)} / ${move.power ?? "-"} BP / ${move.accuracy ?? "-"}% acc / Priority ${move.priority}`;
}

function learnLabel(entry) {
  if (entry.learnMethod === "evolution") return `- evolution move at level ${entry.levelLearnedAt}`;
  if (entry.learnMethod === "level-up") return `- level ${entry.levelLearnedAt}`;
  if (entry.learnMethod === "machine") return "- TM/HM";
  if (entry.learnMethod === "tutor") return "- tutor";
  if (entry.learnMethod === "egg") return "- egg";
  return "";
}

function stabSummary(entries) {
  if (!entries.length) return "No STAB types set.";
  return entries.map((entry) => `${entry.type} STAB is ${effectivenessLabel(entry.multiplier)}`).join(". ");
}

function incomingSummary(entries) {
  if (!entries.length) return "unknown damage";
  const worst = [...entries].sort((a, b) => b.multiplier - a.multiplier)[0];
  return `${effectivenessLabel(worst.multiplier)} (${worst.type})`;
}

function riskClass(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function formatMultiplier(value) {
  return `${Number(value).toFixed(value % 1 === 0 ? 0 : 1)}x`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

async function init() {
  cacheEls();
  await loadData();
  loadState();
  setupAutocomplete();
  optionList(els.opponentType1);
  optionList(els.opponentType2, true);
  bindEvents();
  els.appStatus.textContent = "Ready. Team, settings, and moves save in this browser.";
  els.appStatus.classList.add("ready");
  render();
}

init().catch((error) => {
  document.body.innerHTML = `
    <main class="panel load-error">
      <h1>Failed to load app data</h1>
      <p>Run the local server, then open <code>http://localhost:5177</code>. Do not open <code>index.html</code> directly.</p>
      <pre>${escapeHtml(error.stack || error.message)}</pre>
    </main>
  `;
});
