import Link from "next/link";
import type { ReactNode } from "react";

export const cardClass =
  "rounded-3xl border border-slate-200 bg-white/85 shadow-xl shadow-slate-950/5";

export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800";

export const pillLinkClass =
  "rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-500 backdrop-blur transition hover:border-cyan-300 hover:text-cyan-700";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-lg text-white shadow-lg shadow-slate-950/20">
        ✦
      </span>
      <span className="font-semibold tracking-tight text-slate-900">
        CV<span className="text-cyan-600">/</span>Parser
      </span>
    </Link>
  );
}

export function PageShell({
  action,
  children,
}: {
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden px-5 py-8 sm:px-8 sm:py-12">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-violet-300/20 blur-3xl" />

      <div className="relative mx-auto max-w-5xl">
        <header className="flex items-center justify-between">
          <Logo />
          {action}
        </header>
        {children}
      </div>
    </main>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-600">
      {children}
    </p>
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${cardClass} p-6 sm:p-8 ${className}`}>
      {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
      {children}
    </section>
  );
}

export function ErrorBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 break-words text-red-600/80">{children}</p>
    </div>
  );
}
