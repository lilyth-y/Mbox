import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  disabled?: boolean;
  className?: string;
}

export function CollapsibleSection({
  title,
  summary,
  children,
  defaultOpen = false,
  disabled = false,
  className = "",
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={`rounded-xl border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.45)] overflow-hidden ${className}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[rgba(18,14,24,0.55)] disabled:cursor-not-allowed disabled:opacity-50"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-mbox-text">{title}</span>
        <span className="flex min-w-0 items-center gap-2">
          {summary && !open ? (
            <span className="truncate text-xs text-mbox-subtle">{summary}</span>
          ) : null}
          <ChevronDown
            size={16}
            className={`shrink-0 text-mbox-subtle transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open ? <div className="border-t border-[rgba(223,179,134,0.1)] p-4">{children}</div> : null}
    </div>
  );
}
