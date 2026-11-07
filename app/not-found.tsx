import Link from "next/link";
import { Eyebrow, PageShell, primaryButtonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <PageShell>
      <section className="mx-auto max-w-xl pt-24 text-center">
        <Eyebrow>Error 404</Eyebrow>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950">
          Página no encontrada
        </h1>
        <p className="mt-4 text-slate-500">La página que buscás no existe.</p>
        <Link href="/" className={`${primaryButtonClass} mt-8`}>
          Ir al inicio
        </Link>
      </section>
    </PageShell>
  );
}
