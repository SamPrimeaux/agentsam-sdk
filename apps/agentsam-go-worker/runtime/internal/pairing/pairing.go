// Package pairing lets a browser ask agentsamd for its pairing token with a
// single approval on the computer itself. The token is released only after
// the person clicks Allow in a native dialog that names the requesting site;
// a web page cannot forge the Origin the dialog shows.
package pairing

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"sync"
	"time"
)

// Approver asks the person at the computer. It must block until they answer.
type Approver func(ctx context.Context, origin string) (bool, error)

const (
	approvalTimeout = 60 * time.Second
	denyCooldown    = 30 * time.Second
)

var originRe = regexp.MustCompile(`^https?://[A-Za-z0-9.\-]+(:[0-9]{1,5})?$`)

// ValidOrigin accepts only a plain http(s) origin: no path, quotes or spaces.
func ValidOrigin(o string) bool { return len(o) <= 200 && originRe.MatchString(o) }

type Service struct {
	approve Approver
	token   func() string
	now     func() time.Time

	mu        sync.Mutex
	pending   bool
	blockedTo time.Time
}

func New(approve Approver, token func() string) *Service {
	return &Service{approve: approve, token: token, now: time.Now}
}

func reply(w http.ResponseWriter, status int, body map[string]any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// Handler serves POST /v1/pair/request.
func (s *Service) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			reply(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "method_not_allowed"})
			return
		}
		origin := r.Header.Get("Origin")
		if !ValidOrigin(origin) {
			reply(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "origin_required", "message": "Pairing must be requested from a web page."})
			return
		}
		if s.approve == nil {
			reply(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "approval_unavailable", "message": "This computer cannot show an approval prompt."})
			return
		}
		s.mu.Lock()
		if s.pending {
			s.mu.Unlock()
			reply(w, http.StatusConflict, map[string]any{"ok": false, "error": "approval_pending", "message": "An approval prompt is already open on this computer."})
			return
		}
		if wait := s.blockedTo.Sub(s.now()); wait > 0 {
			s.mu.Unlock()
			reply(w, http.StatusTooManyRequests, map[string]any{"ok": false, "error": "approval_cooldown", "retry_after_s": int(wait.Seconds()) + 1})
			return
		}
		s.pending = true
		s.mu.Unlock()

		ctx, cancel := context.WithTimeout(r.Context(), approvalTimeout)
		defer cancel()
		allowed, err := s.approve(ctx, origin)

		s.mu.Lock()
		s.pending = false
		if !allowed {
			s.blockedTo = s.now().Add(denyCooldown)
		}
		s.mu.Unlock()

		switch {
		case err != nil:
			reply(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "approval_unavailable", "message": "This computer could not show an approval prompt."})
		case !allowed:
			reply(w, http.StatusForbidden, map[string]any{"ok": false, "error": "approval_denied", "message": "Connection was not approved on this computer."})
		default:
			reply(w, http.StatusOK, map[string]any{"ok": true, "token": s.token()})
		}
	})
}
