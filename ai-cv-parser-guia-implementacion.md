# AI CV Parser --- guía de implementación

**Objetivo:** construir un MVP que permita subir un CV en PDF desde una
aplicación Next.js, extraer su información profesional con Gemini,
guardar el archivo y el resultado estructurado en Supabase y coordinar
el procesamiento mediante n8n.

> Alcance inicial: PDF con texto seleccionable. Los PDF escaneados
> (imágenes) y el OCR quedan para una segunda etapa.

------------------------------------------------------------------------

## 0. Arquitectura y decisiones

### Flujo completo

1.  El usuario selecciona un PDF en Next.js.
2.  Next.js valida el archivo y lo envía a una Route Handler.
3.  El backend de Next.js:
    -   crea un registro de candidato con estado `processing`;
    -   guarda el PDF en un bucket privado de Supabase Storage;
    -   envía el PDF como `multipart/form-data` al Webhook de n8n, junto
        con el `candidate_id`.
4.  n8n recibe el archivo como binario.
5.  `Extract From File` extrae el texto del PDF.
6.  n8n llama a Gemini con instrucciones y un esquema JSON.
7.  n8n valida/parsea la respuesta y actualiza el registro en Supabase.
8.  n8n devuelve el resultado a Next.js.
9.  Next.js muestra el perfil extraído.

### Responsabilidades

  -----------------------------------------------------------------------
  Componente                          Responsabilidad
  ----------------------------------- -----------------------------------
  Next.js                             Interfaz, validación inicial,
                                      endpoint backend y presentación

  Supabase Storage                    PDF original, en bucket privado

  Supabase Database                   Estado del procesamiento y perfil
                                      extraído

  n8n                                 Orquestación, extracción de texto,
                                      llamada al LLM y persistencia

  Gemini API                          Interpretación del CV y extracción
                                      estructurada
  -----------------------------------------------------------------------

### Por qué enviar el PDF desde Next.js a n8n

Para el MVP, el backend sube el archivo a Storage y también lo envía en
el webhook. Así n8n no necesita credenciales de Storage para descargar
el PDF ni una URL pública. Más adelante se puede reemplazar el envío
binario por una URL firmada de corta duración.

**Importante:** la clave secreta de Supabase, la API key de Gemini y la
URL del webhook se usan exclusivamente en el servidor o en las
credenciales de n8n. Nunca deben llevar el prefijo `NEXT_PUBLIC_`.

------------------------------------------------------------------------

## 1. Prerrequisitos

Instalar:

-   Node.js 20.9 o superior.
-   npm.
-   Git.
-   Un editor (VS Code, Cursor, etc.).

Crear cuentas/proyectos:

