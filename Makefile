.PHONY: dev clean local local-down container container-down deploy undeploy e2e opa-build

# Detect npm/node path (supports nvm, system install, etc)
NPM := $(shell command -v npm 2>/dev/null || echo /Users/sodutta/.nvm/versions/node/v24.18.0/bin/npm)
NODE_DIR := $(dir $(NPM))
export PATH := $(NODE_DIR):$(PATH)

# OpenShift namespace (can be overridden: make deploy openshift NAMESPACE=my-project)
NAMESPACE ?= $(shell oc project -q 2>/dev/null)

# Dependency checks
deps:
	@which node > /dev/null && echo "node: $(shell node --version)" || (echo "Error: node not found. Please install node." && exit 1)
	@which npm > /dev/null && echo "npm: $(shell npm --version)" || (echo "Error: npm not found. Please install npm." && exit 1)
	@which podman > /dev/null && echo "podman: $(shell podman --version)" || (echo "Error: podman not found. Please install podman." && exit 1)
	@which podman-compose > /dev/null && echo "podman-compose: $(shell podman-compose --version)" || (echo "Error: podman-compose not found. Please install podman-compose." && exit 1)
	@which oc > /dev/null && echo "oc: $(shell oc version --client)" || (echo "Error: oc not found. Please install oc." && exit 1)

# Install Python dependencies
install:
	@if [ ! -f .env ]; then \
		echo "Creating .env from env.template..."; \
		cp env.template .env; \
	else \
		echo ".env file already exists, skipping copy"; \
	fi
	@$(NPM) ci

opa-check:
	@which opa > /dev/null || (echo "Error: opa CLI not found. Install from https://www.openpolicyagent.org/docs/latest/#running-opa" && exit 1)
	opa check config/compliance/
	@echo "OPA policy syntax OK"

clean:
	@echo "Stopping containers and removing volumes..."
	@export PODMAN_COMPOSE_SILENT=true && podman-compose down -v 2>/dev/null || true
	@pkill -f "node.*dist/server" 2>/dev/null || true
	@pkill -f "npm.*start" 2>/dev/null || true
	rm -rf node_modules dist

## Run Playwright e2e tests
e2e:
	npm run build
	npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium
	npx playwright test

dev:
	$(NPM) run dev

local:
	@which podman-compose > /dev/null || (echo "Error: podman-compose not found. Please install podman-compose." && exit 1)
	@echo "Starting Redis..."
	@export PODMAN_COMPOSE_SILENT=true && podman-compose up -d redis
	@echo "Waiting for Redis..."
	@COUNTER=0; until podman exec template-ui-redis redis-cli ping 2>/dev/null | grep -q PONG || [ $$COUNTER -gt 30 ]; do sleep 1; COUNTER=$$((COUNTER + 1)); done; \
	if [ $$COUNTER -gt 30 ]; then echo "Error: Redis did not become ready on localhost:6380"; exit 1; fi
	$(NPM) run build
	PORT=8080 $(NPM) start

local-down:
	@export PODMAN_COMPOSE_SILENT=true && podman-compose stop redis
	
container:
	@export PODMAN_COMPOSE_SILENT=true && podman-compose --no-ansi up --build --force-recreate --remove-orphans --timeout=60

container-down:
	@export PODMAN_COMPOSE_SILENT=true && podman-compose down

# Deployment targets
deploy:
	@if [ "$(filter openshift,$(MAKECMDGOALS))" != "openshift" ] && [ "$(filter mpp,$(MAKECMDGOALS))" != "mpp" ]; then \
		echo "Usage: make deploy [openshift|mpp]"; \
		echo "Available deployment targets: openshift, mpp"; \
		exit 1; \
	fi

openshift:
	@echo "Checking for oc CLI..."
	@which oc > /dev/null || (echo "Error: oc CLI not found. Please install OpenShift CLI." && exit 1)
	@echo "Validating namespace..."
	@if [ -z "$(NAMESPACE)" ]; then \
		echo "Error: NAMESPACE not set. Usage: make deploy openshift NAMESPACE=your-project"; \
		exit 1; \
	fi; \
	echo "Using namespace: $(NAMESPACE)"; \
	echo "Switching to namespace..."; \
	oc project $(NAMESPACE) || (echo "Error: Cannot switch to namespace '$(NAMESPACE)'. Check permissions." && exit 1); \
	echo "Updating namespace references..."; \
	sed -i.bak "s|NAMESPACE_PLACEHOLDER|$(NAMESPACE)|g" deployment/openshift/deployment.yaml; \
	sed -i.bak "s|namespace: template-ui|namespace: $(NAMESPACE)|g" deployment/openshift/kustomization.yaml; \
	echo "Creating BuildConfig and ImageStream..."; \
	oc apply -f deployment/openshift/buildconfig.yaml; \
	oc apply -f deployment/openshift/imagestream.yaml; \
	echo "Building container image from source..."; \
	oc start-build template-ui --from-dir=. --follow || (mv deployment/openshift/deployment.yaml.bak deployment/openshift/deployment.yaml 2>/dev/null; mv deployment/openshift/kustomization.yaml.bak deployment/openshift/kustomization.yaml 2>/dev/null; exit 1); \
	echo "Deploying resources to OpenShift..."; \
	oc apply -k deployment/openshift/ || (mv deployment/openshift/deployment.yaml.bak deployment/openshift/deployment.yaml 2>/dev/null; mv deployment/openshift/kustomization.yaml.bak deployment/openshift/kustomization.yaml 2>/dev/null; exit 1); \
	rm -f deployment/openshift/deployment.yaml.bak deployment/openshift/kustomization.yaml.bak; \
	echo "Deployment complete!"; \
	echo "Checking deployment status..."; \
	oc get pods -l app=template-ui; \
	echo ""; \
	echo "Useful commands:"; \
	echo "  View logs: oc logs -l app=template-ui --tail=100"; \
	echo "  Get route: oc get route template-ui"; \
	echo "  Check status: oc get pods,svc,route -l app=template-ui"

