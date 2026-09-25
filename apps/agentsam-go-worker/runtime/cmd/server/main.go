package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/inneranimalmedia/agentsam-go-worker/internal/hashop"
	"github.com/inneranimalmedia/agentsam-go-worker/internal/health"
	"github.com/inneranimalmedia/agentsam-go-worker/internal/inspect"
	"github.com/inneranimalmedia/agentsam-go-worker/internal/runtimeinfo"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	target := os.Getenv("AGENTSAM_TARGET")
	if target == "" {
		target = "cloudflare"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		writeJSON(w, http.StatusOK, health.Snapshot(target))
	})
	mux.HandleFunc("/v1/runtime", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		writeJSON(w, http.StatusOK, runtimeinfo.Snapshot())
	})
	mux.HandleFunc("/v1/capabilities", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"schema":       "agentsam.go-capabilities.v1",
			"capabilities": runtimeinfo.Snapshot().Capabilities,
		})
	})
	mux.HandleFunc("/v1/hash", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		var req hashop.Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid_json")
			return
		}
		res, err := hashop.Compute(req)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, res)
	})
	mux.HandleFunc("/v1/inspect", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		var req inspect.Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid_json")
			return
		}
		if req.Files == nil {
			writeErr(w, http.StatusBadRequest, "files_required")
			return
		}
		writeJSON(w, http.StatusOK, inspect.Analyze(req))
	})

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("agentsam-go-worker listening on :%s target=%s", port, target)
	log.Fatal(srv.ListenAndServe())
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]any{"ok": false, "error": code})
}
