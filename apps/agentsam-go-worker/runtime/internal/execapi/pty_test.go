package execapi

import "testing"

func TestResolvePTYCwdKeepsExplicitWorkspace(t *testing.T) {
	got := resolvePTYCwd("/tmp/agentsam-workspace")
	if got != "/tmp/agentsam-workspace" {
		t.Fatalf("expected explicit workspace, got %q", got)
	}
}

func TestResolvePTYCwdDefaultsToUserHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	got := resolvePTYCwd("")
	if got != home {
		t.Fatalf("expected home fallback %q, got %q", home, got)
	}
}
