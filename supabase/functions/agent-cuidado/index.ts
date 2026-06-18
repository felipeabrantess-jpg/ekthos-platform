/**
 * agent-cuidado — Link Privado de Responsável de Cuidado
 *
 * GET  ?token=XXX  → dados do responsável + lista de pessoas sob seus cuidados
 * PATCH body:{token, person_id, care_status?, care_observation?, care_next_step?}
 *       → atualiza estado de UMA pessoa (SÓ se ela pertencer a este responsável)
 *
 * Segurança — 4 camadas:
 *   1. Token 256-bit aleatório (gen_random_bytes) — não adivinhável
 *   2. Toda query tem AND church_id = cr.church_id (multi-tenant no banco)
 *   3. PATCH: AND responsible_id = cr.id — 0 linhas → 403 (não pertence a ele)
 *   4. Token inválido → 404 (não revela existência do token)
 *
 * Sem JWT. Acesso público via token. Service role contorna RLS, filtra no SQL.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://ekthos-platform.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const CARE_STATUSES = ["pendente", "contatado", "visitado", "cuidando", "sem_sucesso"];
const TOKEN_LEN = 64; // 32 bytes hex = 64 chars

function corsHeaders(origin: string | null) {
  const allowed =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
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

  // ── GET: listar pessoas do responsável ─────────────────────────────────────
  if (req.method === "GET") {
    const url   = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!isValidToken(token)) {
      return json({ error: "not_found" }, 404, cors);
    }

    const { data: cr, error: crErr } = await supabase
      .from("care_responsibles")
      .select("id, church_id, name, region, type")
      .eq("token", token)
      .eq("is_active", true)
      .single();

    if (crErr || !cr) return json({ error: "not_found" }, 404, cors);

    // Retorna apenas nome + telefone + bairro + campos care_ (sem dados sensíveis além disso)
    const { data: pessoas, error: pErr } = await supabase
      .from("people")
      .select(
        "id, name, phone, neighborhood, care_status, care_observation, care_next_step, care_updated_at"
      )
      .eq("responsible_id", cr.id)
      .eq("church_id", cr.church_id)
      .order("name", { ascending: true });

    if (pErr) return json({ error: "internal" }, 500, cors);

    return json(
      {
        responsible: { name: cr.name, region: cr.region, type: cr.type },
        people: pessoas ?? [],
      },
      200,
      cors,
    );
  }

  // ── PATCH: atualizar status/obs/next_step de uma pessoa ───────────────────
  if (req.method === "PATCH") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400, cors);
    }

    const { token, person_id, care_status, care_observation, care_next_step } = body as {
      token?:            unknown;
      person_id?:        unknown;
      care_status?:      unknown;
      care_observation?: unknown;
      care_next_step?:   unknown;
    };

    if (!isValidToken(token)) return json({ error: "not_found" }, 404, cors);
    if (!person_id || typeof person_id !== "string") {
      return json({ error: "person_required" }, 400, cors);
    }
    if (care_status !== undefined && !CARE_STATUSES.includes(care_status as string)) {
      return json({ error: "invalid_status" }, 400, cors);
    }

    const { data: cr, error: crErr } = await supabase
      .from("care_responsibles")
      .select("id, church_id")
      .eq("token", token)
      .eq("is_active", true)
      .single();

    if (crErr || !cr) return json({ error: "not_found" }, 404, cors);

    const updates: Record<string, unknown> = {
      care_updated_at: new Date().toISOString(),
    };
    if (care_status      !== undefined) updates.care_status      = care_status;
    if (care_observation !== undefined) updates.care_observation = care_observation;
    if (care_next_step   !== undefined) updates.care_next_step   = care_next_step;

    // WHERE id = person_id AND responsible_id = cr.id AND church_id = cr.church_id
    // 0 linhas → forbidden (pessoa não é deste responsável ou church diferente)
    const { data: updated, error: upErr } = await supabase
      .from("people")
      .update(updates)
      .eq("id", person_id)
      .eq("responsible_id", cr.id)
      .eq("church_id", cr.church_id)
      .select("id, care_status, care_observation, care_next_step, care_updated_at");

    if (upErr) return json({ error: "internal" }, 500, cors);
    if (!updated || updated.length === 0) {
      return json({ error: "forbidden" }, 403, cors);
    }

    return json({ updated: updated[0] }, 200, cors);
  }

  return json({ error: "method_not_allowed" }, 405, cors);
});
