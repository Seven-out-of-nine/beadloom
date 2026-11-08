import { adjustRgb, nearestColorIndex } from './color'
import type {
  BeadColor,
  FitMode,
  GeneratorSettings,
  LoadedImage,
  PatternResult,
  RgbColor,
} from '../types'

interface RasterPixel extends RgbColor {
  alpha: number
}

function calculateDrawRect(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: FitMode,
) {
  if (fit === 'stretch') {
    return { x: 0, y: 0, width: targetWidth, height: targetHeight }
  }

  const scale = fit === 'cover'
    ? Math.max(targetWidth / imageWidth, targetHeight / imageHeight)
    : Math.min(targetWidth / imageWidth, targetHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale

  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  }
}

function rasterize(
  source: LoadedImage,
  width: number,
  height: number,
  settings: GeneratorSettings,
): RasterPixel[] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('当前浏览器无法创建图像画布。')

  context.clearRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  const rect = calculateDrawRect(
    source.width,
    source.height,
    width,
    height,
    settings.fit,
  )
  context.drawImage(source.element, rect.x, rect.y, rect.width, rect.height)
  const imageData = context.getImageData(0, 0, width, height).data
  const pixels: RasterPixel[] = []

  for (let index = 0; index < imageData.length; index += 4) {
    const adjusted = adjustRgb(
      { r: imageData[index], g: imageData[index + 1], b: imageData[index + 2] },
      settings.brightness,
      settings.contrast,
      settings.saturation,
    )
    pixels.push({ ...adjusted, alpha: imageData[index + 3] })
  }

  return pixels
}

function selectActivePalette(
  pixels: RasterPixel[],
  palette: BeadColor[],
  maxColors: number,
  alphaThreshold: number,
): BeadColor[] {
  if (maxColors >= palette.length) return palette
  const counts = new Map<number, number>()
  const matchCache = new Map<number, number>()

  for (const pixel of pixels) {
    if (pixel.alpha < alphaThreshold) continue
    const key =
      (Math.round(pixel.r / 4) << 12) |
      (Math.round(pixel.g / 4) << 6) |
      Math.round(pixel.b / 4)
    let colorIndex = matchCache.get(key)
    if (colorIndex === undefined) {
      colorIndex = nearestColorIndex(pixel, palette)
      matchCache.set(key, colorIndex)
    }
    counts.set(colorIndex, (counts.get(colorIndex) ?? 0) + 1)
  }

  const selectedIndices = [...counts.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, maxColors)
    .map(([index]) => index)

  if (selectedIndices.length === 0) return palette.slice(0, 1)
  return selectedIndices.map((index) => palette[index])
}

function mapWithoutDithering(
  pixels: RasterPixel[],
  palette: BeadColor[],
  alphaThreshold: number,
): Array<number | null> {
  const cache = new Map<number, number>()
  return pixels.map((pixel) => {
    if (pixel.alpha < alphaThreshold) return null
    const key =
      (Math.round(pixel.r / 3) << 14) |
      (Math.round(pixel.g / 3) << 7) |
      Math.round(pixel.b / 3)
    let colorIndex = cache.get(key)
    if (colorIndex === undefined) {
      colorIndex = nearestColorIndex(pixel, palette)
      cache.set(key, colorIndex)
    }
    return colorIndex
  })
}

function mapWithFloydSteinberg(
  pixels: RasterPixel[],
  width: number,
  height: number,
  palette: BeadColor[],
  alphaThreshold: number,
): Array<number | null> {
  const channels = new Float32Array(pixels.length * 3)
  pixels.forEach((pixel, index) => {
    channels[index * 3] = pixel.r
    channels[index * 3 + 1] = pixel.g
    channels[index * 3 + 2] = pixel.b
  })
  const cells: Array<number | null> = new Array(pixels.length).fill(null)

  const addError = (
    x: number,
    y: number,
    redError: number,
    greenError: number,
    blueError: number,
    weight: number,
  ) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const pixelIndex = y * width + x
    if (pixels[pixelIndex].alpha < alphaThreshold) return
    const channelIndex = pixelIndex * 3
    channels[channelIndex] += redError * weight
    channels[channelIndex + 1] += greenError * weight
    channels[channelIndex + 2] += blueError * weight
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (pixels[index].alpha < alphaThreshold) continue
      const channelIndex = index * 3
      const current = {
        r: Math.min(255, Math.max(0, channels[channelIndex])),
        g: Math.min(255, Math.max(0, channels[channelIndex + 1])),
        b: Math.min(255, Math.max(0, channels[channelIndex + 2])),
      }
      const colorIndex = nearestColorIndex(current, palette)
      const matched = palette[colorIndex]
      cells[index] = colorIndex
      const redError = current.r - matched.r
      const greenError = current.g - matched.g
      const blueError = current.b - matched.b

      addError(x + 1, y, redError, greenError, blueError, 7 / 16)
      addError(x - 1, y + 1, redError, greenError, blueError, 3 / 16)
      addError(x, y + 1, redError, greenError, blueError, 5 / 16)
      addError(x + 1, y + 1, redError, greenError, blueError, 1 / 16)
    }
  }

  return cells
}

export function generatePattern(
  source: LoadedImage,
  height: number,
  settings: GeneratorSettings,
  fullPalette: BeadColor[],
): PatternResult {
  const width = settings.width
  const pixels = rasterize(source, width, height, settings)
  const alphaThreshold = (settings.alphaThreshold / 100) * 255
  const activePalette = selectActivePalette(
    pixels,
    fullPalette,
    settings.maxColors,
    alphaThreshold,
  )
  const cells = settings.dithering
    ? mapWithFloydSteinberg(pixels, width, height, activePalette, alphaThreshold)
    : mapWithoutDithering(pixels, activePalette, alphaThreshold)
  const counts = new Map<number, number>()
  let totalBeads = 0

  for (const colorIndex of cells) {
    if (colorIndex === null) continue
    counts.set(colorIndex, (counts.get(colorIndex) ?? 0) + 1)
    totalBeads += 1
  }

  return {
    width,
    height,
    cells,
    palette: activePalette,
    counts,
    totalBeads,
    sourceName: source.name.replace(/\.[^.]+$/, ''),
  }
}
