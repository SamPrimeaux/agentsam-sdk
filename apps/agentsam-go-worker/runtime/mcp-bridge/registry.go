package mcpbridge

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Protocol    string                 `json:"protocol"`
	Command     []string               `json:"command,omitempty"`
	URL         string                 `json:"url,omitempty"`
	InputSchema map[string]interface{} `json:"input_schema"`
	Dir         string                 `json:"-"`
}

type Registry struct {
	Tools map[string]*Tool
}

// LoadRegistry scans toolsDir for one subdirectory per tool, each
// containing a tool.json manifest. Missing/malformed manifests are
// skipped, not fatal — one bad tool should never take agentsamd down.
func LoadRegistry(toolsDir string) (*Registry, []error) {
	reg := &Registry{Tools: map[string]*Tool{}}
	var errs []error

	entries, err := os.ReadDir(toolsDir)
	if err != nil {
		return reg, []error{err}
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(toolsDir, e.Name())
		manifestPath := filepath.Join(dir, "tool.json")
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue // no tool.json in this dir -> not a tool dir, skip quietly
		}
		var t Tool
		if err := json.Unmarshal(data, &t); err != nil {
			errs = append(errs, err)
			continue
		}
		t.Dir = dir
		reg.Tools[t.Name] = &t
	}
	return reg, errs
}
