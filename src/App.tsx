import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  BadgeCheck,
  AppWindow,
  Brush,
  ChevronDown,
  Download,
  Eraser,
  FileSpreadsheet,
  FolderOpen,
  Grid3X3,
  Image as ImageIcon,
  Info,
  Lock,
  LockOpen,
  Minus,
  PaintBucket,
  PackageCheck,
  Pipette,
  Plus,
  Printer,
  Redo2,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  WifiOff,
} from 'lucide-react'
import { PatternCanvas } from './components/PatternCanvas'
import { UploadZone } from './components/UploadZone'
import { getPalette, PALETTES } from './data/palettes'
import {
  downloadMaterialsCsv,
  downloadPatternPng,
  downloadProjectJson,
  printPattern,
} from './lib/export'
import {
  createProject,
  parseProject,
  PROJECT_STORAGE_KEY,
  recountPattern,
} from './lib/editor'
import { generatePattern } from './lib/pattern'
import type {
  EditorTool,
  GeneratorSettings,
  InventorySettings,
  LoadedImage,
  PatternResult,
} from './types'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const INITIAL_SETTINGS: GeneratorSettings = {
  width: 58,
  maxColors: 24,
  paletteId: 'studio-66',
  dithering: false,
  fit: 'cover',
  brightness: 0,
  contrast: 6,
  saturation: 4,
  alphaThreshold: 12,
  beadSize: 5,
  showCodes: false,
  showBoardLines: true,
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)))

