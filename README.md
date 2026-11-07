# CV/Parser

Aplicación que convierte un CV en PDF en información profesional estructurada
(datos de contacto, experiencia, educación, habilidades, idiomas). El PDF se
sube desde una interfaz Next.js, un workflow de **n8n** extrae el texto y lo
interpreta con **Gemini**, y el resultado queda guardado en **Supabase**.

> Alcance actual: PDF con texto seleccionable, de hasta 10 MB. Los PDF
> escaneados (OCR) no están soportados. No hay autenticación: es un MVP para
> uso local o de pruebas.

## Stack

| Pieza | Rol |
| --- | --- |
| Next.js 16 (App Router) + Tailwind 4 | Interfaz, validación y endpoint backend |
| Supabase Storage | Guarda el PDF original en el bucket privado `cv-files` |
| Supabase Database | Tabla `candidates`: estado del proceso y perfil extraído |
| n8n (Docker) | Orquesta la extracción de texto, la llamada al LLM y la persistencia |
| Gemini API | Extracción estructurada de la información del CV |

## Cómo funciona

```text
Navegador ──PDF──▶ POST /api/candidates ──▶ Supabase Storage (cv-files/<id>/<archivo>)
                          │                 Supabase DB: fila en `candidates` (processing)
                          │
                          └──multipart (candidate_id + file)──▶ Webhook n8n
                                                                   │
                                  Extract From File ─▶ Gemini ─▶ Code ─▶ PATCH Supabase
                                                                   │
Navegador ◀── JSON ◀── Next.js ◀──────── Respond to Webhook ◀──────┘
```

1. En `/` el usuario arrastra o elige un PDF.
2. `POST /api/candidates` ([app/api/candidates/route.ts](app/api/candidates/route.ts))
   valida que sea PDF, no esté vacío y pese ≤ 10 MB.
3. Genera un `candidate_id`, sube el archivo a Storage y crea la fila con
   `status = processing`.
4. Reenvía el PDF y el `candidate_id` al webhook de n8n (timeout de 120 s).
5. n8n procesa el CV (ver abajo), actualiza la fila a `completed` y responde
   con el JSON resultante.
6. Si algo falla (n8n caído, Gemini, Supabase), la fila pasa a `failed` con el
   mensaje en `error_message` y la UI muestra el error.
7. El resultado se muestra en la home y queda disponible en el historial.

### Pantallas

| Ruta | Contenido |
| --- | --- |
| `/` | Subida del CV y respuesta cruda del webhook |
| `/candidates` | Historial de escaneos con estado y fecha |
| `/candidates/[id]` | Ficha del candidato: resumen, contacto, experiencia, educación, proyectos, habilidades e idiomas |

### API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/candidates` | Lista los candidatos, más recientes primero |
| `POST` | `/api/candidates` | `multipart/form-data` con el campo `file` (PDF). Devuelve `{ candidateId, status, candidate, webhookResponse }` |

## Flujo n8n

Workflow llamado `AI CV Parser`, con un webhook `POST` en la ruta `cv-parser`.
Recibe `candidate_id` (campo de formulario) y el PDF (binario `file`).

| # | Nodo | Qué hace |
| --- | --- | --- |
| 1 | **Webhook** | `POST /webhook/cv-parser`, responde con *Respond to Webhook* |
| 2 | **Extract From File** | Operación *Extract From PDF* sobre el binario `file`; obtiene el texto |
| 3 | **Edit Fields** | Conserva `candidate_id` y `cv_text`; corta el flujo si el texto está vacío |
| 4 | **HTTP Request** (Gemini) | `generateContent` con instrucciones de sistema y `responseSchema` para forzar JSON; header `x-goog-api-key` |
| 5 | **Code** | Toma `candidates[0].content.parts[0].text`, lo parsea y valida que las colecciones sean arrays |
| 6 | **HTTP Request** (Supabase) | `PATCH /rest/v1/candidates?id=eq.<candidate_id>` con `status: completed`, los campos del perfil y el JSON completo en `extraction` |
| 7 | **Respond to Webhook** | Devuelve `{ candidate_id, status, profile }` a Next.js |

