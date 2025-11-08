import { cva } from "class-variance-authority";

export const button = cva("inline-flex px-4 py-2", {
  variants: { size: { sm: "h-8", md: "h-10" } },
  defaultVariants: { size: "md" },
});

export const badge = cva("inline-flex text-xs", {
  variants: {},
  defaultVariants: {},
});
