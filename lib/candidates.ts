import { supabaseAdmin } from "@/lib/supabase/admin";

export type CandidateStatus = "processing" | "completed" | "failed";

export type Candidate = {
  id: string;
  original_filename: string;
  file_path: string;
  status: CandidateStatus;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  professional_summary: string | null;
  total_experience_years: number | null;
  work_experience: unknown;
  education: unknown;
  technical_skills: unknown;
  soft_skills: unknown;
  languages: unknown;
  extraction: unknown;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type CandidateProfile = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  summary: string | null;
  experienceYears: number | null;
  experience: Record<string, unknown>[];
  education: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  technicalSkills: string[];
  softSkills: string[];
  languages: Record<string, unknown>[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getExtractionProfile(extraction: unknown): Record<string, unknown> {
  if (!isRecord(extraction)) return {};

  const candidates = extraction.candidates;
  if (Array.isArray(candidates) && isRecord(candidates[0])) {
    const content = candidates[0].content;
    if (isRecord(content) && Array.isArray(content.parts)) {
      const text = isRecord(content.parts[0]) ? content.parts[0].text : null;
      if (typeof text === "string") {
        try {
          const parsed: unknown = JSON.parse(text);
          if (isRecord(parsed)) return parsed;
        } catch {
          return {};
        }
      }
    }
  }

  return extraction;
}

export function getCandidateProfile(candidate: Candidate): CandidateProfile {
  const extracted = getExtractionProfile(candidate.extraction);
  const personal = isRecord(extracted.personal_info)
    ? extracted.personal_info
    : isRecord(extracted.personal_information)
      ? extracted.personal_information
      : {};
  const links = isRecord(personal.links) ? personal.links : {};
  const experience = asRecordArray(extracted.experience ?? candidate.work_experience);

  return {
    fullName: candidate.full_name ?? asString(personal.name) ?? asString(personal.full_name),
    email: candidate.email ?? asString(personal.email),
    phone: candidate.phone ?? asString(personal.phone),
    location: candidate.location ?? asString(personal.location),
    linkedin: candidate.linkedin ?? asString(personal.linkedin) ?? asString(links.linkedin),
    github: candidate.github ?? asString(personal.github) ?? asString(links.github),
    summary: candidate.professional_summary ?? asString(personal.summary),
    experienceYears:
      candidate.total_experience_years ??
      (typeof extracted.total_experience_years === "number"
        ? extracted.total_experience_years
        : null),
    experience,
    education: asRecordArray(extracted.education ?? candidate.education),
    projects: asRecordArray(extracted.projects),
    technicalSkills: asStringArray(extracted.technical_skills ?? candidate.technical_skills),
    softSkills: asStringArray(extracted.soft_skills ?? candidate.soft_skills),
    languages: asRecordArray(extracted.languages ?? candidate.languages),
  };
}

export async function getCandidates(): Promise<Candidate[]> {
  const { data, error } = await supabaseAdmin
    .from("candidates")
    .select()
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron cargar los CV: ${error.message}`);
  }

  return (data ?? []) as Candidate[];
}

export async function getCandidate(id: string): Promise<Candidate | null> {
  const { data, error } = await supabaseAdmin
    .from("candidates")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar el CV: ${error.message}`);
  }

  return (data as Candidate | null) ?? null;
}

export function getStatusLabel(status: CandidateStatus): string {
  return {
    processing: "Procesando",
    completed: "Completado",
    failed: "Fallido",
  }[status];
}

export function getStatusClasses(status: CandidateStatus): string {
  return {
    processing: "bg-amber-50 text-amber-700",
    completed: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
  }[status];
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getArrayValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null) {
        return Object.values(item)
          .filter((part): part is string => typeof part === "string")
          .join(" · ");
      }
      return "";
    })
    .filter((item) => item.length > 0);
}

export function getObjectValues(value: unknown, keys: string[]): string[] {
  if (!isRecord(value)) return [];

  return keys
    .map((key) => value[key])
    .filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function getObjectListValues(value: unknown, keys: string[]): string[] {
  if (!isRecord(value)) return [];

  return keys.flatMap((key) => {
    const item = value[key];
    if (typeof item === "string" && item.length > 0) return [item];
    if (Array.isArray(item)) {
      return item.filter((entry): entry is string => typeof entry === "string");
    }
    return [];
  });
}
