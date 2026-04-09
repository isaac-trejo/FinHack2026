import React from "react";

export function Card({
  children,
  className = "",
  title,
  subtitle,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-card-border bg-card p-5 shadow-sm ${className}`}
    >
      {title && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted/70">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
