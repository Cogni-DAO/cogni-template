/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  rules: {
    // type(scope)?: subject   — 72 char max header
    "header-max-length": [2, "always", 72],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    // kebab-case or empty
    "scope-case": [2, "always", "kebab-case"],
    // require subject
    "subject-empty": [2, "never"],
  },
};
