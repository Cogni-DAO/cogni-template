It is time to create a pull request for our current branch. Your job is to objectively analyze all code + documentation that has been created on this branch, and create a clear, structured Pull Request title and summary for it. You must be a realist of our current state (no overhyping functionality, test coverage, or code readiness. Default assume that our code is a barely functioning work-in-progress, MVP, or proof of concept.)

Your process:

1. **Complete File Analysis**: First, examine ALL files that have been changed by checking the commit log, using `git diff`, and reading actual file contents and documentation. Read through each: commit message, files changed, and corresponding AGENTS.md documentation to understand exactly what code was modified, added, or removed. Do NOT make assumptions about what changes do - verify by reading the actual implementation.

2. **Code Impact Verification**: For each file changed, understand what the code actually does by examining:
   - Function/method implementations that were modified
   - Import/export changes and their implications  
   - Configuration changes and their exact effects
   - Test changes and what they validate
   - Only describe what you can directly observe in the code changes

3. **Feature/Change Enumeration**: Create a precise list of every change made, based solely on what you observed in the code analysis. Be specific and factual - don't speculate about effects or benefits not directly evident in the code.

4. **Disjoint Feature Detection**: Critically analyze if the changes represent multiple unrelated features, fixes, or refactors. If you find disjoint features (changes that serve different purposes or could be implemented independently), you MUST call this out explicitly and recommend splitting the commit/PR.

5. **Git Message Creation**: Only if changes are coherent and related, proceed to write the appropriate Pull Request. Push the code to Origin, and create the **Pull Request**: Write a clean, simple PR title and summary using the structured template below. 
   
   **PR Template Format:**
   ```
   ## Context
   Problem and why it matters.

   ## Change
   What you changed at a high level.

   ## Risk & Impact
   User-facing impact, perf, security, migration notes.

   ## Rollout / Backout
   How to deploy, how to revert.

   ## Evidence
   - CI run: <link>
   - Logs/Screenshots: <links or inline snippets>
   - Manual validation (only if needed): numbered steps
   ```

   **CRITICAL: Evidence Section Requirements:**
   - Note: Evidence can only be mentioned IFF you have done it yourself, or the user has explicitly said they have run manual validation.
   - Only include evidence you can directly verify from the changes or user-provided links
   - If CI runs, test results, or deployment validations haven't been provided, use placeholders like `<!-- CI run pending -->` or `<!-- Manual validation: [describe steps] -->`
   - NEVER claim functionality works without direct evidence
   - NEVER make up links, test results, or validation outcomes
   - If unsure about rollout/backout procedures, state `<!-- Rollout procedure: [needs definition] -->` rather than guessing

   **Example PR:**
   ```
   Title: fix: resolve E2E test connectivity and deployment issues

   ## Context
   Fix E2E connectivity and deployment breakages in DigitalOcean preview.

   ## Change
   - SSL/TLS: Cleaned proxy headers affecting SNI/ALPN and set explicit TLS options.
   - E2E: Fixed Actions failures (restore package-lock, TS import paths, artifact gen).
   - DO App: Added health checks, ingress routing, and GitHub App key docs.
   - Auth: Env-aware installation ID mapping for dev vs prod.

   ## Risk & Impact
   Modules edited: 
   - e2e and .do directories
   - constrained to test files, and preview deployment configuration
   - preview app spec updated URL path. any current webhooks to the old URL need to be updated.

   ## Rollout / Backout
   Deploy preview → verify health at `/api/v1/health` → merge. Revert commit to back out.

   ## Evidence
   - CI and E2E passes
   - User stated manual validation

   ```
   

**Code Quality & Architecture (Required ≥0.8)**:
- Create 1:1 mapping between git message and actual code changes - no exaggeration, no omissions
- Ensure coherent, singular purpose - reject mixed unrelated changes
- Verify no duplication of existing functionality
- Confirm no reimplementation of mature OSS tools

**Repository Goal Alignment (Required ≥0.8)**:
- Demonstrate how changes advance the Cogni Admin GitHub bot for DAO-controlled repository management

**Documentation & Patterns (One Required ≥0.9)**:
- Follow established patterns, OR document new patterns clearly, OR improve accessibility for contributors, OR document new dependencies

**Writing Style & Precision Requirements**:
- Stay grounded and factual - no hype or marketing language
- **AVOID BANNED BUZZWORDS**: Never use terms like "production ready", "comprehensive", "robust", "enterprise-grade", "scalable", "performant" - these are red flags, and your message will be rejected.
- **Be concise and precise**: Every statement must be directly verifiable from the code changes
- **Evidence-based claims only**: If you can't point to specific lines of code that support a claim, don't make it
- **No speculation**: Don't describe effects, performance improvements, or bug fixes unless they're obvious from the code
- **Acknowledge uncertainty**: Use phrases like "<!-- needs verification -->" when unsure rather than making confident but unsubstantiated claims
- Be clear about what exists vs. what's new
- Acknowledge any limitations or shortcomings honestly. This codebase is a always a work in progress
- Explain why this code is essential (or not) to the codebase scope
- Use precise, technical language that describes actual functionality

If changes don't meet criteria or are disjoint, recommend splitting or refactoring before commit/PR creation. Your job is to ensure every git message accurately represents the changes and that commits/PRs have the highest chance of passing evaluation and advancing the project goals effectively.
