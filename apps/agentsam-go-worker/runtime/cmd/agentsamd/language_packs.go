package main

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
)

// Language pack registry — CORE is always ready; optional packs download/install once.

type langPack struct {
	ID          string   `json:"id"`
	Status      string   `json:"status"` // ready | missing | installing | error
	ServerBinary string  `json:"server_binary,omitempty"`
	InstallHint string   `json:"install_hint,omitempty"`
	Commands    []string `json:"commands,omitempty"`
}

var (
	langMu    sync.Mutex
	langState = map[string]*langPack{
		"language.typescript": {ID: "language.typescript", Status: "ready", InstallHint: "CORE — bundled Monaco TS"},
		"language.javascript": {ID: "language.javascript", Status: "ready", InstallHint: "CORE — bundled Monaco JS"},
		"language.json":       {ID: "language.json", Status: "ready"},
		"language.html":       {ID: "language.html", Status: "ready"},
		"language.css":        {ID: "language.css", Status: "ready"},
		"language.go": {
			ID: "language.go", Status: "missing", ServerBinary: "gopls",
			InstallHint: "go install golang.org/x/tools/gopls@latest",
			Commands:    []string{"go", "install", "golang.org/x/tools/gopls@latest"},
		},
		"language.rust": {
			ID: "language.rust", Status: "missing", ServerBinary: "rust-analyzer",
			InstallHint: "rustup component add rust-analyzer",
			Commands:    []string{"rustup", "component", "add", "rust-analyzer"},
		},
		"language.python": {
			ID: "language.python", Status: "missing", ServerBinary: "pyright-langserver",
			InstallHint: "npm install -g pyright",
			Commands:    []string{"npm", "install", "-g", "pyright"},
		},
	}
)

func refreshLangPackStatus() {
	langMu.Lock()
	defer langMu.Unlock()
	for _, p := range langState {
		if p.ServerBinary == "" {
			continue
		}
		if _, err := exec.LookPath(p.ServerBinary); err == nil {
			p.Status = "ready"
		} else if p.Status != "installing" {
			p.Status = "missing"
		}
	}
}

func handleLanguagePacks(w http.ResponseWriter, r *http.Request) {
	refreshLangPackStatus()
	langMu.Lock()
	defer langMu.Unlock()
	out := make(map[string]any, len(langState))
	for k, v := range langState {
		out[k] = v
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schema":       "agentsam.language.v1",
		"core":         []string{"language.typescript", "language.javascript", "language.json", "language.html", "language.css"},
		"packs":        out,
		"cache_dir":    languagePackCacheDir(),
		"platform":     runtime.GOOS,
		"architecture": runtime.GOARCH,
	})
}

func handleLanguagePackInstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	langMu.Lock()
	pack, ok := langState[body.ID]
	if !ok {
		langMu.Unlock()
		http.Error(w, "unknown_pack", http.StatusNotFound)
		return
	}
	if pack.Status == "ready" {
		langMu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": body.ID, "status": "ready", "message": "already_installed"})
		return
	}
	if len(pack.Commands) == 0 {
		langMu.Unlock()
		http.Error(w, "pack_not_installable", http.StatusBadRequest)
		return
	}
	cmds := append([]string{}, pack.Commands...)
	pack.Status = "installing"
	langMu.Unlock()

	cmd := exec.Command(cmds[0], cmds[1:]...)
	cmd.Env = os.Environ()
	out, err := cmd.CombinedOutput()
	langMu.Lock()
	defer langMu.Unlock()
	if err != nil {
		pack.Status = "error"
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": false, "id": body.ID, "status": "error",
			"message": err.Error(), "output": string(out),
		})
		return
	}
	if _, lookErr := exec.LookPath(pack.ServerBinary); lookErr == nil {
		pack.Status = "ready"
	} else {
		pack.Status = "missing"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": pack.Status == "ready", "id": body.ID, "status": pack.Status,
		"output": string(out),
	})
}

func languagePackCacheDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".agentsam", "runtime", "language-packs")
}
