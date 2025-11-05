It's time to update documentation (specifically, */AGENTS.md files). Look at all staged files (or all files on the current branch, if requested by the user), and identify the subdirectory paths for each of these files. For every unique subdirectory, add a TODO to update the corresponding AGENTS.md file.

1. **Analyze current state**: Now, identify the current functionality of the current code, and what new/changed features it brings. Be a realist, and know that almost all code is an incomplete Work in Progress. Examine all code that was produced or modified, and assess current documentation in all relevant AGENTS.md files corresponding to subdirectories of edited files. 

2. **Perform Gap Analysis**: Identify precisely where this documentation is outdated, compared to our current codebase. Identify discrepancies between what the documentation states and what the code actually implements. Look for outdated descriptions, missing functionality, removed features, and changed interfaces or behaviors. It's time to surgically update the documentation.

3. **Update Documentation Systematically**: 
Rules for writing documentation:
   - Write in present tense describing current functionality. Avoid temporal markers like 'new', 'updated', 'recently added', 'now supports'
   - Maintain consistency with existing documentation patterns in the project
   - Follow DRY principles with coding. Don't repeat yourself
   - Use clear, concise language optimized for AI agent comprehension. structure documentation so future AI agents can quickly understand:
        -- Current capabilities and limitations
        -- Key interfaces and entry points
        -- Expected inputs and outputs
        -- Important behavioral patterns or constraints
        -- Dependencies and relationships with other components

   - In general, your Documentation updates should simplify and reduce documentation size of each file, not increase. Large documents are hard to process. Clean simple documents improve comprehension.
   - Never, EVER, use words like "complete", "comprehensive", "final", "production ready", etc. Words like this are red flags, indicate improper understandanding of the code, and will result in your changes being rejected.
