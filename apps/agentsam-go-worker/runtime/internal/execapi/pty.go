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
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("pty: websocket upgrade failed: %v", err)
			return
		}
		defer conn.Close()

		cwd := strings.TrimSpace(r.URL.Query().Get("cwd"))
		if runtime.GOOS == "windows" {
			runWindowsShellStream(conn, cwd)
			return
		}

		shell := strings.TrimSpace(os.Getenv("SHELL"))
		if shell == "" {
			shell = "/bin/bash"
		}
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

func windowsShellCommand() (*exec.Cmd, string) {
	if shell := strings.TrimSpace(os.Getenv("AGENTSAM_WINDOWS_SHELL")); shell != "" {
		return exec.Command(shell, "-NoLogo", "-NoProfile"), shell
	}
	if path, err := exec.LookPath("pwsh.exe"); err == nil {
		return exec.Command(path, "-NoLogo", "-NoProfile"), "pwsh"
	}
	if path, err := exec.LookPath("powershell.exe"); err == nil {
		return exec.Command(path, "-NoLogo", "-NoProfile"), "powershell"
	}
	if path := strings.TrimSpace(os.Getenv("ComSpec")); path != "" {
		return exec.Command(path), "cmd"
	}
	return exec.Command("cmd.exe"), "cmd"
}

// runWindowsShellStream provides the same websocket terminal protocol on
// Windows without pretending a Unix PTY exists. It prefers PowerShell 7,
// falls back to Windows PowerShell, then cmd.exe. A future ConPTY adapter can
// replace the process transport without changing the browser/runtime contract.
func runWindowsShellStream(conn *websocket.Conn, cwd string) {
	cmd, shellName := windowsShellCommand()
	if cwd != "" {
		cmd.Dir = cwd
	}
	cmd.Env = os.Environ()

	stdin, err := cmd.StdinPipe()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, mustJSON(map[string]any{"type": "error", "message": "failed to open shell stdin: " + err.Error()}))
		return
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, mustJSON(map[string]any{"type": "error", "message": "failed to open shell stdout: " + err.Error()}))
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, mustJSON(map[string]any{"type": "error", "message": "failed to open shell stderr: " + err.Error()}))
		return
	}
	if err := cmd.Start(); err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, mustJSON(map[string]any{"type": "error", "message": "failed to start Windows shell: " + err.Error()}))
		return
	}

	var writeMu sync.Mutex
	done := make(chan struct{})
	var once sync.Once
	closeDone := func() { once.Do(func() { close(done) }) }

	_ = conn.WriteMessage(websocket.TextMessage, mustJSON(map[string]any{
		"type": "shell", "shell": shellName, "pty": false,
	}))

	copyOutput := func(reader io.Reader) {
		buf := make([]byte, 8192)
		for {
			n, readErr := reader.Read(buf)
			if n > 0 {
				writeMu.Lock()
				writeErr := conn.WriteMessage(websocket.BinaryMessage, buf[:n])
				writeMu.Unlock()
				if writeErr != nil {
					closeDone()
					return
				}
			}
			if readErr != nil {
				if readErr != io.EOF {
					log.Printf("windows shell: read error: %v", readErr)
				}
				return
			}
		}
	}
	go copyOutput(stdout)
	go copyOutput(stderr)

	go func() {
		for {
			msgType, data, readErr := conn.ReadMessage()
			if readErr != nil {
				closeDone()
				return
			}
			if msgType == websocket.TextMessage {
				var ctl controlMessage
				if json.Unmarshal(data, &ctl) == nil && ctl.Type == "resize" {
					// Pipe transport has no terminal-size primitive. ConPTY can
					// consume the same control message when that adapter lands.
					continue
				}
			}
			if msgType == websocket.TextMessage || msgType == websocket.BinaryMessage {
				if _, writeErr := stdin.Write(data); writeErr != nil {
					closeDone()
					return
				}
			}
		}
	}()

	go func() {
		waitErr := cmd.Wait()
		exitCode := 0
		if waitErr != nil {
			if exitErr, ok := waitErr.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				exitCode = -1
			}
		}
		writeMu.Lock()
		_ = conn.WriteMessage(websocket.TextMessage, mustJSON(map[string]any{"type": "exit", "exit_code": exitCode}))
		writeMu.Unlock()
		closeDone()
	}()

	select {
	case <-done:
	case <-time.After(24 * time.Hour):
	}
	_ = stdin.Close()
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
