# Robotics perception backend boundary

The browser calls `POST /api/robotics/perception/detect`; provider credentials remain server-side.

The shared implementation is `perception.ts` and is consumed by both the local Node backend and the canonical `backend/worker/index.js` Cloudflare boundary. `GET /api/robotics/capabilities` reports whether the provider is configured without exposing secrets.

Configuration:

- `GEMINI_API_KEY` — server/Worker secret required for live perception.
- `CAD_ROBOTICS_DEFAULT_MODEL` — optional default model override.
- `CAD_ROBOTICS_PERCEPTION_MODELS` — optional comma-separated server-side allowlist.

The original donor implementation remains in the versioned donor snapshot for provenance. Browser code must not receive provider API keys.
