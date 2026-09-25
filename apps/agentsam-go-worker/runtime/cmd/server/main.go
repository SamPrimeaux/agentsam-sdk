package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/inneranimalmedia/agentsam-go-worker/internal/agentserror"
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
		target = "local"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "unsupported_operation", "Method not allowed")
			return
		}
		writeJSON(w, http.StatusOK, health.Snapshot(target))
	})
	mux.HandleFunc("/v1/runtime", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "unsupported_operation", "Method not allowed")
			return
		}
		writeJSON(w, http.StatusOK, runtimeinfo.Snapshot())
	})
	mux.HandleFunc("/v1/capabilities", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "unsupported_operation", "Method not allowed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"schema":       "agentsam.go-capabilities.v1",
			"capabilities": runtimeinfo.Snapshot().Capabilities,
		})
	})
	mux.HandleFunc("/v1/hash", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "unsupported_operation", "Method not allowed")
			return
		}
		var req hashop.Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "input_invalid", "Invalid JSON request")
			return
		}
		res, err := hashop.Compute(req)
		if err != nil {
			reason := "input_invalid"
			if strings.Contains(err.Error(), "unsupported algorithm") {
				reason = "unsupported_operation"
			}
			writeErr(w, http.StatusBadRequest, reason, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, res)
	})
	mux.HandleFunc("/v1/inspect", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "unsupported_operation", "Method not allowed")
			return
		}
		var req inspect.Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "input_invalid", "Invalid JSON request")
			return
		}
		if req.Files == nil {
			writeErr(w, http.StatusBadRequest, "input_invalid", "files is required")
			return
		}
		writeJSON(w, http.StatusOK, inspect.Analyze(req))
	})

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errCh := make(chan error, 1)
	go func() {
		log.Printf("agentsam-go-worker listening on :%s target=%s", port, target)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("agentsam-go-worker server failed: %v", err)
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("agentsam-go-worker graceful shutdown failed: %v", err)
			_ = srv.Close()
		}
		if err := <-errCh; err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("agentsam-go-worker shutdown server error: %v", err)
		}
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, status int, reason, message string) {
	writeJSON(w, status, agentserror.New(reason, message, status))
}
