---
id: guide.candidate-parent-cutover
type: guide
title: Candidate-a Deployment-Parent Cutover
status: active
trust: draft
summary: Guarded one-time migration of candidate-a GitOps authority while preserving exact deploy refs, images, and workloads.
read_when: Reviewing or executing the candidate-a deployment-parent migration from canonical to the test parent.
owner: cogni-dev
created: 2026-08-18
verified: 2026-08-18
tags: [ci-cd, gitops, candidate-a, node-formation]
---

# Candidate-a deployment-parent cutover

This is the one controlled migration from `cogni-dao/cogni` to
`cogni-test-org/cogni-monorepo` as candidate-a's deployment parent. It is not a
provision or promotion path. The live VM, OpenBao/ESO data, databases, DNS, and
images remain in place.

The cutover is safe only when all of these are true:

1. The reviewed target-parent convergence PR is on target `main`.
2. The target `candidate-a` GitHub Environment has the only two secrets this
   cutover consumes: `VM_HOST` and `SSH_DEPLOY_KEY`. The first target-owned app
   flight additionally needs the Cloudflare token/zone pair. GitHub does not
   copy Environment secrets between forks.
3. `infra/candidate-a-parent-cutover.json` matches the current live seven-ref
   snapshot: the umbrella plus the six candidate AppSet branches.
4. Candidate flight is quiescent. The workflow fails if either source flight
   workflow is queued or running; operators must also hold new dispatches for
   the short maintenance window.

Dispatch `candidate-parent-cutover.yml` from target `main` and enter its exact
confirmation phrase. The workflow then:

- validates the fixed source, target, environment, root, and six-node roster;
- proves every live Application is Healthy/Synced at the reviewed canonical
  deploy-ref SHA and uses its reviewed image digest;
- atomically mirrors those exact seven refs and proves both commit and tree
  equality—never a one-SHA reseed;
- server-dry-runs and applies only the target-main candidate root Application;
- waits for root → app-of-apps → six AppSets → six Applications to resolve
  entirely through the target repository; and
- proves Application UIDs plus each Deployment's UID and complete desired
  `spec`—including pod template, images, resources, env, args, volumes,
  replicas, and strategy—are unchanged.

The uploaded proof artifact contains the pre/post normalized state. A changed
live source ref, missing target secret, unhealthy Application, app roster
change, image drift, or workload recreation fails closed before the cutover can
be called complete. If any check fails after the root apply, the workflow
automatically restores the frozen canonical root and leaves the proof artifact
for diagnosis.

After success, merge the canonical deployment-parent contract so the old
repository refuses candidate-a dispatches, then validate a normal candidate
flight from the target parent. Do not run the provisioner or the legacy
`bootstrap-per-node-deploy-branches.sh`; both seed from one SHA and would erase
the live per-node digest split this workflow preserves.
