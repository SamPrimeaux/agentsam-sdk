package pairing

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func post(h http.Handler, origin string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/v1/pair/request", nil)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestApprovedReleasesTokenAndNamesTheOrigin(t *testing.T) {
	var asked string
	s := New(func(_ context.Context, o string) (bool, error) { asked = o; return true, nil }, func() string { return "tok" })
	rec := post(s.Handler(), "https://agentsam.inneranimalmedia.com")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"token":"tok"`) || asked != "https://agentsam.inneranimalmedia.com" {
		t.Fatalf("got %d %s asked=%q", rec.Code, rec.Body.String(), asked)
	}
}

func TestDeniedNeverLeaksTokenAndCoolsDown(t *testing.T) {
	now := time.Now()
	s := New(func(context.Context, string) (bool, error) { return false, nil }, func() string { return "tok" })
	s.now = func() time.Time { return now }
	rec := post(s.Handler(), "https://evil.example")
	if rec.Code != 403 || strings.Contains(rec.Body.String(), "tok") {
		t.Fatalf("deny must be 403 without token: %d %s", rec.Code, rec.Body.String())
	}
	if rec := post(s.Handler(), "https://evil.example"); rec.Code != 429 {
		t.Fatalf("cooldown expected, got %d", rec.Code)
	}
	now = now.Add(denyCooldown + time.Second)
	if rec := post(s.Handler(), "https://evil.example"); rec.Code != 403 {
		t.Fatalf("after cooldown the prompt shows again, got %d", rec.Code)
	}
}

func TestRejectsBadOriginsAndPendingOverlap(t *testing.T) {
	release := make(chan struct{})
	started := make(chan struct{})
	s := New(func(context.Context, string) (bool, error) { close(started); <-release; return true, nil }, func() string { return "tok" })
	for _, bad := range []string{"", "null", "https://a.com/path", `https://a.com"; do shell script "x`, "file:///etc"} {
		if rec := post(s.Handler(), bad); rec.Code != 400 {
			t.Fatalf("origin %q must be 400, got %d", bad, rec.Code)
		}
	}
	done := make(chan int)
	go func() { done <- post(s.Handler(), "https://a.com").Code }()
	<-started
	if rec := post(s.Handler(), "https://b.com"); rec.Code != 409 {
		t.Fatalf("second request while pending must be 409, got %d", rec.Code)
	}
	close(release)
	if code := <-done; code != 200 {
		t.Fatalf("first request should finish approved, got %d", code)
	}
}

func TestNoApproverMeansNoToken(t *testing.T) {
	s := New(nil, func() string { return "tok" })
	rec := post(s.Handler(), "https://a.com")
	if rec.Code != 503 || strings.Contains(rec.Body.String(), "tok") {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}
