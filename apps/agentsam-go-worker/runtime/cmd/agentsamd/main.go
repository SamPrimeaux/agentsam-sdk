// agentsamd — AgentSam machine/runtime daemon (local computer).
// Shares go-worker runtime core (health/runtime/capabilities/hash/inspect).
// Distinct product from agentsam-go-worker (hosted SERVICE).
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/inneranimalmedia/agentsam-go-worker/internal/agentserror"
	"github.com/inneranimalmedia/agentsam-go-worker/internal/hashop"
	"github.com/inneranimalmedia/agentsam-go-worker/internal/health"
	"github.com/inneranimalmedia/agentsam-go-worker/internal/inspect"
	"github.com/inneranimalmedia/agentsam-go-worker/internal/runtimeinfo"
)

const (
	daemonName    = "agentsamd"
	daemonVersion = "0.1.0"
	protocolSchema = "agentsam.runtime.v1"
)

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "version", "--version", "-V":
			fmt.Printf("%s %s (%s/%s)\n", daemonName, daemonVersion, runtime.GOOS, runtime.GOARCH)
			return
		case "enroll":
			os.Exit(runEnroll(os.Args[2:]))
		case "serve", "run", "start":
			os.Exit(runServe(os.Args[2:]))
		case "help", "--help", "-h":
			printHelp()
			return
		}
	}
	os.Exit(runServe(os.Args[1:]))
}

func printHelp() {
	fmt.Print(`agentsamd — AgentSam machine runtime daemon

  agentsamd                 start daemon (default port 8788)
  agentsamd serve           same
  agentsamd enroll --token <enrollment_token>
  agentsamd version

Protocol: agentsam.runtime.v1
Adapter:  runtime_adapter=agentsamd
Env:      PORT, AGENTSAM_API_BASE, IAM_CONNECTION_KEY, AGENTSAM_HOME
`)
}

func runServe(_ []string) int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8788"
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
		snap := health.Snapshot(target)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":       snap.OK,
			"service":  daemonName,
			"runtime":  "go",
			"version":  daemonVersion,
			"protocol": protocolSchema,
			"adapter":  "agentsamd",
			"target":   snap.Target,
			"build":    snap.Build,
		})
	})
	mux.HandleFunc("/v1/runtime", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "unsupported_operation", "Method not allowed")
			return
		}
		info := runtimeinfo.Snapshot()
		writeJSON(w, http.StatusOK, map[string]any{
			"schema":       protocolSchema,
			"service":      daemonName,
			"adapter":      "agentsamd",
			"capabilities": info.Capabilities,
			"runtime":      info,
		})
	})
	mux.HandleFunc("/v1/capabilities", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "unsupported_operation", "Method not allowed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"schema":       "agentsam.runtime.v1.capabilities",
			"adapter":      "agentsamd",
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
		log.Printf("%s listening on :%s protocol=%s adapter=agentsamd", daemonName, port, protocolSchema)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("%s server failed: %v", daemonName, err)
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("%s graceful shutdown failed: %v", daemonName, err)
			_ = srv.Close()
		}
		if err := <-errCh; err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("%s shutdown server error: %v", daemonName, err)
		}
	}
	return 0
}

func runEnroll(args []string) int {
	token := ""
	for i := 0; i < len(args); i++ {
		if args[i] == "--token" && i+1 < len(args) {
			token = args[i+1]
			i++
		} else if strings.HasPrefix(args[i], "--token=") {
			token = strings.TrimPrefix(args[i], "--token=")
		}
	}
	if token == "" {
		fmt.Fprintln(os.Stderr, "agentsamd enroll: --token <enrollment_token> required")
		return 2
	}
	base := strings.TrimRight(os.Getenv("AGENTSAM_API_BASE"), "/")
	if base == "" {
		base = "https://inneranimalmedia.com"
	}
	body := map[string]any{
		"enrollment_token": token,
		"runtime_adapter":  "agentsamd",
		"protocol":         protocolSchema,
		"platform":         runtime.GOOS,
		"arch":             runtime.GOARCH,
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, base+"/api/terminal/connections/enroll", strings.NewReader(string(raw)))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "agentsamd/"+daemonVersion)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer res.Body.Close()
	var payload map[string]any
	_ = json.NewDecoder(res.Body).Decode(&payload)
	if res.StatusCode >= 300 || payload["ok"] == false {
		fmt.Fprintf(os.Stderr, "enroll failed: status=%d body=%v\n", res.StatusCode, payload)
		return 1
	}
	home := os.Getenv("AGENTSAM_HOME")
	if home == "" {
		home, _ = os.UserHomeDir()
		home = filepath.Join(home, ".agentsam")
	}
	profileDir := filepath.Join(home, "runtime", "profiles")
	_ = os.MkdirAll(profileDir, 0o700)
	outPath := filepath.Join(profileDir, "default.env")
	connKey, _ := payload["connection_token"].(string)
	if connKey == "" {
		connKey, _ = payload["iam_connection_key"].(string)
	}
	lines := []string{
		"# agentsamd enrollment — do not commit",
		"AGENTSAM_RUNTIME_ADAPTER=agentsamd",
		"AGENTSAM_RUNTIME_PROTOCOL=" + protocolSchema,
	}
	if connKey != "" {
		lines = append(lines, "IAM_CONNECTION_KEY="+connKey)
	}
	if id, ok := payload["connection_id"].(string); ok && id != "" {
		lines = append(lines, "AGENTSAM_CONNECTION_ID="+id)
	}
	if id, ok := payload["instance_id"].(string); ok && id != "" {
		lines = append(lines, "AGENTSAM_INSTANCE_ID="+id)
	}
	if err := os.WriteFile(outPath, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	fmt.Printf("enrolled agentsamd → %s\n", outPath)
	return 0
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, status int, reason, message string) {
	writeJSON(w, status, agentserror.New(reason, message, status))
}
