package main

import "github.com/inneranimalmedia/agentsam-go-worker/internal/hostpath"

func lookHostBinary(name string) (string, error) {
	return hostpath.LookBinary(name)
}

func enrichEnviron() []string {
	return hostpath.EnrichEnviron()
}
