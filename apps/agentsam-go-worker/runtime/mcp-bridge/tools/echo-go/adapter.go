package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
)

type req struct {
	Tool      string                 `json:"tool"`
	Arguments map[string]interface{} `json:"arguments"`
}
type resp struct {
	OK     bool                   `json:"ok"`
	Result map[string]interface{} `json:"result,omitempty"`
	Error  string                 `json:"error,omitempty"`
}

func main() {
	reader := bufio.NewReader(os.Stdin)
	line, err := reader.ReadString('\n')
	if err != nil && line == "" {
		fmt.Println(mustJSON(resp{OK: false, Error: "no input"}))
		return
	}
	var r req
	if err := json.Unmarshal([]byte(line), &r); err != nil {
		fmt.Println(mustJSON(resp{OK: false, Error: "bad json: " + err.Error()}))
		return
	}
	text, _ := r.Arguments["text"].(string)
	fmt.Println(mustJSON(resp{OK: true, Result: map[string]interface{}{"text": text, "via": "go"}}))
}

func mustJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}
