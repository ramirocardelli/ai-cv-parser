import type { Metadata } from "next";
import Link from "next/link";
import {
  formatDate,
  getCandidates,
  getStatusClasses,
  getStatusLabel,
} from "@/lib/candidates";
import { cardClass, Eyebrow, PageShell, primaryButtonClass } from "@/components/ui";

export const instant = false;

export const metadata: Metadata = {
  title: "CV escaneados — CV/Parser",
};

const GRID = "sm:grid-cols-[minmax(0,1fr)_150px_190px_120px]";

export default async function CandidatesPage() {
  const candidates = await getCandidates();

  return (
    <PageShell
      action={
        <Link href="/" className={primaryButtonClass}>
          Escanear nuevo CV
        </Link>
      }
    >
      <section className="pb-10 pt-16 sm:pt-24">
        <Eyebrow>Historial</Eyebrow>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
              CV escaneados
            </h1>
            <p className="mt-4 text-slate-500">
              Consultá el estado y el resultado de cada procesamiento.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-500 backdrop-blur">
            {candidates.length} {candidates.length === 1 ? "escaneo" : "escaneos"}
          </span>
        </div>
      </section>

      {candidates.length === 0 ? (
        <section className="rounded-3xl border-2 border-dashed border-slate-200 bg-white/80 px-6 py-16 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-600">
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 16V4m0 0L8 8m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
            </svg>
          </div>
          <p className="mt-5 font-medium text-slate-800">Todavía no hay CV escaneados</p>
          <p className="mt-2 text-sm text-slate-400">
            Subí tu primer PDF para verlo en este historial.
          </p>
          <Link href="/" className={`${primaryButtonClass} mt-6`}>
            Escanear un CV →
          </Link>
        </section>
      ) : (
        <section className={`${cardClass} overflow-hidden`}>
          <div
            className={`hidden gap-4 border-b border-slate-100 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-400 sm:grid ${GRID}`}
          >
            <span>Archivo</span>
            <span>Estado</span>
            <span>Fecha</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-100">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <Link
                  href={`/candidates/${candidate.id}`}
                  className={`group grid gap-3 px-5 py-5 transition hover:bg-cyan-50/40 sm:items-center sm:gap-4 sm:px-6 ${GRID}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      {candidate.original_filename}
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-400">
                      {candidate.full_name || "Nombre pendiente de extraer"}
                    </p>
                  </div>
                  <span
                    className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(candidate.status)}`}
                  >
                    {getStatusLabel(candidate.status)}
                  </span>
                  <time className="text-sm text-slate-500" dateTime={candidate.created_at}>
                    {formatDate(candidate.created_at)}
                  </time>
                  <span className="text-sm font-semibold text-cyan-700 group-hover:text-cyan-900 sm:text-right">
                    Ver detalle →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
