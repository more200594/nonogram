import { CELL_TYPES, findCellsByType, getCellType, isInBounds } from "./grid.js";

export function createSimulationState() {
  return {
    running: false,
    ticksPerSecond: 4,
    entities: [],
    spawnCount: 0,
    arriveCount: 0,
    accumulatorMs: 0,
  };
}

export function resetSimulation(sim) {
  sim.running = false;
  sim.entities = [];
  sim.spawnCount = 0;
  sim.arriveCount = 0;
  sim.accumulatorMs = 0;
}

export function setTicksPerSecond(sim, value) {
  sim.ticksPerSecond = value;
}

export function updateSimulation(sim, grid, deltaMs) {
  if (!sim.running) return;

  sim.accumulatorMs += deltaMs;
  const stepMs = 1000 / sim.ticksPerSecond;
  while (sim.accumulatorMs >= stepMs) {
    tickOnce(sim, grid);
    sim.accumulatorMs -= stepMs;
  }
}

export function tickOnce(sim, grid) {
  spawnFromEntrances(sim, grid);
  moveEntities(sim, grid);
}

function spawnFromEntrances(sim, grid) {
  const entrances = findCellsByType(grid, CELL_TYPES.ENTRANCE);
  for (const entrance of entrances) {
    const occupied = sim.entities.some(
      (entity) => entity.x === entrance.x && entity.y === entrance.y,
    );
    if (occupied) continue;
    sim.entities.push({ x: entrance.x, y: entrance.y });
    sim.spawnCount += 1;
  }
}

function moveEntities(sim, grid) {
  const nextEntities = [];
  const occupiedNext = new Set();

  for (const entity of sim.entities) {
    const next = pickNextStep(grid, entity.x, entity.y);
    if (!next) {
      pushEntityIfFree(entity, occupiedNext, nextEntities);
      continue;
    }

    const nextType = getCellType(grid, next.x, next.y);
    if (nextType === CELL_TYPES.EXIT) {
      sim.arriveCount += 1;
      continue;
    }

    pushEntityIfFree(next, occupiedNext, nextEntities, entity);
  }

  sim.entities = nextEntities;
}

function pickNextStep(grid, x, y) {
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: -1 },
  ];

  for (const dir of dirs) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    if (!isInBounds(grid, nx, ny)) continue;
    const cellType = getCellType(grid, nx, ny);
    if (cellType === CELL_TYPES.PATH || cellType === CELL_TYPES.EXIT) {
      return { x: nx, y: ny };
    }
  }
  return null;
}

function pushEntityIfFree(candidate, occupiedNext, nextEntities, fallbackEntity = null) {
  const key = `${candidate.x},${candidate.y}`;
  if (!occupiedNext.has(key)) {
    occupiedNext.add(key);
    nextEntities.push({ x: candidate.x, y: candidate.y });
    return;
  }
  if (fallbackEntity) {
    const fallbackKey = `${fallbackEntity.x},${fallbackEntity.y}`;
    if (!occupiedNext.has(fallbackKey)) {
      occupiedNext.add(fallbackKey);
      nextEntities.push({ x: fallbackEntity.x, y: fallbackEntity.y });
    }
  }
}
