package dockerapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/inneranimalmedia/agentsam-go-worker/internal/agentserror"
)

func decodeB64(s string) ([]byte, error) { return base64.StdEncoding.DecodeString(s) }

// AuthChecker verifies the local pairing token.
type AuthChecker func(r *http.Request) bool

type request struct {
	Container string `json:"container"`
	Path      string `json:"path"`
	Content   string `json:"content"`
	Encoding  string `json:"encoding"` // utf8 (default) | base64
	Dest      string `json:"destination"`
	Recursive bool   `json:"recursive"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, reason, msg string, status int) {
	env := agentserror.New(reason, msg, status)
	writeJSON(w, env.HTTPStatus, env)
}

// Handler serves /v1/docker/<action>. connect is called per request so a
// Docker engine that starts later is picked up without restarting agentsamd.
func Handler(checkAuth AuthChecker, connect func() (*Client, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !checkAuth(r) {
			fail(w, "auth_required", "missing or invalid pairing token", http.StatusUnauthorized)
			return
		}
		action := strings.Trim(strings.TrimPrefix(r.URL.Path, "/v1/docker/"), "/")
		var req request
		if r.Method == http.MethodPost {
			if err := json.NewDecoder(io.LimitReader(r.Body, 8<<20)).Decode(&req); err != nil && err != io.EOF {
				fail(w, "input_invalid", "invalid JSON body", http.StatusBadRequest)
				return
			}
		} else if r.Method != http.MethodGet {
			fail(w, "unsupported_operation", "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		cl, err := connect()
		if err != nil {
			fail(w, "unsupported_operation", "Docker is not running or its socket was not found", http.StatusServiceUnavailable)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()
		serve(ctx, w, cl, action, req)
	})
}

func engineFail(w http.ResponseWriter, err error) {
	var ee *EngineError
	switch {
	case errors.As(err, &ee):
		status := http.StatusBadGateway
		if ee.Status == http.StatusNotFound {
			status = http.StatusNotFound
		}
		fail(w, "unsupported_operation", ee.Message, status)
	case errors.Is(err, ErrTooLarge):
		fail(w, "input_invalid", err.Error(), http.StatusRequestEntityTooLarge)
	default:
		fail(w, "unsupported_operation", err.Error(), http.StatusBadGateway)
	}
}

func serve(ctx context.Context, w http.ResponseWriter, cl *Client, action string, req request) {
	needContainer := func() bool {
		if !ValidName(req.Container) {
			fail(w, "input_invalid", "container must be a valid name or id", http.StatusBadRequest)
			return false
		}
		return true
	}
	needPath := func() bool {
		if !ValidPath(req.Path) {
			fail(w, "input_invalid", "path must be absolute", http.StatusBadRequest)
			return false
		}
		return true
	}
	switch action {
	case "ping":
		v, err := cl.Version(ctx)
		if err != nil {
			engineFail(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "version": v})
	case "containers":
		list, err := cl.Containers(ctx)
		if err != nil {
			engineFail(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "containers": list})
	case "start", "stop", "restart":
		if !needContainer() {
			return
		}
		if err := cl.Lifecycle(ctx, req.Container, action); err != nil {
			engineFail(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
	case "files/list":
		if !needContainer() || !needPath() {
			return
		}
		entries, truncated, err := cl.List(ctx, req.Container, req.Path)
		if err != nil {
			engineFail(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "entries": entries, "truncated": truncated})
	case "files/read":
		if !needContainer() || !needPath() {
			return
		}
		data, err := cl.Read(ctx, req.Container, req.Path)
		if err != nil {
			engineFail(w, err)
			return
		}
		if utf8.Valid(data) {
			writeJSON(w, 200, map[string]any{"ok": true, "encoding": "utf8", "content": string(data), "size": len(data)})
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "encoding": "base64", "content": base64.StdEncoding.EncodeToString(data), "size": len(data)})
	case "files/write":
		if !needContainer() || !needPath() {
			return
		}
		data := []byte(req.Content)
		if req.Encoding == "base64" {
			var err error
			if data, err = base64.StdEncoding.DecodeString(req.Content); err != nil {
				fail(w, "input_invalid", "content is not valid base64", http.StatusBadRequest)
				return
			}
		}
		if err := cl.Write(ctx, req.Container, req.Path, data, cl.Stat(ctx, req.Container, req.Path)); err != nil {
			engineFail(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "size": len(data)})
	case "files/mkdir":
		if !needContainer() || !needPath() {
			return
		}
		if err := cl.Mkdir(ctx, req.Container, req.Path); err != nil {
			engineFail(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
	case "files/rename":
		if !needContainer() || !needPath() {
			return
		}
		if !ValidPath(req.Dest) {
			fail(w, "input_invalid", "destination must be absolute", http.StatusBadRequest)
			return
		}
		if err := cl.Move(ctx, req.Container, req.Path, req.Dest); err != nil {
			engineFail(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
	case "files/delete":
		if !needContainer() || !needPath() {
			return
		}
		if err := cl.Remove(ctx, req.Container, req.Path, req.Recursive); err != nil {
			engineFail(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
	default:
		fail(w, "unsupported_operation", "unknown docker action", http.StatusNotFound)
	}
}
