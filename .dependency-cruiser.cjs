// .dependency-cruiser.cjs
// Hexagonal architecture boundaries enforced via dependency-cruiser.
// Pure policy config - scope controlled via CLI --include-only flag.
// Production: depcruise src packages --include-only '^(src|packages)' --output-type err-long
// Arch probes: depcruise src/__arch_probes__ --include-only '^src/__arch_probes__' --output-type err

/** @type {import('dependency-cruiser').IConfiguration} */

// src/ hexagonal layers
const srcLayers = {
  core: "^src/core",
  ports: "^src/ports",
  features: "^src/features",
  app: "^src/app",
  adapters: "^src/adapters",
  adaptersServer: "^src/adapters/server",
  adaptersTest: "^src/adapters/test",
  // adaptersWorker, adaptersCli: add when implemented
  shared: "^src/shared",
  bootstrap: "^src/bootstrap",
  lib: "^src/lib",
  auth: "^src/auth\\.ts$",
  proxy: "^src/proxy\\.ts$",
  components: "^src/components",
  styles: "^src/styles",
  types: "^src/types",
  assets: "^src/assets",
  contracts: "^src/contracts",
  mcp: "^src/mcp",
};

// Monorepo boundary layers (packages/)
const monorepoLayers = {
  packages: "^packages/",
  // services: "^services/",
};

const layers = { ...srcLayers, ...monorepoLayers };

// Only src/ layers are checked for "unknown layer" violations
const knownSrcLayerPatterns = Object.values(srcLayers);

