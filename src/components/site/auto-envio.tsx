'use client';

import type { ReactNode } from 'react';

/** <select> que envia o formulário ao mudar (como o onchange="this.form.submit()" do PHP). */
export function SelectAutoEnvio({ id, name, defaultValue, className, children }: { id: string; name: string; defaultValue: string; className?: string; children: ReactNode }) {
  return (
    <select id={id} name={name} defaultValue={defaultValue} className={className} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {children}
    </select>
  );
}
