package execapi

import (
	"encoding/json"
	"net/http"

	"github.com/inneranimalmedia/agentsam-go-worker/internal/agentserror"
)

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, env agentserror.Envelope) {
	writeJSON(w, env.HTTPStatus, env)
}
