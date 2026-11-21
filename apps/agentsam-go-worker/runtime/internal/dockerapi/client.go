// Package dockerapi gives agentsamd a native Docker Engine client so browsers
// can browse and edit container files without the Docker CLI or stdin.
// It talks to the engine socket directly and uses the archive endpoints for
// file operations.
package dockerapi

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	MaxFileBytes   = 5 << 20  // read/write cap per file
	maxListBytes   = 32 << 20 // archive bytes scanned for one directory listing
	maxListEntries = 2000
)

var nameRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]*$`)

// ValidName reports whether s is a safe container id or name.
func ValidName(s string) bool { return len(s) <= 128 && nameRe.MatchString(s) }

// ValidPath requires an absolute, NUL-free container path.
func ValidPath(p string) bool {
	return strings.HasPrefix(p, "/") && !strings.ContainsRune(p, 0) && len(p) <= 4096
}

// DiscoverSocket finds the engine socket: DOCKER_HOST first, then well-known
// locations for Docker Desktop, Colima and Rancher Desktop.
func DiscoverSocket() (string, error) {
	if host := strings.TrimSpace(os.Getenv("DOCKER_HOST")); strings.HasPrefix(host, "unix://") {
		return strings.TrimPrefix(host, "unix://"), nil
	}
	home, _ := os.UserHomeDir()
	candidates := []string{"/var/run/docker.sock"}
	if home != "" {
		candidates = append(candidates,
			filepath.Join(home, ".docker", "run", "docker.sock"),
			filepath.Join(home, ".colima", "default", "docker.sock"),
			filepath.Join(home, ".rd", "docker.sock"),
		)
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && st.Mode()&os.ModeSocket != 0 {
			return c, nil
		}
	}
	return "", errors.New("no Docker engine socket found")
}

// Client is a minimal Docker Engine API client over a unix socket.
type Client struct {
	http *http.Client
}

func NewClient(socket string) *Client {
	return &Client{http: &http.Client{Transport: &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", socket)
		},
	}}}
}

func (c *Client) do(ctx context.Context, method, p string, q url.Values, body io.Reader, ct string) (*http.Response, error) {
	u := "http://docker" + p
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return nil, err
	}
	if ct != "" {
		req.Header.Set("Content-Type", ct)
	}
	return c.http.Do(req)
}

func (c *Client) json(ctx context.Context, method, p string, q url.Values, out any) error {
	resp, err := c.do(ctx, method, p, q, nil, "")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return &EngineError{Status: resp.StatusCode, Message: engineMessage(b)}
	}
	if out == nil {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// EngineError carries the engine's HTTP status and message.
type EngineError struct {
	Status  int
	Message string
}

func (e *EngineError) Error() string { return fmt.Sprintf("docker engine %d: %s", e.Status, e.Message) }

func engineMessage(b []byte) string {
	var m struct {
		Message string `json:"message"`
	}
	if json.Unmarshal(b, &m) == nil && m.Message != "" {
		return m.Message
	}
	return strings.TrimSpace(string(b))
}

// Version returns the engine version string.
func (c *Client) Version(ctx context.Context) (string, error) {
	var v struct {
		Version string `json:"Version"`
	}
	if err := c.json(ctx, http.MethodGet, "/version", nil, &v); err != nil {
		return "", err
	}
	return v.Version, nil
}

type Container struct {
	ID     string   `json:"id"`
	Names  []string `json:"names"`
	Image  string   `json:"image"`
	State  string   `json:"state"`
	Status string   `json:"status"`
}

func (c *Client) Containers(ctx context.Context) ([]Container, error) {
	var raw []struct {
		ID, Image, State, Status string
		Names                    []string
	}
	if err := c.json(ctx, http.MethodGet, "/containers/json", url.Values{"all": {"1"}}, &raw); err != nil {
		return nil, err
	}
	out := make([]Container, 0, len(raw))
	for _, r := range raw {
		names := make([]string, 0, len(r.Names))
		for _, n := range r.Names {
			names = append(names, strings.TrimPrefix(n, "/"))
		}
		out = append(out, Container{ID: r.ID, Names: names, Image: r.Image, State: r.State, Status: r.Status})
	}
	return out, nil
}

// Lifecycle runs start, stop or restart on a container.
func (c *Client) Lifecycle(ctx context.Context, container, action string) error {
	switch action {
	case "start", "stop", "restart":
	default:
		return fmt.Errorf("unsupported lifecycle action %q", action)
	}
	return c.json(ctx, http.MethodPost, "/containers/"+container+"/"+action, nil, nil)
}

type Entry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Type  string `json:"type"` // file | dir | symlink | other
	Size  int64  `json:"size"`
	Mode  string `json:"mode"`
	MTime int64  `json:"mtime"`
}

// List returns the direct children of a container directory.
func (c *Client) List(ctx context.Context, container, dir string) ([]Entry, bool, error) {
	resp, err := c.do(ctx, http.MethodGet, "/containers/"+container+"/archive", url.Values{"path": {dir}}, nil, "")
	if err != nil {
		return nil, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, false, &EngineError{Status: resp.StatusCode, Message: engineMessage(b)}
	}
	base := path.Base(path.Clean(dir))
	lr := &io.LimitedReader{R: resp.Body, N: maxListBytes}
	tr := tar.NewReader(lr)
	var out []Entry
	truncated := false
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			// The cap cuts the stream mid-archive; return what was scanned.
			if lr.N <= 0 {
				truncated = true
				break
			}
			return nil, false, err
		}
		rel := strings.TrimPrefix(strings.TrimSuffix(h.Name, "/"), base)
		rel = strings.TrimPrefix(rel, "/")
		if rel == "" || strings.Contains(rel, "/") {
			continue // the directory itself or a deeper descendant
		}
		kind := "other"
		switch h.Typeflag {
		case tar.TypeReg:
			kind = "file"
		case tar.TypeDir:
			kind = "dir"
		case tar.TypeSymlink:
			kind = "symlink"
		}
		out = append(out, Entry{
			Name: rel, Path: path.Join(dir, rel), Type: kind, Size: h.Size,
			Mode: fmt.Sprintf("%04o", h.Mode&0o7777), MTime: h.ModTime.Unix(),
		})
		if len(out) >= maxListEntries {
			truncated = true
			break
		}
	}
	return out, truncated, nil
}

// ErrTooLarge is returned when a file exceeds MaxFileBytes.
var ErrTooLarge = errors.New("file is larger than the 5 MB editor limit")

// Read returns a single file's bytes.
func (c *Client) Read(ctx context.Context, container, file string) ([]byte, error) {
	resp, err := c.do(ctx, http.MethodGet, "/containers/"+container+"/archive", url.Values{"path": {file}}, nil, "")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, &EngineError{Status: resp.StatusCode, Message: engineMessage(b)}
	}
	tr := tar.NewReader(resp.Body)
	h, err := tr.Next()
	if err != nil {
		return nil, err
	}
	if h.Typeflag != tar.TypeReg {
		return nil, errors.New("path is not a regular file")
	}
	if h.Size > MaxFileBytes {
		return nil, ErrTooLarge
	}
	return io.ReadAll(io.LimitReader(tr, MaxFileBytes+1))
}

// Write creates or replaces a single file, preserving the mode when mode > 0.
func (c *Client) Write(ctx context.Context, container, file string, data []byte, mode int64) error {
	if len(data) > MaxFileBytes {
		return ErrTooLarge
	}
	if mode <= 0 {
		mode = 0o644
	}
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	if err := tw.WriteHeader(&tar.Header{Name: path.Base(file), Mode: mode, Size: int64(len(data)), ModTime: time.Now(), Typeflag: tar.TypeReg}); err != nil {
		return err
	}
	if _, err := tw.Write(data); err != nil {
		return err
	}
	if err := tw.Close(); err != nil {
		return err
	}
	resp, err := c.do(ctx, http.MethodPut, "/containers/"+container+"/archive", url.Values{"path": {path.Dir(file)}}, &buf, "application/x-tar")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return &EngineError{Status: resp.StatusCode, Message: engineMessage(b)}
	}
	return nil
}

// Stat returns the file's mode so edits keep permissions; 0 when unknown.
func (c *Client) Stat(ctx context.Context, container, file string) int64 {
	resp, err := c.do(ctx, http.MethodHead, "/containers/"+container+"/archive", url.Values{"path": {file}}, nil, "")
	if err != nil {
		return 0
	}
	defer resp.Body.Close()
	raw := resp.Header.Get("X-Docker-Container-Path-Stat")
	if raw == "" {
		return 0
	}
	dec, err := decodeB64(raw)
	if err != nil {
		return 0
	}
	var st struct {
		Mode uint32 `json:"mode"`
	}
	if json.Unmarshal(dec, &st) != nil {
		return 0
	}
	return int64(st.Mode & 0o7777)
}

// Mkdir creates a directory (and nothing else) through the archive endpoint.
func (c *Client) Mkdir(ctx context.Context, container, dir string) error {
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	if err := tw.WriteHeader(&tar.Header{Name: path.Base(dir) + "/", Mode: 0o755, ModTime: time.Now(), Typeflag: tar.TypeDir}); err != nil {
		return err
	}
	if err := tw.Close(); err != nil {
		return err
	}
	resp, err := c.do(ctx, http.MethodPut, "/containers/"+container+"/archive", url.Values{"path": {path.Dir(dir)}}, &buf, "application/x-tar")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return &EngineError{Status: resp.StatusCode, Message: engineMessage(b)}
	}
	return nil
}

// Exec runs argv inside a container (no shell) and returns its exit code.
func (c *Client) Exec(ctx context.Context, container string, argv []string) (int, error) {
	body, _ := json.Marshal(map[string]any{"Cmd": argv, "AttachStdout": true, "AttachStderr": true})
	resp, err := c.do(ctx, http.MethodPost, "/containers/"+container+"/exec", nil, bytes.NewReader(body), "application/json")
	if err != nil {
		return -1, err
	}
	var created struct {
		ID string `json:"Id"`
	}
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		return -1, &EngineError{Status: resp.StatusCode, Message: engineMessage(b)}
	}
	if err := json.Unmarshal(b, &created); err != nil || created.ID == "" {
		return -1, errors.New("docker exec create returned no id")
	}
	start, _ := json.Marshal(map[string]any{"Detach": false, "Tty": false})
	resp, err = c.do(ctx, http.MethodPost, "/exec/"+created.ID+"/start", nil, bytes.NewReader(start), "application/json")
	if err != nil {
		return -1, err
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
	resp.Body.Close()
	var info struct {
		ExitCode int `json:"ExitCode"`
	}
	if err := c.json(ctx, http.MethodGet, "/exec/"+created.ID+"/json", nil, &info); err != nil {
		return -1, err
	}
	return info.ExitCode, nil
}

// Move renames a file or folder inside the container.
func (c *Client) Move(ctx context.Context, container, from, to string) error {
	code, err := c.Exec(ctx, container, []string{"mv", "--", from, to})
	if err != nil {
		return err
	}
	if code != 0 {
		return fmt.Errorf("mv exited with code %d", code)
	}
	return nil
}

// Remove deletes a file, or a folder when recursive is true.
func (c *Client) Remove(ctx context.Context, container, target string, recursive bool) error {
	if path.Clean(target) == "/" {
		return errors.New("refusing to remove the container root")
	}
	argv := []string{"rm", "--", target}
	if recursive {
		argv = []string{"rm", "-r", "--", target}
	}
	code, err := c.Exec(ctx, container, argv)
	if err != nil {
		return err
	}
	if code != 0 {
		return fmt.Errorf("rm exited with code %d", code)
	}
	return nil
}
