"use client";

import { useState } from "react";
import Link from "next/link";
import { ErrorBox, PageShell, pillLinkClass } from "@/components/ui";

type Result = {
  candidateId?: string;
  status?: string;
  candidate?: unknown;
  webhookResponse?: unknown;
  error?: string;
  details?: string;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function selectFile(selectedFile: File | undefined) {
    if (!selectedFile) return;
    setFile(selectedFile);
    setResult(null);
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files[0]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;

    setLoading(true);
    setResult(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/candidates", {
        method: "POST",
        body,
      });

      const data = (await response.json()) as Result;
      if (!response.ok) throw new Error(data.details || data.error);

      setResult(data);
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "Error inesperado",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell
      action={
        <Link href="/candidates" className={pillLinkClass}>
          Ver escaneos
        </Link>
      }
    >

        <section className="mx-auto max-w-3xl pb-12 pt-20 text-center sm:pt-28">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-600">
            Información profesional, en segundos
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-6xl">
            Convertí tu CV en
            <span className="block text-cyan-600">información útil.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-slate-500 sm:text-lg">
            Subí un PDF y dejá que nuestro pipeline extraiga la experiencia,
            habilidades y datos clave de forma automática.
          </p>
        </section>

        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          <label
            htmlFor="cv-file"
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`group block cursor-pointer rounded-3xl border-2 border-dashed p-2 transition ${
              isDragging
                ? "border-cyan-500 bg-cyan-50"
                : "border-slate-200 bg-white/80 hover:border-cyan-400 hover:bg-white"
            }`}
          >
            <div className="rounded-[1.35rem] px-6 py-12 text-center sm:px-12">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-600 transition group-hover:scale-105">
                <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 16V4m0 0L8 8m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                </svg>
              </div>
              <p className="mt-5 font-medium text-slate-800">
                {file ? file.name : "Arrastrá tu CV acá"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB · PDF listo para analizar`
                  : "o hacé clic para seleccionar un archivo PDF · máximo 10 MB"}
              </p>
              <input
                id="cv-file"
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(event) => selectFile(event.target.files?.[0])}
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={!file || loading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 font-medium text-white shadow-xl shadow-slate-950/15 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Procesando tu CV...
              </>
            ) : (
              <>Analizar CV <span aria-hidden="true">→</span></>
            )}
          </button>
        </form>

        {result?.error && (
          <div className="mx-auto mt-6 max-w-2xl">
            <ErrorBox title="No pudimos procesar el archivo">{result.error}</ErrorBox>
          </div>
        )}

        {result?.webhookResponse !== undefined && (
          <section className="mx-auto mt-12 max-w-4xl">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Resultado</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Respuesta del webhook</h2>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Completado</span>
            </div>
            {result.candidateId && (
              <Link
                href={`/candidates/${result.candidateId}`}
                className="mb-4 inline-flex text-sm font-semibold text-cyan-700 hover:text-cyan-900"
              >
                Ver detalle del escaneo →
              </Link>
            )}
            <pre className="max-h-[34rem] overflow-auto rounded-3xl border border-slate-200 bg-slate-950 p-6 text-left text-xs leading-6 text-cyan-100 shadow-2xl shadow-slate-950/10">
              {JSON.stringify(result.webhookResponse, null, 2)}
            </pre>
          </section>
        )}

        <footer className="pb-6 pt-16 text-center text-xs text-slate-400">
          Tus datos se procesan de forma segura y el resultado aparece acá mismo.
        </footer>
    </PageShell>
  );
}
