import type { ReactNode } from "react";

interface MboxPageShellProps {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}

export function MboxPageShell({ children, className = "", wide = false }: MboxPageShellProps) {
  return (
    <div className="min-h-screen relative">
      <div className="ambient-glow-1" aria-hidden />
      <div className="ambient-glow-2" aria-hidden />
      <div className={`${wide ? "wedding-container" : "mbox-container"} ${className}`.trim()}>
        {children}
      </div>
    </div>
  );
}