mpp:
	@echo "Checking for oc CLI..."
	@which oc > /dev/null || (echo "Error: oc CLI not found. Please install OpenShift CLI." && exit 1)
	@echo "Validating TENANT parameter..."
	@if [ -z "$(TENANT)" ]; then \
		echo "Error: TENANT not set. Usage: make deploy mpp TENANT=your-tenant"; \
		exit 1; \
	fi; \
	CONFIG_NAMESPACE="$(TENANT)--config"; \
	RUNTIME_NAMESPACE="$(TENANT)--template"; \
	echo "Config namespace: $$CONFIG_NAMESPACE"; \
	echo "Runtime namespace: $$RUNTIME_NAMESPACE"; \
	echo "Updating tenant.yaml with config namespace..."; \
	sed -i.bak "s|TENANT_PLACEHOLDER|$$CONFIG_NAMESPACE|g" deployment/mpp/tenant.yaml; \
	echo "Creating/switching to config namespace..."; \
	oc project $$CONFIG_NAMESPACE 2>/dev/null || oc new-project $$CONFIG_NAMESPACE || (echo "Error: Cannot create/switch to namespace '$$CONFIG_NAMESPACE'." && mv deployment/mpp/tenant.yaml.bak deployment/mpp/tenant.yaml 2>/dev/null && exit 1); \
	echo "Applying TenantNamespace CR to create runtime namespace..."; \
	oc apply -f deployment/mpp/tenant.yaml || (mv deployment/mpp/tenant.yaml.bak deployment/mpp/tenant.yaml 2>/dev/null && exit 1); \
	echo "Waiting for runtime namespace '$$RUNTIME_NAMESPACE' to be created..."; \
	COUNTER=1; \
	until oc get project $$RUNTIME_NAMESPACE 2>/dev/null || [ $$COUNTER -gt 30 ]; do \
		echo "Waiting for namespace... ($$COUNTER/30)"; \
		sleep 2; \
		COUNTER=$$((COUNTER + 1)); \
	done; \
	if [ $$COUNTER -le 30 ]; then \
		echo "Runtime namespace '$$RUNTIME_NAMESPACE' is ready"; \
	fi; \
	oc project "$(TENANT)--$(RUNTIME_NAMESPACE)" > /dev/null 2>&1 || (echo "Error: Runtime namespace '$$RUNTIME_NAMESPACE' was not created" && mv deployment/mpp/tenant.yaml.bak deployment/mpp/tenant.yaml 2>/dev/null && exit 1); \
	echo "Switching to runtime namespace..."; \
	oc project $$RUNTIME_NAMESPACE || (echo "Error: Cannot switch to runtime namespace '$$RUNTIME_NAMESPACE'" && mv deployment/mpp/tenant.yaml.bak deployment/mpp/tenant.yaml 2>/dev/null && exit 1); \
	echo "Creating BuildConfig and ImageStream..."; \
	oc apply -f deployment/mpp/buildconfig.yaml; \
	oc apply -f deployment/mpp/imagestream.yaml; \
	echo "Building container image from source..."; \
	oc start-build template-ui --from-dir=. --follow || (mv deployment/mpp/tenant.yaml.bak deployment/mpp/tenant.yaml 2>/dev/null; exit 1); \
	echo "Deploying resources to MPP..."; \
	oc apply -k deployment/mpp/ || (mv deployment/mpp/tenant.yaml.bak deployment/mpp/tenant.yaml 2>/dev/null; exit 1); \
	rm -f deployment/mpp/tenant.yaml.bak; \
	echo "Deployment complete!"; \
	echo "Checking deployment status..."; \
	oc get pods -l app=template-ui; \
	echo ""; \
	echo "Useful commands:"; \
	echo "  View logs: oc logs -l app=template-ui --tail=100"; \
	echo "  Get route: oc get route template-ui"; \
	echo "  Check status: oc get pods,svc,route -l app=template-ui"

undeploy:
	@if [ "$(filter openshift,$(MAKECMDGOALS))" = "openshift" ]; then \
		echo "Checking for oc CLI..."; \
		which oc > /dev/null || (echo "Error: oc CLI not found. Please install OpenShift CLI." && exit 1); \
		oc project $(NAMESPACE) || (echo "Error: Cannot switch to namespace '$(NAMESPACE)'" && exit 1); \
		echo "Removing OpenShift deployment..."; \
		oc delete deployment,service,route,configmap,secret,pvc,buildconfig,imagestream -l app=template-ui 2>/dev/null || true; \
		echo "Undeployment complete!"; \
		exit 1; \
	elif [ "$(filter mpp,$(MAKECMDGOALS))" = "mpp" ]; then \
		echo "Checking for oc CLI..."; \
		RUNTIME_NAMESPACE="$(TENANT)--template"; \
		which oc > /dev/null || (echo "Error: oc CLI not found. Please install OpenShift CLI." && exit 1); \
		oc project $$RUNTIME_NAMESPACE || (echo "Error: Cannot switch to runtime namespace '$$RUNTIME_NAMESPACE'" && exit 1); \
		echo "Removing MPP deployment..."; \
		oc delete deployment,service,route,configmap,secret,pvc,buildconfig,imagestream -l app=template-ui 2>/dev/null || true; \
		echo "Undeployment complete!"; \
		exit 1; \
	else \
		echo "Usage: make undeploy [openshift|mpp]"; \
		echo "Available undeployment targets: openshift, mpp"; \
		exit 1; \
	fi

%:
	@:
	
