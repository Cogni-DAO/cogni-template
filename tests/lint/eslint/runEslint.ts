// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/runEslint`
 * Purpose: Test harness for running ESLint against temporary fixture files with real config.
 * Scope: Creates temp projects, patches config for testing. Does NOT modify actual config.
 * Invariants: Uses real eslint.config.mjs; strips type-checking; preserves all other rules.
 * Side-effects: IO (creates/deletes temp files and directories)
 * Notes: Handles plugin deduplication, TypeScript project setup, path resolution.
 * Links: eslint.config.mjs, tests/lint/fixtures/
 * @public
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ESLint } from "eslint";

type ESLintConfig = Omit<ESLint.ConfigData, "plugins"> & {
  languageOptions?: {
    parserOptions?: {
      project?: string;
      projectService?: boolean;
      projects?: string[];
    };
  };
  plugins?: Record<string, object>;
};

interface TSRule {
  meta?: {
    docs?: {
      requiresTypeChecking?: boolean;
    };
  };
}

// Strip type-aware parser options only, preserve all other settings
function stripTypeProjects(flat: ESLintConfig[]): ESLintConfig[] {
  return flat.map((e: ESLintConfig) => {
    const out = { ...e };

    // Strip type-aware parser options
    if (out.languageOptions?.parserOptions) {
      out.languageOptions = { ...out.languageOptions };
      out.languageOptions.parserOptions = {
        ...out.languageOptions.parserOptions,
      };
      delete out.languageOptions.parserOptions.project;
      delete out.languageOptions.parserOptions.projectService;
      delete out.languageOptions.parserOptions.projects;
    }

    // Preserve all settings including boundaries configuration
    out.settings = { ...(e.settings ?? {}) };

    return out;
  });
}

// Disable ONLY rules that require type info
async function disableTypedTsRules(
  flat: ESLintConfig[]
): Promise<ESLintConfig[]> {
  const tsPlugin = (await import("@typescript-eslint/eslint-plugin")).default;

  // Build list of rule ids that require types
  const typedRuleIds = Object.entries(tsPlugin.rules)
    .filter(
      ([, rule]) => (rule as TSRule)?.meta?.docs?.requiresTypeChecking === true
    )
    .map(([name]) => `@typescript-eslint/${name}`);

  return flat.map((entry: ESLintConfig) => {
    if (!entry.rules) return entry;
    const rules = { ...entry.rules };
    for (const id of typedRuleIds) {
      if (id in rules) rules[id] = "off";
    }
    return { ...entry, rules };
  });
}

// Preserve plugins in each entry but dedupe identical plugin objects
function preservePluginContext(flat: ESLintConfig[]): ESLintConfig[] {
  const seenPlugins: Record<string, object> = Object.create(null);

  // First pass: collect unique plugin objects
  for (const entry of flat) {
    const p = entry.plugins;
    if (!p) continue;
    for (const [name, pluginObj] of Object.entries(p)) {
      if (!(name in seenPlugins)) {
        seenPlugins[name] = pluginObj; // keep first reference
      }
    }
  }

  // Second pass: replace all plugin references with the same object instance
  // This prevents ESLint plugin redefinition errors while preserving context
  for (const entry of flat) {
    if (entry.plugins) {
      const updatedPlugins: Record<string, object> = {};
      for (const [name, _] of Object.entries(entry.plugins)) {
        if (seenPlugins[name]) {
          updatedPlugins[name] = seenPlugins[name];
        }
      }
      entry.plugins = updatedPlugins;
    }
  }

  return flat;
}

interface LintOptions {
  focusRulePrefixes?: string[]; // e.g. ["boundaries/"]
  ignoreRules?: string[]; // optional future use
}

export async function lintFixture(
  relPath: string,
  code?: string,
  options: LintOptions = {}
): Promise<{
  errors: number;
  warnings: number;
  messages: { ruleId: string | null; message: string; line: number }[];
}> {
  const root = mkdtempSync(path.join(tmpdir(), "eslint-case-"));

  // Create project files
  writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["src/*"] },
        },
      },
      null,
      2
    )
  );

  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ type: "module" }, null, 2)
  );

  writeFileSync(path.join(root, "next-env.d.ts"), ""); // silence Next typings

  // Create source file with proper directory structure
  const absFile = path.join(root, relPath);
  mkdirSync(path.dirname(absFile), { recursive: true });

  if (code) {
    writeFileSync(absFile, code, { encoding: "utf8" });
  } else {
    // Use existing fixture file
    const fixtureContent = readFileSync(
      path.resolve(`tests/lint/fixtures/${relPath}`),
      "utf8"
    );
    writeFileSync(absFile, fixtureContent, { encoding: "utf8" });
  }

  // Load and patch real flat config
  const repoFlat = (
    await import(pathToFileURL(path.resolve("eslint.config.mjs")).href)
  ).default;
  let flat = Array.isArray(repoFlat) ? repoFlat.slice() : [repoFlat];

  flat = stripTypeProjects(flat);
  flat = await disableTypedTsRules(flat);
  flat = preservePluginContext(flat);

  // Silence Next.js plugin warnings
  for (const entry of flat) {
    if (entry.rules) {
      entry.rules = {
        ...entry.rules,
        "@next/next/no-html-link-for-pages": "off",
      };
    }
  }

  // Add resolver to first entry, preserving all settings
  const firstEntry = flat[0] ?? {};
  const existingSettings = firstEntry.settings ?? {};
  const existingResolver = existingSettings["import/resolver"] ?? {};

  flat[0] = {
    ...firstEntry,
    settings: {
      ...existingSettings,
      "import/resolver": {
        ...existingResolver,
        typescript: {
          project: path.join(root, "tsconfig.json"),
        },
        node: { extensions: [".ts", ".tsx", ".js", ".jsx"] },
      },
    },
  };

  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true, // Don't load config from disk
    overrideConfig: flat, // Use our patched config instead
    errorOnUnmatchedPattern: false,
  });

  const [res] = await eslint.lintFiles([absFile]);
  let messages = res?.messages ?? [];

  // Apply focus filtering if specified
  if (options.focusRulePrefixes && options.focusRulePrefixes.length > 0) {
    messages = messages.filter((m) =>
      options.focusRulePrefixes?.some((prefix) => m.ruleId?.startsWith(prefix))
    );
  }

  // Apply ignore filtering if specified
  if (options.ignoreRules && options.ignoreRules.length > 0) {
    messages = messages.filter(
      (m) => !options.ignoreRules?.includes(m.ruleId ?? "")
    );
  }

  return {
    errors: messages.filter((m) => m.severity === 2).length,
    warnings: messages.filter((m) => m.severity === 1).length,
    messages: messages.map((m) => ({
      ruleId: m.ruleId,
      message: m.message,
      line: m.line,
    })),
  };
}
