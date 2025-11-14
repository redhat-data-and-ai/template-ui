# MPP (Managed Platform) Deployment

This directory contains Kubernetes manifests for deploying the Template UI to Red Hat Managed Platform.

## Prerequisites

- Access to Red Hat Managed Platform cluster
- `kubectl` configured with cluster access
- Tenant name for your deployment
- Agent service deployed and accessible

## Quick Start

Deploy using the Makefile from the project root:

```bash
# Deploy to MPP
make deploy mpp TENANT=ask-data

# Remove deployment
make undeploy mpp TENANT=ask-data
```

## Configuration

### Required Secrets

Update `secret.yaml` before deploying:

```yaml
stringData:
  COOKIE_SIGN: ""                    # Generate a secure random key (min 32 chars)
  SSO_CLIENT_ID: ""                  # Optional: SSO client ID
  SSO_CLIENT_SECRET: ""              # Optional: SSO client secret
```

### ConfigMap Settings

Configure `configmap.yaml` for your environment:

| Setting | Default | Description |
|---------|---------|-------------|
| `ENVIRONMENT` | `production` | Runtime environment (development, staging, production) |
| `AUTH_ENABLED` | `true` | Enable/disable SSO authentication |
| `SSO_ISSUER_HOST` | Red Hat SSO | SSO provider URL |
| `SSO_CALLBACK_URL` | - | OAuth callback URL |
| `AGENT_HOST` | - | Backend agent service URL |

### Tenant Configuration

Update `tenant.yaml` with your tenant information:

```yaml
spec:
  tenantId: "ask-data"           # Your tenant ID
  appCode: "ASKD-001"            # Your application code
  costCenter: "12345"            # Your cost center
```

## Architecture

### Resources Deployed

| Resource | Name | Purpose |
|----------|------|---------|
| **BuildConfig** | template-ui | Build Node.js container from source |
| **ImageStream** | template-ui | Store built container images |
| **Deployment** | template-ui | Run UI application |
| **Service** | template-ui | Internal cluster service (port 8080) |
| **Route** | template-ui | External HTTPS access with TLS |
| **ConfigMap** | template-ui-config | Environment configuration |
| **Secret** | template-ui-secrets | Sensitive credentials |
| **Tenant** | ask-data | Multi-tenant configuration |

### Network Configuration

- **Service Port**: 8080 (HTTP)
- **Route**: HTTPS with edge termination
- **TLS**: Automatic certificate from platform

## Deployment Process

### Manual Deployment

```bash
# Navigate to deployment directory
cd deployment/mpp

# Update configuration files
# - secret.yaml: Add your secrets
# - configmap.yaml: Update AGENT_HOST and SSO settings
# - tenant.yaml: Set your tenant ID

# Apply manifests
kubectl apply -k .

# Verify deployment
kubectl get pods -l app=template-ui
kubectl logs -l app=template-ui --tail=50
```

### Build Process

The BuildConfig will:
1. Accept binary source upload
2. Build container using Containerfile (Node.js 24 Alpine)
3. Push to internal ImageStream
4. Trigger deployment rollout

### Verify Deployment

```bash
# Check pod status
kubectl get pods -l app=template-ui

# Check pod logs
kubectl logs -l app=template-ui -f

# Check route
kubectl get route template-ui

# Test health endpoint
ROUTE_URL=$(kubectl get route template-ui -o jsonpath='{.spec.host}')
curl https://${ROUTE_URL}/health
```

Expected health response:
```json
{
  "status": "ok"
}
```

## Troubleshooting

### Pod Fails to Start

Check logs for errors:
```bash
kubectl logs -l app=template-ui --tail=100
```

Common issues:
- Missing required secrets (COOKIE_SIGN)
- Invalid configuration values
- Agent backend unreachable
- SSO configuration errors (if AUTH_ENABLED=true)

### Build Failures

Check build logs:
```bash
kubectl logs -f bc/template-ui
```

Common issues:
- Containerfile syntax errors
- Missing dependencies in package.json
- Build timeout
- npm ci failures

### Route Not Accessible

Check route configuration:
```bash
kubectl describe route template-ui
```

Verify:
- TLS certificate is valid
- Route is admitted
- Service endpoints are available

### Agent Connection Issues

Check agent connectivity:
```bash
# From within the pod
kubectl exec -it deployment/template-ui -- sh
wget -O- $AGENT_HOST/health
```

Verify:
- AGENT_HOST URL is correct
- Agent service is running
- Network policies allow communication

### Authentication Issues

If SSO authentication fails:
```bash
# Check SSO configuration
kubectl exec -it deployment/template-ui -- sh
env | grep SSO
```

Verify:
- SSO_CLIENT_ID and SSO_CLIENT_SECRET are set
- SSO_CALLBACK_URL matches route hostname
- SSO_ISSUER_HOST is accessible

## Cleanup

Remove all resources:

```bash
# Using Makefile
make undeploy mpp TENANT=ask-data

# Or manually
kubectl delete -k deployment/mpp/
```

## Security Considerations

### Production Deployment Best Practices

1. **Secrets Management**:
   - Use external secrets operator
   - Rotate credentials regularly
   - Never commit secrets to git
   - Use strong random keys for COOKIE_SIGN (minimum 32 characters)

2. **Authentication**:
   - Keep AUTH_ENABLED=true in production
   - Use corporate SSO provider
   - Verify SSO token validation
   - Set secure cookie attributes

3. **Network Policies**:
   - Restrict ingress to authorized sources
   - Use network policies for pod isolation
   - Limit egress to agent service and SSO provider

4. **Resource Limits**:
   - Set appropriate CPU/memory limits
   - Configure horizontal pod autoscaling for production
   - Monitor resource usage

5. **Monitoring & Logging**:
   - Set up log aggregation
   - Configure health check monitoring
   - Enable metrics collection
   - Monitor agent backend latency

6. **TLS Configuration**:
   - Use edge termination for frontend
   - Verify backend agent uses HTTPS
   - Monitor certificate expiration

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Yes | `8080` | Server port |
| `ENVIRONMENT` | Yes | `production` | Runtime environment |
| `AUTH_ENABLED` | Yes | `true` | Enable authentication |
| `COOKIE_SIGN` | Yes | - | Cookie signing key (min 32 chars) |
| `SSO_CLIENT_ID` | If AUTH_ENABLED | - | SSO OAuth client ID |
| `SSO_CLIENT_SECRET` | If AUTH_ENABLED | - | SSO OAuth client secret |
| `SSO_ISSUER_HOST` | If AUTH_ENABLED | - | SSO provider base URL |
| `SSO_CALLBACK_URL` | If AUTH_ENABLED | - | OAuth callback URL |
| `AGENT_HOST` | Yes | - | Backend agent service URL |

## Support

For issues or questions:
- Check application logs: `kubectl logs -l app=template-ui`
- Review pod events: `kubectl describe pod -l app=template-ui`
- Test agent connectivity from pod
- Contact platform support team

