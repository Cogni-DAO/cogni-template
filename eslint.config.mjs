import base from "./eslint/base.config.mjs";
import app from "./eslint/app.config.mjs";
import filename from "./eslint/filename.config.mjs";
import tests from "./eslint/tests.config.mjs";
import noRawTailwind from "./eslint/no-raw-tailwind.config.mjs";

/** @type {import('eslint').Linter.Config[]} */
export default [...base, ...app, ...filename, ...tests, ...noRawTailwind];
