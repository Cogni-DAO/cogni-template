export type { ClientEnv } from "./client";
export { clientEnv } from "./client";
export type { ServerEnv } from "./server";
export { serverEnv } from "./server";

// Tiny helpers when needed
export const getEnv = (k: string): string | undefined => process.env[k];
export const requireEnv = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
};
