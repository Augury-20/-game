"use strict";

const SIZE_CONFIGS = [
  {
    id: "4x4",
    label: "4 x 4",
    title: "數獨 4x4",
    boxRows: 2,
    boxCols: 2,
    symbols: ["1", "2", "3", "4"],
    givens: {
      easy: 10,
      normal: 8,
      hard: 6,
    },
    unique: true,
    maxAttempts: 60,
  },
  {
    id: "9x9",
    label: "9 x 9",
    title: "數獨 9x9",
    boxRows: 3,
    boxCols: 3,
    symbols: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    givens: {
      easy: 45,
      normal: 38,
      hard: 31,
    },
    unique: true,
    maxAttempts: 12,
  },
  {
    id: "16x16",
    label: "16 x 16",
    title: "數獨 16x16",
    boxRows: 4,
    boxCols: 4,
    symbols: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G"],
    givens: {
      easy: 192,
      normal: 176,
      hard: 160,
    },
    unique: false,
    maxAttempts: 1,
  },
];

const DIFFICULTY_LABELS = {
  easy: "輕鬆",
  normal: "標準",
  hard: "挑戰",
};

const boardEl = document.querySelector("#sudokuBoard");
const keypadEl = document.querySelector("#keypad");
const sizeSelect = document.querySelector("#sizeSelect");
const difficultySelect = document.querySelector("#difficultySelect");
const newGameBtn = document.querySelector("#newGameBtn");
const noteBtn = document.querySelector("#noteBtn");
const eraseBtn = document.querySelector("#eraseBtn");
const hintBtn = document.querySelector("#hintBtn");
const checkBtn = document.querySelector("#checkBtn");
const messageEl = document.querySelector("#message");
const timerEl = document.querySelector("#timer");
const remainingEl = document.querySelector("#remaining");
const hintsEl = document.querySelector("#hints");
const gameTitle = document.querySelector("#gameTitle");

let state = null;
let timerId = null;

init();

function init() {
  fillSizeOptions();
  newGameBtn.addEventListener("click", startGame);
  sizeSelect.addEventListener("change", startGame);
  difficultySelect.addEventListener("change", startGame);
  noteBtn.addEventListener("click", toggleNotes);
  eraseBtn.addEventListener("click", eraseSelected);
  hintBtn.addEventListener("click", useHint);
  checkBtn.addEventListener("click", checkBoard);
  document.addEventListener("keydown", handleKeyboard);
  startGame();
}

function fillSizeOptions() {
  sizeSelect.innerHTML = SIZE_CONFIGS.map((config) => (
    `<option value="${config.id}">${config.label}</option>`
  )).join("");
}

function startGame() {
  const config = getSelectedConfig();
  const difficulty = difficultySelect.value;
  const generated = generatePuzzle(config, difficulty);

  state = {
    config,
    difficulty,
    puzzle: generated.puzzle,
    solution: generated.solution,
    values: generated.puzzle.slice(),
    notes: Array.from({ length: config.symbols.length ** 2 }, () => new Set()),
    selectedIndex: generated.puzzle.findIndex((value) => value === "") || 0,
    noteMode: false,
    checked: false,
    complete: false,
    hintsUsed: 0,
    startedAt: Date.now(),
    finishedAt: null,
  };

  boardEl.style.setProperty("--side", config.symbols.length);
  boardEl.dataset.side = String(config.symbols.length);
  keypadEl.style.setProperty("--key-cols", Math.ceil(Math.sqrt(config.symbols.length)));
  gameTitle.textContent = config.title;
  document.title = config.title;
  messageEl.textContent = `${DIFFICULTY_LABELS[difficulty]}題已就緒`;
  messageEl.className = "status-message";
  noteBtn.setAttribute("aria-pressed", "false");
  noteBtn.classList.remove("active");

  restartTimer();
  render();
}

function getSelectedConfig() {
  return SIZE_CONFIGS.find((config) => config.id === sizeSelect.value) || SIZE_CONFIGS[0];
}

function generatePuzzle(config, difficulty) {
  const targetGivens = config.givens[difficulty] ?? config.givens.normal;
  const maxAttempts = config.maxAttempts ?? 20;
  let best = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const solution = makeSolvedBoard(config);
    const puzzle = config.unique === false
      ? digPuzzleFast(solution, targetGivens)
      : digPuzzle(solution, config, targetGivens);
    const givenCount = puzzle.filter(Boolean).length;

    if (givenCount === targetGivens) {
      return { puzzle, solution };
    }

    if (!best || givenCount < best.puzzle.filter(Boolean).length) {
      best = { puzzle, solution };
    }
  }

  return best;
}

