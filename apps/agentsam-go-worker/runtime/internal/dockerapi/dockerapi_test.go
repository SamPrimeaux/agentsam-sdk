package dockerapi

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fakeEngine serves just enough of the Docker Engine API over a unix socket.
func fakeEngine(t *testing.T, written *[]byte) *Client {
	t.Helper()
	sock := filepath.Join(t.TempDir(), "d.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Skip("unix sockets unavailable")
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/version", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, `{"Version":"27.0.1"}`) })
	mux.HandleFunc("/containers/json", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `[{"Id":"abc","Names":["/cad"],"Image":"img","State":"running","Status":"Up"}]`)
	})
	var execArgv []string
	mux.HandleFunc("/containers/cad/exec", func(w http.ResponseWriter, r *http.Request) {
		var b struct{ Cmd []string }
		json.NewDecoder(r.Body).Decode(&b)
		execArgv = b.Cmd
		io.WriteString(w, `{"Id":"e1"}`)
	})
	mux.HandleFunc("/exec/e1/start", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") })
	mux.HandleFunc("/exec/e1/json", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"ExitCode":0,"Argv":"`+strings.Join(execArgv, " ")+`"}`)
	})
	mux.HandleFunc("/containers/cad/start", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
	mux.HandleFunc("/containers/cad/archive", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("path")
		switch r.Method {
		case http.MethodHead:
			st, _ := json.Marshal(map[string]any{"mode": 0o755})
			w.Header().Set("X-Docker-Container-Path-Stat", base64.StdEncoding.EncodeToString(st))
		case http.MethodPut:
			tr := tar.NewReader(r.Body)
			h, _ := tr.Next()
			*written, _ = io.ReadAll(tr)
			if p != "/app" || (h.Name != "server.py" && h.Name != "new/") {
				w.WriteHeader(400)
			}
		case http.MethodGet:
			var buf bytes.Buffer
			tw := tar.NewWriter(&buf)
			switch p {
			case "/app":
				tw.WriteHeader(&tar.Header{Name: "app/", Typeflag: tar.TypeDir, Mode: 0o755})
				tw.WriteHeader(&tar.Header{Name: "app/server.py", Typeflag: tar.TypeReg, Size: 5, Mode: 0o644})
				tw.Write([]byte("hello"))
				tw.WriteHeader(&tar.Header{Name: "app/sub/", Typeflag: tar.TypeDir, Mode: 0o755})
				tw.WriteHeader(&tar.Header{Name: "app/sub/deep.txt", Typeflag: tar.TypeReg, Size: 1, Mode: 0o644})
				tw.Write([]byte("x"))
			case "/app/server.py":
				tw.WriteHeader(&tar.Header{Name: "server.py", Typeflag: tar.TypeReg, Size: 5, Mode: 0o644})
				tw.Write([]byte("hello"))
			default:
				w.WriteHeader(404)
				io.WriteString(w, `{"message":"no such path"}`)
				return
			}
			tw.Close()
			w.Write(buf.Bytes())
		}
	})
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: time.Second}
	go srv.Serve(ln)
	t.Cleanup(func() { srv.Close(); os.Remove(sock) })
	return NewClient(sock)
}

func TestClientFileOperations(t *testing.T) {
	var written []byte
	c := fakeEngine(t, &written)
	ctx := context.Background()

	if v, err := c.Version(ctx); err != nil || v != "27.0.1" {
		t.Fatalf("version %q %v", v, err)
	}
	entries, _, err := c.List(ctx, "cad", "/app")
	if err != nil || len(entries) != 2 {
		t.Fatalf("list should return direct children only, got %v %v", entries, err)
	}
	if entries[0].Name != "server.py" || entries[0].Type != "file" || entries[1].Name != "sub" || entries[1].Type != "dir" {
		t.Fatalf("unexpected entries %+v", entries)
	}
	data, err := c.Read(ctx, "cad", "/app/server.py")
	if err != nil || string(data) != "hello" {
		t.Fatalf("read %q %v", data, err)
	}
	if err := c.Write(ctx, "cad", "/app/server.py", []byte("patched"), c.Stat(ctx, "cad", "/app/server.py")); err != nil || string(written) != "patched" {
		t.Fatalf("write %q %v", written, err)
	}
	if _, err := c.Read(ctx, "cad", "/missing"); err == nil || !strings.Contains(err.Error(), "no such path") {
		t.Fatalf("expected engine error, got %v", err)
	}
	if err := c.Write(ctx, "cad", "/app/big", make([]byte, MaxFileBytes+1), 0); err != ErrTooLarge {
		t.Fatalf("expected ErrTooLarge, got %v", err)
	}
}

func TestHandlerAuthValidationAndRoutes(t *testing.T) {
	var written []byte
	c := fakeEngine(t, &written)
	allow := false
	h := Handler(func(*http.Request) bool { return allow }, func() (*Client, error) { return c, nil })

	do := func(method, path, body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(body)))
		return rec
	}
	if rec := do("POST", "/v1/docker/containers", "{}"); rec.Code != 401 {
		t.Fatalf("unauthenticated must be 401, got %d", rec.Code)
	}
	allow = true
	if rec := do("POST", "/v1/docker/files/read", `{"container":"--privileged","path":"/a"}`); rec.Code != 400 {
		t.Fatalf("flag-like container must be rejected, got %d", rec.Code)
	}
	if rec := do("POST", "/v1/docker/files/read", `{"container":"cad","path":"relative"}`); rec.Code != 400 {
		t.Fatalf("relative path must be rejected, got %d", rec.Code)
	}
	rec := do("POST", "/v1/docker/files/read", `{"container":"cad","path":"/app/server.py"}`)
	var out struct {
		OK      bool   `json:"ok"`
		Content string `json:"content"`
	}
	json.Unmarshal(rec.Body.Bytes(), &out)
	if rec.Code != 200 || !out.OK || out.Content != "hello" {
		t.Fatalf("read failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = do("POST", "/v1/docker/files/write", `{"container":"cad","path":"/app/server.py","content":"patched"}`)
	if rec.Code != 200 || string(written) != "patched" {
		t.Fatalf("write failed: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do("POST", "/v1/docker/start", `{"container":"cad"}`); rec.Code != 200 {
		t.Fatalf("start failed: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do("GET", "/v1/docker/ping", ""); rec.Code != 200 {
		t.Fatalf("ping failed: %d", rec.Code)
	}
	if rec := do("POST", "/v1/docker/nope", "{}"); rec.Code != 404 {
		t.Fatalf("unknown action must 404, got %d", rec.Code)
	}
}

func TestRenameDeleteMkdirUseArgvNotShell(t *testing.T) {
	var written []byte
	c := fakeEngine(t, &written)
	ctx := context.Background()
	if err := c.Move(ctx, "cad", "/app/a b", "/app/c; rm -rf /"); err != nil {
		t.Fatal(err)
	}
	if err := c.Remove(ctx, "cad", "/", true); err == nil {
		t.Fatal("removing root must be refused")
	}
	if err := c.Remove(ctx, "cad", "/app/old", true); err != nil {
		t.Fatal(err)
	}
	if err := c.Mkdir(ctx, "cad", "/app/new"); err != nil {
		t.Fatal(err)
	}
}