function Section({
  step,
  title,
  children,
}: {
  step: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="control-section">
      <div className="section-heading">
        <span className="step-number">{step}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function RangeControl({
  label,
  value,
  min,
  max,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="range-control">
      <span className="range-label"><span>{label}</span><strong>{value}{suffix}</strong></span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function createDemoImage(): Promise<LoadedImage> {
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 620
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('无法创建示例图片。'))

  const gradient = context.createLinearGradient(0, 0, 720, 620)
  gradient.addColorStop(0, '#f6e8ce')
  gradient.addColorStop(1, '#d9e8d2')
  context.fillStyle = gradient
  context.fillRect(0, 0, 720, 620)
  context.fillStyle = '#204f3c'
  context.beginPath()
  context.ellipse(185, 455, 120, 48, -0.55, 0, Math.PI * 2)
  context.fill()
  context.beginPath()
  context.ellipse(525, 442, 116, 45, 0.55, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = '#397c51'
  context.lineWidth = 26
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(355, 480)
  context.lineTo(360, 325)
  context.stroke()
  const petalColors = ['#ef654f', '#f18e51', '#e84c63', '#f5b45e', '#db5c7e', '#f47c62']
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2
    const x = 360 + Math.cos(angle) * 132
    const y = 255 + Math.sin(angle) * 112
    context.save()
    context.translate(x, y)
    context.rotate(angle)
    context.fillStyle = petalColors[index % petalColors.length]
    context.beginPath()
    context.ellipse(0, 0, 78, 46, 0, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }
  context.fillStyle = '#f1c83b'
  context.beginPath()
  context.arc(360, 255, 78, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#7d4b2c'
  for (let y = -40; y <= 40; y += 20) {
    for (let x = -40; x <= 40; x += 20) {
      if (x * x + y * y < 2200) {
        context.beginPath()
        context.arc(360 + x, 255 + y, 6, 0, Math.PI * 2)
        context.fill()
      }
    }
  }

  const url = canvas.toDataURL('image/png')
  const element = new Image()
  element.src = url
  return element.decode().then(() => ({
    element,
    name: '向日葵示例.png',
    url,
    width: canvas.width,
    height: canvas.height,
  }))
}

export default function App() {
  const isDesktop = Boolean(window.beadloomDesktop)
  const [settings, setSettings] = useState(INITIAL_SETTINGS)
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [outputHeight, setOutputHeight] = useState(50)
  const [ratioLocked, setRatioLocked] = useState(true)
  const [zoom, setZoom] = useState(14)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pattern, setPattern] = useState<PatternResult | null>(null)
  const [tool, setTool] = useState<EditorTool>('pencil')
  const [activeColorIndex, setActiveColorIndex] = useState(0)
  const [undoStack, setUndoStack] = useState<Array<Array<number | null>>>([])
  const [redoStack, setRedoStack] = useState<Array<Array<number | null>>>([])
  const [inventory, setInventory] = useState<InventorySettings>({
    enabled: false,
    availableCodes: getPalette(INITIAL_SETTINGS.paletteId).colors.map((color) => color.code),
  })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [hasAutosave, setHasAutosave] = useState(() => {
    try {
      return Boolean(localStorage.getItem(PROJECT_STORAGE_KEY))
    } catch {
      return false
    }
  })
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const generationSettings = useMemo<GeneratorSettings>(() => ({ ...settings }), [
    settings.width,
    settings.maxColors,
    settings.paletteId,
    settings.dithering,
    settings.fit,
    settings.brightness,
    settings.contrast,
    settings.saturation,
    settings.alphaThreshold,
  ])
  const deferredSettings = useDeferredValue(generationSettings)
  const deferredHeight = useDeferredValue(outputHeight)
  const selectedPalette = getPalette(deferredSettings.paletteId)
  const effectiveColors = useMemo(() => {
    if (!inventory.enabled) return selectedPalette.colors
    const available = new Set(inventory.availableCodes)
    const filtered = selectedPalette.colors.filter((color) => available.has(color.code))
    return filtered.length > 0 ? filtered : selectedPalette.colors
  }, [inventory, selectedPalette.colors])

  useEffect(() => {
    return () => {
      if (image?.url.startsWith('blob:')) URL.revokeObjectURL(image.url)
    }
  }, [image])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 2600)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const generatedResult = useMemo(() => {
    if (!image) return null
    try {
      return generatePattern(image, deferredHeight, deferredSettings, effectiveColors)
    } catch {
      return null
    }
  }, [deferredHeight, deferredSettings, effectiveColors, image])

  useEffect(() => {
    if (!generatedResult) return
    setPattern(generatedResult)
    setActiveColorIndex(0)
    setUndoStack([])
    setRedoStack([])
  }, [generatedResult])

  useEffect(() => {
    if (!pattern) return
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      try {
        const project = createProject(pattern, settings, outputHeight, inventory)
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project))
        setHasAutosave(true)
        setSaveState('saved')
      } catch {
        setSaveState('idle')
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [inventory, outputHeight, pattern, settings])

  const updateSetting = <Key extends keyof GeneratorSettings>(
    key: Key,
    value: GeneratorSettings[Key],
  ) => setSettings((current) => ({ ...current, [key]: value }))

  const setWidth = (requestedWidth: number) => {
    const width = clamp(requestedWidth, 8, 160)
    setSettings((current) => ({ ...current, width }))
    if (ratioLocked && image) {
      setOutputHeight(clamp((width * image.height) / image.width, 8, 180))
    }
  }

  const setHeight = (requestedHeight: number) => {
    const height = clamp(requestedHeight, 8, 180)
    setOutputHeight(height)
    if (ratioLocked && image) {
      setSettings((current) => ({
        ...current,
        width: clamp((height * image.width) / image.height, 8, 160),
      }))
    }
  }

  const installImage = (loaded: LoadedImage) => {
    setImage(loaded)
    setOutputHeight(clamp((settings.width * loaded.height) / loaded.width, 8, 180))
    setError(null)
    setMessage('图片已就位，图纸已自动生成')
  }

  const loadFile = (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('请选择 PNG、JPG 或 WebP 图片。')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('图片超过 15MB，请压缩后再试。')
      return
    }
    const url = URL.createObjectURL(file)
    const element = new Image()
    element.onload = () => installImage({
      element,
      name: file.name,
      url,
      width: element.naturalWidth,
      height: element.naturalHeight,
    })
    element.onerror = () => {
      URL.revokeObjectURL(url)
      setError('图片读取失败，请换一张图片重试。')
    }
    element.src = url
  }

  const loadDemo = () => {
    createDemoImage().then(installImage).catch(() => setError('示例图片生成失败。'))
  }

  const handleCellsChange = (cells: Array<number | null>, recordHistory: boolean) => {
    if (!pattern || cells === pattern.cells) return
    if (recordHistory) {
      setUndoStack((current) => [...current, pattern.cells].slice(-50))
      setRedoStack([])
    }
    setPattern(recountPattern(pattern, cells))
  }

  const undo = () => {
    const previous = undoStack.at(-1)
    if (!pattern || !previous) return
    setRedoStack((current) => [...current, pattern.cells].slice(-50))
    setUndoStack((current) => current.slice(0, -1))
    setPattern(recountPattern(pattern, previous))
  }

  const redo = () => {
    const next = redoStack.at(-1)
    if (!pattern || !next) return
    setUndoStack((current) => [...current, pattern.cells].slice(-50))
    setRedoStack((current) => current.slice(0, -1))
    setPattern(recountPattern(pattern, next))
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select')) return
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [pattern, redoStack, undoStack])

  const applyProject = (raw: unknown, restoredMessage: string) => {
    const restored = parseProject(raw)
    setImage(null)
    setSettings(restored.project.settings)
    setOutputHeight(restored.project.outputHeight)
    setInventory(restored.project.inventory)
    setPattern(restored.pattern)
    setActiveColorIndex(0)
    setUndoStack([])
    setRedoStack([])
    setError(null)
    setMessage(restoredMessage)
  }

  const restoreAutosave = () => {
    try {
      const stored = localStorage.getItem(PROJECT_STORAGE_KEY)
      if (!stored) throw new Error('没有找到可恢复的项目。')
      applyProject(JSON.parse(stored), '已恢复上次编辑的项目')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '自动保存恢复失败。')
    }
  }

  const importProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError('项目文件超过 5MB，无法导入。')
      return
    }
    try {
      applyProject(JSON.parse(await file.text()), '项目已导入，可以继续编辑')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目导入失败。')
    }
  }

  const saveProjectFile = async () => {
    if (!pattern) return
    try {
      const saved = await downloadProjectJson(createProject(pattern, settings, outputHeight, inventory))
      if (saved) setMessage(isDesktop ? '项目文件已保存' : '项目文件已下载')
    } catch {
      setError('项目保存失败，请重试。')
    }
  }

  const changePalette = (paletteId: string) => {
    const palette = getPalette(paletteId)
    updateSetting('paletteId', paletteId)
    setInventory({
      enabled: false,
      availableCodes: palette.colors.map((color) => color.code),
    })
  }

  const toggleInventoryCode = (code: string) => {
    setInventory((current) => {
      const included = current.availableCodes.includes(code)
      if (included && current.availableCodes.length === 1) {
        setError('库存色至少保留一种。')
        return current
      }
      return {
        ...current,
        availableCodes: included
          ? current.availableCodes.filter((item) => item !== code)
          : [...current.availableCodes, code],
      }
    })
  }

  const installApplication = async () => {
    if (isDesktop) {
      setMessage('当前已经是 Windows 桌面应用')
      return
    }
    if (!installPrompt) {
      setMessage('可在浏览器菜单中选择“安装应用”或“添加到主屏幕”')
      return
    }
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)
    if (choice.outcome === 'accepted') setMessage('豆格已安装到你的设备')
  }

  useEffect(() => {
    return window.beadloomDesktop?.onCommand((command) => {
      if (command === 'open-project') projectInputRef.current?.click()
      else if (command === 'save-project') void saveProjectFile()
      else if (command === 'undo') undo()
      else if (command === 'redo') redo()
    })
  }, [inventory, outputHeight, pattern, redoStack, settings, undoStack])

  const result = pattern

  const boards = result
    ? Math.ceil(result.width / 29) * Math.ceil(result.height / 29)
    : 0
  const physicalWidth = result
    ? ((result.width * settings.beadSize) / 10).toFixed(1)
    : '0'
  const physicalHeight = result
    ? ((result.height * settings.beadSize) / 10).toFixed(1)
    : '0'
  const sortedUsage = result
    ? [...result.counts.entries()].sort((first, second) => second[1] - first[1])
    : []
  const sheetOptions = {
    showCodes: settings.showCodes,
    showBoardLines: settings.showBoardLines,
    beadSize: settings.beadSize,
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="豆格首页">
          <span className="brand-mark" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((item) => <i key={item} />)}
          </span>
          <span><strong>豆格</strong><small>BEADLOOM</small></span>
        </a>
        <div className="header-actions">
          <button type="button" className={`install-button ${isDesktop ? 'desktop' : ''}`} onClick={installApplication}>
            {isDesktop ? <AppWindow size={15} /> : <Download size={15} />}
            {isDesktop ? 'Windows 桌面版' : '安装应用'}
          </button>
          <div className={`header-note ${online ? '' : 'offline'}`}>
            {online ? <ShieldCheck size={16} /> : <WifiOff size={16} />}
            {online ? '图片只在本机处理' : '离线模式可用'}
          </div>
        </div>
      </header>

      <input
        ref={projectInputRef}
        className="visually-hidden"
        type="file"
        accept=".json,.beadloom.json,application/json"
        onChange={importProject}
      />

      <div className="workspace" id="top">
        <aside className="sidebar">
          <div className="intro-copy">
            <span className="eyebrow"><Sparkles size={14} /> IMAGE TO BEADS</span>
            <h1>把喜欢的图片，<br />变成一颗颗拼豆。</h1>
            <p>选图、定大小、拿图纸。色号与用量也帮你算好。</p>
          </div>

          <Section step="01" title="上传图片">
            <UploadZone image={image} onFile={loadFile} onDemo={loadDemo} />
            {error && <div className="inline-error" role="alert"><Info size={15} />{error}</div>}
          </Section>

          <fieldset className="settings-fieldset" disabled={!image}>
            <Section step="02" title="图纸大小">
              <div className="preset-row">
                {[29, 58, 87].map((size, index) => (
                  <button
                    key={size}
                    type="button"
                    className={`preset-button ${settings.width === size ? 'active' : ''}`}
                    onClick={() => setWidth(size)}
                  >
                    <strong>{size}</strong>
                    <span>{['轻松', '标准', '精细'][index]}</span>
                  </button>
                ))}
              </div>
              <div className="dimension-row">
                <label><span>宽</span><input type="number" min="8" max="160" value={settings.width} onChange={(event) => setWidth(Number(event.target.value))} /><em>颗</em></label>
                <button
                  type="button"
                  className={`ratio-lock ${ratioLocked ? 'active' : ''}`}
                  onClick={() => setRatioLocked((value) => !value)}
                  title={ratioLocked ? '解锁宽高比例' : '锁定原图比例'}
                >
                  {ratioLocked ? <Lock size={15} /> : <LockOpen size={15} />}
                </button>
                <label><span>高</span><input type="number" min="8" max="180" value={outputHeight} onChange={(event) => setHeight(Number(event.target.value))} /><em>颗</em></label>
              </div>
              <div className="segmented two">
                <button type="button" className={settings.beadSize === 5 ? 'active' : ''} onClick={() => updateSetting('beadSize', 5)}>5mm 大豆</button>
                <button type="button" className={settings.beadSize === 2.6 ? 'active' : ''} onClick={() => updateSetting('beadSize', 2.6)}>2.6mm 小豆</button>
              </div>
              {result && (
                <p className="size-hint">
                  成品约 {physicalWidth} × {physicalHeight} cm · 需 {boards} 块 29×29 底板
                </p>
              )}
            </Section>

            <Section step="03" title="颜色与效果">
              <label className="field-label">
                <span>参考色板</span>
                <select value={settings.paletteId} onChange={(event) => changePalette(event.target.value)}>
                  {PALETTES.map((palette) => <option key={palette.id} value={palette.id}>{palette.name}</option>)}
                </select>
              </label>
              <p className="field-help">{getPalette(settings.paletteId).description}</p>
              <div className="field-label compact"><span>最多用色</span><strong>{Math.min(settings.maxColors, getPalette(settings.paletteId).colors.length)} 色</strong></div>
              <div className="color-count-row">
                {[8, 16, 24, 32, 48, 66].map((count) => (
                  <button type="button" key={count} className={settings.maxColors === count ? 'active' : ''} onClick={() => updateSetting('maxColors', count)}>{count}</button>
                ))}
              </div>
              <label className="toggle-row">
                <span><strong>柔和抖动</strong><small>用相邻颜色模拟过渡，照片更自然</small></span>
                <input type="checkbox" checked={settings.dithering} onChange={(event) => updateSetting('dithering', event.target.checked)} />
                <i />
              </label>

              <details className="advanced-settings">
                <summary><SlidersHorizontal size={16} /> 图像微调 <ChevronDown size={16} /></summary>
                <div className="advanced-body">
                  <label className="field-label">
                    <span>适配方式</span>
                    <select value={settings.fit} onChange={(event) => updateSetting('fit', event.target.value as GeneratorSettings['fit'])}>
                      <option value="cover">填满并裁切</option>
                      <option value="contain">完整保留</option>
                      <option value="stretch">拉伸到画布</option>
                    </select>
                  </label>
                  <RangeControl label="亮度" value={settings.brightness} min={-30} max={30} onChange={(value) => updateSetting('brightness', value)} />
                  <RangeControl label="对比度" value={settings.contrast} min={-30} max={40} onChange={(value) => updateSetting('contrast', value)} />
                  <RangeControl label="饱和度" value={settings.saturation} min={-40} max={40} onChange={(value) => updateSetting('saturation', value)} />
                  <RangeControl label="透明阈值" value={settings.alphaThreshold} min={0} max={80} suffix="%" onChange={(value) => updateSetting('alphaThreshold', value)} />
                  <button className="text-button" type="button" onClick={() => setSettings((current) => ({ ...INITIAL_SETTINGS, width: current.width, beadSize: current.beadSize }))}>恢复默认效果</button>
                </div>
              </details>
            </Section>

            <Section step="04" title="我的库存">
              <label className="toggle-row inventory-toggle">
                <span><strong>只使用手头已有颜色</strong><small>生成时不会选中未勾选的豆色</small></span>
                <input
                  type="checkbox"
                  checked={inventory.enabled}
                  onChange={(event) => setInventory((current) => ({ ...current, enabled: event.target.checked }))}
                />
                <i />
              </label>
              <details className="inventory-settings">
                <summary>
                  <PackageCheck size={16} /> 管理库存色
                  <span>{inventory.availableCodes.length}/{getPalette(settings.paletteId).colors.length}</span>
                  <ChevronDown size={15} />
                </summary>
                <div className="inventory-actions">
                  <button type="button" onClick={() => setInventory((current) => ({
                    ...current,
                    availableCodes: getPalette(settings.paletteId).colors.map((color) => color.code),
                  }))}>全选</button>
                  {result && (
                    <button type="button" onClick={() => setInventory((current) => ({
                      ...current,
                      availableCodes: result.palette.map((color) => color.code),
                    }))}>仅图纸用色</button>
                  )}
                </div>
                <div className="inventory-grid">
                  {getPalette(settings.paletteId).colors.map((color) => {
                    const available = inventory.availableCodes.includes(color.code)
                    return (
                      <button
                        key={color.code}
                        type="button"
                        className={available ? 'active' : ''}
                        title={`${color.code} · ${color.name}`}
                        aria-label={`${available ? '移除' : '加入'} ${color.code} ${color.name}`}
                        onClick={() => toggleInventoryCode(color.code)}
                      >
                        <i style={{ backgroundColor: color.hex }} />
                        <span>{color.code}</span>
                      </button>
                    )
                  })}
                </div>
              </details>
            </Section>
          </fieldset>
        </aside>

        <main className="preview-panel">
          <div className="project-bar">
            <div className="save-indicator">
              <Save size={15} />
              {saveState === 'saving' ? '正在自动保存…' : saveState === 'saved' ? '已自动保存到本机' : '项目保存在本机'}
            </div>
            <div>
              <button type="button" className="button ghost small" onClick={() => projectInputRef.current?.click()}>
                <FolderOpen size={15} /> 打开项目
              </button>
              {result && (
                <button type="button" className="button ghost small" onClick={saveProjectFile}>
                  <Save size={15} /> 保存项目
                </button>
              )}
            </div>
          </div>

          {hasAutosave && !result && (
            <div className="restore-banner">
              <span><strong>发现上次编辑的项目</strong><small>图纸和编辑记录已保存在这台设备上。</small></span>
              <button type="button" className="button primary small" onClick={restoreAutosave}>恢复项目</button>
            </div>
          )}

          <div className="preview-toolbar">
            <div>
              <span className="panel-kicker">实时图纸</span>
              {result ? (
                <input
                  className="project-title-input"
                  value={result.sourceName}
                  aria-label="项目名称"
                  onChange={(event) => setPattern((current) => current ? {
                    ...current,
                    sourceName: event.target.value.slice(0, 80),
                  } : current)}
                />
              ) : <h2>等待一张图片</h2>}
            </div>
            {result && (
              <div className="export-actions">
                <button type="button" className="button ghost" onClick={() => {
                  downloadMaterialsCsv(result)
                    .then((saved) => saved && setMessage(isDesktop ? '材料清单已保存' : '材料清单已下载'))
                    .catch(() => setError('材料清单导出失败，请重试。'))
                }}><FileSpreadsheet size={17} /> 清单</button>
                <button type="button" className="button ghost" onClick={() => {
                  printPattern(result, sheetOptions)
                    .then((opened) => {
                      if (!opened) setError(isDesktop ? '无法打开系统打印窗口。' : '浏览器拦截了打印窗口，请允许弹出窗口后重试。')
                    })
                    .catch(() => setError('打印准备失败，请重试。'))
                }}><Printer size={17} /> 打印</button>
                <button type="button" className="button dark" onClick={() => {
                  downloadPatternPng(result, sheetOptions)
                    .then((saved) => saved && setMessage(isDesktop ? '高清图纸已保存' : '高清图纸已下载'))
                    .catch(() => setError('图纸导出失败，请重试。'))
                }}><Download size={17} /> 下载图纸</button>
              </div>
            )}
          </div>

          {result ? (
            <>
              <div className="result-summary">
                <div><span>图纸尺寸</span><strong>{result.width} × {result.height}</strong><small>颗</small></div>
                <div><span>总用量</span><strong>{result.totalBeads.toLocaleString()}</strong><small>颗豆</small></div>
                <div><span>实际用色</span><strong>{result.counts.size}</strong><small>种</small></div>
                <div><span>底板需求</span><strong>{boards}</strong><small>块</small></div>
              </div>

              <div className="canvas-card">
                <div className="editor-toolbar" aria-label="图纸编辑工具">
                  <div className="editor-tools">
                    <span>逐格编辑</span>
                    <button type="button" className={tool === 'pencil' ? 'active' : ''} title="画笔 (拖动绘制)" onClick={() => setTool('pencil')}><Brush size={16} />画笔</button>
                    <button type="button" className={tool === 'eraser' ? 'active' : ''} title="橡皮 (拖动清除)" onClick={() => setTool('eraser')}><Eraser size={16} />橡皮</button>
                    <button type="button" className={tool === 'fill' ? 'active' : ''} title="填充相连区域" onClick={() => setTool('fill')}><PaintBucket size={16} />填充</button>
                    <button type="button" className={tool === 'eyedropper' ? 'active' : ''} title="从图纸取色" onClick={() => setTool('eyedropper')}><Pipette size={16} />取色</button>
                  </div>
                  <div className="history-tools">
                    <button type="button" disabled={undoStack.length === 0} title="撤销 Ctrl+Z" onClick={undo}><Undo2 size={17} /><span>撤销</span></button>
                    <button type="button" disabled={redoStack.length === 0} title="重做 Ctrl+Y" onClick={redo}><Redo2 size={17} /><span>重做</span></button>
                  </div>
                </div>
                <div className="editor-palette" aria-label="编辑颜色">
                  <span className="active-color-copy">
                    <i style={{ backgroundColor: result.palette[activeColorIndex]?.hex }} />
                    <strong>{result.palette[activeColorIndex]?.code}</strong>
                    <small>{result.palette[activeColorIndex]?.name}</small>
                  </span>
                  <div>
                    {result.palette.map((color, colorIndex) => (
                      <button
                        key={color.code}
                        type="button"
                        className={activeColorIndex === colorIndex ? 'active' : ''}
                        style={{ backgroundColor: color.hex }}
                        title={`${color.code} · ${color.name}`}
                        aria-label={`选择 ${color.code} ${color.name}`}
                        onClick={() => {
                          setActiveColorIndex(colorIndex)
                          if (tool === 'eyedropper' || tool === 'eraser') setTool('pencil')
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="canvas-toolbar">
                  <div className="view-toggles">
                    <button type="button" className={settings.showCodes ? 'active' : ''} onClick={() => updateSetting('showCodes', !settings.showCodes)}><Grid3X3 size={16} /> 色号</button>
                    <button type="button" className={settings.showBoardLines ? 'active' : ''} onClick={() => updateSetting('showBoardLines', !settings.showBoardLines)}><BadgeCheck size={16} /> 底板线</button>
                  </div>
                  <div className="zoom-control">
                    <button type="button" aria-label="缩小" onClick={() => setZoom((value) => Math.max(8, value - 2))}><Minus size={15} /></button>
                    <span>{zoom}px</span>
                    <button type="button" aria-label="放大" onClick={() => setZoom((value) => Math.min(30, value + 2))}><Plus size={15} /></button>
                  </div>
                </div>
                <div className="canvas-scroll">
                  <PatternCanvas
                    result={result}
                    zoom={zoom}
                    showCodes={settings.showCodes}
                    showBoardLines={settings.showBoardLines}
                    tool={tool}
                    activeColorIndex={activeColorIndex}
                    onCellsChange={handleCellsChange}
                    onPickColor={(colorIndex) => {
                      setActiveColorIndex(colorIndex)
                      setTool('pencil')
                      setMessage(`已取色 ${result.palette[colorIndex].code}`)
                    }}
                  />
                </div>
              </div>

              <section className="materials-card">
                <div className="materials-heading">
                  <div><span className="panel-kicker">材料准备</span><h3>用色清单</h3></div>
                  <span>建议每色多备 5%–10%</span>
                </div>
                <div className="materials-grid">
                  {sortedUsage.map(([colorIndex, count]) => {
                    const color = result.palette[colorIndex]
                    return (
                      <div className="material-item" key={color.code}>
                        <span className="material-swatch" style={{ backgroundColor: color.hex }} />
                        <span className="material-code">{color.code}</span>
                        <span className="material-name">{color.name}</span>
                        <strong>{count}<small> 颗</small></strong>
                      </div>
                    )
                  })}
                </div>
              </section>
            </>
          ) : (
            <div className="empty-preview">
              <div className="empty-art" aria-hidden="true">
                {Array.from({ length: 64 }, (_, index) => <i key={index} style={{ '--delay': `${index * 8}ms` } as React.CSSProperties} />)}
                <span><ImageIcon size={34} /></span>
              </div>
              <h2>从左边上传图片开始</h2>
              <p>线条清晰、主体明确的图片，通常会得到更好看的拼豆效果。</p>
              <div className="empty-features">
                <span><BadgeCheck size={16} /> 真实色板匹配</span>
                <span><BadgeCheck size={16} /> 自动统计豆数</span>
                <span><BadgeCheck size={16} /> 高清图纸导出</span>
              </div>
              <button className="button primary" type="button" onClick={loadDemo}><Sparkles size={17} /> 用示例图体验</button>
            </div>
          )}

          <footer className="app-footer">
            <span>豆格 Beadloom · 本地生成，不保存你的图片</span>
            <span>色板为屏幕参考值，购买前请以实物色卡为准</span>
          </footer>
        </main>
      </div>

      {message && <div className="toast" role="status"><BadgeCheck size={18} />{message}</div>}
    </div>
  )
}