function makeSolvedBoard(config) {
  const side = config.symbols.length;
  const rows = shuffledGroups(config.boxCols, config.boxRows);
  const cols = shuffledGroups(config.boxRows, config.boxCols);
  const symbols = shuffle(config.symbols);
  const board = [];

  for (const row of rows) {
    for (const col of cols) {
      const symbolIndex = patternIndex(row, col, config);
      board.push(symbols[symbolIndex]);
    }
  }

  if (board.length !== side * side) {
    throw new Error(`Invalid size config: ${config.id}`);
  }

  return board;
}

function patternIndex(row, col, config) {
  const side = config.symbols.length;
  return (config.boxCols * (row % config.boxRows) + Math.floor(row / config.boxRows) + col) % side;
}

function shuffledGroups(groupCount, groupSize) {
  return shuffle(range(groupCount)).flatMap((group) => (
    shuffle(range(groupSize)).map((item) => group * groupSize + item)
  ));
}

function digPuzzle(solution, config, targetGivens) {
  const puzzle = solution.slice();
  const positions = shuffle(range(solution.length));
  let givenCount = puzzle.length;

  for (const index of positions) {
    if (givenCount <= targetGivens) {
      break;
    }

    const saved = puzzle[index];
    puzzle[index] = "";

    if (countSolutions(puzzle, config, 2) !== 1) {
      puzzle[index] = saved;
    } else {
      givenCount -= 1;
    }
  }

  return puzzle;
}

function digPuzzleFast(solution, targetGivens) {
  const puzzle = solution.slice();
  const removableCount = Math.max(0, puzzle.length - targetGivens);
  const positions = shuffle(range(solution.length)).slice(0, removableCount);

  positions.forEach((index) => {
    puzzle[index] = "";
  });

  return puzzle;
}

function countSolutions(startBoard, config, limit) {
  const side = config.symbols.length;
  const board = startBoard.slice();
  const rows = Array.from({ length: side }, () => new Set());
  const cols = Array.from({ length: side }, () => new Set());
  const boxes = Array.from({ length: side }, () => new Set());
  let solutions = 0;

  for (let index = 0; index < board.length; index += 1) {
    const value = board[index];
    if (!value) {
      continue;
    }

    const row = Math.floor(index / side);
    const col = index % side;
    const box = boxIndex(row, col, config);

    if (rows[row].has(value) || cols[col].has(value) || boxes[box].has(value)) {
      return 0;
    }

    rows[row].add(value);
    cols[col].add(value);
    boxes[box].add(value);
  }

  solve();
  return solutions;

  function solve() {
    if (solutions >= limit) {
      return;
    }

    let targetIndex = -1;
    let targetCandidates = null;

    for (let index = 0; index < board.length; index += 1) {
      if (board[index]) {
        continue;
      }

      const candidates = getCandidates(index);

      if (candidates.length === 0) {
        return;
      }

      if (!targetCandidates || candidates.length < targetCandidates.length) {
        targetIndex = index;
        targetCandidates = candidates;
      }
    }

    if (targetIndex === -1) {
      solutions += 1;
      return;
    }

    const row = Math.floor(targetIndex / side);
    const col = targetIndex % side;
    const box = boxIndex(row, col, config);

    for (const value of targetCandidates) {
      board[targetIndex] = value;
      rows[row].add(value);
      cols[col].add(value);
      boxes[box].add(value);

      solve();

      board[targetIndex] = "";
      rows[row].delete(value);
      cols[col].delete(value);
      boxes[box].delete(value);

      if (solutions >= limit) {
        return;
      }
    }
  }

  function getCandidates(index) {
    const row = Math.floor(index / side);
    const col = index % side;
    const box = boxIndex(row, col, config);

    return config.symbols.filter((symbol) => (
      !rows[row].has(symbol) && !cols[col].has(symbol) && !boxes[box].has(symbol)
    ));
  }
}

function render() {
  if (!state) {
    return;
  }

  renderBoard();
  renderKeypad();
  renderStats();
  document.body.classList.toggle("is-complete", state.complete);
}

