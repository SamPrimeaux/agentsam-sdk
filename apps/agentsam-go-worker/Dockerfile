# syntax=docker/dockerfile:1
FROM golang:1.22-bookworm AS build
WORKDIR /src
COPY runtime/go.mod ./
COPY runtime/ ./
ARG TARGETARCH
RUN COMMIT="$(cat .agentsam-build-commit 2>/dev/null || true)" \
    && BUILT_AT="$(cat .agentsam-built-at 2>/dev/null || true)" \
    && ARCH="${TARGETARCH:-amd64}" \
    && CGO_ENABLED=0 GOOS=linux GOARCH="$ARCH" go build -trimpath \
      -ldflags="-s -w -X github.com/inneranimalmedia/agentsam-go-worker/internal/health.BuildCommit=${COMMIT} -X github.com/inneranimalmedia/agentsam-go-worker/internal/health.BuildTime=${BUILT_AT}" \
      -o /out/agentsam-go-worker ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=build /out/agentsam-go-worker /agentsam-go-worker
ENV PORT=8080
ENV AGENTSAM_TARGET=cloudflare
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/agentsam-go-worker"]
