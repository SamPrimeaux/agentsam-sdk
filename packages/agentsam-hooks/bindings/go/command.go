package agentsamhooks

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type CommandOptions struct {
	Command            string
	Args               []string
	CWD                string
	Environment        map[string]string
	InheritEnvironment bool
	MaxOutputBytes     int
}

var portableEnvironmentKeys = []string{"PATH", "Path", "PATHEXT", "SYSTEMROOT", "WINDIR", "HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL"}

func commandEnvironment(options CommandOptions) []string {
	values := map[string]string{}
	if options.InheritEnvironment {
		for _, row := range os.Environ() { key, value, ok := strings.Cut(row, "="); if ok { values[key] = value } }
	} else {
		for _, key := range portableEnvironmentKeys { if value, ok := os.LookupEnv(key); ok { values[key] = value } }
	}
	for key, value := range options.Environment { values[key] = value }
	output := make([]string, 0, len(values)); for key, value := range values { output = append(output, key+"="+value) }; return output
}

// CommandHandler starts one process per invocation. It never invokes a shell.
// The process reads one envelope from stdin and writes one output JSON object.
func CommandHandler(options CommandOptions) Handler {
	return func(ctx context.Context, envelope Envelope) (*Output, error) {
		if strings.TrimSpace(options.Command) == "" { return nil, fmt.Errorf("hook_command_required") }
		limit := options.MaxOutputBytes; if limit <= 0 { limit = 1_048_576 }
		payload, err := json.Marshal(envelope); if err != nil { return nil, err }
		command := exec.CommandContext(ctx, options.Command, options.Args...)
		command.Dir = options.CWD; if command.Dir == "" { command.Dir = envelope.CWD }
		command.Env = commandEnvironment(options); command.Stdin = bytes.NewReader(append(payload, '\n'))
		var stdout, stderr bytes.Buffer; command.Stdout = &stdout; command.Stderr = &stderr
		if err := command.Run(); err != nil { return nil, fmt.Errorf("hook_command_failed:%s:%w:%s", options.Command, err, stderr.String()) }
		if stdout.Len()+stderr.Len() > limit { return nil, fmt.Errorf("hook_command_output_limit_exceeded:%d", limit) }
		lines := strings.Split(strings.TrimSpace(stdout.String()), "\n"); if len(lines) == 0 || strings.TrimSpace(lines[len(lines)-1]) == "" { return nil, nil }
		output := &Output{}
		decoder := json.NewDecoder(strings.NewReader(lines[len(lines)-1]))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(output); err != nil { return nil, fmt.Errorf("hook_command_invalid_json:%w", err) }
		return output, nil
	}
}
