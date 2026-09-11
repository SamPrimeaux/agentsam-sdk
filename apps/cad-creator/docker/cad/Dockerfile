# ----------------------------------------------------
# AgentSam Isolated CAD Runtime Container (Blender 4.2 + OpenSCAD)
# ----------------------------------------------------
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV BLENDER_PATH=/usr/bin/blender
ENV CAD_STORAGE_ROOT=/storage/cad

# Install base utilities, Python, OpenSCAD, and Blender dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    blender \
    openscad \
    python3 \
    python3-pip \
    nodejs \
    npm \
    ca-certificates \
    curl \
    libgl1-mesa-dri \
    libgl1-mesa-glx \
    libglu1-mesa \
    libxi6 \
    libxrender1 \
    libxxf86vm1 \
    libxfixes3 \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd -ms /bin/bash caduser

WORKDIR /cad-service
COPY package*.json ./
RUN npm install --only=production

COPY . .

RUN mkdir -p /storage/cad/artifacts /storage/cad/renders /storage/cad/temp \
    && chown -R caduser:caduser /cad-service /storage/cad

USER caduser
EXPOSE 8080

ENV PORT=8080
ENV CAD_RUNTIME_LANE=native-blender

CMD ["node", "dist/server.cjs"]
