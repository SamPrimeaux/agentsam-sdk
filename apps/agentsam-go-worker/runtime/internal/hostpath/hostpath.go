// Package hostpath resolves developer tools that LaunchAgents often omit from PATH.
package hostpath

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func toolDirs() []string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = ""
	}
	dirs := []string{
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/Applications/Blender.app/Contents/MacOS",
		"/Applications/FreeCAD.app/Contents/MacOS",
	}
	if home != "" {
		dirs = append([]string{
			filepath.Join(home, ".cargo", "bin"),
			filepath.Join(home, "go", "bin"),
			filepath.Join(home, ".local", "bin"),
			filepath.Join(home, ".agentsam", "bin"),
		}, dirs...)
	}
	return dirs
}

// EnrichPATH returns PATH with cargo/go/homebrew/CAD app bins prepended.
func EnrichPATH() string {
	seen := map[string]bool{}
	var parts []string
	add := func(p string) {
		p = strings.TrimSpace(p)
		if p == "" || seen[p] {
			return
		}
		seen[p] = true
		parts = append(parts, p)
	}
	for _, d := range toolDirs() {
		add(d)
	}
	for _, d := range strings.Split(os.Getenv("PATH"), string(os.PathListSeparator)) {
		add(d)
	}
	return strings.Join(parts, string(os.PathListSeparator))
}

// EnrichEnviron returns os.Environ with an enriched PATH.
func EnrichEnviron() []string {
	return MergeEnv(nil)
}

// MergeEnv returns os.Environ with optional overrides and enriched PATH.
func MergeEnv(overrides map[string]string) []string {
	env := os.Environ()
	path := EnrichPATH()
	out := make([]string, 0, len(env)+len(overrides)+1)
	replaced := false
	for _, e := range env {
		if strings.HasPrefix(e, "PATH=") {
			out = append(out, "PATH="+path)
			replaced = true
			continue
		}
		out = append(out, e)
	}
	if !replaced {
		out = append(out, "PATH="+path)
	}
	for k, v := range overrides {
		if strings.EqualFold(k, "PATH") {
			continue
		}
		out = append(out, k+"="+v)
	}
	return out
}

// LookBinary finds name on the enriched PATH or as an absolute path.
func LookBinary(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", exec.ErrNotFound
	}
	if filepath.IsAbs(name) {
		if st, err := os.Stat(name); err == nil && !st.IsDir() {
			return name, nil
		}
		return "", exec.ErrNotFound
	}
	prev := os.Getenv("PATH")
	_ = os.Setenv("PATH", EnrichPATH())
	path, err := exec.LookPath(name)
	_ = os.Setenv("PATH", prev)
	if err == nil {
		return path, nil
	}
	for _, dir := range toolDirs() {
		candidate := filepath.Join(dir, name)
		if st, err := os.Stat(candidate); err == nil && !st.IsDir() {
			return candidate, nil
		}
	}
	return "", exec.ErrNotFound
}

// ResolveCommand returns an absolute binary path when possible.
func ResolveCommand(name string) string {
	if path, err := LookBinary(name); err == nil {
		return path
	}
	return name
}
