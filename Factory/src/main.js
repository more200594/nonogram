const CELL_TYPES = {
  EMPTY: "empty",
  BELT_RIGHT: "belt_right",
  BELT_DOWN: "belt_down",
  BELT_LEFT: "belt_left",
  BELT_UP: "belt_up",
  LIFT_UP: "lift_up",
  LIFT_DOWN: "lift_down",
  WALL: "wall",
  ENTRANCE: "entrance",
  EXIT: "exit",
};

const TOOL_BEHAVIOR = {
  PASS: "pass",
  BLOCK: "block",
  PROCESS: "process",
};

const BELT_TYPES = new Set([
  CELL_TYPES.BELT_RIGHT,
  CELL_TYPES.BELT_DOWN,
  CELL_TYPES.BELT_LEFT,
  CELL_TYPES.BELT_UP,
]);

const LIFT_TYPES = new Set([CELL_TYPES.LIFT_UP, CELL_TYPES.LIFT_DOWN]);

const BELT_DIR = {
  [CELL_TYPES.BELT_RIGHT]: { dx: 1, dy: 0, arrow: "→" },
  [CELL_TYPES.BELT_DOWN]: { dx: 0, dy: 1, arrow: "↓" },
  [CELL_TYPES.BELT_LEFT]: { dx: -1, dy: 0, arrow: "←" },
  [CELL_TYPES.BELT_UP]: { dx: 0, dy: -1, arrow: "↑" },
};

const TOOL_DESCRIPTION = {
  empty: "空地：把格子清成空白可通行區。",
  belt_right: "輸送帶→：物件向右移動。",
  belt_down: "輸送帶↓：物件向下移動。",
  belt_left: "輸送帶←：物件向左移動。",
  belt_up: "輸送帶↑：物件向上移動。",
  lift_up: "上樓轉運：可把物件送到上一層同座標（需對應下樓轉運）。",
  lift_down: "下樓轉運：可把物件送到下一層同座標（需對應上樓轉運）。",
  wall: "障礙物：阻擋物件通行。",
  entrance: "入口：每個 tick 會有新產物加入排隊。",
  exit: "出口：物件到達後被回收並計數。",
  eyedropper: "吸管：點地圖可切換成該格工具。",
};

const palette = {
  empty: "#151d2a",
  belt: "#4b5f7f",
  entrance: "#28c76f",
  exit: "#ff6b6b",
  wall: "#5a3a3a",
  entity: "#ffd166",
  grid: "#2d3648",
  beltArrow: "#d6e4ff",
  liftUp: "#7a9dff",
  liftDown: "#55c6a9",
  blockedRing: "#ffad33",
  queueBadge: "#f7f7ff",
};

let customToolSeq = 1;
const customTools = new Map();

function createGrid(width, height) {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () =>
      Array.from({ length: width }, () => CELL_TYPES.EMPTY),
    ),
  };
}

function createSimulationState() {
  return {
    entities: [],
    spawnCount: 0,
    arriveCount: 0,
    blockedCount: 0,
    entranceQueue: new Map(),
  };
}

function createLayer(width, height) {
  return {
    grid: createGrid(width, height),
    sim: createSimulationState(),
  };
}

function makeCellKey(x, y) {
  return `${x},${y}`;
}

function isInBounds(grid, x, y) {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

function setCellType(grid, x, y, type) {
  if (!isInBounds(grid, x, y)) return false;
  grid.cells[y][x] = type;
  return true;
}

function getCellType(grid, x, y) {
  if (!isInBounds(grid, x, y)) return null;
  return grid.cells[y][x];
}

function findCellsByType(grid, type) {
  const points = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (grid.cells[y][x] === type) points.push({ x, y });
    }
  }
  return points;
}

function isCustomTool(type) {
  return customTools.has(type);
}

function isCustomPassTool(type) {
  return isCustomTool(type) && customTools.get(type).behavior === TOOL_BEHAVIOR.PASS;
}