module.exports = {
  options: {
    // Use TS path resolution so @/aliases resolve to src/** correctly
    tsConfig: {
      fileName: "./tsconfig.base.json",
    },

    // Track TypeScript type-only imports
    tsPreCompilationDeps: true,

    // Normal dependency-cruiser hygiene
    doNotFollow: {
      path: "node_modules",
    },
  },

  allowedSeverity: "error",

  allowed: [
    // core → core, types
    {
      from: { path: layers.core },
      to: { path: [layers.core, layers.types] },
    },

    // ports → ports, core, types
    {
      from: { path: layers.ports },
      to: { path: [layers.ports, layers.core, layers.types] },
    },

    // features → features, ports, core, shared, types, components, contracts
    {
      from: { path: layers.features },
      to: {
        path: [
          layers.features,
          layers.ports,
          layers.core,
          layers.shared,
          layers.types,
          layers.components,
          layers.contracts,
        ],
      },
    },

    // contracts → contracts, shared, types
    {
      from: { path: layers.contracts },
      to: { path: [layers.contracts, layers.shared, layers.types] },
    },

    // app → app, features, ports, shared, lib, contracts, types, components, styles, bootstrap, auth
    {
      from: { path: layers.app },
      to: {
        path: [
          layers.app,
          layers.features,
          layers.ports,
          layers.shared,
          layers.lib,
          layers.contracts,
          layers.types,
          layers.components,
          layers.styles,
          layers.bootstrap,
          layers.auth,
        ],
      },
    },

    // lib → lib, ports, shared, types, auth
    {
      from: { path: layers.lib },
      to: {
        path: [
          layers.lib,
          layers.ports,
          layers.shared,
          layers.types,
          layers.auth,
        ],
      },
    },

    // auth → auth, adapters, shared, types (bootstrap-level: framework wiring)
    {
      from: { path: layers.auth },
      to: {
        path: [layers.auth, layers.adapters, layers.shared, layers.types],
      },
    },

    // proxy → auth, lib, shared, types (edge layer: middleware)
    {
      from: { path: layers.proxy },
      to: { path: [layers.auth, layers.lib, layers.shared, layers.types] },
    },

    // mcp → mcp, features, ports, contracts, bootstrap
    {
      from: { path: layers.mcp },
      to: {
        path: [
          layers.mcp,
          layers.features,
          layers.ports,
          layers.contracts,
          layers.bootstrap,
        ],
      },
    },

    // adapters/server → adapters/server, ports, shared, types
    {
      from: { path: layers.adaptersServer },
      to: {
        path: [
          layers.adaptersServer,
          layers.ports,
          layers.shared,
          layers.types,
        ],
      },
    },

    // adapters/test → adapters/test, ports, shared, types
    {
      from: { path: layers.adaptersTest },
      to: {
        path: [layers.adaptersTest, layers.ports, layers.shared, layers.types],
      },
    },

    // shared → shared, types
    {
      from: { path: layers.shared },
      to: { path: [layers.shared, layers.types] },
    },

    // bootstrap → bootstrap, ports, adapters, shared, types
    {
      from: { path: layers.bootstrap },
      to: {
        path: [
          layers.bootstrap,
          layers.ports,
          layers.adapters,
          layers.shared,
          layers.types,
        ],
      },
    },

    // components → components, shared, types, styles
    {
      from: { path: layers.components },
      to: {
        path: [layers.components, layers.shared, layers.types, layers.styles],
      },
    },

    // styles → styles only
    {
      from: { path: layers.styles },
      to: { path: [layers.styles] },
    },

    // assets → assets only
    {
      from: { path: layers.assets },
      to: { path: [layers.assets] },
    },

    // types → types only (leaf layer: pure type definitions)
    {
      from: { path: layers.types },
      to: { path: [layers.types] },
    },

    // =========================================================================
    // Monorepo package rules
    // =========================================================================

    // packages/ can import within itself (internal)
    {
      from: { path: "^packages/" },
      to: { path: "^packages/" },
    },

    // src/ can import from packages/ (consumption)
    {
      from: { path: "^src/" },
      to: { path: "^packages/" },
    },

    // services/ can import from packages/ (consumption)
    {
      from: { path: "^services/" },
      to: { path: "^packages/" },
    },

    // services/ can import within itself (internal)
    {
      from: { path: "^services/" },
      to: { path: "^services/" },
    },

    // Files not in a known layer are caught by the forbidden `no-unknown-layer` rule below.
  ],

  forbidden: [
    // Enforce "no-unknown-files": any file in src/** not covered by a known layer pattern is an error.
    {
      name: "no-unknown-src-layer",
      severity: "error",
      from: {
        path: "^src",
        pathNot: knownSrcLayerPatterns,
      },
      to: {},
    },

    // Block parent-relative imports (../) - use @/ aliases instead
    {
      severity: "error",
      from: {
        path: "^src",
      },
      to: {
        path: "\\.\\./",
      },
    },

    // Entry point enforcement: block internal module imports
    // ports: must use @/ports (index.ts), not internal port files
    {
      name: "no-internal-ports-imports",
      severity: "error",
      from: {
        path: "^src/(?!ports/)",
      },
      to: {
        path: "^src/ports/(?!index\\.ts$).*\\.ts$",
      },
      comment: "Import from @/ports (index.ts), not internal port files",
    },

    // core: must use @/core (public.ts), not internal core files
    {
      name: "no-internal-core-imports",
      severity: "error",
      from: {
        path: "^src/(?!core/)",
      },
      to: {
        path: "^src/core/(?!public\\.ts$).*\\.ts$",
      },
      comment: "Import from @/core (public.ts), not internal core files",
    },

    // adapters/server: must use @/adapters/server (index.ts), not internal files
    // Exception: src/auth.ts is a bootstrap file that can import adapter internals
    {
      name: "no-internal-adapter-imports",
      severity: "error",
      from: {
        path: "^src/(?!adapters/server/)(?!auth\\.ts$)",
      },
      to: {
        path: "^src/adapters/server/(?!index\\.ts$).*\\.ts$",
      },
      comment:
        "Import from @/adapters/server (index.ts), not internal adapter files",
    },

    // adapters/test: must use @/adapters/test (index.ts), not internal files
    {
      name: "no-internal-test-adapter-imports",
      severity: "error",
      from: {
        path: "^src/(?!adapters/test/)",
      },
      to: {
        path: "^src/adapters/test/(?!index\\.ts$).*\\.ts$",
      },
      comment:
        "Import from @/adapters/test (index.ts), not internal test adapter files",
    },

    // features: only allow services/ and components/ subdirectories
    {
      name: "no-internal-features-imports",
      severity: "error",
      from: {
        path: "^src/(?!features/)",
      },
      to: {
        path: "^src/features/[^/]+/(mappers|utils|constants)/",
      },
      comment:
        "Only import from features/*/services or features/*/components subdirectories",
    },

    // AI _facades: must import from features/ai/public.ts, never features/ai/services/*
    // Prevents app-layer bypassing the feature boundary
    // TODO: Extend to all facades after refactor PR
    {
      name: "no-ai-facades-to-feature-services",
      severity: "error",
      from: {
        path: "^src/app/_facades/ai/",
      },
      to: {
        path: "^src/features/ai/services/",
      },
      comment:
        "AI app facades must import from features/ai/public.ts, not internal services",
    },

    // =========================================================================
    // Monorepo boundary rules: packages/, services/, src/ isolation
    // =========================================================================

    // packages/ cannot import from src/ or services/
    {
      name: "no-packages-to-src-or-services",
      severity: "error",
      from: {
        path: "^packages/",
      },
      to: {
        path: ["^src/", "^services/"],
      },
      comment:
        "packages/ must be standalone; cannot depend on src/ or services/",
    },

    // services/ cannot import from src/
    {
      name: "no-services-to-src",
      severity: "error",
      from: {
        path: "^services/",
      },
      to: {
        path: "^src/",
      },
      comment: "services/ cannot depend on Next.js app code in src/",
    },

    // src/ cannot import from services/
    {
      name: "no-src-to-services",
      severity: "error",
      from: {
        path: "^src/",
      },
      to: {
        path: "^services/",
      },
      comment: "src/ cannot depend on standalone services",
    },

    // Block deep imports into package internals (force use of package exports)
    // Allows index.ts (entrypoint), blocks other internal files
    {
      name: "no-deep-package-imports",
      severity: "error",
      from: {
        path: "^src/", // was "^(src|services)/"
      },
      to: {
        path: "^packages/[^/]+/src/(?!index\\.ts$)",
      },
      comment:
        "Import from package root (@cogni/setup-core), not internal paths",
    },

    // NOTE: NO_LANGCHAIN_IN_SRC is enforced via Biome noRestrictedImports
    // (biome/base.json) which blocks @langchain/** imports in src/.
    // src/ CAN import from @cogni/langgraph-graphs for InProc execution path.

    // =========================================================================
    // ai-core kernel boundary (AI_CORE_IS_KERNEL)
    // =========================================================================

    // ai-core cannot import ai-tools (ai-core defines interfaces; ai-tools implements)
    {
      name: "no-ai-core-to-ai-tools",
      severity: "error",
      from: {
        path: "^packages/ai-core/",
      },
      to: {
        path: "^packages/ai-tools/",
      },
      comment:
        "ai-core defines runtime interfaces; ai-tools implements them. No reverse dependency.",
    },

    // =========================================================================
    // Scheduler package boundary rules (per PACKAGES_ARCHITECTURE.md)
    // =========================================================================

    // db-schema: refs is the root — imports nothing from other slices
    {
      name: "no-refs-to-slices",
      severity: "error",
      from: {
        path: "^packages/db-schema/src/refs",
      },
      to: {
        path: "^packages/db-schema/src/(scheduling|auth|billing|ai)",
      },
      comment: "refs.ts is the FK root; must not import from domain slices",
    },

    // db-schema: slices cannot import each other (only refs allowed)
    {
      name: "no-cross-slice-schema-imports",
      severity: "error",
      from: {
        path: "^packages/db-schema/src/(scheduling|auth|billing|ai)\\.ts$",
      },
      to: {
        path: "^packages/db-schema/src/(scheduling|auth|billing|ai)\\.ts$",
      },
      comment: "Domain slices import from /refs only, never from each other",
    },

    // db-client must only be imported in server layers (prevent client bundle pollution)
    // Allowed: bootstrap, adapters, app/api (server routes), app/_facades, app/_lib
    // Blocked: features (may be used client-side), components, core, etc.
    {
      name: "db-client-server-only",
      severity: "error",
      from: {
        path: "^src/(features|components|core|styles|assets)/",
      },
      to: {
        path: "^packages/db-client/",
      },
      comment:
        "db-client contains postgres/drizzle; only server layers may import",
    },

    // =========================================================================
    // Services internal clean architecture (opt-in when folders exist)
    // =========================================================================

    // core/ and ports/ cannot import from adapters/
    {
      name: "no-service-core-or-ports-to-adapters",
      severity: "error",
      from: {
        path: "^services/[^/]+/src/(core|ports)/",
      },
      to: {
        path: "^services/[^/]+/src/adapters/",
      },
      comment: "core/ports cannot depend on adapters (clean architecture)",
    },

    // adapters/ cannot import main.ts (composition root)
    {
      name: "no-service-adapters-to-main",
      severity: "error",
      from: {
        path: "^services/[^/]+/src/adapters/",
      },
      to: {
        path: "^services/[^/]+/src/main\\.ts$",
      },
      comment: "adapters must not import the composition root",
    },

    // =========================================================================
    // Scheduler worker boundary rules (per SCHEDULER_SPEC.md)
    // =========================================================================

    // scheduler-worker must not import schedule-control modules (WORKER_NEVER_CONTROLS_SCHEDULES)
    {
      name: "no-worker-schedule-control",
      severity: "error",
      from: {
        path: "^services/scheduler-worker/",
      },
      to: {
        path: ["schedule-control", "ScheduleControl"],
      },
      comment:
        "Per WORKER_NEVER_CONTROLS_SCHEDULES: worker executes workflows only, CRUD endpoints are schedule authority",
    },
  ],
};
