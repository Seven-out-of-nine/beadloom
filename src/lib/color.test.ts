import { describe, expect, it } from 'vitest'
import { deltaE2000, hexToRgb, nearestColorIndex, rgbToLab } from './color'
import type { BeadColor } from '../types'

describe('color science utilities', () => {
  it('matches the published CIEDE2000 reference pairs', () => {
    expect(deltaE2000(
      { l: 50, a: 2.6772, b: -79.7751 },
      { l: 50, a: 0, b: -82.7485 },
    )).toBeCloseTo(2.0425, 4)
    expect(deltaE2000(
      { l: 50, a: 3.1571, b: -77.2803 },
      { l: 50, a: 0, b: -82.7485 },
    )).toBeCloseTo(2.8615, 4)
  })

  it('converts sRGB white and black to expected Lab lightness', () => {
    expect(rgbToLab(hexToRgb('#ffffff')).l).toBeCloseTo(100, 3)
    expect(rgbToLab(hexToRgb('#000000')).l).toBeCloseTo(0, 3)
  })

  it('selects the perceptually nearest available bead color', () => {
    const makeColor = (code: string, hex: string): BeadColor => {
      const rgb = hexToRgb(hex)
      return { code, name: code, hex, ...rgb, lab: rgbToLab(rgb) }
    }
    const palette = [makeColor('R', '#e33434'), makeColor('B', '#285ec9')]
    expect(nearestColorIndex({ r: 220, g: 50, b: 54 }, palette)).toBe(0)
    expect(nearestColorIndex({ r: 40, g: 91, b: 196 }, palette)).toBe(1)
  })
})
