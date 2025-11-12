# Handoff Summary: Spheron Deployment Implementation

## Project Goal

Deploy Next.js container on Spheron (managed Akash layer) via OpenTofu and bind www.cognidao.org domain. Spheron accepts crypto payments and provides simplified container deployment on Akash Network.

## Task Status: ~80% Complete

✅ **Completed:**

- Added `/health` API route at `src/app/health/route.ts` for health checks
- Created production `Dockerfile` with Node.js 20 Alpine, multi-stage build
- Updated `next.config.ts` to use `output: 'standalone'` for containerization
- Created OpenTofu configuration in `infra/terraform/spheron/main.tf`
- Created `infra/terraform/spheron/AGENTS.md` documentation
- Updated root documentation to reference Spheron/Akash

🔄 **In Progress:**

- Final validation with `pnpm check` needed
- Documentation updates were partially interrupted

## Key Reference Files

### Core Implementation

- **`infra/terraform/spheron/main.tf`** - OpenTofu configuration with Spheron provider, autoscaling (1-3 replicas), health checks
- **`infra/terraform/spheron/AGENTS.md`** - Deployment documentation and usage instructions
- **`Dockerfile`** - Production container build with standalone Next.js output
- **`src/app/health/route.ts`** - Health endpoint returning JSON status for Spheron monitoring

### Architecture Context

- **`AGENTS.md`** - Root architecture guidance, updated to reference Spheron
- **`infra/AGENTS.md`** - Infrastructure layer boundaries and responsibilities
- **`next.config.ts`** - Configured for standalone output mode

## Remaining Work

1. **Run validation:** `pnpm check` to ensure all changes pass linting/testing
2. **Test deployment flow:**
   - Build/push image to `ghcr.io/cogni-dao/cogni-template:main`
   - Deploy via OpenTofu with required env vars
   - Configure DNS CNAME
3. **Verify deployment:** Test health endpoint and domain resolution

## Prerequisites for Deployment

- Spheron org + PAT with Compute permissions
- DNS access for cognidao.org (preferably Cloudflare)
- OpenTofu installed locally
- Docker registry access (GHCR)

## Architecture Notes

- Follows hexagonal architecture - no app logic in infra layer
- Uses AGENTS.md pattern throughout (not README files)
- OpenTofu/Terraform equivalency maintained in documentation
- Spheron described as "managed Akash layer with crypto payments"
