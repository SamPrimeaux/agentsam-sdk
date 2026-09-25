package inspect

import "testing"

func TestAnalyzeHardcodedColor(t *testing.T) {
	res := Analyze(Request{Files: []FileInput{{
		Path:    "demo.css",
		Content: ".button { color: #2563eb; }",
	}}})
	if len(res.Findings) != 1 {
		t.Fatalf("expected 1 finding, got %d", len(res.Findings))
	}
	f := res.Findings[0]
	if f.Kind != "hardcoded_color" || f.Value != "#2563eb" || f.Path != "demo.css" {
		t.Fatalf("unexpected finding: %+v", f)
	}
}

func TestAnalyzeEmpty(t *testing.T) {
	res := Analyze(Request{Files: []FileInput{}})
	if res.Findings == nil || len(res.Findings) != 0 {
		t.Fatalf("expected empty findings")
	}
}
