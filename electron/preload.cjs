const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('beadloomDesktop', {
  isDesktop: true,
  platform: process.platform,
  saveFile: (request) => ipcRenderer.invoke('desktop:save-file', request),
  printImage: (dataUrl) => ipcRenderer.invoke('desktop:print-image', dataUrl),
  onCommand: (callback) => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('desktop:command', listener)
    return () => ipcRenderer.removeListener('desktop:command', listener)
  },
})
