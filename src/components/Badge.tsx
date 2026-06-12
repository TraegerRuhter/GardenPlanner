import type { ReactNode } from "react";
import { badgeTone } from "./badgeTone";

export function Badge({
  tone = badgeTone.neutral,
  children,
}: {
  tone?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}
    >
      {children}
    </span>
  );
}
