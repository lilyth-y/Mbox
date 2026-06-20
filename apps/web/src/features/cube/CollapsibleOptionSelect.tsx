import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface CollapsibleOptionItem<T extends string = string> {
  id: T;
  label: string;
  description?: string;
  swatchClass?: string;
}

interface CollapsibleOptionSelectProps<T extends string> {
  label: string;
  value: T;
  options: CollapsibleOptionItem<T>[];
  onChange: (id: T) => void;
  disabled?: boolean;
  className?: string;
  optionButtonClassName?: string;
  activeOptionClassName?: string;
  inactiveOptionClassName?: string;
}

export function CollapsibleOptionSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = "",
  optionButtonClassName = "",
  activeOptionClassName = "border-mbox-gold/50 bg-mbox-gold/15 text-mbox-gold",
  inactiveOptionClassName = "border-transparent bg-transparent text-mbox-muted hover:bg-[rgba(18,14,24,0.55)] hover:text-mbox-text",
}: CollapsibleOptionSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value) ?? options[0];

  return (
    <div
      className={`rounded-xl border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.45)] overflow-hidden ${className}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-[rgba(18,14,24,0.55)] disabled:cursor-not-allowed disabled:opacity-50"
        aria-expanded={open}
      >
        <span className="text-xs font-semibold text-mbox-muted">{label}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="truncate text-xs font-semibold text-mbox-gold">{selected?.label}</span>
          <ChevronDown
            size={14}
            className={`shrink-0 text-mbox-subtle transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open ? (
        <div className="border-t border-[rgba(223,179,134,0.1)] p-1.5 space-y-0.5">
          {options.map((option) => {
            const isActive = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className={`flex w-full flex-col rounded-lg border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${optionButtonClassName} ${
                  isActive ? activeOptionClassName : inactiveOptionClassName
                }`}
              >
                {option.swatchClass ? (
                  <div className={`mb-1.5 h-1.5 rounded-full bg-gradient-to-r ${option.swatchClass}`} />
                ) : null}
                <span className="text-xs font-semibold">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 text-[10px] leading-snug text-mbox-subtle">{option.description}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
