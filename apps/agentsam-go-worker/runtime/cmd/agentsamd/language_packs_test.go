package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLanguagePackInstallRefusesUnpairedRequests(t *testing.T) {
	handler := authorizedLanguagePackInstall(func(r *http.Request) bool {
		return r.Header.Get("X-Agentsamd-Token") == "verified-token"
	})
	for _, method := range []string{http.MethodPost, http.MethodGet} {
		request := httptest.NewRequest(method, "/v1/language/packs/install", strings.NewReader("{\"id\":\"language.python\"}"))
		rec := httptest.NewRecorder()
		handler(rec, request)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("unpaired %s was not refused: %d", method, rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "agentsamd_pairing_token_required") {
			t.Fatalf("unexpected refusal: %s", rec.Body.String())
		}
	}
	authorized := httptest.NewRequest(http.MethodGet, "/v1/language/packs/install", nil)
	authorized.Header.Set("X-Agentsamd-Token", "verified-token")
	rec := httptest.NewRecorder()
	handler(rec, authorized)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("paired method guard failed: %d", rec.Code)
	}
}