function isProcessTool(type) {
  return isCustomTool(type) && customTools.get(type).behavior === TOOL_BEHAVIOR.PROCESS;
}

function createFactoryState(width, height, layerCount) {
  return {
    running: false,
    ticksPerSecond: 4,
    accumulatorMs: 0,
    layers: Array.from({ length: layerCount }, () => createLayer(width, height)),
    currentLayer: 0,
  };
}

function rebuildAllLayers(factory, width, height) {
  factory.layers = factory.layers.map(() => createLayer(width, height));
}

function applyLayerCount(factory, width, height, nextCount) {
  const current = factory.layers.length;
  if (nextCount === current) return;
  if (nextCount > current) {
    for (let i = current; i < nextCount; i += 1) {
      factory.layers.push(createLayer(width, height));
    }
  } else {
    factory.layers = factory.layers.slice(0, nextCount);
    if (factory.currentLayer >= nextCount) {
      factory.currentLayer = nextCount - 1;
    }
  }
}

function resetFactorySimulation(factory) {
  factory.running = false;
  factory.accumulatorMs = 0;
  for (const layer of factory.layers) {
    layer.sim = createSimulationState();
  }
}

function updateFactory(factory, deltaMs) {
  if (!factory.running) return;
  factory.accumulatorMs += deltaMs;
  const stepMs = 1000 / factory.ticksPerSecond;
  while (factory.accumulatorMs >= stepMs) {
    for (const layer of factory.layers) {
      tickLayer(layer.grid, layer.sim);
    }
    applyInterLayerTransfers(factory);
    factory.accumulatorMs -= stepMs;
  }
}

function applyInterLayerTransfers(factory) {
  const transferOps = [];

  for (let i = 0; i < factory.layers.length; i += 1) {
    const srcLayer = factory.layers[i];
    for (let eIdx = 0; eIdx < srcLayer.sim.entities.length; eIdx += 1) {
      const entity = srcLayer.sim.entities[eIdx];
      const srcType = getCellType(srcLayer.grid, entity.x, entity.y);

      if (srcType === CELL_TYPES.LIFT_UP && i + 1 < factory.layers.length) {
        const dstLayer = factory.layers[i + 1];
        const dstType = getCellType(dstLayer.grid, entity.x, entity.y);
        if (dstType === CELL_TYPES.LIFT_DOWN && canReceiveEntity(dstLayer.sim, entity.x, entity.y)) {
          transferOps.push({ fromLayer: i, fromEntityIdx: eIdx, toLayer: i + 1, x: entity.x, y: entity.y });
        }
      }

      if (srcType === CELL_TYPES.LIFT_DOWN && i - 1 >= 0) {
        const dstLayer = factory.layers[i - 1];
        const dstType = getCellType(dstLayer.grid, entity.x, entity.y);
        if (dstType === CELL_TYPES.LIFT_UP && canReceiveEntity(dstLayer.sim, entity.x, entity.y)) {
          transferOps.push({ fromLayer: i, fromEntityIdx: eIdx, toLayer: i - 1, x: entity.x, y: entity.y });
        }
      }
    }
  }

  transferOps.sort((a, b) => b.fromEntityIdx - a.fromEntityIdx);
  for (const op of transferOps) {
    const src = factory.layers[op.fromLayer].sim.entities;
    if (!src[op.fromEntityIdx]) continue;
    src.splice(op.fromEntityIdx, 1);
    factory.layers[op.toLayer].sim.entities.push({
      x: op.x,
      y: op.y,
      blocked: false,
      processTicks: 0,
    });
  }
}

function canReceiveEntity(sim, x, y) {
  return !sim.entities.some((e) => e.x === x && e.y === y);
}

function tickLayer(grid, sim) {
  enqueueEntrances(grid, sim);
  spawnFromQueue(grid, sim);
  moveEntities(grid, sim);
}

