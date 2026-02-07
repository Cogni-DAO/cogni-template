# MVP Deliverables

> [!CRITICAL]
> MVP Node must be a closed-loop sovereign DAO+app. MVP Operator services are value-add, not dependencies.

## MVP Node

A fully functioning DAO+app with closed-loop operations:

| Deliverable             | Description                                   | Status      |
| ----------------------- | --------------------------------------------- | ----------- |
| **DAO Wallet**          | Multisig/Governor-controlled treasury         | Implemented |
| **On-chain Governance** | Token + Governor (or Safe) contracts          | Implemented |
| **Payment Receiver**    | USDC receiver for incoming revenue            | Implemented |
| **Self-Deployable App** | Docker + OpenTofu → Akash/Spheron             | Implemented |
| **AI Inference**        | Node's own provider keys + billing            | Partial     |
| **Repo-Spec Policy**    | `.cogni/repo-spec.yml` for Node configuration | Partial     |

### Manual Fallbacks (When Not Using Operator)

| Operator Feature               | Manual Fallback                |
| ------------------------------ | ------------------------------ |
| PR code review (git-review)    | Human review against repo-spec |
| Repo admin actions (git-admin) | Manual via GitHub/GitLab UI    |
| Cred scoring (cognicred)       | Manual tracking / spreadsheet  |

---

## MVP Operator

Value-add services for Nodes. **Not required for Node operation.**

| Service               | Description                                              | Delivery |
| --------------------- | -------------------------------------------------------- | -------- |
| **git-review-daemon** | PR code review against repo-spec rubric                  | MVP      |
| **git-admin-daemon**  | DAO-authorized repo admin actions (merge, collaborators) | MVP      |

### Self-Host Option

Both MVP Operator services will be open-sourced as standalone deployables:

- Sovereign Nodes can run their own instances
- No Cogni Operator account required
- Same codebase, different deployment target

---

## Explicit vNext (Out of Scope for MVP)

| Item                           | Reason Deferred                                             |
| ------------------------------ | ----------------------------------------------------------- |
| **cognicred scoring engine**   | Requires event backbone + proven value from git-review      |
| **One-click Node launcher**    | Requires stable Node template + Operator infrastructure     |
| **Operator-level contracts**   | Registry/factory contracts only needed at scale (5-10 DAOs) |
| **Federated Node discovery**   | Narrative-only until multiple DAOs earning                  |
| **broadcast-cogni service**    | Content generation deferred until core services proven      |
| **AI inference proxy**         | Nodes pay providers directly; proxy is optimization         |
| **Automated template updates** | Requires stable versioning + multiple downstream forks      |

---

## Success Criteria

### MVP Node Complete When:

- [ ] DAO can receive USDC payment on-chain
- [ ] DAO can execute governance proposal to transfer funds
- [ ] App deploys to Akash/Spheron via documented process
- [ ] AI features work with Node-owned provider keys
- [ ] Repo forks and runs without Cogni accounts

### MVP Operator Complete When:

- [ ] git-review-daemon reviews PRs against repo-spec
- [ ] git-admin-daemon executes DAO-authorized merge
- [ ] At least one external Node consuming services
- [ ] Standalone OSS versions published

---

**Last Updated**: 2025-01-13
**Status**: Design Approved
