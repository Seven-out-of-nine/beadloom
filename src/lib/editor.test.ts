import { describe, expect, it } from 'vitest'
import { createProject, floodFill, parseProject, recountPattern, setCell } from './editor'
import type { BeadColor, GeneratorSettings, PatternResult } from '../types'

const color = (code: string): BeadColor => ({
  code,
  name: code,
  hex: '#000000',
  r: 0,
  g: 0,
  b: 0,
  lab: { l: 0, a: 0, b: 0 },
})

const pattern: PatternResult = {
  width: 3,
  height: 3,
  cells: [0, 0, 1, 0, null, 1, 1, 1, 1],
  palette: [color('A'), color('B')],
  counts: new Map([[0, 3], [1, 5]]),
  totalBeads: 8,
  sourceName: '测试项目',
}

const settings = {
  width: 3,
  maxColors: 2,
  paletteId: 'test',
  dithering: false,
  fit: 'cover',
  brightness: 0,
  contrast: 0,
  saturation: 0,
  alphaThreshold: 0,
  beadSize: 5,
  showCodes: false,
  showBoardLines: true,
} satisfies GeneratorSettings

describe('pattern editor utilities', () => {
  it('changes one cell without mutating the source', () => {
    const next = setCell(pattern.cells, 4, 0)
    expect(next).not.toBe(pattern.cells)
    expect(next[4]).toBe(0)
    expect(pattern.cells[4]).toBeNull()
  })

  it('fills only the connected area', () => {
    expect(floodFill(pattern.cells, 3, 3, 0, 1)).toEqual([
      1, 1, 1, 1, null, 1, 1, 1, 1,
    ])
  })

  it('recounts and restores a serialized project', () => {
    const edited = recountPattern(pattern, setCell(pattern.cells, 4, 0))
    const saved = createProject(edited, settings, 3, {
      enabled: true,
      availableCodes: ['A', 'B'],
    })
    const restored = parseProject(JSON.parse(JSON.stringify(saved)))
    expect(restored.pattern.totalBeads).toBe(9)
    expect(restored.pattern.counts.get(0)).toBe(4)
    expect(restored.project.name).toBe('测试项目')
  })

  it('rejects malformed project settings', () => {
    const saved = createProject(pattern, settings, 3, {
      enabled: false,
      availableCodes: ['A'],
    })
    expect(() => parseProject({
      ...saved,
      settings: { ...saved.settings, beadSize: 99 },
    })).toThrow('生成参数无效')
  })
})
