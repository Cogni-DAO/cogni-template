It is time to create a commit message for our current staged changes. Your job is to objectively analyze all code + documentation that has been created on this branch, and create a clear, structured commit message following Conventional Commits. You must be a realist of our current state (no overhyping functionality, test coverage, or code readiness. Default assume that our code is a barely functioning work-in-progress, MVP, or proof of concept.)

Your process:

1. **File Analysis**: First, examine ALL files that have been changed by using `git diff`, and reading actual file contents and documentation. Read through each: file changed, and corresponding AGENTS.md documentation to understand exactly what code was modified, added, or removed. Do NOT make assumptions about what changes do - verify by reading the actual implementation.

2. **Code Impact Verification**: For each file changed, understand what the code actually does by examining:
   - Function/method implementations that were modified
   - Import/export changes and their implications  
   - Configuration changes and their exact effects
   - Test changes and what they validate
   - Only describe what you can directly observe in the code changes

3. **Feature/Change Enumeration**: Create a precise list of every change made, based solely on what you observed in the code analysis. Be specific and factual - don't speculate about effects or benefits not directly evident in the code.

4. **Disjoint Feature Detection**: Critically analyze if the changes represent multiple unrelated features, fixes, or refactors. If you find disjoint features (changes that serve different purposes or could be implemented independently), you MUST call this out explicitly and recommend splitting into multiple separate commits.

5. **Git Message Creation**: If changes are coherent and related, proceed to write the appropriate Commit message. Prioritize clean, short commit messages. Avoid overhyping, use WIP whenever not fully complete.

The commit message should be structured as follows:

<type>[optional scope]: <description>

[optional body]

[optional footer(s)]



The commit contains the following structural elements, to communicate intent to the consumers of your library:

fix: a commit of the type fix patches a bug in your codebase (this correlates with PATCH in Semantic Versioning).
feat: a commit of the type feat introduces a new feature to the codebase (this correlates with MINOR in Semantic Versioning).
BREAKING CHANGE: a commit that has a footer BREAKING CHANGE:, or appends a ! after the type/scope, introduces a breaking API change (correlating with MAJOR in Semantic Versioning). A BREAKING CHANGE can be part of commits of any type.
types other than fix: and feat: are allowed, for example @commitlint/config-conventional (based on the Angular convention) recommends build:, chore:, ci:, docs:, style:, refactor:, perf:, test:, and others.
footers other than BREAKING CHANGE: <description> may be provided and follow a convention similar to git trailer format.
Additional types are not mandated by the Conventional Commits specification, and have no implicit effect in Semantic Versioning (unless they include a BREAKING CHANGE). A scope may be provided to a commit’s type, to provide additional contextual information and is contained within parenthesis, e.g., feat(parser): add ability to parse arrays.