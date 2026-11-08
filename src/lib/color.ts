import type { BeadColor, LabColor, RgbColor } from '../types'

const clamp = (value: number, min = 0, max = 255) =>
  Math.min(max, Math.max(min, value))

export function hexToRgb(hex: string): RgbColor {
  const value = hex.replace('#', '')
  const full = value.length === 3
    ? value.split('').map((character) => character + character).join('')
    : value

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const channel = (value: number) =>
    Math.round(clamp(value)).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

export function rgbToLab({ r, g, b }: RgbColor): LabColor {
  const linearize = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  }

  const lr = linearize(r)
  const lg = linearize(g)
  const lb = linearize(b)

  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883

  const pivot = (value: number) =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116
  const fx = pivot(x)
  const fy = pivot(y)
  const fz = pivot(z)

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180
const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI

export function deltaE2000(first: LabColor, second: LabColor): number {
  const averageL = (first.l + second.l) / 2
  const c1 = Math.hypot(first.a, first.b)
  const c2 = Math.hypot(second.a, second.b)
  const averageC = (c1 + c2) / 2
  const averageC7 = averageC ** 7
  const g = 0.5 * (1 - Math.sqrt(averageC7 / (averageC7 + 25 ** 7)))

  const a1Prime = (1 + g) * first.a
  const a2Prime = (1 + g) * second.a
  const c1Prime = Math.hypot(a1Prime, first.b)
  const c2Prime = Math.hypot(a2Prime, second.b)
  const averageCPrime = (c1Prime + c2Prime) / 2

  const hue = (bValue: number, aValue: number) => {
    const angle = radiansToDegrees(Math.atan2(bValue, aValue))
    return angle >= 0 ? angle : angle + 360
  }
  const h1Prime = c1Prime === 0 ? 0 : hue(first.b, a1Prime)
  const h2Prime = c2Prime === 0 ? 0 : hue(second.b, a2Prime)

  const deltaLPrime = second.l - first.l
  const deltaCPrime = c2Prime - c1Prime
  let deltaHuePrime = 0
  if (c1Prime * c2Prime !== 0) {
    const difference = h2Prime - h1Prime
    if (Math.abs(difference) <= 180) deltaHuePrime = difference
    else if (difference > 180) deltaHuePrime = difference - 360
    else deltaHuePrime = difference + 360
  }
  const deltaHPrime =
    2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(degreesToRadians(deltaHuePrime / 2))

  let averageHPrime = h1Prime + h2Prime
  if (c1Prime * c2Prime === 0) {
    averageHPrime = h1Prime + h2Prime
  } else if (Math.abs(h1Prime - h2Prime) <= 180) {
    averageHPrime = (h1Prime + h2Prime) / 2
  } else if (h1Prime + h2Prime < 360) {
    averageHPrime = (h1Prime + h2Prime + 360) / 2
  } else {
    averageHPrime = (h1Prime + h2Prime - 360) / 2
  }

  const t =
    1 -
    0.17 * Math.cos(degreesToRadians(averageHPrime - 30)) +
    0.24 * Math.cos(degreesToRadians(2 * averageHPrime)) +
    0.32 * Math.cos(degreesToRadians(3 * averageHPrime + 6)) -
    0.2 * Math.cos(degreesToRadians(4 * averageHPrime - 63))

  const deltaTheta = 30 * Math.exp(-(((averageHPrime - 275) / 25) ** 2))
  const averageCPrime7 = averageCPrime ** 7
  const rc = 2 * Math.sqrt(averageCPrime7 / (averageCPrime7 + 25 ** 7))
  const sl = 1 + (0.015 * (averageL - 50) ** 2) / Math.sqrt(20 + (averageL - 50) ** 2)
  const sc = 1 + 0.045 * averageCPrime
  const sh = 1 + 0.015 * averageCPrime * t
  const rt = -Math.sin(degreesToRadians(2 * deltaTheta)) * rc

  const lightnessTerm = deltaLPrime / sl
  const chromaTerm = deltaCPrime / sc
  const hueTerm = deltaHPrime / sh
  return Math.sqrt(
    lightnessTerm ** 2 +
      chromaTerm ** 2 +
      hueTerm ** 2 +
      rt * chromaTerm * hueTerm,
  )
}

export function nearestColorIndex(rgb: RgbColor, palette: BeadColor[]): number {
  const lab = rgbToLab(rgb)
  let nearestIndex = 0
  let smallestDifference = Number.POSITIVE_INFINITY

  for (let index = 0; index < palette.length; index += 1) {
    const difference = deltaE2000(lab, palette[index].lab)
    if (difference < smallestDifference) {
      smallestDifference = difference
      nearestIndex = index
    }
  }

  return nearestIndex
}

export function readableTextColor(rgb: RgbColor): '#171815' | '#ffffff' {
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
  return luminance > 0.62 ? '#171815' : '#ffffff'
}

export function adjustRgb(
  rgb: RgbColor,
  brightness: number,
  contrast: number,
  saturation: number,
): RgbColor {
  const brightnessOffset = (brightness / 100) * 255
  const contrastFactor = (100 + contrast) / 100
  let r = (rgb.r - 128) * contrastFactor + 128 + brightnessOffset
  let g = (rgb.g - 128) * contrastFactor + 128 + brightnessOffset
  let b = (rgb.b - 128) * contrastFactor + 128 + brightnessOffset
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const saturationFactor = (100 + saturation) / 100
  r = luminance + (r - luminance) * saturationFactor
  g = luminance + (g - luminance) * saturationFactor
  b = luminance + (b - luminance) * saturationFactor

  return { r: clamp(r), g: clamp(g), b: clamp(b) }
}