function enqueueEntrances(grid, sim) {
  const entrances = findCellsByType(grid, CELL_TYPES.ENTRANCE);
  for (const entrance of entrances) {
    const key = makeCellKey(entrance.x, entrance.y);
    sim.entranceQueue.set(key, (sim.entranceQueue.get(key) || 0) + 1);
  }
}

function spawnFromQueue(grid, sim) {
  const entrances = findCellsByType(grid, CELL_TYPES.ENTRANCE);
  for (const entrance of entrances) {
    const key = makeCellKey(entrance.x, entrance.y);
    const queue = sim.entranceQueue.get(key) || 0;
    if (queue <= 0) continue;
    const occupied = sim.entities.some((e) => e.x === entrance.x && e.y === entrance.y);
    if (occupied) continue;
    sim.entities.push({ x: entrance.x, y: entrance.y, blocked: false, processTicks: 0 });
    sim.spawnCount += 1;
    sim.entranceQueue.set(key, queue - 1);
  }
}

function moveEntities(grid, sim) {
  const nextEntities = [];
  const occupiedNext = new Set();
  let blockedCount = 0;
  for (const entity of sim.entities) {
    const currentType = getCellType(grid, entity.x, entity.y);
    if (isProcessTool(currentType)) {
      const wait = customTools.get(currentType)?.param || 1;
      if ((entity.processTicks || 0) < wait) {
        entity.processTicks = (entity.processTicks || 0) + 1;
        entity.blocked = true;
        keepEntityIfFree(entity, occupiedNext, nextEntities);
        blockedCount += 1;
        continue;
      }
      entity.processTicks = 0;
    }

    const next = pickNextStep(grid, entity.x, entity.y);
    if (!next) {
      entity.blocked = true;
      keepEntityIfFree(entity, occupiedNext, nextEntities);
      blockedCount += 1;
      continue;
    }
    if (getCellType(grid, next.x, next.y) === CELL_TYPES.EXIT) {
      sim.arriveCount += 1;
      continue;
    }
    const moved = keepEntityIfFree(next, occupiedNext, nextEntities, entity);
    if (!moved) blockedCount += 1;
  }
  sim.entities = nextEntities;
  sim.blockedCount = blockedCount;
}

function pickNextStep(grid, x, y) {
  const current = getCellType(grid, x, y);
  if (BELT_TYPES.has(current)) {
    const dir = BELT_DIR[current];
    return moveIfValid(grid, x + dir.dx, y + dir.dy);
  }
  if (current === CELL_TYPES.ENTRANCE || isCustomPassTool(current) || isProcessTool(current)) {
    const nearby = [
      moveIfValid(grid, x + 1, y),
      moveIfValid(grid, x, y + 1),
      moveIfValid(grid, x - 1, y),
      moveIfValid(grid, x, y - 1),
    ];
    for (const next of nearby) {
      if (next) return next;
    }
  }
  return null;
}

function moveIfValid(grid, nx, ny) {
  if (!isInBounds(grid, nx, ny)) return null;
  const t = getCellType(grid, nx, ny);
  if (
    BELT_TYPES.has(t) ||
    LIFT_TYPES.has(t) ||
    t === CELL_TYPES.EXIT ||
    isCustomPassTool(t) ||
    isProcessTool(t)
  ) {
    return { x: nx, y: ny };
  }
  return null;
}

function keepEntityIfFree(candidate, occupiedNext, nextEntities, fallback = null) {
  const key = makeCellKey(candidate.x, candidate.y);
  if (!occupiedNext.has(key)) {
    occupiedNext.add(key);
    nextEntities.push({
      x: candidate.x,
      y: candidate.y,
      blocked: false,
      processTicks: fallback?.processTicks || 0,
    });
    return true;
  }
  if (fallback) {
    const fk = makeCellKey(fallback.x, fallback.y);
    if (!occupiedNext.has(fk)) {
      occupiedNext.add(fk);
      nextEntities.push({
        x: fallback.x,
        y: fallback.y,
        blocked: true,
        processTicks: fallback.processTicks || 0,
      });
      return false;
    }
  }
  return false;
}

