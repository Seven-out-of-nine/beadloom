type DesktopCommand = 'open-project' | 'save-project' | 'undo' | 'redo'

interface DesktopSaveRequest {
  fileName: string
  mimeType: string
  data: ArrayBuffer
}

interface BeadloomDesktopBridge {
  isDesktop: true
  platform: string
  saveFile: (request: DesktopSaveRequest) => Promise<{ saved: boolean }>
  printImage: (dataUrl: string) => Promise<boolean>
  onCommand: (callback: (command: DesktopCommand) => void) => () => void
}

interface Window {
  beadloomDesktop?: BeadloomDesktopBridge
}
