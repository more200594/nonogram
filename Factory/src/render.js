import { CELL_TYPES } from "./grid.js";

const COLORS = {
  [CELL_TYPES.EMPTY]: "#151d2a",
  [CELL_TYPES.PATH]: "#4b5f7f",
  [CELL_TYPES.ENTRANCE]: "#28c76f",
  [CELL_TYPES.EXIT]: "#ff6b6b",
  entity: "#ffd166",
  grid: "#2d3648",
};

export function renderAll(ctx, canvas, grid, sim) {
  const cellSize = calcCellSize(canvas, grid);
  clearCanvas(ctx, canvas);
  drawCells(ctx, grid, cellSize);
  drawGridLines(ctx, grid, cellSize);
  drawEntities(ctx, sim.entities, cellSize);
}

function calcCellSize(canvas, grid) {
  return Math.floor(Math.min(canvas.width / grid.width, canvas.height / grid.height));
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111722";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawCells(ctx, grid, cellSize) {
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const type = grid.cells[y][x];
      ctx.fillStyle = COLORS[type] ?? COLORS[CELL_TYPES.EMPTY];
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}

function drawGridLines(ctx, grid, cellSize) {
  ctx.strokeStyle = COLORS.grid;
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
}

function drawEntities(ctx, entities, cellSize) {
  ctx.fillStyle = COLORS.entity;
  for (const entity of entities) {
    const cx = entity.x * cellSize + cellSize * 0.5;
    const cy = entity.y * cellSize + cellSize * 0.5;
    const radius = Math.max(3, Math.floor(cellSize * 0.26));
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function getGridCoordinateFromPointer(canvas, grid, event) {
  const rect = canvas.getBoundingClientRect();
  const cellSize = Math.floor(Math.min(canvas.width / grid.width, canvas.height / grid.height));
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (event.clientX - rect.left) * scaleX;
  const py = (event.clientY - rect.top) * scaleY;
  const x = Math.floor(px / cellSize);
  const y = Math.floor(py / cellSize);
  return { x, y };
}