function getCellColor(type) {
  if (BELT_TYPES.has(type)) return palette.belt;
  if (type === CELL_TYPES.LIFT_UP) return palette.liftUp;
  if (type === CELL_TYPES.LIFT_DOWN) return palette.liftDown;
  if (type === CELL_TYPES.ENTRANCE) return palette.entrance;
  if (type === CELL_TYPES.EXIT) return palette.exit;
  if (type === CELL_TYPES.WALL) return palette.wall;
  if (isCustomTool(type)) return customTools.get(type).color;
  return palette.empty;
}

function renderLayer(ctx, canvas, grid, sim, baseGrid = null) {
  const cellSize = Math.floor(Math.min(canvas.width / grid.width, canvas.height / grid.height));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111722";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (baseGrid) {
    drawBaseLayerReference(ctx, baseGrid, cellSize);
  }

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const type = grid.cells[y][x];
      ctx.fillStyle = getCellColor(type);
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      drawCellMark(ctx, type, x, y, cellSize);
    }
  }

  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= grid.width; x += 1) {
    const px = x * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, grid.height * cellSize);
    ctx.stroke();
  }
  for (let y = 0; y <= grid.height; y += 1) {
    const py = y * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(grid.width * cellSize, py);
    ctx.stroke();
  }

  drawEntities(ctx, sim.entities, cellSize);
  drawEntranceQueue(ctx, grid, sim.entranceQueue, cellSize);
}

