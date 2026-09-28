// Package execapi implements agentsamd's real exec and PTY surfaces.
package execapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"github.com/inneranimalmedia/agentsam-go-worker/internal/agentserror"
	"github.com/inneranimalmedia/agentsam-go-worker/internal/hostpath"
)

const (
	defaultTimeoutMS = 120_000
	maxTimeoutMS     = 600_000
	maxCapturedBytes = 5 << 20 // 5MB per stream, then truncate
)

type execRequest struct {
	Command   string            `json:"command"`
	Args      []string          `json:"args"`
	Cwd       string            `json:"cwd"`
	TimeoutMS int               `json:"timeout_ms"`
	Env       map[string]string `json:"env"`
}

type execResponse struct {
	OK         bool   `json:"ok"`
	ExitCode   int    `json:"exit_code"`
	Stdout     string `json:"stdout"`
	Stderr     string `json:"stderr"`
	Output     string `json:"output"`
	DurationMS int64  `json:"duration_ms"`
	TimedOut   bool   `json:"timed_out"`
}

// capBuffer caps how much of a stream we hold in memory; agentsamd is a
// long-running local daemon, an unbounded buffer from a runaway command is
// a real way to take down someone's machine.
type capBuffer struct {
	buf       bytes.Buffer
	limit     int
	truncated bool
}

func (c *capBuffer) Write(p []byte) (int, error) {
	if c.buf.Len() >= c.limit {
		c.truncated = true
		return len(p), nil // pretend-consume so exec.Cmd doesn't block/error
	}
	remaining := c.limit - c.buf.Len()
	if len(p) > remaining {
		c.buf.Write(p[:remaining])
		c.truncated = true
		return len(p), nil
	}
	return c.buf.Write(p)
}

// AuthChecker verifies the local pairing token from a request header.
type AuthChecker func(r *http.Request) bool

// ExecHandler returns the POST /v1/exec handler.
func ExecHandler(checkAuth AuthChecker) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeErr(w, agentserror.New("unsupported_operation", "method not allowed", http.StatusMethodNotAllowed))
			return
		}
		if !checkAuth(r) {
			writeErr(w, agentserror.New("auth_required", "missing or invalid pairing token", http.StatusUnauthorized))
			return
		}

		var req execRequest
		dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
		if err := dec.Decode(&req); err != nil {
			writeErr(w, agentserror.New("input_invalid", "invalid JSON body", http.StatusBadRequest))
			return
		}
		req.Command = strings.TrimSpace(req.Command)
		if req.Command == "" {
			writeErr(w, agentserror.New("input_invalid", "command is required", http.StatusBadRequest))
			return
		}

		timeout := time.Duration(defaultTimeoutMS) * time.Millisecond
		if req.TimeoutMS > 0 {
			ms := req.TimeoutMS
			if ms > maxTimeoutMS {
				ms = maxTimeoutMS
			}
			timeout = time.Duration(ms) * time.Millisecond
		}

		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()

		bin := hostpath.ResolveCommand(req.Command)
		cmd := exec.CommandContext(ctx, bin, req.Args...)
		if req.Cwd != "" {
			cmd.Dir = req.Cwd
		}
		cmd.Env = hostpath.MergeEnv(req.Env)

		stdout := &capBuffer{limit: maxCapturedBytes}
		stderr := &capBuffer{limit: maxCapturedBytes}
		cmd.Stdout = stdout
		cmd.Stderr = stderr

		start := time.Now()
		runErr := cmd.Run()
		dur := time.Since(start)

		exitCode := 0
		timedOut := false
		if ctx.Err() == context.DeadlineExceeded {
			timedOut = true
			exitCode = -1
		} else if runErr != nil {
			if exitErr, ok := runErr.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				exitCode = -1
			}
		}

		resp := execResponse{
			OK:         exitCode == 0 && !timedOut,
			ExitCode:   exitCode,
			Stdout:     stdout.buf.String(),
			Stderr:     stderr.buf.String(),
			DurationMS: dur.Milliseconds(),
			TimedOut:   timedOut,
		}
		resp.Output = resp.Stdout
		if resp.Output == "" {
			resp.Output = resp.Stderr
		}

		writeJSON(w, http.StatusOK, resp)
	}
}
