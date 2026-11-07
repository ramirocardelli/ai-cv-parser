import Link from "next/link";
import { Card, Eyebrow, PageShell, pillLinkClass } from "@/components/ui";
import { notFound } from "next/navigation";
import {
  formatDate,
  getCandidate,
  getCandidateProfile,
  getObjectListValues,
  getObjectValues,
  getStatusClasses,
  getStatusLabel,
} from "@/lib/candidates";

type CandidatePageProps = {
  params: Promise<{ id: string }>;
};

export const instant = false;

export default async function CandidateDetailPage({ params }: CandidatePageProps) {
  const { id } = await params;
  const candidate = await getCandidate(id);

  if (!candidate) notFound();
  const profile = getCandidateProfile(candidate);
  const skills = [...profile.technicalSkills, ...profile.softSkills];

  return (
    <PageShell
      action={
        <Link href="/candidates" className={pillLinkClass}>
          ← Volver al historial
        </Link>
      }
    >
        <section className="pt-16 sm:pt-24">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <Eyebrow>Detalle del escaneo</Eyebrow>
              <h1 className="mt-3 truncate text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                {profile.fullName || candidate.original_filename}
              </h1>
              <p className="mt-3 truncate text-slate-500">{candidate.original_filename}</p>
            </div>
            <span
              className={`rounded-full px-4 py-2 text-sm font-semibold ${getStatusClasses(candidate.status)}`}
            >
              {getStatusLabel(candidate.status)}
            </span>
          </div>
        </section>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
          <Card>
            <h2 className="text-lg font-semibold text-slate-900">Información profesional</h2>
            {profile.summary ? (
              <p className="mt-4 leading-7 text-slate-600">{profile.summary}</p>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                El resumen todavía no está disponible.
              </p>
            )}

            <dl className="mt-8 grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2">
              <Info label="Email" value={profile.email} />
              <Info label="Teléfono" value={profile.phone} />
              <Info label="Ubicación" value={profile.location} />
              <Info
                label="Experiencia"
                value={
                  profile.experienceYears === null
                    ? null
                    : `${profile.experienceYears} años`
                }
              />
              <Info label="LinkedIn" value={profile.linkedin} />
              <Info label="GitHub" value={profile.github} />
            </dl>
          </Card>

          <aside className="space-y-5">
            <Card>
              <h2 className="text-lg font-semibold text-slate-900">Datos del proceso</h2>
              <dl className="mt-5 space-y-4 text-sm">
                <Detail label="Creado" value={formatDate(candidate.created_at)} />
                <Detail label="Actualizado" value={formatDate(candidate.updated_at)} />
                <Detail label="ID" value={candidate.id} />
              </dl>
            </Card>

            {candidate.error_message && (
              <section role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                <h2 className="font-semibold">Detalle del error</h2>
                <p className="mt-2 break-words text-red-600/80">{candidate.error_message}</p>
              </section>
            )}
          </aside>
        </div>

        {profile.experience.length > 0 && (
          <Card className="mt-5">
            <h2 className="text-lg font-semibold text-slate-900">Experiencia laboral</h2>
            <div className="mt-6 space-y-6">
              {profile.experience.map((item, index) => (
                <article key={`${String(item.company ?? "experience")}-${index}`} className="border-l-2 border-cyan-200 pl-5">
                  <h3 className="font-semibold text-slate-900">
                    {String(item.role ?? item.position ?? "Experiencia profesional")}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-cyan-700">
                    {String(item.company ?? "")}
                    {item.period ? ` · ${String(item.period)}` : ""}
                  </p>
                  {item.description ? <p className="mt-2 text-sm text-slate-500">{String(item.description)}</p> : null}
                  <BulletList
                    values={[
                      ...getObjectListValues(item, ["responsibilities", "responsibilities_and_achievements"]),
                      ...getObjectListValues(item, ["achievements"]),
                    ]}
                  />
                  <TagCard title="Tecnologías" values={Array.isArray(item.technologies) ? item.technologies.filter((value): value is string => typeof value === "string") : []} />
                </article>
              ))}
            </div>
          </Card>
        )}

        {(profile.education.length > 0 || profile.projects.length > 0) && (
          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            {profile.education.length > 0 && (
              <ObjectList title="Educación" values={profile.education} primaryKeys={["degree"]} secondaryKeys={["institution", "start_date", "end_date"]} />
            )}
            {profile.projects.length > 0 && (
              <ObjectList title="Proyectos" values={profile.projects} primaryKeys={["name"]} secondaryKeys={["period"]} />
            )}
          </section>
        )}

        {(skills.length > 0 || profile.languages.length > 0) && (
          <section className="mt-5 grid items-start gap-5 sm:grid-cols-2">
            <TagCard title="Habilidades" values={skills} />
            <TagCard
              title="Idiomas"
              values={profile.languages.map((language) =>
                [language.language, language.level].filter(Boolean).join(" · ")
              )}
            />
          </section>
        )}
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-700">{value || "No informado"}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="break-all text-slate-600">{value}</dd>
    </div>
  );
}

function TagCard({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {values.map((value, index) => (
          <span
            key={`${value}-${index}`}
            className="rounded-full bg-cyan-50 px-3 py-1.5 text-sm text-cyan-800"
          >
            {value}
          </span>
        ))}
      </div>
    </Card>
  );
}

function BulletList({ values }: { values: string[] }) {
  const items = values.flatMap((value) => value.split(/\n|(?<=\.)\s+(?=[A-Z])/).filter(Boolean));
  if (items.length === 0) return null;

  return (
    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
      {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
    </ul>
  );
}

function ObjectList({
  title,
  values,
  primaryKeys,
  secondaryKeys,
}: {
  title: string;
  values: Record<string, unknown>[];
  primaryKeys: string[];
  secondaryKeys: string[];
}) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-5 space-y-5">
        {values.map((item, index) => (
          <article key={`${title}-${index}`}>
            <h3 className="font-medium text-slate-800">
              {getObjectValues(item, primaryKeys).join(" · ") || "Sin título"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {getObjectValues(item, secondaryKeys).join(" · ")}
            </p>
            {item.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{String(item.description)}</p> : null}
          </article>
        ))}
      </div>
    </Card>
  );
}