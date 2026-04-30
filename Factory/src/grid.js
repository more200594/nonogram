export const CELL_TYPES = {
  EMPTY: "empty",
  PATH: "path",
  ENTRANCE: "entrance",
  EXIT: "exit",
};

export function createGrid(width, height) {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () =>
      Array.from({ length: width }, () => CELL_TYPES.EMPTY),
    ),
  };
}

export function setCellType(grid, x, y, type) {
  if (!isInBounds(grid, x, y)) return false;
  grid.cells[y][x] = type;
  return true;
}

export function getCellType(grid, x, y) {
  if (!isInBounds(grid, x, y)) return null;
  return grid.cells[y][x];
}

export function isInBounds(grid, x, y) {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

export function findCellsByType(grid, type) {
  const points = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (grid.cells[y][x] === type) {
        points.push({ x, y });
      }
    }
  }
  return points;
}
