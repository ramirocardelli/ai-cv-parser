import Link from "next/link";
import { Eyebrow, PageShell, primaryButtonClass } from "@/components/ui";

export default function CandidateNotFound() {
  return (
    <PageShell>
      <section className="mx-auto max-w-xl pt-24 text-center">
        <Eyebrow>Error 404</Eyebrow>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950">
          No encontramos este escaneo
        </h1>
        <p className="mt-4 text-slate-500">
          Puede que haya sido eliminado o que el enlace sea incorrecto.
        </p>
        <Link href="/candidates" className={`${primaryButtonClass} mt-8`}>
          Volver al historial
        </Link>
      </section>
    </PageShell>
  );
}
