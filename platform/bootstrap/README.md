# Bootstrap - Development Environment Setup

One-time development machine and repository setup installers.

## Install Scripts

Individual focused installers in `install/`:

- **`install-tofu.sh`** - OpenTofu (Infrastructure as Code)
- **`install-pnpm.sh`** - Node.js, pnpm, project dependencies, git hooks
- **`install-reuse.sh`** - REUSE tool (license compliance)
- **`install-docker.sh`** - Docker (containerization)

## Usage

### Complete Setup (Recommended)

Run all installers in sequence:

```bash
# From repository root
platform/bootstrap/install/install-pnpm.sh    # Node.js, project dependencies
platform/bootstrap/install/install-tofu.sh    # Infrastructure tooling
platform/bootstrap/install/install-docker.sh  # Container runtime
platform/bootstrap/install/install-reuse.sh   # License compliance
```

### Individual Tools

Install only specific tools as needed:

```bash
# Just the app development stack
platform/bootstrap/install/install-pnpm.sh

# Just infrastructure tooling
platform/bootstrap/install/install-tofu.sh
```

## Platform Support

- **macOS**: Full automated installation via Homebrew
- **Linux/Other**: Manual installation instructions provided

## Next Steps

After bootstrap:

```bash
pnpm dev     # Start development server
pnpm check   # Run all validation checks
```

For deployment:

```bash
cd platform/infra/providers/cherry/base
tofu init
```
