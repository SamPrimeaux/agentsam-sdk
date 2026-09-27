// Package localauth mints and checks agentsamd's local pairing token.
//
// This token is deliberately independent of AGENTSAM_API_KEY /
// AGENTSAM_BRIDGE_KEY: agentsamd must keep working with zero network
// dependency (sold/customer deployments included), so its auth can never
// require a call home to verify. It exists only to stop an arbitrary
// website open in another tab from silently exec'ing on this machine.
package localauth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const tokenBytes = 32

// Store loads (or creates on first run) the local pairing token.
type Store struct {
	mu    sync.RWMutex
	token string
	path  string
}

// dir returns ~/.agentsam, honoring AGENTSAM_HOME for tests/overrides.
func dir() (string, error) {
	if v := strings.TrimSpace(os.Getenv("AGENTSAM_HOME")); v != "" {
		return v, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}
	return filepath.Join(home, ".agentsam"), nil
}

// LoadOrCreate reads the token file, generating a new one (0600, dir 0700)
// on first run. Safe to call once at startup.
func LoadOrCreate() (*Store, error) {
	d, err := dir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(d, 0o700); err != nil {
		return nil, fmt.Errorf("create %s: %w", d, err)
	}
	path := filepath.Join(d, "agentsamd.token")

	if b, err := os.ReadFile(path); err == nil {
		tok := strings.TrimSpace(string(b))
		if tok != "" {
			return &Store{token: tok, path: path}, nil
		}
		// fall through and regenerate an empty/corrupt file
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}
	tok := hex.EncodeToString(raw)
	if err := os.WriteFile(path, []byte(tok+"\n"), 0o600); err != nil {
		return nil, fmt.Errorf("write %s: %w", path, err)
	}
	return &Store{token: tok, path: path}, nil
}

// Path returns the on-disk token file location (for the startup log line).
func (s *Store) Path() string {
	return s.path
}

// Verify does a constant-time comparison against the loaded token.
func (s *Store) Verify(presented string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	presented = strings.TrimSpace(presented)
	if presented == "" || s.token == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(presented), []byte(s.token)) == 1
}