-   [Supabase](https://supabase.com/).
-   [Google AI Studio](https://aistudio.google.com/) para generar una
    Gemini API key.
-   Una instancia de n8n: n8n Cloud o una instancia propia/local.

Para desarrollo local, Next.js y n8n deben poder comunicarse. Si n8n
corre en Docker, `localhost` dentro del contenedor no es el host de
Windows/macOS/Linux. Usar la URL accesible desde el contenedor o una URL
pública temporal para pruebas.

------------------------------------------------------------------------

## 2. Crear el proyecto Next.js

En la terminal:

``` bash
npx create-next-app@latest ai-cv-parser
cd ai-cv-parser
npm run dev
```

Elegir (o confirmar los defaults recomendados):

-   TypeScript: sí.
-   ESLint: sí.
-   Tailwind CSS: sí.
-   App Router: sí.
-   `src/` directory: opcional. Esta guía asume que **no** se usa
    `src/`.
-   Import alias: `@/*`.

Abrir `http://localhost:3000`.

Instalar Supabase JS:

``` bash
npm install @supabase/supabase-js
```

No hace falta `@supabase/ssr` para este MVP si Next.js solo usa Supabase
desde Route Handlers con una clave secreta de servidor y no implementa
login. Si luego se agrega autenticación con sesiones/cookies, seguir la
guía oficial de Supabase SSR e instalar `@supabase/ssr`.

### Estructura sugerida

``` text
ai-cv-parser/
├── app/
│   ├── api/
│   │   └── candidates/
│   │       └── route.ts
│   ├── candidates/
│   │   └── [id]/
│   │       └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   └── supabase/
│       └── admin.ts
├── .env.local
└── package.json
```

------------------------------------------------------------------------

## 3. Crear el proyecto y la base de datos en Supabase

1.  Crear un proyecto en Supabase.
2.  Guardar la contraseña de la base de datos en un gestor seguro.
3.  Desde **Project Settings → API Keys** (o el panel Connect), copiar:
    -   Project URL.
    -   Publishable key, si luego se necesita desde el navegador.
    -   Secret key para operaciones administrativas desde el servidor.
4.  No compartir ni subir la secret key a Git.

### 3.1 Crear la tabla

Abrir **SQL Editor → New query** y ejecutar:

``` sql
create extension if not exists pgcrypto;

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  original_filename text not null,
  file_path text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  full_name text,
  email text,
  phone text,
  location text,
  linkedin text,
  github text,
  professional_summary text,
  total_experience_years numeric,
  work_experience jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  technical_skills jsonb not null default '[]'::jsonb,
  soft_skills jsonb not null default '[]'::jsonb,
  languages jsonb not null default '[]'::jsonb,
  extraction jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index candidates_created_at_idx
  on public.candidates (created_at desc);

create index candidates_status_idx
  on public.candidates (status);
```

El campo `extraction` guarda el JSON completo devuelto por Gemini. Los
campos individuales facilitan mostrar y filtrar los datos sin tener que
navegar todo el JSON.

### 3.2 Seguridad de la tabla

Activar Row Level Security:

``` sql
alter table public.candidates enable row level security;

grant usage on schema public to service_role;
grant insert, update on table public.candidates to service_role;
```

En este prototipo, Next.js y n8n acceden desde servidores usando una
**secret/service key**, que tiene privilegios elevados y evita las
políticas RLS. No crear una policy pública de lectura o escritura para
hacer que el MVP funcione.

La clave secreta solo debe usarse: - en una Route Handler de Next.js; -
en una credencial privada de n8n.

No debe aparecer en componentes React, variables `NEXT_PUBLIC_*`, código
enviado al navegador ni repositorios.

**Advertencia:** este MVP no implementa autenticación. Antes de
publicarlo, agregar login, autorización por usuario/tenant, políticas
RLS adecuadas y límites de uso. No dejar un endpoint público que permita
consumir Gemini sin control.

### 3.3 Crear el bucket de Storage

En **Storage → New bucket**:

-   Nombre: `cv-files`.
-   Public bucket: **desactivado** (privado).
-   Limitar el tamaño máximo de archivo según el MVP (por ejemplo, 5--10
    MB).
-   Permitir MIME type `application/pdf`.

El bucket privado evita que los CV queden accesibles mediante una URL
pública.

------------------------------------------------------------------------

## 4. Configurar las variables de entorno de Next.js

Crear `.env.local` en la raíz:

``` dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY
N8N_WEBHOOK_URL=http://localhost:5678/webhook/cv-parser
```

Reemplazar los valores por los del proyecto y la URL real del webhook.
`SUPABASE_SECRET_KEY` debe ser la secret/service-role key del servidor,
no la publishable/anon key ni una variable `NEXT_PUBLIC_*`.

Agregar `.env.local` a `.gitignore` (create-next-app normalmente ya lo
hace). No pegar valores reales en capturas, issues ni commits.

### 4.1 Cliente administrativo de Supabase

Crear `lib/supabase/admin.ts`:

``` ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Missing Supabase server environment variables");
}

if (supabaseSecretKey.startsWith("sb_publishable_")) {
  throw new Error(
    "SUPABASE_SECRET_KEY must be a Supabase secret/service-role key, not a publishable key"
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
```

Este módulo solo debe importarse desde código del servidor (por ejemplo,
`app/api/.../route.ts`). Nunca desde un Client Component.

------------------------------------------------------------------------

## 5. Crear la API de Gemini

1.  Entrar en [Google AI Studio](https://aistudio.google.com/).
2.  Crear una API key.
3.  Consultar el catálogo de modelos y elegir uno que esté habilitado en
    el free tier de tu proyecto/región.
4.  Guardar la key como credencial en n8n, no en el frontend.

La API de Gemini ofrece un nivel gratuito para determinados modelos, con
límites de solicitudes/tokens. Los modelos disponibles, límites y
condiciones pueden cambiar. En el nivel gratuito, Google indica que el
contenido puede utilizarse para mejorar sus productos; no enviar CV
reales sin revisar previamente los términos y requisitos de privacidad.
Para pruebas, usar CV ficticios o anonimizados.

Para extraer datos de CV alcanza con un modelo Flash/Lite que soporte
structured output. No fijar el nombre del modelo para siempre: elegir
uno disponible en AI Studio y actualizar el endpoint de n8n si cambia.

Documentación: [Gemini API
pricing](https://ai.google.dev/gemini-api/docs/pricing) y [Structured
output](https://ai.google.dev/gemini-api/docs/structured-output).

------------------------------------------------------------------------

## 6. Crear el endpoint de Next.js para recibir el PDF

El navegador enviará el archivo a `/api/candidates`. La Route Handler
valida, guarda el archivo en Storage, crea el registro y llama a n8n.

Crear `app/api/candidates/route.ts`:

``` ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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

    if (!process.env.N8N_WEBHOOK_URL) {
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

    const n8nResponse = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: "POST",
      body: n8nForm,
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });

    if (!n8nResponse.ok) {
      const details = await n8nResponse.text();
      throw new Error(`n8n returned ${n8nResponse.status}: ${details}`);
    }

    const result = await n8nResponse.json();

    return NextResponse.json({
      candidateId,
      status: "completed",
      candidate: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected processing error";

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
```

**Notas:** - En una aplicación pública, no devolver `details` al
cliente; registrar el detalle en logs y devolver un mensaje genérico. -
Para un MVP local, el flujo síncrono es sencillo. En producción conviene
responder `202 Accepted` y procesar en segundo plano, haciendo que la
interfaz consulte el estado del candidato. - Si falla n8n después de
subir el PDF, el registro queda como `failed`; el archivo puede
conservarse para diagnóstico o eliminarse mediante una política de
retención. - Agregar autenticación, rate limiting y validación real del
contenido PDF antes de desplegar.

------------------------------------------------------------------------

## 7. Crear la interfaz para subir un CV

Crear `app/page.tsx`:

``` tsx
"use client";

import { useState } from "react";

type Result = {
  candidateId?: string;
  status?: string;
  candidate?: unknown;
  error?: string;
  details?: string;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

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
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-bold">AI CV Parser</h1>
      <p className="mt-2 text-gray-600">
        Subí un CV en PDF para extraer su información profesional.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />

        <button
          type="submit"
          disabled={!file || loading}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Procesando..." : "Analizar CV"}
        </button>
      </form>

      {result?.error && (
        <p className="mt-6 text-red-600">{result.error}</p>
      )}

      {result?.candidate && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Resultado</h2>
          <pre className="mt-3 overflow-auto rounded bg-gray-100 p-4 text-sm">
            {JSON.stringify(result.candidate, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
```

Este primer frontend muestra el JSON sin diseñar todavía una ficha de
candidato. Primero comprobar que el pipeline funciona; después construir
componentes visuales para experiencia, educación, skills e idiomas.

------------------------------------------------------------------------

## 8. Construir el workflow en n8n

Crear un workflow llamado `AI CV Parser`.

### 8.1 Nodo 1 --- Webhook

Agregar un nodo **Webhook** y configurar:

-   HTTP Method: `POST`.
-   Path: `cv-parser`.
-   Respond: `Using Respond to Webhook Node`.
-   Binary Data: habilitado si la versión lo presenta como opción.
-   Binary Property: `file` (si el campo de archivo llega con ese
    nombre).

Guardar el workflow y usar la **Test URL** mientras se desarrolla. La
URL de producción se usa cuando el workflow esté activo.

El webhook debe recibir: - `candidate_id` como campo de formulario; - el
PDF como archivo binario llamado `file`.

Si el binario aparece con otro nombre, usar ese nombre en el nodo
siguiente.

### 8.2 Nodo 2 --- Extract From File

Agregar **Extract From File**:

-   Operation: `Extract From PDF`.
-   Input Binary Field: `file` (o el nombre real recibido por el
    Webhook).

Ejecutar el nodo con un PDF de prueba. Revisar el output y localizar el
campo que contiene el texto extraído. En muchos casos el texto queda en
`text`, pero verificar el output de la versión instalada.

Si el texto sale vacío: - comprobar que el PDF tenga texto
seleccionable; - probar otro PDF; - si es escaneado, agregar OCR en una
iteración posterior.

### 8.3 Nodo 3 --- Edit Fields (Set)

Agregar **Edit Fields** para normalizar los datos antes de llamar a
Gemini.

Conservar: - `candidate_id`, proveniente del Webhook; - `cv_text`,
proveniente del nodo Extract From File.

Ejemplo conceptual de expresiones:

``` text
candidate_id = {{ $('Webhook').first().json.body.candidate_id }}
cv_text      = {{ $json.text }}
```

Los nombres y rutas exactos dependen del output real de los nodos. Usar
el selector de expresiones de n8n en lugar de asumir una estructura sin
inspeccionarla.

Agregar una validación: si `cv_text` está vacío o es demasiado corto,
detener el flujo con un error controlado.

### 8.4 Nodo 4 --- HTTP Request a Gemini

Agregar **HTTP Request**:

-   Method: `POST`.
-   URL:

``` text
https://generativelanguage.googleapis.com/v1beta/models/MODEL_ID:generateContent
```

Reemplazar `MODEL_ID` por un modelo Flash/Lite habilitado en AI Studio.

-   Authentication: configurar un header credential o header manual.
-   Header: `x-goog-api-key: GEMINI_API_KEY`.
-   Send Body: sí.
-   Body Content Type: JSON.

Ejemplo de body (adaptar el nombre del modelo y comprobar el soporte de
`responseSchema` en el modelo elegido):

``` json
{
  "systemInstruction": {
    "parts": [
      {
        "text": "You are an expert CV information extraction system. Extract only facts explicitly present in the CV. Never invent information. Use null for missing scalar fields and empty arrays for missing collections. Distinguish responsibilities from measurable achievements. Do not infer protected or sensitive personal characteristics. Return only data matching the requested schema."
      }
    ]
  },
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Extract the professional information from this CV:\n\n{{ $json.cv_text }}"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "OBJECT",
      "properties": {
        "personal_information": {
          "type": "OBJECT",
          "properties": {
            "full_name": { "type": ["STRING", "NULL"] },
            "email": { "type": ["STRING", "NULL"] },
            "phone": { "type": ["STRING", "NULL"] },
            "location": { "type": ["STRING", "NULL"] },
            "linkedin": { "type": ["STRING", "NULL"] },
            "github": { "type": ["STRING", "NULL"] }
          },
          "required": ["full_name", "email", "phone", "location", "linkedin", "github"]
        },
        "professional_summary": { "type": ["STRING", "NULL"] },
        "total_experience_years": { "type": ["NUMBER", "NULL"] },
        "work_experience": {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "properties": {
              "company": { "type": ["STRING", "NULL"] },
              "position": { "type": ["STRING", "NULL"] },
              "start_date": { "type": ["STRING", "NULL"] },
              "end_date": { "type": ["STRING", "NULL"] },
              "responsibilities": { "type": "ARRAY", "items": { "type": "STRING" } },
              "achievements": { "type": "ARRAY", "items": { "type": "STRING" }
              }
            },
            "required": ["company", "position", "start_date", "end_date", "responsibilities", "achievements"]
          }
        },
        "education": {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "properties": {
              "institution": { "type": ["STRING", "NULL"] },
              "degree": { "type": ["STRING", "NULL"] },
              "start_date": { "type": ["STRING", "NULL"] },
              "end_date": { "type": ["STRING", "NULL"] }
            },
            "required": ["institution", "degree", "start_date", "end_date"]
          }
        },
        "technical_skills": { "type": "ARRAY", "items": { "type": "STRING" } },
        "soft_skills": { "type": "ARRAY", "items": { "type": "STRING" } },
        "languages": {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "properties": {
              "language": { "type": "STRING" },
              "level": { "type": ["STRING", "NULL"] }
            },
            "required": ["language", "level"]
          }
        }
      },
      "required": [
        "personal_information",
        "professional_summary",
        "total_experience_years",
        "work_experience",
        "education",
        "technical_skills",
        "soft_skills",
        "languages"
      ]
    }
  }
}
```

**Importante sobre el JSON Schema:** Gemini soporta un subconjunto de
JSON Schema. Si el modelo rechaza algún tipo o propiedad, simplificar el
schema según la documentación oficial. En particular, probar primero con
un schema reducido y ampliar gradualmente.

En n8n, insertar `cv_text` como expresión del editor. No dejar
literalmente `{{ $json.cv_text }}` dentro de un campo JSON estático si
el editor no lo interpreta como expresión.

La respuesta de Gemini suele estar en una ruta equivalente a:

``` text
candidates[0].content.parts[0].text
```

Inspeccionar el output real del HTTP Request antes de configurar el
siguiente nodo.

### 8.5 Nodo 5 --- Code: parsear y validar la respuesta

Agregar un nodo **Code** después de Gemini.

Ejemplo conceptual:

``` js
const responseText =
  $json.candidates?.[0]?.content?.parts?.[0]?.text;

if (!responseText) {
  throw new Error("Gemini returned an empty response");
}

let profile;

try {
  profile = JSON.parse(responseText);
} catch {
  throw new Error("Gemini did not return valid JSON");
}

const requiredArrays = [
  "work_experience",
  "education",
  "technical_skills",
  "soft_skills",
  "languages",
];

for (const key of requiredArrays) {
  if (!Array.isArray(profile[key])) {
    throw new Error(`Invalid field: ${key} must be an array`);
  }
}

return [
  {
    json: {
      candidate_id: $("Edit Fields").first().json.candidate_id,
      profile,
    },
  },
];
```

Ajustar `Edit Fields` al nombre exacto del nodo. Si el Code node recibe
otra estructura, inspeccionar el input y adaptar las rutas.

### 8.6 Nodo 6 --- HTTP Request: actualizar Supabase

Usar la API REST de Supabase para actualizar el registro.

-   Method: `PATCH`.
-   URL:

``` text
https://YOUR_PROJECT.supabase.co/rest/v1/candidates?id=eq.CANDIDATE_UUID
```

Es preferible construir el filtro mediante una expresión con
`candidate_id`, sin concatenar datos no confiables en el endpoint.

Headers:

``` text
apikey: SUPABASE_SECRET_KEY
Authorization: Bearer SUPABASE_SECRET_KEY
Content-Type: application/json
Prefer: return=representation
```

Body JSON:

``` json
{
  "status": "completed",
  "full_name": "EXPRESION",
  "email": "EXPRESION",
  "phone": "EXPRESION",
  "location": "EXPRESION",
  "linkedin": "EXPRESION",
  "github": "EXPRESION",
  "professional_summary": "EXPRESION",
  "total_experience_years": 0,
  "work_experience": [],
  "education": [],
  "technical_skills": [],
  "soft_skills": [],
  "languages": [],
  "extraction": {},
  "updated_at": "TIMESTAMP"
}
```

En el editor de n8n, reemplazar cada valor por expresiones que lean
`profile` y `candidate_id` del nodo Code. Por ejemplo, si el output del
Code node tiene `{ candidate_id, profile }`:

``` text
full_name = {{ $json.profile.personal_information.full_name }}
email     = {{ $json.profile.personal_information.email }}
```

Para los campos JSONB, enviar arrays/objetos como JSON, no como strings
escapados. Si el editor exige una expresión para todo el body, construir
un objeto con expresiones en modo JSON/Expression.

En una implementación más limpia se puede usar el nodo Supabase si la
versión instalada ofrece la operación necesaria. El HTTP Request contra
PostgREST es explícito y funciona con la API REST.

### 8.7 Nodo 7 --- Respond to Webhook

Agregar **Respond to Webhook** después de la actualización:

-   Respond With: `JSON`.
-   Response Body: devolver el perfil y el identificador.
-   Response Code: `200`.

Ejemplo de respuesta:

``` json
{
  "candidate_id": "UUID",
  "status": "completed",
  "profile": {}
}
```

El nodo Webhook debe estar configurado para responder mediante
`Respond to Webhook`.

### 8.8 Manejo de errores

Agregar una ruta de error para fallos de extracción, Gemini o Supabase.
Como mínimo: - actualizar `candidates.status` a `failed`; - guardar un
mensaje técnico acotado en `error_message`; - devolver un error HTTP
apropiado; - no exponer API keys, tokens ni datos completos del CV en
logs innecesarios.

n8n permite configurar un Error Workflow para manejar fallos no
controlados. Para el primer prototipo, al menos inspeccionar las
ejecuciones fallidas en la pestaña Executions.

------------------------------------------------------------------------

## 9. Probar la integración por etapas

No intentar depurar todo junto. Seguir este orden:

### Prueba A --- Next.js recibe el PDF

-   Arrancar Next.js.
-   Subir un PDF válido.
-   Confirmar que el archivo llega a la Route Handler.
-   Probar un `.txt` renombrado como `.pdf`: debe rechazarse por
    validación adicional si se implementa la comprobación de firma
    MIME/contenido.

### Prueba B --- Supabase Storage y Database

-   Confirmar que aparece un objeto bajo `cv-files/<candidate_id>/...`.
-   Confirmar que se crea una fila en `candidates`.
-   Confirmar que el estado inicial es `processing`.

### Prueba C --- Webhook de n8n

-   Ejecutar el workflow en modo test.
-   Enviar el formulario desde Next.js.
-   Confirmar que n8n recibe `candidate_id` y el binario.
-   Verificar que el PDF se puede descargar/abrir desde la ejecución.

### Prueba D --- extracción de PDF

-   Ejecutar `Extract From File`.
-   Revisar que el texto esté completo y legible.
-   Probar un CV con dos o más experiencias laborales.

### Prueba E --- Gemini

-   Ejecutar el HTTP Request.
-   Confirmar que la respuesta contiene JSON.
-   Probar un CV con datos faltantes.
-   Verificar que no inventa email, fechas, estudios ni logros.
-   Verificar que las experiencias simultáneas no se suman dos veces en
    la estimación de años.

### Prueba F --- persistencia y respuesta

-   Confirmar que la fila se actualiza a `completed`.
-   Revisar los campos y el JSON `extraction`.
-   Confirmar que Next.js recibe el resultado y lo muestra.

------------------------------------------------------------------------

## 10. Casos de prueba mínimos

  Caso                            Resultado esperado
  ------------------------------- ----------------------------------------------------
  PDF válido con texto            Procesamiento exitoso
  PDF sin email                   `email = null`
  PDF sin experiencia laboral     `work_experience = []`
  PDF con varios trabajos         Una entrada por experiencia
  PDF con trabajos simultáneos    No duplicar duración
  Archivo DOCX renombrado a PDF   Rechazar
  PDF escaneado                   Error controlado o mensaje indicando OCR pendiente
  Gemini devuelve JSON inválido   Marcar como `failed`
  Gemini excede cuota             Error controlado, sin perder el registro
  Supabase falla                  Marcar/loguear el error y no mostrar falso éxito

------------------------------------------------------------------------

## 11. Mejoras después del MVP

Prioridad sugerida:

1.  **Pantalla de candidato:** reemplazar el JSON crudo por secciones
    visuales editables.
2.  **Listado de CVs:** tabla con nombre, fecha, estado y búsqueda.
3.  **Autenticación:** login y autorización por usuario.
4.  **Procesamiento asíncrono:** Next.js responde `202`; frontend
    consulta estado hasta completar.
5.  **OCR:** admitir CV escaneados.
6.  **Reintentos:** reintentar errores transitorios de Gemini o red con
    backoff.
7.  **Validación de datos:** Zod o JSON Schema en el backend antes de
    persistir.
8.  **Deduplicación:** hash del archivo y/o detección de candidatos
    duplicados.
9.  **Observabilidad:** logs con `candidate_id`, tiempos y errores,
    evitando registrar el texto completo del CV.
10. **Privacidad:** política de retención, eliminación de archivos,
    consentimiento y control de acceso.

No utilizar el resultado de IA para tomar decisiones automatizadas de
contratación. El parser debe organizar información, no inferir
características protegidas ni decidir si una persona debe avanzar en un
proceso.

------------------------------------------------------------------------

## 12. Checklist de finalización

-   [ ] Next.js corre localmente.
-   [ ] Supabase project creado.
-   [ ] Tabla `candidates` creada.
-   [ ] Bucket privado `cv-files` creado.
-   [ ] Variables de entorno configuradas y excluidas de Git.
-   [ ] API route valida y recibe PDF.
-   [ ] PDF se guarda en Storage.
-   [ ] Se crea el registro con estado `processing`.
-   [ ] Webhook n8n recibe archivo y `candidate_id`.
-   [ ] Extract From File obtiene texto.
-   [ ] Gemini devuelve JSON estructurado.
-   [ ] n8n actualiza Supabase.
-   [ ] n8n responde al webhook.
-   [ ] Next.js muestra el resultado.
-   [ ] Los errores quedan registrados y no se reporta éxito falso.

------------------------------------------------------------------------

## 13. Documentación oficial

-   [Next.js ---
    Installation](https://nextjs.org/docs/app/getting-started/installation)
-   [Next.js --- App Router](https://nextjs.org/docs/app)
-   [Supabase --- Next.js
    Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
-   [Supabase --- JavaScript Storage
    upload](https://supabase.com/docs/reference/javascript/storage-from-upload)
-   [Supabase --- SSR
    clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
-   [Gemini API --- Pricing and free
    tier](https://ai.google.dev/gemini-api/docs/pricing)
-   [Gemini API --- Structured
    output](https://ai.google.dev/gemini-api/docs/structured-output)
-   [n8n --- Webhook
    node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
-   [n8n --- Extract From
    File](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.extractfromfile/)
-   [n8n --- HTTP
    Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
-   [n8n --- Respond to
    Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/)

------------------------------------------------------------------------

## Nota final

Esta guía prioriza que el pipeline funcione de punta a punta con el
menor número de piezas posible. Los nombres exactos de campos binarios y
rutas de output de n8n pueden variar según la versión y configuración;
inspeccionar la ejecución de cada nodo y adaptar las expresiones a los
datos reales. Mantener primero el flujo simple y agregar autenticación,
OCR, colas y reintentos antes de tratarlo como una aplicación de
producción.
