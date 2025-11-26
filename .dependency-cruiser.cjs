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
  adaptersWorker: "^src/adapters/worker",
  adaptersCli: "^src/adapters/cli",
  adaptersTest: "^src/adapters/test",
  shared: "^src/shared",
  bootstrap: "^src/bootstrap",
  lib: "^src/lib",
  auth: "^src/auth\\.ts$",
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

    // lib → lib, ports, shared, types
    {
      from: { path: layers.lib },
      to: { path: [layers.lib, layers.ports, layers.shared, layers.types] },
    },

    // auth → auth, shared, types, lib
    {
      from: { path: layers.auth },
      to: { path: [layers.auth, layers.shared, layers.types, layers.lib] },
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

    // adapters/worker → adapters/worker, ports, shared, types
    {
      from: { path: layers.adaptersWorker },
      to: {
        path: [
          layers.adaptersWorker,
          layers.ports,
          layers.shared,
          layers.types,
        ],
      },
    },

    // adapters/cli → adapters/cli, ports, shared, types
    {
      from: { path: layers.adaptersCli },
      to: {
        path: [layers.adaptersCli, layers.ports, layers.shared, layers.types],
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
  ],
};
