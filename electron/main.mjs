import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ID = 'cn.beadloom.desktop'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const preloadPath = path.join(__dirname, 'preload.cjs')
const indexPath = path.join(projectRoot, 'dist', 'index.html')
const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(projectRoot, 'build', 'icon.png')
const devServerUrl = process.env.BEADLOOM_DEV_SERVER_URL
const isSmokeTest = process.env.BEADLOOM_SMOKE_TEST === '1'
const smokeResultPath = process.env.BEADLOOM_SMOKE_RESULT

app.setAppUserModelId(APP_ID)

function sendCommand(window, command) {
  if (!window?.isDestroyed()) window.webContents.send('desktop:command', command)
}

function createApplicationMenu(window) {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '打开项目…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand(window, 'open-project') },
        { label: '保存项目…', accelerator: 'CmdOrCtrl+S', click: () => sendCommand(window, 'save-project') },
        { type: 'separator' },
        { role: 'quit', label: '退出豆格' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => sendCommand(window, 'undo') },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', click: () => sendCommand(window, 'redo') },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大界面' },
        { role: 'zoomOut', label: '缩小界面' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于豆格',
          click: () => dialog.showMessageBox(window, {
            type: 'info',
            title: '关于豆格 Beadloom',
            message: '豆格 Beadloom',
            detail: `版本 ${app.getVersion()}\n本地运行的拼豆图纸生成与编辑软件。`,
            buttons: ['确定'],
          }),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const window = new BrowserWindow({
    title: '豆格 Beadloom',
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f2f1ec',
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  })

  window.once('ready-to-show', () => {
    if (!isSmokeTest) window.show()
  })
  if (isSmokeTest) {
    window.webContents.once('did-finish-load', async () => {
      try {
        const result = await window.webContents.executeJavaScript(`({
          title: document.title,
          desktopBridge: Boolean(window.beadloomDesktop?.isDesktop),
          brand: document.querySelector('.brand strong')?.textContent,
          uploadButtons: document.querySelectorAll('.upload-zone button').length
        })`)
        if (smokeResultPath) await writeFile(smokeResultPath, JSON.stringify(result, null, 2))
        console.log(`BEADLOOM_SMOKE_TEST ${JSON.stringify(result)}`)
        app.exit(result.desktopBridge && result.brand === '豆格' ? 0 : 2)
      } catch (error) {
        if (smokeResultPath) await writeFile(smokeResultPath, JSON.stringify({ error: String(error) }, null, 2))
        console.error('BEADLOOM_SMOKE_TEST_FAILED', error)
        app.exit(2)
      }
    })
    window.webContents.once('did-fail-load', (_event, code, description) => {
      console.error('BEADLOOM_SMOKE_TEST_LOAD_FAILED', code, description)
      app.exit(2)
    })
  }
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file:')
    if (!allowed) event.preventDefault()
  })

  if (devServerUrl) void window.loadURL(devServerUrl)
  else void window.loadFile(indexPath)

  createApplicationMenu(window)
  return window
}

function filtersFor(fileName, mimeType) {
  const extension = path.extname(fileName).replace('.', '').toLowerCase()
  const names = {
    png: 'PNG 图像',
    csv: 'CSV 表格',
    json: '豆格项目',
  }
  if (!extension) return [{ name: mimeType || '文件', extensions: ['*'] }]
  return [{ name: names[extension] || '文件', extensions: [extension] }]
}

ipcMain.handle('desktop:save-file', async (event, payload) => {
  if (!payload || typeof payload.fileName !== 'string' || !payload.data) {
    throw new Error('无效的保存请求。')
  }
  const bytes = Buffer.from(payload.data)
  if (bytes.byteLength > 250 * 1024 * 1024) throw new Error('导出文件超过 250MB。')

  const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined
  const result = await dialog.showSaveDialog(owner, {
    title: '保存文件',
    defaultPath: path.join(app.getPath('documents'), path.basename(payload.fileName)),
    filters: filtersFor(payload.fileName, payload.mimeType),
  })
  if (result.canceled || !result.filePath) return { saved: false }
  await writeFile(result.filePath, bytes)
  return { saved: true }
})

ipcMain.handle('desktop:print-image', async (_event, dataUrl) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 150_000_000) {
    throw new Error('无效的打印内容。')
  }
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  try {
    await printWindow.loadURL(dataUrl)
    return await new Promise((resolve) => {
      printWindow.webContents.print(
        { silent: false, printBackground: true },
        (success, failureReason) => resolve(success || failureReason === 'cancelled'),
      )
    })
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
  }
})

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  let mainWindow
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow()
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    mainWindow = createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
