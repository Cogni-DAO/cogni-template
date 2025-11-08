import { button } from "@/styles/ui";

export function Button(props: { size?: "sm" | "md" }) {
  return <button className={button({ size: props.size })} {...props} />;
}
