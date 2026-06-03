const { app, BrowserWindow, ipcMain, protocol, net } = require('electron')
const path = require('node:path')

const isDev = !app.isPackaged

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
])

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
    win.loadURL('app://index.html')
  }
}

app.whenReady().then(() => {
  if (!isDev) {
    protocol.handle('app', (request) => {
      const url = new URL(request.url)
      const filePath = url.pathname === '/' ? '/index.html' : url.pathname
      const fullPath = path.join(__dirname, '..', 'docs', filePath)
      return net.fetch('file://' + fullPath).then((response) => {
        const headers = new Headers(response.headers)
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
        headers.set('Cross-Origin-Opener-Policy', 'same-origin')
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      })
    })
  }

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
