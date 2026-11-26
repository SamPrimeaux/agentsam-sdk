package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha512"
	"encoding/base64"
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
	"strconv"
	"strings"
	"sync"
	"time"
)

// Device cache for public, static APP packages. The account catalog authorizes
// the package identity; npm owns the published version and tarball integrity.
// No npm CLI, lifecycle script, native executable, or host React import is run.
const maxAppArchive = 256 << 20
const maxAppExpanded = 768 << 20

var appScopePattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var appKeyPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,99}$`)
var appPackagePattern = regexp.MustCompile(`^@inneranimalmedia/[a-z0-9][a-z0-9-]{0,99}$`)
var appVersionPattern = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$`)

type appPackageRequest struct {
	Action  string `json:"action"`
	ID      string `json:"id"`
	Package string `json:"package"`
	Scope   string `json:"scope"`
}
type appPackageReceipt struct {
	ID        string `json:"id"`
	Package   string `json:"package"`
	Version   string `json:"version"`
	Integrity string `json:"integrity"`
	Frontend  string `json:"frontend"`
}
type npmAppRelease struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Dist    struct {
		Tarball   string `json:"tarball"`
		Integrity string `json:"integrity"`
	} `json:"dist"`
}
type appPackageManager struct {
	mu       sync.Mutex
	root     string
	launches map[string]*http.Server
	urls     map[string]string
	roots    map[string]string
}

