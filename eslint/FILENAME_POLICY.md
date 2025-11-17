# Filename Policy // [num] rule in `eslint.config.mjs`

**Global config exclusions:** ✅ common tool configs (_config_, _.rc_, next-env.d.ts), middleware.ts, AGENTS.md files. // 1
/
**Components:** ✅ src/components/**, src/features/\*/components/** → PascalCase(.client|.server)?.tsx; helpers camelCase.ts; no default exports. // 5, 6

**Hooks:** ✅ **/hooks/** → useName.ts|tsx only. No colocated tests or stories. // 7, 8

**App Router:** ✅ src/app/\*\* allow only page|layout|error|loading|not-found|template|default.tsx, route.ts, sitemap|robots.ts, opengraph-image|twitter-image.(ts|tsx|png|jpg), icon.(png|jpg|ico|svg), apple-icon.png, manifest.webmanifest, providers.tsx. No other files. // 9

**Ports:** ✅ src/ports/\*_ → _.port.ts only. // 10

**Adapters:** ✅ src/adapters/\*_ → _.adapter.ts, _.repo.ts, _.client.ts. // 10

**Contracts:** ✅ src/contracts/\*_ → _.contract.ts only. // 10

**Schemas:** ✅ src/shared/schemas/\*_ → _.schema.ts only. // 10

**Mappers:** ✅ src/shared/mappers/\*_ → _.mapper.ts only. // 10

**Features root files:** ✅ actions.ts, types.ts, constants.ts, index.ts; services services/\*\*.ts; ban utils.ts in features. // 11, 12, 13

**Tests:** ✅ unit _.test.ts|tsx or _.spec.ts|tsx; integration _.int.test.ts; contract _.contract.test.ts; e2e \*.spec.ts. Hook tests in /tests/** with useName.test.ts or useName.spec.ts. // 14  
**Contract split:\*\* tests/contract/<port-name>.contract.ts (harnesses) + tests/contract/<feature>.<action>.contract.test.ts (edge tests).

**Scripts:** ✅ scripts/\*\* → kebab-case with .ts preferred; allow .mjs|.cjs|.sh|.sql by exception. // 15

**Styles:** ✅ src/styles/\*\* → kebab-case .ts and .css files allowed. // 16

**Types:** ✅ ambient only in src/types/\*_ as _.d.ts; local type bags \*.types.ts elsewhere. // 17

**Shared utilities:** ✅ src/shared/util/\*\* → camelCase .ts files. // 18

**TODO:** Assets/Public kebab-case enforcement via CI script.
