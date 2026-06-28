package main

import (
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
)

type WebDAVProxy struct {
	mu        sync.RWMutex
	targetURL string
	server    *http.Server
	port      int
	ln        net.Listener
}

func (p *WebDAVProxy) SetTargetURL(url string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.targetURL = url
}

func (p *WebDAVProxy) GetTargetURL() string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.targetURL
}

func (p *WebDAVProxy) Port() int {
	return p.port
}

func (p *WebDAVProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	target := p.GetTargetURL()
	if target == "" {
		http.Error(w, "proxy target not configured", http.StatusBadGateway)
		return
	}

	fullURL := strings.TrimRight(target, "/") + r.URL.Path
	if r.URL.RawQuery != "" {
		fullURL += "?" + r.URL.RawQuery
	}

	proxyReq, err := http.NewRequest(r.Method, fullURL, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	for k, vs := range r.Header {
		for _, v := range vs {
			proxyReq.Header.Add(k, v)
		}
	}

	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PROPFIND, MOVE, COPY, MKCOL")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("Access-Control-Expose-Headers", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func StartProxy() (*WebDAVProxy, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}

	proxy := &WebDAVProxy{
		port: ln.Addr().(*net.TCPAddr).Port,
		ln:   ln,
	}
	proxy.server = &http.Server{
		Handler: proxy,
	}
	go proxy.server.Serve(ln)
	return proxy, nil
}

func (p *WebDAVProxy) Stop() {
	if p.server != nil {
		p.server.Close()
	}
	if p.ln != nil {
		p.ln.Close()
	}
}
