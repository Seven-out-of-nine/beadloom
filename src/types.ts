export interface RgbColor {
  r: number
  g: number
  b: number
}

export interface LabColor {
  l: number
  a: number
  b: number
}

export interface BeadColor extends RgbColor {
  code: string
  name: string
  hex: string
  lab: LabColor
}

export interface Palette {
  id: string
  name: string
  description: string
  colors: BeadColor[]
}

export type FitMode = 'cover' | 'contain' | 'stretch'

export interface GeneratorSettings {
  width: number
  maxColors: number
  paletteId: string
  dithering: boolean
  fit: FitMode
  brightness: number
  contrast: number
  saturation: number
  alphaThreshold: number
  beadSize: 2.6 | 5
  showCodes: boolean
  showBoardLines: boolean
}

export interface PatternResult {
  width: number
  height: number
  cells: Array<number | null>
  palette: BeadColor[]
  counts: Map<number, number>
  totalBeads: number
  sourceName: string
}

export interface LoadedImage {
  element: HTMLImageElement
  name: string
  url: string
  width: number
  height: number
}

export type EditorTool = 'pencil' | 'eraser' | 'fill' | 'eyedropper'

export interface InventorySettings {
  enabled: boolean
  availableCodes: string[]
}

export interface SavedProject {
  kind: 'beadloom-project'
  version: 1
  name: string
  updatedAt: string
  settings: GeneratorSettings
  outputHeight: number
  inventory: InventorySettings
  pattern: {
    width: number
    height: number
    cells: Array<number | null>
    palette: BeadColor[]
    sourceName: string
  }
}