function drawBaseLayerReference(ctx, baseGrid, cellSize) {
  ctx.save();
  ctx.globalAlpha = 0.28;
  for (let y = 0; y < baseGrid.height; y += 1) {
    for (let x = 0; x < baseGrid.width; x += 1) {
      const type = baseGrid.cells[y][x];
      if (type === CELL_TYPES.EMPTY) continue;
      ctx.fillStyle = getCellColor(type);
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
  ctx.restore();
}

function drawCellMark(ctx, type, x, y, cellSize) {
  if (BELT_TYPES.has(type)) {
    const dir = BELT_DIR[type];
    ctx.fillStyle = palette.beltArrow;
    ctx.font = `${Math.max(12, Math.floor(cellSize * 0.52))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(dir.arrow, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
    return;
  }
  if (type === CELL_TYPES.LIFT_UP || type === CELL_TYPES.LIFT_DOWN) {
    const icon = type === CELL_TYPES.LIFT_UP ? "⇧" : "⇩";
    ctx.fillStyle = "#eff8ff";
    ctx.font = `${Math.max(12, Math.floor(cellSize * 0.5))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
    return;
  }
  if (isCustomTool(type)) {
    const symbol = customTools.get(type).symbol || "◆";
    ctx.fillStyle = "#f1f4ff";
    ctx.font = `${Math.max(12, Math.floor(cellSize * 0.46))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
  }
}

function drawEntities(ctx, entities, cellSize) {
  for (const entity of entities) {
    const cx = entity.x * cellSize + cellSize * 0.5;
    const cy = entity.y * cellSize + cellSize * 0.5;
    const radius = Math.max(3, Math.floor(cellSize * 0.26));
    ctx.fillStyle = palette.entity;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    if (entity.blocked) {
      ctx.strokeStyle = palette.blockedRing;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawEntranceQueue(ctx, grid, queueMap, cellSize) {
  const entrances = findCellsByType(grid, CELL_TYPES.ENTRANCE);
  ctx.font = `${Math.max(11, Math.floor(cellSize * 0.34))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const entrance of entrances) {
    const key = makeCellKey(entrance.x, entrance.y);
    const waiting = queueMap.get(key) || 0;
    if (waiting <= 0) continue;
    const bx = entrance.x * cellSize + cellSize * 0.76;
    const by = entrance.y * cellSize + cellSize * 0.24;
    const r = Math.max(7, Math.floor(cellSize * 0.2));
    ctx.fillStyle = palette.queueBadge;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#23293a";
    ctx.fillText(String(waiting), bx, by);
  }
}

function getGridCoordinateFromPointer(canvas, grid, event) {
  const rect = canvas.getBoundingClientRect();
  const cellSize = Math.floor(Math.min(canvas.width / grid.width, canvas.height / grid.height));
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (event.clientX - rect.left) * scaleX;
  const py = (event.clientY - rect.top) * scaleY;
  return { x: Math.floor(px / cellSize), y: Math.floor(py / cellSize) };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function getTotalQueue(queueMap) {
  let total = 0;
  queueMap.forEach((n) => {
    total += n;
  });
  return total;
}

const canvas = document.getElementById("gridCanvas");
const ctx = canvas.getContext("2d");
const gridWidthInput = document.getElementById("gridWidth");
const gridHeightInput = document.getElementById("gridHeight");
const resizeGridBtn = document.getElementById("resizeGridBtn");
const layerCountInput = document.getElementById("layerCount");
const applyLayerCountBtn = document.getElementById("applyLayerCountBtn");
const layerTabs = document.getElementById("layerTabs");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const speedRange = document.getElementById("speedRange");
const speedValue = document.getElementById("speedValue");
const modeText = document.getElementById("modeText");
const currentLayerText = document.getElementById("currentLayerText");
const totalLayerText = document.getElementById("totalLayerText");
const entranceCount = document.getElementById("entranceCount");
const exitCount = document.getElementById("exitCount");
const wallCount = document.getElementById("wallCount");
const queueCount = document.getElementById("queueCount");
const blockedCount = document.getElementById("blockedCount");
const spawnCount = document.getElementById("spawnCount");
const arriveCount = document.getElementById("arriveCount");
const entityCount = document.getElementById("entityCount");
const toolDescription = document.getElementById("toolDescription");
const toolButtons = Array.from(document.querySelectorAll(".tool-btn"));
const colorBelt = document.getElementById("colorBelt");
const colorEntrance = document.getElementById("colorEntrance");
const colorExit = document.getElementById("colorExit");
const colorWall = document.getElementById("colorWall");
const colorEntity = document.getElementById("colorEntity");
const showBaseLayerRef = document.getElementById("showBaseLayerRef");
const customToolName = document.getElementById("customToolName");
const customToolSymbol = document.getElementById("customToolSymbol");
const customToolColor = document.getElementById("customToolColor");
const customToolBehavior = document.getElementById("customToolBehavior");
const customToolParam = document.getElementById("customToolParam");
const customToolDesc = document.getElementById("customToolDesc");
const addCustomToolBtn = document.getElementById("addCustomToolBtn");
const customToolList = document.getElementById("customToolList");
const toolRow = document.querySelector(".tool-row");

const factory = createFactoryState(20, 12, 3);
let activeTool = CELL_TYPES.EMPTY;
let isDragging = false;
let lastDragCell = null;
let lastFrame = performance.now();

function getCurrentLayer() {
  return factory.layers[factory.currentLayer];
}

function setActiveTool(toolName) {
  activeTool = toolName;
  lastDragCell = null;
  const allToolButtons = Array.from(document.querySelectorAll(".tool-btn"));
  for (const button of allToolButtons) {
    button.classList.toggle("active", button.dataset.tool === activeTool);
  }
  toolDescription.textContent = TOOL_DESCRIPTION[toolName] ?? "自訂工具：可先放置，後續補行為。";
}

function renderLayerTabs() {
  layerTabs.innerHTML = "";
  for (let i = 0; i < factory.layers.length; i += 1) {
    const btn = document.createElement("button");
    btn.className = "layer-tab-btn";
    if (i === factory.currentLayer) btn.classList.add("active");
    btn.textContent = `第 ${i + 1} 層`;
    btn.addEventListener("click", () => {
      factory.currentLayer = i;
      syncStatus();
      renderLayerTabs();
    });
    layerTabs.appendChild(btn);
  }
}

toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tool = btn.dataset.tool;
    if (!tool) return;
    if (tool === "erase") setActiveTool(CELL_TYPES.EMPTY);
    else setActiveTool(tool);
  });
});

addCustomToolBtn.addEventListener("click", () => {
  const name = (customToolName.value || "").trim();
  if (!name) return;
  const symbol = (customToolSymbol.value || "").trim().slice(0, 2) || "◆";
  const color = customToolColor.value || "#8f7bff";
  const behavior = customToolBehavior.value || TOOL_BEHAVIOR.PASS;
  const param = clampNumber(Number(customToolParam.value), 0, 999);
  const descInput = (customToolDesc.value || "").trim();
  const desc =
    descInput ||
    (behavior === TOOL_BEHAVIOR.BLOCK
      ? `${name}：阻擋物件通行。`
      : behavior === TOOL_BEHAVIOR.PROCESS
        ? `${name}：加工站，停留 ${param} tick 後放行。`
        : `${name}：可通過機台（裝飾/標記）。`);

  const id = `custom_${customToolSeq++}`;
  customTools.set(id, { id, name, symbol, color, behavior, param, desc });
  TOOL_DESCRIPTION[id] = desc;

  const btn = document.createElement("button");
  btn.className = "tool-btn";
  btn.dataset.tool = id;
  btn.textContent = `${name} ${symbol}`;
  btn.addEventListener("click", () => setActiveTool(id));
  toolRow.insertBefore(btn, toolRow.querySelector('[data-tool="eyedropper"]'));

  renderCustomToolChips();
  setActiveTool(id);
  customToolName.value = "";
  customToolDesc.value = "";
});

function renderCustomToolChips() {
  customToolList.innerHTML = "";
  customTools.forEach((tool) => {
    const chip = document.createElement("span");
    chip.className = "custom-tool-chip";
    chip.style.borderColor = tool.color;
    chip.textContent = `${tool.name} ${tool.symbol} / ${tool.behavior}(${tool.param})`;
    customToolList.appendChild(chip);
  });
}

colorBelt.addEventListener("input", () => (palette.belt = colorBelt.value));
colorEntrance.addEventListener("input", () => (palette.entrance = colorEntrance.value));
colorExit.addEventListener("input", () => (palette.exit = colorExit.value));
colorWall.addEventListener("input", () => (palette.wall = colorWall.value));
colorEntity.addEventListener("input", () => (palette.entity = colorEntity.value));

resizeGridBtn.addEventListener("click", () => {
  const width = clampNumber(Number(gridWidthInput.value), 5, 80);
  const height = clampNumber(Number(gridHeightInput.value), 5, 80);
  gridWidthInput.value = String(width);
  gridHeightInput.value = String(height);
  rebuildAllLayers(factory, width, height);
  resetFactorySimulation(factory);
  syncStatus();
});

applyLayerCountBtn.addEventListener("click", () => {
  const count = clampNumber(Number(layerCountInput.value), 1, 12);
  layerCountInput.value = String(count);
  const width = clampNumber(Number(gridWidthInput.value), 5, 80);
  const height = clampNumber(Number(gridHeightInput.value), 5, 80);
  applyLayerCount(factory, width, height, count);
  renderLayerTabs();
  syncStatus();
});

startBtn.addEventListener("click", () => {
  const hasEntrance = factory.layers.some((l) => findCellsByType(l.grid, CELL_TYPES.ENTRANCE).length);
  const hasExit = factory.layers.some((l) => findCellsByType(l.grid, CELL_TYPES.EXIT).length);
  if (!hasEntrance || !hasExit) return;
  factory.running = true;
  modeText.textContent = "模擬";
});

pauseBtn.addEventListener("click", () => {
  factory.running = false;
  modeText.textContent = "編輯";
});

resetBtn.addEventListener("click", () => {
  resetFactorySimulation(factory);
  modeText.textContent = "編輯";
  syncStatus();
});

speedRange.addEventListener("input", () => {
  factory.ticksPerSecond = clampNumber(Number(speedRange.value), 1, 10);
  speedValue.textContent = String(factory.ticksPerSecond);
});

canvas.addEventListener("mousedown", (event) => {
  if (factory.running) return;
  isDragging = true;
  lastDragCell = null;
  paintAt(event);
});
canvas.addEventListener("mousemove", (event) => {
  if (!isDragging || factory.running) return;
  paintAt(event);
});
window.addEventListener("mouseup", () => {
  isDragging = false;
  lastDragCell = null;
});

function paintAt(event) {
  const layer = getCurrentLayer();
  const { grid } = layer;
  const { x, y } = getGridCoordinateFromPointer(canvas, grid, event);
  if (!isInBounds(grid, x, y)) return;

  if (BELT_TYPES.has(activeTool) && isDragging) {
    paintSmartBelt(grid, x, y);
    syncStatus();
    return;
  }

  if (activeTool === "eyedropper") {
    setActiveTool(getCellType(grid, x, y) || CELL_TYPES.EMPTY);
    return;
  }
  if (
    activeTool === CELL_TYPES.ENTRANCE ||
    activeTool === CELL_TYPES.EXIT ||
    activeTool === CELL_TYPES.LIFT_UP ||
    activeTool === CELL_TYPES.LIFT_DOWN ||
    activeTool === CELL_TYPES.WALL ||
    BELT_TYPES.has(activeTool) ||
    isCustomTool(activeTool)
  ) {
    setCellType(grid, x, y, activeTool);
  } else {
    setCellType(grid, x, y, CELL_TYPES.EMPTY);
  }
  syncStatus();
}

function paintSmartBelt(grid, x, y) {
  if (!lastDragCell) {
    setCellType(grid, x, y, activeTool);
    lastDragCell = { x, y };
    return;
  }

  const dx = x - lastDragCell.x;
  const dy = y - lastDragCell.y;
  if (dx === 0 && dy === 0) return;

  const dirTool = getBeltToolFromDelta(dx, dy);
  setCellType(grid, lastDragCell.x, lastDragCell.y, dirTool);
  setCellType(grid, x, y, dirTool);
  lastDragCell = { x, y };
}

function getBeltToolFromDelta(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? CELL_TYPES.BELT_RIGHT : CELL_TYPES.BELT_LEFT;
  }
  return dy >= 0 ? CELL_TYPES.BELT_DOWN : CELL_TYPES.BELT_UP;
}

