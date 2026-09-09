# Base image for  UI - config loaded from volume mount
#
# Expected volume mount:
#   - /app/config/ui/ (PVC)
#   - Must contain: settings.yaml
#
# Build: podman build -f Containerfile.base -t ai-template-ui:v1.0.0 .
# Run:   podman run -v /path/to/config:/app/config/ui:ro -e UI_CONFIG_PATH=/app/config/ui/settings.yaml ai-template-ui:v1.0.0

FROM registry.access.redhat.com/hi/nodejs:24.18.0-builder

USER root

ARG OPA_VERSION=1.20.1
RUN curl -fsSL "https://github.com/open-policy-agent/opa/releases/download/v${OPA_VERSION}/opa_linux_amd64_static" \
    -o /usr/local/bin/opa && chmod 755 /usr/local/bin/opa

WORKDIR /opt/app-root/src

# UI config is NOT baked in — mount config/ui at /opt/app-root/src/config
# (compose: ./config:/opt/app-root/src/config:ro; K8s: ConfigMap/PVC).

COPY --chown=1001:0 package*.json ./
COPY --chown=1001:0 src ./src
COPY --chown=1001:0 public ./public
COPY --chown=1001:0 components.json ./
COPY --chown=1001:0 eslint.config.js ./
COPY --chown=1001:0 vite.config.ts ./
COPY --chown=1001:0 vite-env.d.ts ./
COPY --chown=1001:0 tsconfig.json ./
COPY --chown=1001:0 tsconfig.node.json ./

RUN mkdir -p config/ui && chown -R 1001:0 config && chown -R 1001:0 /opt/app-root/src

USER 1001

RUN npm ci && npm run build

# Config will be mounted here at runtime from PVC
# Override UI_CONFIG_PATH in deployment.yaml if using a custom mount location
ENV UI_CONFIG_PATH=/app/config/ui/settings.yaml

CMD ["node", "dist/server/index.js"]
