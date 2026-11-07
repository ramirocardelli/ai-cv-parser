import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCandidates } from "@/lib/candidates";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function GET() {
  try {
    return NextResponse.json(await getCandidates());
  } catch (error) {
    console.error("Could not load candidates", { error });
    return NextResponse.json(
      { error: "No se pudieron cargar los CV." },
      { status: 500 }
    );
  }
}

type ErrorDetails = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null) {
    const details = error as ErrorDetails;
    const parts = [details.message, details.details, details.hint]
      .filter((part): part is string => typeof part === "string" && part.length > 0);

    if (typeof details.code === "string" && details.code.length > 0) {
      parts.unshift(`[${details.code}]`);
    }

    if (parts.length > 0) return parts.join(" - ");
  }

  return "Unexpected processing error";
}

export async function POST(request: Request) {
  let candidateId: string | null = null;
  let filePath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Falta el archivo PDF." },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "El archivo debe ser un PDF." },
        { status: 400 }
      );
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "El PDF está vacío o supera el límite de 10 MB." },
        { status: 400 }
      );
    }

    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      throw new Error("Missing N8N_WEBHOOK_URL");
    }

    candidateId = randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    filePath = `${candidateId}/${safeName}`;

    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from("cv-files")
      .upload(filePath, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { error: insertError } = await supabaseAdmin
      .from("candidates")
      .insert({
        id: candidateId,
        original_filename: file.name,
        file_path: filePath,
        status: "processing",
      });

    if (insertError) throw insertError;

    const n8nForm = new FormData();
    n8nForm.append("candidate_id", candidateId);
    n8nForm.append("file", file, file.name);

    let n8nResponse: Response;
    try {
      n8nResponse = await fetch(n8nWebhookUrl, {
        method: "POST",
        body: n8nForm,
        cache: "no-store",
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new Error(
        `Could not connect to n8n at ${n8nWebhookUrl}. ` +
          "Start n8n, activate the workflow, and verify N8N_WEBHOOK_URL. " +
          `Cause: ${reason}`,
        { cause: error }
      );
    }

    if (!n8nResponse.ok) {
      const details = await n8nResponse.text();
      throw new Error(`n8n returned ${n8nResponse.status}: ${details}`);
    }

    const result = await n8nResponse.json();

    return NextResponse.json({
      candidateId,
      status: "completed",
      candidate: result,
      webhookResponse: result,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("Candidate processing failed", {
      candidateId,
      filePath,
      error,
    });

    if (candidateId) {
      await supabaseAdmin
        .from("candidates")
        .update({
          status: "failed",
          error_message: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidateId);
    }

    return NextResponse.json(
      { error: "No se pudo procesar el CV.", details: message, candidateId },
      { status: 500 }
    );
  }
}
