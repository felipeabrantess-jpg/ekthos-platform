/**
 * service-report-handler — Registro de Culto
 *
 * GET  ?fill_token=XXX   → rascunho atual do voluntário OU formulário vazio (+ sede do reporter)
 * PATCH body:{fill_token, ...campos, areas?:{...}}  → auto-save do rascunho
 * POST  body:{fill_token, ...campos, areas?:{...}}  → finaliza (status=submitted), retorna view_token
 * GET  ?view_token=XXX   → relatório somente-leitura (pro pastor)
 *
 * Segurança (idêntico ao agent-cuidado):
 *   1. Token 256-bit aleatório — não adivinhável
 *   2. Toda query filtra church_id = reporter.church_id (multi-tenant no SQL, não no RLS)
 *   3. Token inválido → 404 (não revela existência do token)
 *   4. Service_role contorna RLS, filtra no SQL — frontend nunca faz INSERT/UPDATE direto
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://ekthos-platform.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const TOKEN_LEN = 64;
const VALID_SERVICE_TYPES = ["domingo_manha", "domingo_noite", "quarta", "especial", "outro"] as const;
const VALID_AREAS = ["kids", "recepcao", "portaria", "louvor", "intercessao"] as const;
const REPORT_FIELDS = [
  "service_date", "service_type", "service_type_other", "pastor_name", "is_guest_pastor",
  "guest_pastor_name", "worship_leader", "sermon_topic",
  "total_people", "total_visitors", "notes",
] as const;

type ServiceType = typeof VALID_SERVICE_TYPES[number];
type AreaName    = typeof VALID_AREAS[number];

interface Reporter {
  id:        string;
  church_id: string;
  name:      string;
  sede:      string;
}

interface AreaPayload {
  volunteer_count?: number;
  kids_count?:      number; // só para area 'kids'
}

function corsHeaders(origin: string | null) {
  const allowed =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "GET, PATCH, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isValidToken(t: unknown): t is string {
  return typeof t === "string" && t.length === TOKEN_LEN && /^[0-9a-f]+$/.test(t);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveReporter(supabase: any, fillToken: string): Promise<Reporter | null> {
  const { data, error } = await supabase
    .from("service_report_reporters")
    .select("id, church_id, name, sede")
    .eq("fill_token", fillToken)
    .eq("is_active", true)
    .single();
  if (error || !data) return null;
  return data as Reporter;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCurrentDraft(supabase: any, reporterId: string, churchId: string) {
  const { data } = await supabase
    .from("service_reports")
    .select("*")
    .eq("reporter_id", reporterId)
    .eq("church_id", churchId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAreaCounts(supabase: any, reportId: string) {
  const { data } = await supabase
    .from("service_report_area_counts")
    .select("area_name, volunteer_count, kids_count")
    .eq("report_id", reportId);
  return data ?? [];
}

// Extrai apenas os campos permitidos do payload (whitelist)
function pickReportFields(raw: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const key of REPORT_FIELDS) {
    if (key in raw) {
      const val = raw[key];
      // Validação mínima por campo
      if (key === "service_type"       && !VALID_SERVICE_TYPES.includes(val as ServiceType)) continue;
      if (key === "service_type_other" && val !== null && typeof val !== "string") continue;
      if (key === "total_people"       && val !== null && typeof val !== "number") continue;
      if (key === "total_visitors"     && val !== null && typeof val !== "number") continue;
      result[key] = val;
    }
  }
  return result;
}

// Upsert áreas (ON CONFLICT report_id, area_name → update)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertAreas(
  supabase: any,
  reportId: string,
  churchId: string,
  areas: Record<string, AreaPayload | null>,
) {
  for (const [areaName, areaData] of Object.entries(areas)) {
    if (!VALID_AREAS.includes(areaName as AreaName)) continue;
    if (areaData === null) {
      // null significa "área removida" → apaga a linha
      await supabase
        .from("service_report_area_counts")
        .delete()
        .eq("report_id", reportId)
        .eq("area_name", areaName);
      continue;
    }
    const row: Record<string, unknown> = {
      report_id:       reportId,
      church_id:       churchId,
      area_name:       areaName,
      volunteer_count: typeof areaData.volunteer_count === "number" ? areaData.volunteer_count : 0,
    };
    if (areaName === "kids" && typeof areaData.kids_count === "number") {
      row.kids_count = areaData.kids_count;
    }
    await supabase
      .from("service_report_area_counts")
      .upsert(row, { onConflict: "report_id,area_name" });
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors   = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const fillToken = url.searchParams.get("fill_token");
    const viewToken = url.searchParams.get("view_token");

    // GET ?view_token=xxx → relatório somente-leitura pro pastor
    if (viewToken !== null) {
      if (!isValidToken(viewToken)) return json({ error: "not_found" }, 404, cors);

      const { data: report, error } = await supabase
        .from("service_reports")
        .select("*")
        .eq("view_token", viewToken)
        .eq("status", "submitted")
        .single();

      if (error || !report) return json({ error: "not_found" }, 404, cors);

      const areas = await getAreaCounts(supabase, report.id);
      return json({ report, areas }, 200, cors);
    }

    // GET ?fill_token=xxx → formulário do voluntário
    if (!isValidToken(fillToken)) return json({ error: "not_found" }, 404, cors);

    const reporter = await resolveReporter(supabase, fillToken);
    if (!reporter) return json({ error: "not_found" }, 404, cors);

    const draft = await getCurrentDraft(supabase, reporter.id, reporter.church_id);
    const areas = draft ? await getAreaCounts(supabase, draft.id) : [];

    return json(
      { reporter: { name: reporter.name, sede: reporter.sede }, draft, areas },
      200,
      cors,
    );
  }

  // ── PATCH: auto-save rascunho ──────────────────────────────────────────────
  if (req.method === "PATCH") {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400, cors); }

    const { fill_token, areas, ...rawFields } = body as Record<string, unknown> & {
      fill_token?: unknown;
      areas?:      Record<string, AreaPayload | null>;
    };

    if (!isValidToken(fill_token)) return json({ error: "not_found" }, 404, cors);

    const reporter = await resolveReporter(supabase, fill_token);
    if (!reporter) return json({ error: "not_found" }, 404, cors);

    const fields = pickReportFields(rawFields);
    let draft = await getCurrentDraft(supabase, reporter.id, reporter.church_id);

    if (!draft) {
      const { data: created, error } = await supabase
        .from("service_reports")
        .insert({
          ...fields,
          reporter_id: reporter.id,
          church_id:   reporter.church_id,
          sede:        reporter.sede,
          status:      "draft",
        })
        .select()
        .single();
      if (error || !created) return json({ error: "internal", detail: error?.message }, 500, cors);
      draft = created;
    } else {
      const { error } = await supabase
        .from("service_reports")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", draft.id)
        .eq("church_id", reporter.church_id);
      if (error) return json({ error: "internal", detail: error.message }, 500, cors);
    }

    if (areas && typeof areas === "object") {
      await upsertAreas(supabase, draft.id, reporter.church_id, areas);
    }

    return json({ saved: true, report_id: draft.id }, 200, cors);
  }

  // ── POST: finalizar relatório ──────────────────────────────────────────────
  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400, cors); }

    const { fill_token, areas, ...rawFields } = body as Record<string, unknown> & {
      fill_token?: unknown;
      areas?:      Record<string, AreaPayload | null>;
    };

    if (!isValidToken(fill_token)) return json({ error: "not_found" }, 404, cors);

    const reporter = await resolveReporter(supabase, fill_token);
    if (!reporter) return json({ error: "not_found" }, 404, cors);

    const fields = pickReportFields(rawFields);
    if (!fields.service_date) {
      return json({ error: "service_date_required" }, 400, cors);
    }

    let draft = await getCurrentDraft(supabase, reporter.id, reporter.church_id);
    const now = new Date().toISOString();

    if (!draft) {
      const { data: created, error } = await supabase
        .from("service_reports")
        .insert({
          ...fields,
          reporter_id:  reporter.id,
          church_id:    reporter.church_id,
          sede:         reporter.sede,
          status:       "submitted",
          submitted_at: now,
        })
        .select()
        .single();
      if (error || !created) return json({ error: "internal", detail: error?.message }, 500, cors);
      draft = created;
    } else {
      const { error } = await supabase
        .from("service_reports")
        .update({
          ...fields,
          status:       "submitted",
          submitted_at: now,
          updated_at:   now,
        })
        .eq("id", draft.id)
        .eq("church_id", reporter.church_id);
      if (error) return json({ error: "internal", detail: error.message }, 500, cors);

      // Re-fetch para pegar view_token atualizado
      const { data: refreshed } = await supabase
        .from("service_reports")
        .select("*")
        .eq("id", draft.id)
        .single();
      draft = refreshed ?? draft;
    }

    if (areas && typeof areas === "object") {
      await upsertAreas(supabase, draft.id, reporter.church_id, areas);
    }

    const baseUrl = Deno.env.get("ALLOWED_ORIGIN") ?? "https://ekthos-platform.vercel.app";
    const viewUrl = `${baseUrl}/culto/ver/${draft.view_token}`;

    return json(
      { submitted: true, view_token: draft.view_token, view_url: viewUrl },
      200,
      cors,
    );
  }

  return json({ error: "method_not_allowed" }, 405, cors);
});
