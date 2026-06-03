const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
})
