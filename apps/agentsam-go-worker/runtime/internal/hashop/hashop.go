package hashop

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

type Request struct {
	Input     string `json:"input"`
	Algorithm string `json:"algorithm"`
}

type Response struct {
	Hash       string  `json:"hash"`
	Algorithm  string  `json:"algorithm"`
	DurationMs float64 `json:"duration_ms"`
}

func Compute(req Request) (Response, error) {
	start := time.Now()
	algo := strings.ToLower(strings.TrimSpace(req.Algorithm))
	if algo == "" {
		algo = "sha256"
	}
	if algo != "sha256" {
		return Response{}, fmt.Errorf("unsupported algorithm: %s", algo)
	}
	sum := sha256.Sum256([]byte(req.Input))
	return Response{
		Hash:       hex.EncodeToString(sum[:]),
		Algorithm:  algo,
		DurationMs: float64(time.Since(start).Microseconds()) / 1000.0,
	}, nil
}