function syncStatus() {
  const layer = getCurrentLayer();
  const { grid, sim } = layer;
  currentLayerText.textContent = String(factory.currentLayer + 1);
  totalLayerText.textContent = String(factory.layers.length);
  entranceCount.textContent = String(findCellsByType(grid, CELL_TYPES.ENTRANCE).length);
  exitCount.textContent = String(findCellsByType(grid, CELL_TYPES.EXIT).length);
  wallCount.textContent = String(findCellsByType(grid, CELL_TYPES.WALL).length);
  queueCount.textContent = String(getTotalQueue(sim.entranceQueue));
  blockedCount.textContent = String(sim.blockedCount);
  spawnCount.textContent = String(sim.spawnCount);
  arriveCount.textContent = String(sim.arriveCount);
  entityCount.textContent = String(sim.entities.length);
  speedValue.textContent = String(factory.ticksPerSecond);
}

function animate(now) {
  const delta = now - lastFrame;
  lastFrame = now;
  updateFactory(factory, delta);
  const layer = getCurrentLayer();
  const baseGrid =
    showBaseLayerRef.checked && factory.currentLayer > 0 ? factory.layers[0].grid : null;
  renderLayer(ctx, canvas, layer.grid, layer.sim, baseGrid);
  syncStatus();
  requestAnimationFrame(animate);
}

setActiveTool(CELL_TYPES.EMPTY);
renderLayerTabs();
syncStatus();
requestAnimationFrame(animate);
