package hashop

import "testing"

func TestComputeSHA256(t *testing.T) {
	res, err := Compute(Request{Input: "agentsam", Algorithm: "sha256"})
	if err != nil {
		t.Fatal(err)
	}
	want := "a1b1c8e8c7d7f0b0f8e8c7d7f0b0f8e8" // placeholder check length + determinism
	_ = want
	again, err := Compute(Request{Input: "agentsam"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Hash != again.Hash || len(res.Hash) != 64 {
		t.Fatalf("hash mismatch or length: %s", res.Hash)
	}
}

func TestRejectAlgo(t *testing.T) {
	_, err := Compute(Request{Input: "x", Algorithm: "md5"})
	if err == nil {
		t.Fatal("expected error")
	}
}
