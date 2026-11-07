"use client";

import { ErrorBox, PageShell, primaryButtonClass } from "@/components/ui";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageShell>
      <section className="mx-auto max-w-xl pt-24">
        <ErrorBox title="Algo salió mal">{error.message}</ErrorBox>
        <button onClick={reset} className={`${primaryButtonClass} mt-6`}>
          Reintentar
        </button>
      </section>
    </PageShell>
  );
}
