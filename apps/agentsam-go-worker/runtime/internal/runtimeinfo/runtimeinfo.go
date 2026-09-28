package runtimeinfo

import (
	"os/exec"
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

func shellCapabilities() []string {
	if runtime.GOOS == "windows" {
		caps := []string{"terminal.stream", "shell.cmd"}
		if _, err := exec.LookPath("powershell.exe"); err == nil {
			caps = append(caps, "shell.powershell")
		}
		if _, err := exec.LookPath("pwsh.exe"); err == nil {
			caps = append(caps, "shell.pwsh")
		}
		return caps
	}
	return []string{"terminal.pty", "shell.posix"}
}

func Snapshot() Response {
	capabilities := []string{
		"hash",
		"inspect",
		"capabilities",
		"runtime",
	}
	capabilities = append(capabilities, shellCapabilities()...)
	return Response{
		Schema:       "agentsam.go-runtime.v1",
		GoVersion:    health.GoVersion(),
		Arch:         runtime.GOARCH,
		OS:           runtime.GOOS,
		CPUs:         runtime.NumCPU(),
		Capabilities: capabilities,
	}
}
