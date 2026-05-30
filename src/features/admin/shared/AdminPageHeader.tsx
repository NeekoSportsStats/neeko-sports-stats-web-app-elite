import React from 'react';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
}

export function AdminPageHeader({ title, subtitle }: AdminPageHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-zinc-100">{title}</h1>
      {subtitle && <p className="text-sm text-zinc-400 mt-1">{subtitle}</p>}
    </div>
  );
}
