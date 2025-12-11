# Chain Configuration

**Authority:** `.cogni/repo-spec.yaml` is the DAO's governance-controlled source of truth for which chain and wallet to use.

**Enforcement:** `src/shared/web3/chain.ts` defines deployment-time constants, and `repoSpec.server.ts` refuses to start if repo-spec doesn't match them.

---

## Invariants

1. **Repo-spec is source of truth** - DAO governance declares `chain_id` and `receiving_address` in `.cogni/repo-spec.yaml`
2. **Strongly typed** - `src/shared/web3/chain.ts` MUST export constants matching repo-spec or startup fails
3. **Schema enforces structure** - `repoSpec.schema.ts` validates repo-spec shape; `repoSpec.server.ts` validates chain alignment with `chain.ts`
4. **Single active chain per deployment** - No runtime chain switching; different builds for different chains
5. **Single path, different contents:** All deployments (dev/preview/prod) read `.cogni/repo-spec.yaml` from the same path; the app never branches on env to pick a different file.
6. **RPC in environment** - `EVM_RPC_URL` varies per deployment, never committed

---

## File Pointers

| File                                   | Role                                        | Owns                                                                |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| `.cogni/repo-spec.yaml`                | DAO governance (source of truth)            | `cogni_dao.chain_id`, `payments_in.credits_topup.receiving_address` |
| `src/shared/web3/chain.ts`             | Deployment constants (must match repo-spec) | `CHAIN`, `CHAIN_ID`, `USDC_TOKEN_ADDRESS`, `MIN_CONFIRMATIONS`      |
| `src/shared/config/repoSpec.schema.ts` | Structure validation                        | Zod schemas for repo-spec YAML                                      |
| `src/shared/config/repoSpec.server.ts` | Loader + alignment check                    | `getPaymentConfig()` validates `chain_id` === `CHAIN_ID`            |
| `.env`                                 | Runtime RPC endpoint                        | `EVM_RPC_URL`                                                       |

---

## Usage

```typescript
// ✅ CORRECT: Get DAO wallet from repo-spec, chain constants from code
import { CHAIN_ID, USDC_TOKEN_ADDRESS } from "@/shared/web3/chain";
import { getPaymentConfig } from "@/shared/config";

const { receivingAddress } = getPaymentConfig(); // DAO wallet (repo-spec)
const chainId = CHAIN_ID; // Chain constant (code)
const token = USDC_TOKEN_ADDRESS; // Token address (code)

// ❌ WRONG: Don't use getPaymentConfig() for chain constants
const { chainId } = getPaymentConfig(); // Use CHAIN_ID from chain.ts
```

---

## Validation Flow

```
.cogni/repo-spec.yaml (DAO governance)
         ↓
  Zod schema validation (structure)
         ↓
  chainId === CHAIN_ID check (alignment)
         ↓
  getPaymentConfig() returns { receivingAddress, provider }
```

Misalignment throws: `"Chain mismatch: repo-spec declares X, app requires Y"`

---

# Roadmap

## Environment-Specific Repo-Specs

3. **Preview vs prod wallets:** Preview and prod may use _different_ repo-spec YAMLs (e.g. different receiving addresses), but both MUST pass the same `repoSpec.schema.ts` validation and chain alignment checks.
4. **Config injection by infra:** CI/CD or orchestration mounts the appropriate repo-spec for each environment at `.cogni/repo-spec.yaml` (e.g. `repo-spec.preview.yaml` → mounted as `.cogni/repo-spec.yaml` in preview), keeping application code environment-agnostic.
5. **No env matrix in repo-spec:** Environment selection (`DEPLOY_ENVIRONMENT`, `APP_ENV`) is handled by env vars and adapter wiring; repo-spec describes “this node’s DAO identity,” not a multi-env config matrix.

## Long-Term Hardening: Signed Repo-Spec, Hash verification

1. **Signed repo-spec:** Repo-spec itself is signed by a DAO-controlled key; the app refuses to start unless repo-spec is both structurally valid and cryptographically signed.
2. **Policy at the edge:** Production policy enforces “only run images whose repo-spec hash and signature match the DAO-approved spec for this environment,” making Web2 runtime strictly bound to Web3-governed configuration.
3. **Repo-spec Revocation Policy:** A list of hashes of old vulnerable repo-specs that should not be trusted, regardless of trusted signature.
4. **Governance-critical artifact:** `.cogni/repo-spec.yaml` is treated like a bootloader config: any change to DAO chain/wallet must go through PR + CI on the main governance branch.
5. **Attested builds:** Build pipelines compute a hash of repo-spec and record `(git_commit, repo_spec_hash)` in a build attestation; production only runs images with approved `(commit, hash)` pairs.
