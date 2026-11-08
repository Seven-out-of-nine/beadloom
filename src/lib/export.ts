import { readableTextColor } from './color'
import type { PatternResult, SavedProject } from '../types'

interface SheetOptions {
  showCodes: boolean
  showBoardLines: boolean
  beadSize: number
}

const safeFileName = (name: string) =>
  name.replace(/[\\/:*?"<>|]/g, '-').trim() || '拼豆图纸'

function usedColorIndices(result: PatternResult): number[] {
  return [...result.counts.keys()].sort((first, second) =>
    result.palette[first].code.localeCompare(result.palette[second].code),
  )
}

export function drawPatternSheet(
  result: PatternResult,
  options: SheetOptions,
): HTMLCanvasElement {
  const cellSize = result.width <= 40 ? 30 : result.width <= 80 ? 22 : 16
  const margin = 64
  const headerHeight = 118
  const gridWidth = result.width * cellSize
  const gridHeight = result.height * cellSize
  const usedIndices = usedColorIndices(result)
  const legendColumns = Math.min(3, Math.max(1, Math.ceil(usedIndices.length / 10)))
  const legendColumnWidth = 300
  const legendRows = Math.ceil(usedIndices.length / legendColumns)
  const legendHeight = 78 + legendRows * 40
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(gridWidth + margin * 2, legendColumns * legendColumnWidth + margin * 2)
  canvas.height = headerHeight + gridHeight + legendHeight + margin
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法创建导出画布。')

  context.fillStyle = '#fbfaf6'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#171815'
  context.font = '700 30px system-ui, sans-serif'
  context.fillText(`${result.sourceName} · 拼豆图纸`, margin, 48)
  context.font = '16px system-ui, sans-serif'
  context.fillStyle = '#696a64'
  const physicalWidth = ((result.width * options.beadSize) / 10).toFixed(1)
  const physicalHeight = ((result.height * options.beadSize) / 10).toFixed(1)
  context.fillText(
    `${result.width} × ${result.height} 颗 · ${result.totalBeads.toLocaleString()} 颗豆 · 约 ${physicalWidth} × ${physicalHeight} cm`,
    margin,
    80,
  )
  context.fillText('豆格 Beadloom · 每 29 格粗线为一块常见方形底板边界', margin, 104)

  const originX = Math.round((canvas.width - gridWidth) / 2)
  const originY = headerHeight
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      const colorIndex = result.cells[y * result.width + x]
      if (colorIndex === null) continue
      const color = result.palette[colorIndex]
      const left = originX + x * cellSize
      const top = originY + y * cellSize
      context.fillStyle = color.hex
      context.fillRect(left, top, cellSize, cellSize)
      if (options.showCodes) {
        context.fillStyle = readableTextColor(color)
        context.font = `700 ${Math.max(6, Math.floor(cellSize * 0.36))}px ui-monospace, monospace`
        context.fillText(color.code, left + cellSize / 2, top + cellSize / 2 + 0.5)
      }
    }
  }

  context.strokeStyle = '#a8aaa2'
  context.lineWidth = 0.7
  for (let x = 0; x <= result.width; x += 1) {
    const position = originX + x * cellSize
    context.beginPath()
    context.moveTo(position, originY)
    context.lineTo(position, originY + gridHeight)
    context.stroke()
  }
  for (let y = 0; y <= result.height; y += 1) {
    const position = originY + y * cellSize
    context.beginPath()
    context.moveTo(originX, position)
    context.lineTo(originX + gridWidth, position)
    context.stroke()
  }

  if (options.showBoardLines) {
    context.strokeStyle = '#292a26'
    context.lineWidth = 2.6
    for (let x = 0; x <= result.width; x += 29) {
      const position = originX + x * cellSize
      context.beginPath()
      context.moveTo(position, originY)
      context.lineTo(position, originY + gridHeight)
      context.stroke()
    }
    for (let y = 0; y <= result.height; y += 29) {
      const position = originY + y * cellSize
      context.beginPath()
      context.moveTo(originX, position)
      context.lineTo(originX + gridWidth, position)
      context.stroke()
    }
  }
  context.strokeStyle = '#292a26'
  context.lineWidth = 2
  context.strokeRect(originX, originY, gridWidth, gridHeight)

  const legendTop = originY + gridHeight + 44
  context.textAlign = 'left'
  context.fillStyle = '#171815'
  context.font = '700 22px system-ui, sans-serif'
  context.fillText('用色与数量', margin, legendTop)
  usedIndices.forEach((colorIndex, itemIndex) => {
    const color = result.palette[colorIndex]
    const column = Math.floor(itemIndex / legendRows)
    const row = itemIndex % legendRows
    const left = margin + column * legendColumnWidth
    const top = legendTop + 34 + row * 40
    context.fillStyle = color.hex
    context.fillRect(left, top, 28, 28)
    context.strokeStyle = '#d1d1ca'
    context.lineWidth = 1
    context.strokeRect(left, top, 28, 28)
    context.fillStyle = '#171815'
    context.font = '700 14px ui-monospace, monospace'
    context.fillText(color.code, left + 40, top + 14)
    context.font = '14px system-ui, sans-serif'
    context.fillStyle = '#5f605a'
    context.fillText(`${color.name} · ${result.counts.get(colorIndex) ?? 0} 颗`, left + 88, top + 14)
  })

  return canvas
}

async function downloadBlob(blob: Blob, fileName: string): Promise<boolean> {
  if (window.beadloomDesktop) {
    const result = await window.beadloomDesktop.saveFile({
      fileName,
      mimeType: blob.type || 'application/octet-stream',
      data: await blob.arrayBuffer(),
    })
    return result.saved
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

export function downloadProjectJson(project: SavedProject): Promise<boolean> {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  return downloadBlob(blob, `${safeFileName(project.name)}.beadloom.json`)
}

export async function downloadPatternPng(
  result: PatternResult,
  options: SheetOptions,
) {
  const canvas = drawPatternSheet(result, options)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value)
      else reject(new Error('PNG 导出失败。'))
    }, 'image/png')
  })
  return downloadBlob(blob, `${safeFileName(result.sourceName)}-拼豆图纸.png`)
}

export function downloadMaterialsCsv(result: PatternResult): Promise<boolean> {
  const rows = ['色号,颜色名称,HEX,数量']
  for (const colorIndex of usedColorIndices(result)) {
    const color = result.palette[colorIndex]
    rows.push(`${color.code},${color.name},${color.hex},${result.counts.get(colorIndex) ?? 0}`)
  }
  rows.push(`,,,`)
  rows.push(`总计,,,${result.totalBeads}`)
  const blob = new Blob([`\uFEFF${rows.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8',
  })
  return downloadBlob(blob, `${safeFileName(result.sourceName)}-材料清单.csv`)
}

export async function printPattern(result: PatternResult, options: SheetOptions): Promise<boolean> {
  const dataUrl = drawPatternSheet(result, options).toDataURL('image/png')
  if (window.beadloomDesktop) return window.beadloomDesktop.printImage(dataUrl)

  const printWindow = window.open('', '_blank')
  if (!printWindow) return false
  printWindow.document.write(`<!doctype html><html><head><title>拼豆图纸</title><style>
    html,body{margin:0;background:#fff}img{display:block;width:100%;height:auto}
    @page{size:auto;margin:8mm}@media print{img{width:100%;page-break-inside:avoid}}
  </style></head><body><img src="${dataUrl}" alt="拼豆图纸"></body></html>`)
  printWindow.document.close()
  printWindow.focus()
  printWindow.setTimeout(() => printWindow.print(), 300)
  return true
}
