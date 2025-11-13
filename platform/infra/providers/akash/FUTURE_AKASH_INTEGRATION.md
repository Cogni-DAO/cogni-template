# Future Akash Integration Plan

## Overview

This document outlines the integration plan for Akash Network deployment using OSS building blocks for a complete crypto-native infrastructure stack.

## Architecture: EVM → Cosmos Bridge Flow

**User Payment → Safe Treasury → Akash Deployment**

```
Users (USDC) → Coinbase Commerce → Safe Multisig → Zodiac Automation →
Squid Router (EVM→Cosmos) → axlUSDC → Cosmos Multisig → Akash Stable Payments
```

## OSS Building Blocks

### 1. EVM Multisig + Policy/Automation

- **Safe**: Core multisig wallet
- **Zodiac modules**:
  - Delay: Time-locked transactions
  - Roles: Permission management
  - Reality: Oracle-based execution
  - Bridge: Cross-chain operations
- **Zodiac Safe App**: One-click module setup
- **Links**: [Safe](https://github.com/safe-global), [Zodiac](https://github.com/gnosis/zodiac)

### 2. Crypto Payments

- **Coinbase Commerce API**: Accept USDC from users
- **Sample SDKs**: Integration examples
- **OpenRouter Integration**: Automated LLM credit funding via Coinbase crypto top-ups
- **Links**: [Coinbase Commerce](https://docs.cdp.coinbase.com/commerce), [OpenRouter](https://openrouter.ai/docs)

### 3. EVM → Cosmos Bridge

- **Squid Router SDK**: EVM→Cosmos axlUSDC routes
- **Axelar GMP**: Message-passing for complex cross-chain logic
- **Links**: [Squid Router](https://docs.squidrouter.com), [Axelar](https://github.com/axelarnetwork)

### 4. Cosmos Multisig Treasury

- **Cosmos Multisig UI**: CosmJS-based multisig management
- **Capability**: Create/sign Akash transactions from multisig account
- **Links**: [Cosmos Multisig UI](https://github.com/cosmos/cosmos-multisig-ui)

### 5. Akash Payments + Deploy

- **Akash SDL**: Service Definition Language with Stable Payments (axlUSDC)
- **Akash Terraform Provider**: Infrastructure as code
- **CI Integration**: Automated deployments
- **Links**: [Akash Stable Payments](https://akash.network/docs/getting-started/stable-payment)

## Implementation Flow

1. **User Payment**: USDC via Coinbase Commerce → Safe multisig
2. **Automation Trigger**: Zodiac modules detect payment, initiate deployment
3. **Bridge Assets**: Squid Router converts USDC → axlUSDC on Cosmos
4. **Deploy Infrastructure**: Cosmos multisig signs Akash deployment transactions
5. **Resource Provisioning**: Akash network provisions containers per SDL specification

## Current Blocker: EVM/Cosmos Split

### Problem

- **Akash**: Requires Cosmos ecosystem (axlUSDC, Cosmos multisig)
- **OpenRouter**: Requires EVM payments (USDC on Ethereum/Base)
- **Complexity**: Bridge operations, dual wallet management, cross-chain coordination

### MVP Decision

**Using Cherry Servers for simplicity:**

- Single payment method (traditional or crypto)
- No cross-chain complexity
- Faster time-to-market
- Proven Terraform integration

## Future Migration Path

When ready to move to full crypto-native stack:

1. **Phase 1**: Implement Safe + Coinbase Commerce for user payments
2. **Phase 2**: Add Zodiac automation modules
3. **Phase 3**: Integrate Squid Router for EVM→Cosmos bridging
4. **Phase 4**: Deploy Cosmos multisig for Akash treasury management
5. **Phase 5**: Migrate from Cherry → Akash with stable payments

## Files in This Directory

- `main.tf`: Akash Terraform provider configuration (ready for future use)
- `variables.tf`: Akash deployment variables
- `deploy.yaml`: Akash SDL for Next.js container deployment
- `terraform.tfvars.example`: Configuration template

## Benefits of Future Akash Integration

- **True Decentralization**: No KYC requirements
- **Crypto-Native**: End-to-end crypto payments
- **Cost Efficiency**: Decentralized compute marketplace pricing
- **Censorship Resistance**: Decentralized infrastructure
- **Transparency**: All transactions on-chain

---

_Note: This integration is planned for post-MVP implementation once the core product is validated with Cherry Servers._
