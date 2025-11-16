# Cogni Template

A production-ready Next.js template for AI-powered autonomous organizations.

## There are 2 ways you could be using this repository! Which are you?

### 1. 👨‍💻 Contributor: Improve the Template

**Goal:** Develop improvements and merge back into CogniDAO repo  
_We love you! ❤️_

```bash
git clone https://github.com/Cogni-DAO/cogni-template
cd cogni-template
pnpm setup local     # Automated setup TODO: lol sorry, cp .env.example .env
pnpm dev:stack       # Start developing with full stack (DB + LiteLLM + Next.js)
pnpm docker:stack    # Full production simulation (https://localhost - browser cert warning expected)
```

**You'll need:** [OpenRouter API key](https://openrouter.ai/keys) for AI features

### 2. 🚀 Fork Owner: Launch Your Own DAO

**Goal:** Create your own autonomous organization with your unique direction  
_We love you too, go for it! 🎯_

```bash
pnpm setup local                    # Local development
pnpm setup infra --env preview      # Infrastructure + SSH keys
pnpm setup infra --env production   # Production infrastructure
pnpm setup github --env preview     # GitHub secrets + branch protection
pnpm setup github --env production  # Production GitHub setup
```

---

## Setup Status: What's Scripted vs Manual

_We're working to automate more of this! Want to help? Contribute setup automation._

### ✅ Current Script Support

- **`platform/bootstrap/install/*`** - Tool installation (pnpm, docker, tofu, reuse)
- **`tofu apply`** - VM provisioning (when manually configured)

### ⚠️ Current Manual Setup Required

**For Contributors:**

- Get [OpenRouter API key](https://openrouter.ai/keys) for AI features
- Copy `.env.example` → `.env.local` and fill in values
- `pnpm install` and `pnpm dev:stack`

**For Fork Owners (everything above, plus):**

**Infra Setup** _(see [deploy.md](platform/runbooks/DEPLOY.md) for details)_

- Generate SSH keys for deployment, move to folder, commit
- Get [Cherry Servers auth token](https://portal.cherryservers.com/settings/api-keys)
- Update `.tfvars` files with your settings
- Run `tofu apply`

**GitHub Environment Setup**

- Create [GitHub PAT](https://github.com/settings/tokens/new?scopes=read:packages) for container registry CI/CD
- Enable your git repo to contribute packages to your git org
- Set up GitHub environments and secrets manually
- Configure branch protection rules (see docs/CI-CD.md)
- **SonarCloud setup:** Generate token at [SonarCloud Security](https://sonarcloud.io/account/security) → Add as `SONAR_TOKEN` repository secret

**DAO Setup**

- Run `make dao-setup` from [cogni-signal-evm-contracts](https://github.com/Cogni-DAO/cogni-signal-evm-contracts)

---

**Coming Soon:** `pnpm setup local|infra|github|dao` commands to automate these steps!
