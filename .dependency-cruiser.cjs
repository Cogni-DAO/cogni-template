// .dependency-cruiser.cjs
// Hexagonal architecture boundaries enforced via dependency-cruiser.
// Pure policy config - scope controlled via CLI --include-only flag.
// Production: depcruise src --include-only '^src' --output-type err-long
// Arch probes: depcruise src/__arch_probes__ --include-only '^src/__arch_probes__' --output-type err

/** @type {import('dependency-cruiser').IConfiguration} */

const layers = {
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

const knownLayerPatterns = Object.values(layers);

module.exports = {
  options: {
    // Use TS path resolution so @/aliases resolve to src/** correctly
    tsConfig: {
      fileName: "./tsconfig.json",
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
    // core → core only
    {
      from: { path: layers.core },
      to: { path: [layers.core] },
    },

    // ports → ports, core, types
    {
      from: { path: layers.ports },
      to: { path: [layers.ports, layers.core, layers.types] },
    },

    // features → features, ports, core, shared, types, components
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

    // Files not in a known layer are caught by the forbidden `no-unknown-layer` rule below.
  ],

  forbidden: [
    // Enforce "no-unknown-files": any file in src/** not covered by a known layer pattern is an error.
    {
      severity: "error",
      from: {
        path: "^src",
        pathNot: knownLayerPatterns,
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
  ],
};
