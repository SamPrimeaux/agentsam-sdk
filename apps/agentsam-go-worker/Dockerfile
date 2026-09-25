# syntax=docker/dockerfile:1
FROM golang:1.22-bookworm AS build
WORKDIR /src
COPY runtime/go.mod ./
COPY runtime/ ./
ARG TARGETARCH
RUN ARCH="${TARGETARCH:-amd64}" \
    && CGO_ENABLED=0 GOOS=linux GOARCH="$ARCH" go build -trimpath -ldflags="-s -w" \
      -o /out/agentsam-go-worker ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=build /out/agentsam-go-worker /agentsam-go-worker
ENV PORT=8080
ENV AGENTSAM_TARGET=cloudflare
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/agentsam-go-worker"]
