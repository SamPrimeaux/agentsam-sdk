package execapi

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

// PTYAuthChecker verifies the pairing token carried on the WS handshake
// (browsers can't set custom headers on a WS upgrade, so it travels as
// ?token=... on the query string instead).
type PTYAuthChecker func(token string) bool

// controlMessage is a JSON text frame from the client; anything else on the
// wire is treated as raw binary keystrokes to write to the PTY.
type controlMessage struct {
	Type string `json:"type"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// Origin isn't the security boundary here — the pairing token is.
	// Rejecting on Origin would also break local file:// / packaged UIs.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// PTYHandler returns the GET /v1/pty (WebSocket) handler.
func PTYHandler(checkAuth PTYAuthChecker) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		token := r.URL.Query().Get("token")
		if !checkAuth(token) {
			http.Error(w, "missing or invalid pairing token", http.StatusUnauthorized)
			return
		}
		if runtime.GOOS == "windows" {
			http.Error(w, "pty not supported on this platform yet", http.StatusNotImplemented)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("pty: websocket upgrade failed: %v", err)
			return
		}
		defer conn.Close()

		shell := strings.TrimSpace(os.Getenv("SHELL"))
		if shell == "" {
			shell = "/bin/bash"
		}
		cwd := strings.TrimSpace(r.URL.Query().Get("cwd"))

		cmd := exec.Command(shell)
		if cwd != "" {
			cmd.Dir = cwd
		}
		cmd.Env = append(os.Environ(), "TERM=xterm-256color")

		ptmx, err := pty.Start(cmd)
		if err != nil {
			_ = conn.WriteMessage(websocket.TextMessage, mustJSON(map[string]any{
				"type": "error", "message": "failed to start pty: " + err.Error(),
			}))
			return
		}
		defer func() { _ = ptmx.Close() }()

		var writeMu sync.Mutex
		done := make(chan struct{})
		var once sync.Once
		closeDone := func() { once.Do(func() { close(done) }) }

		// PTY output -> WebSocket
		go func() {
			buf := make([]byte, 8192)
			for {
				n, err := ptmx.Read(buf)
				if n > 0 {
					writeMu.Lock()
					werr := conn.WriteMessage(websocket.BinaryMessage, buf[:n])
					writeMu.Unlock()
					if werr != nil {
						closeDone()
						return
					}
				}
				if err != nil {
					if err != io.EOF {
						log.Printf("pty: read error: %v", err)
					}
					closeDone()
					return
				}
			}
		}()

		// Exit code -> WebSocket, then close
		go func() {
			werr := cmd.Wait()
			exitCode := 0
			if werr != nil {
				if ee, ok := werr.(*exec.ExitError); ok {
					exitCode = ee.ExitCode()
				} else {
					exitCode = -1
				}
			}
			writeMu.Lock()
			_ = conn.WriteMessage(websocket.TextMessage, mustJSON(map[string]any{
				"type": "exit", "exit_code": exitCode,
			}))
			writeMu.Unlock()
			closeDone()
		}()

		// WebSocket -> PTY input / resize control
		go func() {
			for {
				msgType, data, err := conn.ReadMessage()
				if err != nil {
					closeDone()
					return
				}
				switch msgType {
				case websocket.BinaryMessage:
					if _, werr := ptmx.Write(data); werr != nil {
						closeDone()
						return
					}
				case websocket.TextMessage:
					var ctl controlMessage
					if jsonErr := json.Unmarshal(data, &ctl); jsonErr == nil && ctl.Type == "resize" {
						if ctl.Cols > 0 && ctl.Rows > 0 {
							_ = pty.Setsize(ptmx, &pty.Winsize{
								Cols: uint16(ctl.Cols),
								Rows: uint16(ctl.Rows),
							})
						}
						continue
					}
					// Not a recognized control message: browsers send plain
					// keystrokes as text frames (WebSocket.send(string)), so
					// treat anything that isn't valid {"type":"resize",...}
					// as raw stdin, same as a binary frame.
					if _, werr := ptmx.Write(data); werr != nil {
						closeDone()
						return
					}
				}
			}
		}()

		select {
		case <-done:
		case <-time.After(24 * time.Hour): // hard ceiling, never leak sessions forever
		}
		_ = cmd.Process.Kill()
	}
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte(`{"type":"error","message":"internal json error"}`)
	}
	return b
}
