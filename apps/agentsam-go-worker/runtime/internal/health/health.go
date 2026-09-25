package health

import (
	"os"
	"runtime"
)

const ServiceName = "agentsam-go-worker"
const Version = "0.1.0"

// BuildCommit, BuildSource, and BuildTime are populated with -ldflags by
// AgentSam's canonical build path. Environment variables remain explicit
// runtime overrides for controlled environments.
var BuildCommit string
var BuildSource string
var BuildTime string

type BuildInfo struct {
	Commit  string `json:"commit,omitempty"`
	Source  string `json:"source,omitempty"`
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
			Commit:  envOr("AGENTSAM_BUILD_COMMIT", BuildCommit),
			Source:  envOr("AGENTSAM_BUILD_SOURCE", BuildSource),
			BuiltAt: envOr("AGENTSAM_BUILT_AT", BuildTime),
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
