import type {
  GeneratorSettings,
  InventorySettings,
  PatternResult,
  SavedProject,
} from '../types'

export const PROJECT_STORAGE_KEY = 'beadloom:autosave:v1'

export function recountPattern(
  result: PatternResult,
  cells: Array<number | null> = result.cells,
): PatternResult {
  const counts = new Map<number, number>()
  let totalBeads = 0

  for (const colorIndex of cells) {
    if (colorIndex === null) continue
    counts.set(colorIndex, (counts.get(colorIndex) ?? 0) + 1)
    totalBeads += 1
  }

  return { ...result, cells, counts, totalBeads }
}

export function setCell(
  cells: Array<number | null>,
  index: number,
  colorIndex: number | null,
): Array<number | null> {
  if (index < 0 || index >= cells.length || cells[index] === colorIndex) return cells
  const next = [...cells]
  next[index] = colorIndex
  return next
}

export function floodFill(
  cells: Array<number | null>,
  width: number,
  height: number,
  startIndex: number,
  replacement: number | null,
): Array<number | null> {
  if (width <= 0 || height <= 0 || cells.length !== width * height) return cells
  if (startIndex < 0 || startIndex >= cells.length) return cells
  const target = cells[startIndex]
  if (target === replacement) return cells

  const next = [...cells]
  const queue = [startIndex]
  next[startIndex] = replacement

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor]
    const x = index % width
    const neighbors = [index - width, index + width]
    if (x > 0) neighbors.push(index - 1)
    if (x < width - 1) neighbors.push(index + 1)

    for (const neighbor of neighbors) {
      if (neighbor < 0 || neighbor >= next.length || next[neighbor] !== target) continue
      next[neighbor] = replacement
      queue.push(neighbor)
    }
  }

  return next
}

export function createProject(
  pattern: PatternResult,
  settings: GeneratorSettings,
  outputHeight: number,
  inventory: InventorySettings,
): SavedProject {
  return {
    kind: 'beadloom-project',
    version: 1,
    name: pattern.sourceName,
    updatedAt: new Date().toISOString(),
    settings,
    outputHeight,
    inventory,
    pattern: {
      width: pattern.width,
      height: pattern.height,
      cells: pattern.cells,
      palette: pattern.palette,
      sourceName: pattern.sourceName,
    },
  }
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)
}

export function parseProject(value: unknown): {
  project: SavedProject
  pattern: PatternResult
} {
  if (!value || typeof value !== 'object') throw new Error('项目文件内容无效。')
  const candidate = value as Partial<SavedProject>
  if (candidate.kind !== 'beadloom-project' || candidate.version !== 1) {
    throw new Error('这不是受支持的豆格项目文件。')
  }
  if (!candidate.pattern || !candidate.settings || !candidate.inventory) {
    throw new Error('项目文件缺少必要数据。')
  }

  const { width, height, cells, palette, sourceName } = candidate.pattern
  if (!isFiniteInteger(width) || !isFiniteInteger(height) || width < 1 || height < 1 || width > 500 || height > 500) {
    throw new Error('项目中的图纸尺寸无效。')
  }
  if (!Array.isArray(cells) || cells.length !== width * height || !Array.isArray(palette) || palette.length === 0) {
    throw new Error('项目中的格子或色板数据无效。')
  }
  const invalidCell = cells.some((cell) => cell !== null && (
    !isFiniteInteger(cell) || cell < 0 || cell >= palette.length
  ))
  if (invalidCell) throw new Error('项目中包含无法识别的色号。')
  const invalidColor = palette.some((color) => (
    !color || typeof color.code !== 'string' || typeof color.name !== 'string' ||
    typeof color.hex !== 'string' || !color.lab
  ))
  if (invalidColor) throw new Error('项目中的色板数据不完整。')
  if (typeof sourceName !== 'string' || !sourceName.trim()) {
    throw new Error('项目名称无效。')
  }

  const settings = candidate.settings as Partial<GeneratorSettings>
  const numericSettings = [
    settings.width,
    settings.maxColors,
    settings.brightness,
    settings.contrast,
    settings.saturation,
    settings.alphaThreshold,
  ]
  if (
    numericSettings.some((item) => typeof item !== 'number' || !Number.isFinite(item)) ||
    typeof settings.paletteId !== 'string' ||
    !['cover', 'contain', 'stretch'].includes(settings.fit ?? '') ||
    typeof settings.dithering !== 'boolean' ||
    ![2.6, 5].includes(settings.beadSize ?? 0) ||
    typeof settings.showCodes !== 'boolean' ||
    typeof settings.showBoardLines !== 'boolean' ||
    !isFiniteInteger(candidate.outputHeight) || candidate.outputHeight < 1 || candidate.outputHeight > 500
  ) {
    throw new Error('项目中的生成参数无效。')
  }
  if (
    typeof candidate.inventory.enabled !== 'boolean' ||
    !Array.isArray(candidate.inventory.availableCodes) ||
    candidate.inventory.availableCodes.some((code) => typeof code !== 'string')
  ) {
    throw new Error('项目中的库存设置无效。')
  }

  const project = candidate as SavedProject
  const pattern = recountPattern({
    width,
    height,
    cells,
    palette,
    counts: new Map<number, number>(),
    totalBeads: 0,
    sourceName,
  })
  return { project, pattern }
}

export function serializeProject(project: SavedProject): string {
  return JSON.stringify(project, null, 2)
}