Notas:

- La ruta de error del workflow debería marcar la fila como `failed` y
  responder con un HTTP de error. Si no, Next.js lo hace igualmente al recibir
  un estado no exitoso o un timeout.
- La ficha del candidato lee tanto las columnas de la tabla como el JSON de
  `extraction`, así que tolera variaciones en el esquema de salida del LLM.
- Credenciales (Gemini API key y secret key de Supabase) van en n8n, nunca en
  el frontend.
- El workflow **no está exportado en este repositorio**. Se recomienda
  exportarlo desde n8n (*Download*) y versionarlo, por ejemplo en
  `n8n/ai-cv-parser.json`.
- El paso a paso completo (esquema JSON de Gemini, expresiones, cuerpo del
  PATCH, pruebas por etapas) está en
  [ai-cv-parser-guia-implementacion.md](ai-cv-parser-guia-implementacion.md).

## Cómo ejecutarlo

### Requisitos

- Node.js 20.9 o superior y npm
- Docker Desktop (para n8n local)
- Un proyecto de [Supabase](https://supabase.com/)
- Una API key de [Google AI Studio](https://aistudio.google.com/) (Gemini)

Usá CV ficticios o anonimizados para probar: en el nivel gratuito de Gemini el
contenido puede usarse para mejorar los productos de Google.

### 1. Instalar dependencias

```bash
npm install
```

### 2. Preparar Supabase

En el **SQL Editor** ejecutá:

```sql
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

create index candidates_created_at_idx on public.candidates (created_at desc);
create index candidates_status_idx on public.candidates (status);

alter table public.candidates enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on table public.candidates to service_role;
```

Después, en **Storage**, creá un bucket **privado** llamado `cv-files`
(tipo permitido `application/pdf`, límite de 10 MB).

### 3. Variables de entorno

Creá `.env.local` en la raíz:

```env
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_SECRET_KEY=tu_secret_key_de_supabase
N8N_WEBHOOK_URL=http://localhost:5678/webhook/cv-parser
```

`SUPABASE_SECRET_KEY` es la *secret/service-role key* (no la publishable) y
solo se usa en el servidor. No la subas a Git.

### 4. Levantar n8n

```bash
docker compose up -d
```

Abrí [http://localhost:5678](http://localhost:5678), creá o importá el workflow
`AI CV Parser`, configurá las credenciales (Gemini y Supabase) y **activalo**:
con el workflow inactivo, la URL `/webhook/cv-parser` no responde (la URL de
test `/webhook-test/...` solo funciona mientras escuchás una ejecución).

Para detener n8n:

```bash
docker compose down
```

Los datos de n8n se conservan en el volumen Docker `n8n_data`.

### 5. Iniciar la app

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000), subí un PDF y revisá el
resultado en `/candidates`.

### Otros comandos

```bash
npm run build   # build de producción
npm start       # servir el build
npm run lint    # ESLint
```

## Solución de problemas

| Síntoma | Causa probable |
| --- | --- |
| `Missing N8N_WEBHOOK_URL` | Falta la variable en `.env.local` (reiniciá `npm run dev`) |
| `Could not connect to n8n` | n8n no está corriendo o el workflow no está activo |
| `n8n returned 404` | Se usa la URL de test, o el path del webhook no es `cv-parser` |
| `Missing Supabase server environment variables` | Falta `SUPABASE_URL` o `SUPABASE_SECRET_KEY` |
| Error al subir a Storage | El bucket `cv-files` no existe o no es el esperado |
| Fila en `failed` | Revisá `error_message` en la tabla y la pestaña *Executions* de n8n |
| Texto vacío en n8n | El PDF es una imagen escaneada (sin OCR) |

## Antes de publicarlo

Este proyecto no tiene login, autorización ni límites de uso. Antes de
exponerlo agregá autenticación, políticas RLS adecuadas, *rate limiting*,
procesamiento asíncrono (responder `202` y consultar el estado) y no devuelvas
el detalle de los errores al cliente. El resultado de la IA organiza
información; no debe usarse para tomar decisiones automatizadas de
contratación.