function renderBoard() {
  const { config } = state;
  const side = config.symbols.length;
  const selected = state.selectedIndex;
  const selectedValue = state.values[selected];
  const selectedRow = Math.floor(selected / side);
  const selectedCol = selected % side;
  const selectedBox = boxIndex(selectedRow, selectedCol, config);
  const conflicts = getConflictIndexes();

  boardEl.innerHTML = "";

  state.values.forEach((value, index) => {
    const row = Math.floor(index / side);
    const col = index % side;
    const sameGroup = row === selectedRow || col === selectedCol || boxIndex(row, col, config) === selectedBox;
    const isGiven = state.puzzle[index] !== "";
    const isWrong = state.checked && value && value !== state.solution[index];
    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = getCellClasses({
      row,
      col,
      index,
      side,
      sameGroup,
      selectedValue,
      isGiven,
      isWrong,
      conflicts,
      config,
    });
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `第 ${row + 1} 列第 ${col + 1} 欄`);
    cell.addEventListener("click", () => {
      state.selectedIndex = index;
      render();
    });

    if (value) {
      cell.textContent = value;
    } else {
      cell.appendChild(createNotes(index));
    }

    boardEl.appendChild(cell);
  });
}

function getCellClasses(options) {
  const {
    row,
    col,
    index,
    side,
    sameGroup,
    selectedValue,
    isGiven,
    isWrong,
    conflicts,
    config,
  } = options;
  const classes = ["cell"];

  if (row % config.boxRows === 0) classes.push("box-top");
  if (col % config.boxCols === 0) classes.push("box-left");
  if (row === side - 1) classes.push("box-bottom");
  if (col === side - 1) classes.push("box-right");
  if (isGiven) classes.push("given");
  if (index === state.selectedIndex) classes.push("selected");
  if (index !== state.selectedIndex && sameGroup) classes.push("peer");
  if (selectedValue && state.values[index] === selectedValue) classes.push("same-value");
  if (isWrong) classes.push("wrong");
  if (conflicts.has(index)) classes.push("conflict");

  return classes.join(" ");
}

function createNotes(index) {
  const notes = document.createElement("span");
  notes.className = "notes";
  notes.style.setProperty("--note-cols", state.config.boxCols);
  notes.style.setProperty("--note-rows", state.config.boxRows);

  state.config.symbols.forEach((symbol) => {
    const note = document.createElement("span");
    note.textContent = state.notes[index].has(symbol) ? symbol : "";
    notes.appendChild(note);
  });

  return notes;
}

function renderKeypad() {
  keypadEl.innerHTML = "";

  state.config.symbols.forEach((symbol) => {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key-button";
    key.textContent = symbol;
    key.addEventListener("click", () => inputSymbol(symbol));
    keypadEl.appendChild(key);
  });
}

function renderStats() {
  const remaining = state.values.filter((value) => value === "").length;
  remainingEl.textContent = String(remaining);
  hintsEl.textContent = String(state.hintsUsed);
  timerEl.textContent = formatTime(getElapsedSeconds());
}

function inputSymbol(symbol) {
  if (state.complete || isSelectedGiven()) {
    return;
  }

  const index = state.selectedIndex;

  if (state.noteMode) {
    if (state.values[index]) {
      return;
    }

    if (state.notes[index].has(symbol)) {
      state.notes[index].delete(symbol);
    } else {
      state.notes[index].add(symbol);
    }
  } else {
    state.values[index] = symbol;
    state.notes[index].clear();
    clearPeerNotes(index, symbol);
    state.checked = false;
    messageEl.className = "status-message";
    messageEl.textContent = "";
  }

  evaluateCompletion();
  render();
}

function toggleNotes() {
  if (state.complete) {
    return;
  }

  state.noteMode = !state.noteMode;
  noteBtn.setAttribute("aria-pressed", String(state.noteMode));
  noteBtn.classList.toggle("active", state.noteMode);
}

function eraseSelected() {
  if (state.complete || isSelectedGiven()) {
    return;
  }

  state.values[state.selectedIndex] = "";
  state.notes[state.selectedIndex].clear();
  state.checked = false;
  messageEl.className = "status-message";
  messageEl.textContent = "";
  render();
}

function useHint() {
  if (state.complete) {
    return;
  }

  let index = state.selectedIndex;

  if (state.puzzle[index] || state.values[index] === state.solution[index]) {
    index = state.values.findIndex((value, candidateIndex) => (
      !state.puzzle[candidateIndex] && value !== state.solution[candidateIndex]
    ));
  }

  if (index === -1) {
    return;
  }

  state.selectedIndex = index;
  state.values[index] = state.solution[index];
  state.notes[index].clear();
  clearPeerNotes(index, state.solution[index]);
  state.hintsUsed += 1;
  state.checked = false;
  messageEl.className = "status-message";
  messageEl.textContent = "已填入提示";

  evaluateCompletion();
  render();
}