func newAppPackageManager() *appPackageManager {
	root := os.Getenv("AGENTSAM_HOME")
	if root == "" {
		home, _ := os.UserHomeDir()
		if home != "" {
			root = filepath.Join(home, ".agentsam")
		}
	}
	if root != "" {
		root = filepath.Join(root, "apps")
	}
	return &appPackageManager{root: root, launches: map[string]*http.Server{}, urls: map[string]string{}, roots: map[string]string{}}
}
func npmRegistryURL(raw string) bool {
	u, e := url.Parse(raw)
	return e == nil && u.Scheme == "https" && u.Host == "registry.npmjs.org" && u.User == nil && u.Fragment == ""
}
func appRegistryClient() *http.Client {
	return &http.Client{Timeout: 90 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if len(via) > 3 || !npmRegistryURL(r.URL.String()) {
			return errors.New("untrusted npm redirect")
		}
		return nil
	}}
}
func readLimited(r io.Reader, max int64) ([]byte, error) {
	b, e := io.ReadAll(io.LimitReader(r, max+1))
	if e == nil && int64(len(b)) > max {
		e = errors.New("app artifact exceeds limit")
	}
	return b, e
}
func fetchAppBytes(client *http.Client, raw string, max int64) ([]byte, error) {
	if !npmRegistryURL(raw) {
		return nil, errors.New("untrusted npm URL")
	}
	resp, e := client.Get(raw)
	if e != nil {
		return nil, e
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("npm HTTP %d", resp.StatusCode)
	}
	return readLimited(resp.Body, max)
}
func safeAppPath(raw string) bool {
	return raw != "" && raw != "." && !strings.ContainsAny(raw, "\\\x00:") && !strings.HasPrefix(raw, "/") && path.Clean(raw) == raw && raw != ".." && !strings.HasPrefix(raw, "../")
}
func appIntegrity(raw string, bytes []byte) bool {
	sum := sha512.Sum512(bytes)
	return raw == "sha512-"+base64.StdEncoding.EncodeToString(sum[:])
}
func unpackAppPackage(archive []byte, dest string, req appPackageRequest, release npmAppRelease) (appPackageReceipt, error) {
	var receipt appPackageReceipt
	if !appIntegrity(release.Dist.Integrity, archive) {
		return receipt, errors.New("npm integrity mismatch")
	}
	gz, e := gzip.NewReader(bytes.NewReader(archive))
	if e != nil {
		return receipt, e
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	var expanded int64
	count := 0
	seen := map[string]bool{}
	for {
		h, e := tr.Next()
		if e == io.EOF {
			break
		}
		if e != nil {
			return receipt, e
		}
		count++
		if count > 25000 {
			return receipt, errors.New("too many app files")
		}
		name := strings.TrimSuffix(h.Name, "/")
		if name == "package" && h.Typeflag == tar.TypeDir {
			continue
		}
		if !strings.HasPrefix(name, "package/") {
			return receipt, errors.New("invalid npm archive root")
		}
		rel := strings.TrimPrefix(name, "package/")
		if !safeAppPath(rel) || seen[rel] {
			return receipt, errors.New("unsafe or duplicate app archive path")
		}
		seen[rel] = true
		if h.Typeflag == tar.TypeDir {
			continue
		}
		if h.Typeflag != tar.TypeReg && h.Typeflag != tar.TypeRegA {
			return receipt, errors.New("app archive contains nonregular file")
		}
		if h.Size < 0 || h.Size > maxAppExpanded-expanded {
			return receipt, errors.New("expanded app exceeds limit")
		}
		expanded += h.Size
		target := filepath.Join(dest, filepath.FromSlash(rel))
		if e = os.MkdirAll(filepath.Dir(target), 0700); e != nil {
			return receipt, e
		}
		f, e := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if e != nil {
			return receipt, e
		}
		_, copyErr := io.CopyN(f, tr, h.Size)
		closeErr := f.Close()
		if copyErr != nil {
			return receipt, copyErr
		}
		if closeErr != nil {
			return receipt, closeErr
		}
	}
	var pkg struct {
		Name    string `json:"name"`
		Version string `json:"version"`
	}
	var manifest struct {
		Schema      string `json:"schema"`
		Kind        string `json:"kind"`
		ID          string `json:"id"`
		Package     string `json:"package"`
		Version     string `json:"version"`
		Entrypoints struct {
			Frontend string `json:"frontend"`
		} `json:"entrypoints"`
	}
	for name, target := range map[string]any{"package.json": &pkg, "agentsam.app.json": &manifest} {
		b, e := os.ReadFile(filepath.Join(dest, name))
		if e != nil {
			return receipt, e
		}
		if e = json.Unmarshal(b, target); e != nil {
			return receipt, e
		}
	}
	if pkg.Name != req.Package || pkg.Version != release.Version || manifest.Schema != "agentsam.app.v1" || manifest.Kind != "app" || manifest.ID != req.ID || manifest.Package != req.Package || manifest.Version != release.Version {
		return receipt, errors.New("installed APP identity mismatch")
	}
	frontend := strings.TrimPrefix(manifest.Entrypoints.Frontend, "./")
	if !safeAppPath(frontend) {
		return receipt, errors.New("app has no independent static frontend")
	}
	st, e := os.Stat(filepath.Join(dest, frontend, "index.html"))
	if e != nil || !st.Mode().IsRegular() {
		return receipt, errors.New("static app index missing")
	}
	receipt = appPackageReceipt{ID: req.ID, Package: req.Package, Version: release.Version, Integrity: release.Dist.Integrity, Frontend: frontend}
	return receipt, nil
}
func (m *appPackageManager) current(req appPackageRequest) (appPackageReceipt, string, error) {
	var r appPackageReceipt
	dir := filepath.Join(m.root, req.ID)
	b, e := os.ReadFile(filepath.Join(dir, "current.json"))
	if e != nil {
		return r, "", e
	}
	if e = json.Unmarshal(b, &r); e != nil {
		return r, "", e
	}
	if r.ID != req.ID || r.Package != req.Package || !appVersionPattern.MatchString(r.Version) || !safeAppPath(r.Frontend) || !strings.HasPrefix(r.Integrity, "sha512-") {
		return r, "", errors.New("invalid app receipt")
	}
	root := filepath.Join(dir, "versions", r.Version, r.Frontend)
	st, e := os.Stat(filepath.Join(root, "index.html"))
	if e != nil || !st.Mode().IsRegular() {
		return r, "", errors.New("installed app index missing")
	}
	return r, root, nil
}
func (m *appPackageManager) install(req appPackageRequest) (appPackageReceipt, error) {
	var release npmAppRelease
	var empty appPackageReceipt
	client := appRegistryClient()
	raw, e := fetchAppBytes(client, "https://registry.npmjs.org/"+url.PathEscape(req.Package)+"/latest", 2<<20)
	if e != nil {
		return empty, e
	}
	if e = json.Unmarshal(raw, &release); e != nil {
		return empty, e
	}
	if release.Name != req.Package || !appVersionPattern.MatchString(release.Version) || !strings.HasPrefix(release.Dist.Integrity, "sha512-") {
		return empty, errors.New("invalid npm release")
	}
	if current, _, e := m.current(req); e == nil && current.Version == release.Version && current.Integrity == release.Dist.Integrity {
		return current, nil
	}
	archive, e := fetchAppBytes(client, release.Dist.Tarball, maxAppArchive)
	if e != nil {
		return empty, e
	}
	dir := filepath.Join(m.root, req.ID)
	versions := filepath.Join(dir, "versions")
	if e = os.MkdirAll(versions, 0700); e != nil {
		return empty, e
	}
	stage, e := os.MkdirTemp(versions, ".install-")
	if e != nil {
		return empty, e
	}
	defer os.RemoveAll(stage)
	receipt, e := unpackAppPackage(archive, stage, req, release)
	if e != nil {
		return empty, e
	}
	dest := filepath.Join(versions, release.Version)
	b, e := json.Marshal(receipt)
	if e != nil {
		return empty, e
	}
	if e = os.WriteFile(filepath.Join(stage, ".agentsam-receipt.json"), b, 0600); e != nil {
		return empty, e
	}
	if existing, statErr := os.ReadFile(filepath.Join(dest, ".agentsam-receipt.json")); statErr == nil {
		if !bytes.Equal(existing, b) {
			return empty, errors.New("cached version receipt mismatch")
		}
		if st, err := os.Stat(filepath.Join(dest, receipt.Frontend, "index.html")); err != nil || !st.Mode().IsRegular() {
			return empty, errors.New("cached version incomplete")
		}
	} else if e = os.Rename(stage, dest); e != nil {
		return empty, e
	}
	if e = writeAppFileAtomic(dir, "current.json", b); e != nil {
		return empty, e
	}

	return receipt, nil
}

// Each public static app gets a separate loopback origin, never the privileged
// daemon origin. It has no account cookies, token, filesystem API or Tauri IPC.
func writeAppFileAtomic(dir, name string, data []byte) error {
	f, e := os.CreateTemp(dir, ".app-state-")
	if e != nil {
		return e
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if _, e = f.Write(data); e != nil {
		f.Close()
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	return os.Rename(tmp, filepath.Join(dir, name))
}
func (m *appPackageManager) open(req appPackageRequest, root, version string) (string, error) {
	key := req.ID + ":" + req.Scope
	if m.launches[key] != nil && m.roots[key] == root {
		return m.urls[key], nil
	}
	// Keep the account-specific browser origin stable across launches and updates.
	// Never silently switch origins when the reserved port is unavailable.
	originDir := filepath.Join(m.root, req.ID, "origins")
	if e := os.MkdirAll(originDir, 0700); e != nil {
		return "", e
	}
	originFile := req.Scope + ".port"
	address := "127.0.0.1:0"
	if raw, e := os.ReadFile(filepath.Join(originDir, originFile)); e == nil {
		port, e := strconv.Atoi(string(raw))
		if e != nil || port < 1024 || port > 65535 {
			return "", errors.New("invalid saved app origin")
		}
		address = fmt.Sprintf("127.0.0.1:%d", port)
	} else if !os.IsNotExist(e) {
		return "", e
	}
	if prior := m.launches[key]; prior != nil {
		prior.Close()
		delete(m.launches, key)
		delete(m.roots, key)
		delete(m.urls, key)
	}
	listener, e := net.Listen("tcp4", address)
	if e != nil {
		return "", fmt.Errorf("app origin unavailable: %w", e)
	}
	if address == "127.0.0.1:0" {
		if e = writeAppFileAtomic(originDir, originFile, []byte(strconv.Itoa(listener.Addr().(*net.TCPAddr).Port))); e != nil {
			listener.Close()
			return "", e
		}
	}
	host := listener.Addr().String()
	files, e := os.OpenRoot(root)
	if e != nil {
		listener.Close()
		return "", e
	}
	server := &http.Server{ReadHeaderTimeout: 5 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != host || (r.Method != "GET" && r.Method != "HEAD") {
			http.Error(w, "forbidden", 403)
			return
		}
		rel := strings.TrimPrefix(r.URL.Path, "/")
		if rel == "" {
			rel = "index.html"
		}
		if !safeAppPath(rel) {
			http.NotFound(w, r)
			return
		}
		f, e := files.Open(filepath.FromSlash(rel))
		if e != nil {
			http.NotFound(w, r)
			return
		}
		defer f.Close()
		st, e := f.Stat()
		if e != nil || !st.Mode().IsRegular() {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		http.ServeContent(w, r, path.Base(rel), st.ModTime(), f)
	})}
	m.launches[key] = server
	m.roots[key] = root
	m.urls[key] = "http://" + host + "/?v=" + url.QueryEscape(version)
	go func() { defer files.Close(); _ = server.Serve(listener) }()
	return m.urls[key], nil
}
func (m *appPackageManager) handler(verify func(*http.Request) bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !verify(r) {
			writeJSON(w, 403, map[string]string{"error": "agentsamd_pairing_token_required"})
			return
		}
		if r.Method != "POST" {
			http.Error(w, "method not allowed", 405)
			return
		}
		var req appPackageRequest
		if e := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); e != nil || m.root == "" || !appKeyPattern.MatchString(req.ID) || !appPackagePattern.MatchString(req.Package) || !appScopePattern.MatchString(req.Scope) {
			http.Error(w, "invalid app package request", 400)
			return
		}
		m.mu.Lock()
		defer m.mu.Unlock()
		switch req.Action {
		case "install":
			receipt, e := m.install(req)
			if e != nil {
				writeJSON(w, 409, map[string]any{"ok": false, "error": e.Error()})
				return
			}
			writeJSON(w, 200, map[string]any{"ok": true, "ready": true, "version": receipt.Version})
		case "status", "open":
			receipt, root, e := m.current(req)
			if e != nil {
				writeJSON(w, 200, map[string]any{"ok": true, "ready": false})
				return
			}
			out := map[string]any{"ok": true, "ready": true, "version": receipt.Version}
			if req.Action == "open" {
				u, e := m.open(req, root, receipt.Version)
				if e != nil {
					writeJSON(w, 500, map[string]any{"ok": false, "error": e.Error()})
					return
				}
				out["url"] = u
			}
			writeJSON(w, 200, out)
		default:
			http.Error(w, "unsupported app operation", 400)
		}
	}
}
