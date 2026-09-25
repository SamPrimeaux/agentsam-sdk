package health

import (
	"os"
	"runtime"
	"time"
)

const ServiceName = "agentsam-go-worker"
const Version = "0.1.0"

type BuildInfo struct {
	Commit  string `json:"commit,omitempty"`
	BuiltAt string `json:"built_at,omitempty"`
}

type Response struct {
	OK      bool      `json:"ok"`
	Service string    `json:"service"`
	Runtime string    `json:"runtime"`
	Version string    `json:"version"`
	Target  string    `json:"target"`
	Build   BuildInfo `json:"build"`
}

func Snapshot(target string) Response {
	if target == "" {
		target = "local"
	}
	return Response{
		OK:      true,
		Service: ServiceName,
		Runtime: "go",
		Version: Version,
		Target:  target,
		Build: BuildInfo{
			Commit:  envOr("AGENTSAM_BUILD_COMMIT", ""),
			BuiltAt: envOr("AGENTSAM_BUILT_AT", time.Now().UTC().Format(time.RFC3339)),
		},
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func GoVersion() string {
	return runtime.Version()
}