function checkBoard() {
  if (state.complete) {
    return;
  }

  state.checked = true;
  const wrongCount = state.values.filter((value, index) => (
    value && value !== state.solution[index]
  )).length;
  const emptyCount = state.values.filter((value) => !value).length;

  if (wrongCount === 0 && emptyCount === 0) {
    finishGame();
  } else if (wrongCount === 0) {
    messageEl.className = "status-message success";
    messageEl.textContent = "目前都正確";
  } else {
    messageEl.className = "status-message warning";
    messageEl.textContent = `有 ${wrongCount} 格需要調整`;
  }

  render();
}

function evaluateCompletion() {
  if (state.values.every((value, index) => value === state.solution[index])) {
    finishGame();
  }
}

function finishGame() {
  state.complete = true;
  state.finishedAt = Date.now();
  state.checked = true;
  messageEl.className = "status-message success";
  messageEl.textContent = "完成";
  stopTimer();
}

function isSelectedGiven() {
  return state.puzzle[state.selectedIndex] !== "";
}

function clearPeerNotes(index, symbol) {
  const side = state.config.symbols.length;
  const row = Math.floor(index / side);
  const col = index % side;
  const box = boxIndex(row, col, state.config);

  state.notes.forEach((notes, candidateIndex) => {
    const candidateRow = Math.floor(candidateIndex / side);
    const candidateCol = candidateIndex % side;
    const samePeer = (
      candidateRow === row ||
      candidateCol === col ||
      boxIndex(candidateRow, candidateCol, state.config) === box
    );

    if (samePeer) {
      notes.delete(symbol);
    }
  });
}

function getConflictIndexes() {
  const conflicts = new Set();
  const side = state.config.symbols.length;
  const groups = [];

  for (let row = 0; row < side; row += 1) {
    groups.push(range(side).map((col) => row * side + col));
  }

  for (let col = 0; col < side; col += 1) {
    groups.push(range(side).map((row) => row * side + col));
  }

  for (let boxRow = 0; boxRow < side; boxRow += state.config.boxRows) {
    for (let boxCol = 0; boxCol < side; boxCol += state.config.boxCols) {
      const group = [];

      for (let row = 0; row < state.config.boxRows; row += 1) {
        for (let col = 0; col < state.config.boxCols; col += 1) {
          group.push((boxRow + row) * side + boxCol + col);
        }
      }

      groups.push(group);
    }
  }

  groups.forEach((group) => {
    const seen = new Map();

    group.forEach((index) => {
      const value = state.values[index];

      if (!value) {
        return;
      }

      if (seen.has(value)) {
        conflicts.add(index);
        conflicts.add(seen.get(value));
      } else {
        seen.set(value, index);
      }
    });
  });

  return conflicts;
}

function handleKeyboard(event) {
  if (!state || event.target.tagName === "SELECT") {
    return;
  }

  const side = state.config.symbols.length;
  const key = event.key;
  const symbol = normalizeKeyboardSymbol(key, state.config);

  if (symbol) {
    event.preventDefault();
    inputSymbol(symbol);
    return;
  }

  if (key === "Backspace" || key === "Delete") {
    event.preventDefault();
    eraseSelected();
    return;
  }

  if (key.toLowerCase() === "n") {
    event.preventDefault();
    toggleNotes();
    return;
  }

  const moves = {
    ArrowUp: -side,
    ArrowDown: side,
    ArrowLeft: -1,
    ArrowRight: 1,
  };

  if (!Object.prototype.hasOwnProperty.call(moves, key)) {
    return;
  }

  event.preventDefault();
  const current = state.selectedIndex;
  let next = current + moves[key];

  if (key === "ArrowLeft" && current % side === 0) next = current + side - 1;
  if (key === "ArrowRight" && current % side === side - 1) next = current - side + 1;
  if (key === "ArrowUp" && current < side) next = current + side * (side - 1);
  if (key === "ArrowDown" && current >= side * (side - 1)) next = current % side;

  state.selectedIndex = next;
  render();
}

function normalizeKeyboardSymbol(key, config) {
  if (config.symbols.includes(key)) {
    return key;
  }

  const upperKey = key.toUpperCase();
  return config.symbols.includes(upperKey) ? upperKey : null;
}

function restartTimer() {
  stopTimer();
  timerId = window.setInterval(renderStats, 1000);
}

function stopTimer() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function getElapsedSeconds() {
  const end = state.finishedAt || Date.now();
  return Math.floor((end - state.startedAt) / 1000);
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function boxIndex(row, col, config) {
  const boxesPerRow = config.symbols.length / config.boxCols;
  return Math.floor(row / config.boxRows) * boxesPerRow + Math.floor(col / config.boxCols);
}

function range(length) {
  return Array.from({ length }, (_, index) => index);
}

function shuffle(items) {
  const copy = items.slice();

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}
