// Package mcpbridge implements agentsamd's local MCP bridge:
// tools/list and tools/call, dispatching to language-agnostic adapters
// registered under runtime/mcp-bridge/tools/. See ADAPTER_CONTRACT.md.
package mcpbridge

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"time"
)

type CallRequest struct {
	Tool      string                 `json:"tool"`
	Arguments map[string]interface{} `json:"arguments"`
}

type CallResponse struct {
	OK     bool                   `json:"ok"`
	Result map[string]interface{} `json:"result,omitempty"`
	Error  string                 `json:"error,omitempty"`
}

// ListTools returns the MCP tools/list payload from the registry.
func ListTools(reg *Registry) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(reg.Tools))
	for _, t := range reg.Tools {
		out = append(out, map[string]interface{}{
			"name":        t.Name,
			"description": t.Description,
			"inputSchema": t.InputSchema,
		})
	}
	return out
}

// CallTool dispatches tools/call to the correct adapter protocol.
func CallTool(reg *Registry, req CallRequest) CallResponse {
	tool, ok := reg.Tools[req.Tool]
	if !ok {
		return CallResponse{OK: false, Error: fmt.Sprintf("unknown tool: %s", req.Tool)}
	}
	switch tool.Protocol {
	case "stdio-json":
		return callStdioJSON(tool, req)
	case "http":
		return callHTTP(tool, req)
	default:
		return CallResponse{OK: false, Error: fmt.Sprintf("unsupported protocol: %s", tool.Protocol)}
	}
}

func callStdioJSON(tool *Tool, req CallRequest) CallResponse {
	if len(tool.Command) == 0 {
		return CallResponse{OK: false, Error: "tool has no command"}
	}
	cmd := exec.Command(tool.Command[0], tool.Command[1:]...)
	cmd.Dir = tool.Dir

	payload, err := json.Marshal(req)
	if err != nil {
		return CallResponse{OK: false, Error: "marshal request: " + err.Error()}
	}
	cmd.Stdin = bytes.NewReader(append(payload, '\n'))

	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	done := make(chan error, 1)
	if err := cmd.Start(); err != nil {
		return CallResponse{OK: false, Error: "start: " + err.Error()}
	}
	go func() { done <- cmd.Wait() }()

	select {
	case <-time.After(30 * time.Second):
		_ = cmd.Process.Kill()
		return CallResponse{OK: false, Error: "adapter timed out after 30s"}
	case err := <-done:
		if err != nil && stdout.Len() == 0 {
			return CallResponse{OK: false, Error: fmt.Sprintf("adapter exited: %v; stderr: %s", err, stderr.String())}
		}
	}

	scanner := bufio.NewScanner(bytes.NewReader(stdout.Bytes()))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		var resp CallResponse
		if err := json.Unmarshal([]byte(line), &resp); err == nil {
			return resp
		}
	}
	return CallResponse{OK: false, Error: "adapter produced no valid JSON line on stdout; stderr: " + stderr.String()}
}

func callHTTP(tool *Tool, req CallRequest) CallResponse {
	if tool.URL == "" {
		return CallResponse{OK: false, Error: "tool has no url"}
	}
	payload, err := json.Marshal(req)
	if err != nil {
		return CallResponse{OK: false, Error: "marshal request: " + err.Error()}
	}
	client := &http.Client{Timeout: 30 * time.Second}
	httpResp, err := client.Post(tool.URL, "application/json", bytes.NewReader(payload))
	if err != nil {
		return CallResponse{OK: false, Error: "http post: " + err.Error()}
	}
	defer httpResp.Body.Close()

	var resp CallResponse
	if err := json.NewDecoder(httpResp.Body).Decode(&resp); err != nil {
		return CallResponse{OK: false, Error: "decode response: " + err.Error()}
	}
	return resp
}
