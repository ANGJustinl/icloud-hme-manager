"use client";

import { type ChangeEvent } from "react";

interface ToggleProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}

/** iOS 风格开关，移植自脚本 .hme-toggle */
export function Toggle({ checked, disabled, onChange, ariaLabel }: ToggleProps) {
  return (
    <label className="relative inline-block h-5 w-9 shrink-0">
      <input
        type="checkbox"
        className="absolute h-0 w-0 opacity-0"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
      />
      <span
        className={`absolute inset-0 cursor-pointer rounded-full transition-colors ${
          checked ? "bg-hme-primary" : "bg-hme-border"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <span
          className={`absolute bottom-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
    </label>
  );
}
