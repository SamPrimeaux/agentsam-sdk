package inspect

import (
	"regexp"
	"strings"
)

var (
	hexColorRe = regexp.MustCompile(`(?i)#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b`)
	urlRe      = regexp.MustCompile(`https?://[^\s"'<>]+`)
	tokenishRe = regexp.MustCompile(`(?i)\b(sk-[a-z0-9_-]{16,}|ghp_[a-z0-9]{20,}|cfpat_[a-z0-9_-]{20,})\b`)
)

type FileInput struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type Request struct {
	Files []FileInput `json:"files"`
}

type Finding struct {
	Kind       string  `json:"kind"`
	Path       string  `json:"path"`
	Line       int     `json:"line,omitempty"`
	Value      string  `json:"value"`
	Confidence float64 `json:"confidence"`
}

type Response struct {
	Schema   string    `json:"schema"`
	Findings []Finding `json:"findings"`
}

func Analyze(req Request) Response {
	out := Response{Schema: "agentsam.go-inspect.v1", Findings: []Finding{}}
	for _, file := range req.Files {
		path := file.Path
		if path == "" {
			path = "<memory>"
		}
		lines := strings.Split(file.Content, "\n")
		for i, line := range lines {
			lineNo := i + 1
			for _, m := range hexColorRe.FindAllString(line, -1) {
				out.Findings = append(out.Findings, Finding{
					Kind: "hardcoded_color", Path: path, Line: lineNo, Value: m, Confidence: 1,
				})
			}
			for _, m := range urlRe.FindAllString(line, -1) {
				out.Findings = append(out.Findings, Finding{
					Kind: "url", Path: path, Line: lineNo, Value: m, Confidence: 0.9,
				})
			}
			for _, m := range tokenishRe.FindAllString(line, -1) {
				out.Findings = append(out.Findings, Finding{
					Kind: "token_pattern", Path: path, Line: lineNo, Value: redact(m), Confidence: 0.85,
				})
			}
		}
	}
	return out
}

func redact(value string) string {
	if len(value) <= 8 {
		return "***"
	}
	return value[:4] + "…" + value[len(value)-4:]
}
