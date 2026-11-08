import { useEffect, useRef, useState } from 'react'
import { readableTextColor } from '../lib/color'
import { floodFill, setCell } from '../lib/editor'
import type { EditorTool, PatternResult } from '../types'

interface PatternCanvasProps {
  result: PatternResult
  zoom: number
  showCodes: boolean
  showBoardLines: boolean
  tool: EditorTool
  activeColorIndex: number
  onCellsChange: (cells: Array<number | null>, recordHistory: boolean) => void
  onPickColor: (colorIndex: number) => void
}

interface HoveredCell {
  x: number
  y: number
  colorIndex: number | null
}

export function PatternCanvas({
  result,
  zoom,
  showCodes,
  showBoardLines,
  tool,
  activeColorIndex,
  onCellsChange,
  onPickColor,
}: PatternCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cellsRef = useRef(result.cells)
  const drawingRef = useRef(false)
  const historyRecordedRef = useRef(false)
  const visitedRef = useRef(new Set<number>())
  const [hovered, setHovered] = useState<HoveredCell | null>(null)

  useEffect(() => {
    cellsRef.current = result.cells
  }, [result.cells])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cellSize = zoom
    canvas.width = result.width * cellSize
    canvas.height = result.height * cellSize
    const context = canvas.getContext('2d')
    if (!context) return

    context.fillStyle = '#ecebe6'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const checkerSize = Math.max(4, cellSize)
    context.fillStyle = '#deddd7'
    for (let y = 0; y < canvas.height; y += checkerSize) {
      for (let x = 0; x < canvas.width; x += checkerSize) {
        if ((x / checkerSize + y / checkerSize) % 2 === 0) {
          context.fillRect(x, y, checkerSize, checkerSize)
        }
      }
    }

    context.textAlign = 'center'
    context.textBaseline = 'middle'
    for (let y = 0; y < result.height; y += 1) {
      for (let x = 0; x < result.width; x += 1) {
        const colorIndex = result.cells[y * result.width + x]
        if (colorIndex === null) continue
        const color = result.palette[colorIndex]
        const left = x * cellSize
        const top = y * cellSize

        if (showCodes) {
          context.fillStyle = color.hex
          context.fillRect(left, top, cellSize, cellSize)
          if (cellSize >= 17) {
            context.fillStyle = readableTextColor(color)
            context.font = `700 ${Math.max(6, Math.floor(cellSize * 0.34))}px ui-monospace, monospace`
            context.fillText(color.code, left + cellSize / 2, top + cellSize / 2 + 0.5)
          }
        } else {
          const centerX = left + cellSize / 2
          const centerY = top + cellSize / 2
          const radius = cellSize * 0.43
          context.beginPath()
          context.arc(centerX, centerY, radius, 0, Math.PI * 2)
          context.fillStyle = color.hex
          context.fill()
          context.strokeStyle = 'rgba(20,20,18,.16)'
          context.lineWidth = Math.max(0.6, cellSize * 0.035)
          context.stroke()
          context.beginPath()
          context.arc(
            centerX - radius * 0.25,
            centerY - radius * 0.28,
            Math.max(0.8, radius * 0.18),
            0,
            Math.PI * 2,
          )
          context.fillStyle = 'rgba(255,255,255,.42)'
          context.fill()
        }
      }
    }

    if (showCodes || cellSize >= 18) {
      context.strokeStyle = 'rgba(44,45,41,.18)'
      context.lineWidth = 0.6
      for (let x = 0; x <= result.width; x += 1) {
        const position = x * cellSize
        context.beginPath()
        context.moveTo(position, 0)
        context.lineTo(position, canvas.height)
        context.stroke()
      }
      for (let y = 0; y <= result.height; y += 1) {
        const position = y * cellSize
        context.beginPath()
        context.moveTo(0, position)
        context.lineTo(canvas.width, position)
        context.stroke()
      }
    }

    if (showBoardLines) {
      context.strokeStyle = 'rgba(25,26,23,.78)'
      context.lineWidth = Math.max(1.5, cellSize * 0.1)
      for (let x = 29; x < result.width; x += 29) {
        const position = x * cellSize
        context.beginPath()
        context.moveTo(position, 0)
        context.lineTo(position, canvas.height)
        context.stroke()
      }
      for (let y = 29; y < result.height; y += 29) {
        const position = y * cellSize
        context.beginPath()
        context.moveTo(0, position)
        context.lineTo(canvas.width, position)
        context.stroke()
      }
    }
  }, [result, showBoardLines, showCodes, zoom])

  const getCell = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.min(
      result.width - 1,
      Math.max(0, Math.floor(((event.clientX - bounds.left) / bounds.width) * result.width)),
    )
    const y = Math.min(
      result.height - 1,
      Math.max(0, Math.floor(((event.clientY - bounds.top) / bounds.height) * result.height)),
    )
    return { x, y, index: y * result.width + x }
  }

  const applyPaint = (index: number) => {
    if (visitedRef.current.has(index)) return
    visitedRef.current.add(index)
    const colorIndex = tool === 'eraser' ? null : activeColorIndex
    const next = setCell(cellsRef.current, index, colorIndex)
    if (next === cellsRef.current) return
    const recordHistory = !historyRecordedRef.current
    historyRecordedRef.current = true
    cellsRef.current = next
    onCellsChange(next, recordHistory)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const { x, y, index } = getCell(event)
    setHovered({ x, y, colorIndex: cellsRef.current[index] })

    if (tool === 'eyedropper') {
      const colorIndex = cellsRef.current[index]
      if (colorIndex !== null) onPickColor(colorIndex)
      return
    }
    if (tool === 'fill') {
      const next = floodFill(
        cellsRef.current,
        result.width,
        result.height,
        index,
        activeColorIndex,
      )
      if (next !== cellsRef.current) {
        cellsRef.current = next
        onCellsChange(next, true)
      }
      return
    }

    drawingRef.current = true
    historyRecordedRef.current = false
    visitedRef.current.clear()
    applyPaint(index)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, index } = getCell(event)
    setHovered({ x, y, colorIndex: cellsRef.current[index] })
    if (drawingRef.current && (tool === 'pencil' || tool === 'eraser')) {
      event.preventDefault()
      applyPaint(index)
    }
  }

  const stopDrawing = () => {
    drawingRef.current = false
    visitedRef.current.clear()
  }

  const hoveredColor = hovered?.colorIndex === null || hovered?.colorIndex === undefined
    ? null
    : result.palette[hovered.colorIndex]

  return (
    <div className="pattern-canvas-wrap">
      <canvas
        ref={canvasRef}
        className={`pattern-canvas tool-${tool}`}
        aria-label={`${result.width} 乘 ${result.height} 的拼豆图纸`}
        title="在格子上拖动即可编辑"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={() => {
          stopDrawing()
          setHovered(null)
        }}
      />
      {hovered && (
        <div
          className="cell-tooltip"
          style={{
            left: `${((hovered.x + 0.5) / result.width) * 100}%`,
            top: `${((hovered.y + 0.5) / result.height) * 100}%`,
          }}
        >
          <span
            className="tooltip-swatch"
            style={{ backgroundColor: hoveredColor?.hex ?? 'transparent' }}
          />
          {hoveredColor
            ? `${hoveredColor.code} · ${hoveredColor.name} · (${hovered.x + 1}, ${hovered.y + 1})`
            : `空格 · (${hovered.x + 1}, ${hovered.y + 1})`}
        </div>
      )}
    </div>
  )
}
