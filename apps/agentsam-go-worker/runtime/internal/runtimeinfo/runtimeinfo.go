package runtimeinfo

import (
	"runtime"

	"github.com/inneranimalmedia/agentsam-go-worker/internal/health"
)

type Response struct {
	Schema       string   `json:"schema"`
	GoVersion    string   `json:"go_version"`
	Arch         string   `json:"arch"`
	OS           string   `json:"os"`
	CPUs         int      `json:"cpus"`
	Capabilities []string `json:"capabilities"`
}

func Snapshot() Response {
	return Response{
		Schema:    "agentsam.go-runtime.v1",
		GoVersion: health.GoVersion(),
		Arch:      runtime.GOARCH,
		OS:        runtime.GOOS,
		CPUs:      runtime.NumCPU(),
		Capabilities: []string{
			"hash",
			"inspect",
			"capabilities",
			"runtime",
		},
	}
}
