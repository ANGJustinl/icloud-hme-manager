import { type ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center text-hme-muted">
      {icon && <div className="text-hme-muted/70">{icon}</div>}
      <div>
        <div className="text-sm font-medium text-hme-text">{title}</div>
        {description && <div className="mt-1 text-xs">{description}</div>}
      </div>
      {action}
    </div>
  );
}
