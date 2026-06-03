const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 360,
    minHeight: 500,
    title: 'Daily Habit',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, 'docs', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('toggle-devtools', (event) => {
  event.sender.toggleDevTools()
})
