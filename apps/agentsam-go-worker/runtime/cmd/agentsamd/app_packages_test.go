package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha512"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppPackageRejectsUnpairedAndUnsafeArchive(t *testing.T) {
	m := newAppPackageManager()
	w := httptest.NewRecorder()
	m.handler(func(*http.Request) bool { return false })(w, httptest.NewRequest("POST", "/v1/apps/package", strings.NewReader(`{}`)))
	if w.Code != http.StatusForbidden {
		t.Fatalf("unpaired install: %d", w.Code)
	}
	var raw bytes.Buffer
	gz := gzip.NewWriter(&raw)
	tw := tar.NewWriter(gz)
	if e := tw.WriteHeader(&tar.Header{Name: "package/../escape", Mode: 0600, Size: 1}); e != nil {
		t.Fatal(e)
	}
	if _, e := tw.Write([]byte("x")); e != nil {
		t.Fatal(e)
	}
	if e := tw.Close(); e != nil {
		t.Fatal(e)
	}
	if e := gz.Close(); e != nil {
		t.Fatal(e)
	}
	release := npmAppRelease{Name: "@inneranimalmedia/agentsam-design-canvas", Version: "0.1.0"}
	req := appPackageRequest{ID: "design-canvas", Package: release.Name, Scope: strings.Repeat("a", 64)}
	if _, e := unpackAppPackage(raw.Bytes(), t.TempDir(), req, release); e == nil || !strings.Contains(e.Error(), "integrity") {
		t.Fatalf("expected integrity rejection: %v", e)
	}
	sum := sha512.Sum512(raw.Bytes())
	release.Dist.Integrity = "sha512-" + base64.StdEncoding.EncodeToString(sum[:])
	if _, e := unpackAppPackage(raw.Bytes(), t.TempDir(), req, release); e == nil || !strings.Contains(e.Error(), "unsafe") {
		t.Fatalf("expected unsafe archive rejection: %v", e)
	}
}

// Opt-in proof: actual published npm package, installed in an isolated device
// cache and served from the same app runtime used by the desktop bridge.
func TestAppPackageLiveInstall(t *testing.T) {
	if os.Getenv("AGENTSAM_TEST_NPM_APP") != "1" {
		t.Skip("set AGENTSAM_TEST_NPM_APP=1 to verify the real registry package")
	}
	t.Setenv("AGENTSAM_HOME", t.TempDir())
	m := newAppPackageManager()
	defer func() {
		for _, server := range m.launches {
			server.Close()
		}
	}()
	req := appPackageRequest{ID: "design-canvas", Package: "@inneranimalmedia/agentsam-design-canvas", Scope: strings.Repeat("a", 64)}
	receipt, e := m.install(req)
	if e != nil {
		t.Fatal(e)
	}
	_, root, e := m.current(req)
	if e != nil {
		t.Fatal(e)
	}
	index, e := os.ReadFile(filepath.Join(root, "index.html"))
	if e != nil {
		t.Fatal(e)
	}
	first, e := m.open(req, root, receipt.Version)
	if e != nil {
		t.Fatal(e)
	}
	resp, e := http.Get(first)
	if e != nil {
		t.Fatal(e)
	}
	body, e := io.ReadAll(resp.Body)
	resp.Body.Close()
	if e != nil || resp.StatusCode != 200 || !bytes.Equal(index, body) {
		t.Fatalf("installed index HTTP proof: %d %v", resp.StatusCode, e)
	}
	again, e := m.install(req)
	if e != nil || again != receipt {
		t.Fatalf("repeat installation did not reuse receipt: %v", e)
	}
	same, e := m.open(req, root, receipt.Version)
	if e != nil || same != first {
		t.Fatalf("launch changed origin: %v", e)
	}
	other := req
	other.Scope = strings.Repeat("b", 64)
	second, e := m.open(other, root, receipt.Version)
	if e != nil || second == first {
		t.Fatalf("different accounts share origin: %v", e)
	}
	// A daemon restart must not silently change the origin used by local app data.
	m.launches[req.ID+":"+req.Scope].Close()
	delete(m.launches, req.ID+":"+req.Scope)
	restored := newAppPackageManager()
	defer func() {
		for _, server := range restored.launches {
			server.Close()
		}
	}()
	reopened, e := restored.open(req, root, receipt.Version)
	if e != nil {
		t.Fatal(e)
	}
	a, _ := url.Parse(first)
	b, _ := url.Parse(reopened)
	if a.Host != b.Host {
		t.Fatalf("restart changed origin: %s vs %s", a.Host, b.Host)
	}
	t.Logf("downloaded and served real %s@%s (%d byte index); repeat install reused receipt; account origins isolated; restart preserved origin", receipt.Package, receipt.Version, len(index))
}
