package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx   context.Context
	proxy *WebDAVProxy
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	var err error
	a.proxy, err = StartProxy()
	if err != nil {
		println("failed to start proxy:", err.Error())
	}
}

func (a *App) shutdown(ctx context.Context) {
	if a.proxy != nil {
		a.proxy.Stop()
	}
}

func (a *App) GetProxyPort() int {
	if a.proxy == nil {
		return -1
	}
	return a.proxy.Port()
}

func (a *App) SetWebdavProxyTarget(url string) {
	if a.proxy != nil {
		a.proxy.SetTargetURL(url)
	}
}

func (a *App) ToggleDevTools() {
	runtime.WindowExecJS(a.ctx, `console.log("DevTools: right-click the window and select Inspect")`)
}

func (a *App) OpenDevTools() {
	runtime.WindowExecJS(a.ctx, `console.log("DevTools: right-click the window and select Inspect")`)
}
