package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/inneranimalmedia/agentsam-go-worker/internal/health"
	"github.com/inneranimalmedia/agentsam-go-worker/internal/runtimeinfo"
)

// agentsamd — AgentSam machine/runtime daemon (local host).
// Distinct from agentsam-go-worker (Cloudflare SERVICE).
// Speaks agentsam.runtime.v1 for identity/health/capabilities (MVP).

func main() {
	listen := flag.String("listen", envOr("AGENTSAMD_LISTEN", "127.0.0.1:18765"), "HTTP listen address")
	flag.Parse()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":             true,
			"schema":         "agentsam.runtime.v1",
			"implementation": "agentsamd",
			"role":           "machine",
			"language":       "go",
			"version":        "0.1.0",
			"service":        "agentsamd",
			"runtime":        "go",
			"target":         "local",
			"build": map[string]any{
				"go":       health.GoVersion(),
				"built_at": time.Now().UTC().Format(time.RFC3339),
			},
		})
	})
	mux.HandleFunc("/v1/runtime", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		snap := runtimeinfo.Snapshot()
		writeJSON(w, http.StatusOK, map[string]any{
			"schema": "agentsam.runtime.v1",
			"runtime": map[string]any{
				"implementation": "agentsamd",
				"language":       "go",
				"version":        "0.1.0",
				"go_version":     snap.GoVersion,
			},
			"system": map[string]any{
				"os":   runtime.GOOS,
				"arch": runtime.GOARCH,
				"cpus": runtime.NumCPU(),
			},
			"capabilities": map[string]any{
				"exec":                 true,
				"pty":                  runtime.GOOS != "windows",
				"filesystem":           true,
				"process":              true,
				"git":                  true,
				"ports":                true,
				"hash":                 true,
				"inspect":              true,
				"language.typescript":  "ready",
				"language.javascript":  "ready",
				"language.json":        "ready",
				"language.html":        "ready",
				"language.css":         "ready",
				"language.go":          "missing",
				"language.rust":        "missing",
				"language.python":      "missing",
			},
			"status": "online",
		})
	})
	mux.HandleFunc("/v1/capabilities", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		refreshLangPackStatus()
		langMu.Lock()
		caps := map[string]any{
			"exec":       true,
			"pty":        runtime.GOOS != "windows",
			"filesystem": true,
			"process":    true,
			"hash":       true,
			"inspect":    true,
		}
		for k, v := range langState {
			caps[k] = v.Status
		}
		langMu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{
			"schema":       "agentsam.runtime.v1",
			"capabilities": caps,
		})
	})
	mux.HandleFunc("/v1/language/packs", handleLanguagePacks)
	mux.HandleFunc("/v1/language/packs/install", handleLanguagePackInstall)

	server := &http.Server{
		Addr:              *listen,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("agentsamd listening on http://%s (agentsam.runtime.v1)", *listen)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	_ = server.Close()
	fmt.Fprintln(os.Stderr, "agentsamd stopped")
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
