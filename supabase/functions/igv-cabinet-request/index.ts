/**
 * igv-cabinet-request v2 — Gabinete Pastoral PWA (público, sem JWT)
 * GET  ?action=pastors             → pastores ativos IGV
 * GET  ?action=slots&pastor_id=X  → slots disponíveis de um pastor
 * POST                             → solicitar agendamento (slot_id opcional)
 *
 * Anti-double-booking v2: UPDATE cabinet_slots SET appointment_id=X
 *   WHERE id=slot AND appointment_id IS NULL
 *   Se 0 linhas retornadas → 409 (corrida perdida).
 * LGPD: theme/notes nunca em logs. Apenas códigos de erro.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const IGV_CHURCH_ID = "6c127559-874a-4748-8fce-55d4079613a5";

const ALLOWED_ORIGINS = [
  "https://ekthos-platform.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const VALID_THEMES = ["Aconselhamento", "Oração", "Família", "Questão Espiritual", "Outro"];
const VALID_TYPES  = ["Individual", "Casal", "Família"];

function corsHeaders(origin: string | null) {
  const allowed =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 15);
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

  const url    = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";

  // ── GET ?action=pastors ── lista pastores ativos da IGV ──────────────────
  if (req.method === "GET" && action === "pastors") {
    const { data, error } = await supabase
      .from("pastoral_cabinet")
      .select("id, role, bio, photo_url, people(name)")
      .eq("church_id", IGV_CHURCH_ID)
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    if (error) {
      console.error("[igv-cabinet-request] pastors query error:", error.code);
      return json({ error: "Erro ao buscar pastores." }, 500, cors);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pastors = (data ?? []).map((m: any) => ({
      id:        m.id,
      name:      m.people?.name ?? null,
      role:      m.role,
      bio:       m.bio ?? null,
      photo_url: m.photo_url ?? null,
    }));

    return json({ pastors }, 200, cors);
  }

  // ── GET ?action=slots&pastor_id=X ── slots disponíveis de um pastor ──────
  if (req.method === "GET" && action === "slots") {
    const pastorId = url.searchParams.get("pastor_id");
    if (!pastorId) return json({ error: "pastor_id obrigatório." }, 400, cors);

    // Valida pastor pertence à IGV e está ativo
    const { data: pastor } = await supabase
      .from("pastoral_cabinet")
      .select("id")
      .eq("id", pastorId)
      .eq("church_id", IGV_CHURCH_ID)
      .eq("is_active", true)
      .maybeSingle();

    if (!pastor) return json({ error: "Pastor não encontrado." }, 404, cors);

    const { data, error } = await supabase
      .from("cabinet_slots")
      .select("id, slot_datetime, duration_minutes")
      .eq("cabinet_pastor_id", pastorId)
      .eq("church_id", IGV_CHURCH_ID)
      .is("appointment_id", null)
      .gt("slot_datetime", new Date().toISOString())
      .order("slot_datetime");

    if (error) {
      console.error("[igv-cabinet-request] slots query error:", error.code);
      return json({ error: "Erro ao buscar horários." }, 500, cors);
    }

    return json({ slots: data ?? [] }, 200, cors);
  }

  // ── POST — cria pedido de agendamento ────────────────────────────────────
  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "JSON inválido." }, 400, cors);
    }

    const name                  = (body.name                  as string | undefined)?.trim() ?? "";
    const phone                 = (body.phone                 as string | undefined)?.trim() ?? "";
    const theme                 = (body.theme                 as string | undefined)?.trim() ?? "";
    const appointment_type      = (body.appointment_type      as string | undefined)?.trim() ?? "";
    const preferred_datetime_text = (body.preferred_datetime_text as string | undefined)?.trim() ?? "";
    const cabinet_pastor_id     = (body.cabinet_pastor_id     as string | undefined)?.trim() ?? "";
    const slot_id               = (body.slot_id               as string | undefined)?.trim() ?? "";

    if (!name || !phone || !theme || !appointment_type) {
      return json({ error: "Campos obrigatórios: nome, telefone, tema, tipo." }, 400, cors);
    }
    if (!VALID_THEMES.includes(theme)) {
      return json({ error: "Tema inválido." }, 400, cors);
    }
    if (!VALID_TYPES.includes(appointment_type)) {
      return json({ error: "Tipo inválido." }, 400, cors);
    }

    const phoneSan = sanitizePhone(phone);
    if (phoneSan.length < 8) {
      return json({ error: "Telefone inválido (mínimo 8 dígitos)." }, 400, cors);
    }

    // Valida pastor se fornecido
    let resolvedPastorId: string | null = null;
    if (cabinet_pastor_id) {
      const { data: pastor } = await supabase
        .from("pastoral_cabinet")
        .select("id")
        .eq("id", cabinet_pastor_id)
        .eq("church_id", IGV_CHURCH_ID)
        .eq("is_active", true)
        .maybeSingle();
      if (pastor) resolvedPastorId = cabinet_pastor_id;
    }

    // Valida slot se fornecido — pré-check (rápido, não atômico)
    if (slot_id) {
      const { data: slot } = await supabase
        .from("cabinet_slots")
        .select("id, appointment_id")
        .eq("id", slot_id)
        .eq("church_id", IGV_CHURCH_ID)
        .maybeSingle();

      if (!slot)               return json({ error: "Horário não encontrado." }, 400, cors);
      if (slot.appointment_id) return json({ error: "Horário indisponível. Escolha outro." }, 409, cors);
    }

    // ── Upsert pessoa por telefone ─────────────────────────────────────────
    let personId: string;

    const { data: existing } = await supabase
      .from("people")
      .select("id")
      .eq("church_id", IGV_CHURCH_ID)
      .eq("phone", phoneSan)
      .maybeSingle();

    if (existing) {
      personId = existing.id;
      await supabase
        .from("people")
        .update({ name, last_contact_at: new Date().toISOString() })
        .eq("id", personId);
    } else {
      const { data: newPerson, error: insertErr } = await supabase
        .from("people")
        .insert({
          church_id:      IGV_CHURCH_ID,
          name,
          phone:          phoneSan,
          source:         "gabinete_igv",
          person_stage:   "visitante",
          lgpd_consent:   true,
          is_bulk_import: false,
        })
        .select("id")
        .single();

      if (insertErr || !newPerson) {
        console.error("[igv-cabinet-request] people insert error:", insertErr?.code);
        return json({ error: "Erro ao salvar seus dados." }, 500, cors);
      }
      personId = newPerson.id;
    }

    // ── INSERT appointment ─────────────────────────────────────────────────
    // LGPD: theme NÃO vai em nenhum log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apptPayload: Record<string, any> = {
      church_id:        IGV_CHURCH_ID,
      person_id:        personId,
      appointment_type,
      scheduled_at:     new Date().toISOString(),
      status:           "solicitado",
      source:           "igv_pwa",
      theme,
      is_test:          false,
      cabinet_pastor_id: resolvedPastorId,
      slot_id:          slot_id || null,
    };

    if (preferred_datetime_text) {
      apptPayload.preferred_datetime_text = preferred_datetime_text.slice(0, 200);
    }

    const { data: appt, error: apptErr } = await supabase
      .from("pastoral_appointments")
      .insert(apptPayload)
      .select("id")
      .single();

    if (apptErr || !appt) {
      console.error("[igv-cabinet-request] appointment insert error:", apptErr?.code);
      return json({ error: "Erro ao registrar pedido." }, 500, cors);
    }

    // ── Anti-double-booking: UPDATE condicional atômico ───────────────────
    // UPDATE só ocorre se appointment_id ainda for NULL — Postgres serializa.
    // Se 0 rows retornadas → outro request ganhou a corrida → rollback + 409.
    if (slot_id) {
      const { data: reserved } = await supabase
        .from("cabinet_slots")
        .update({ appointment_id: appt.id })
        .eq("id", slot_id)
        .is("appointment_id", null)
        .select("id");

      if (!reserved || reserved.length === 0) {
        await supabase.from("pastoral_appointments").delete().eq("id", appt.id);
        return json({ error: "Horário indisponível. Escolha outro." }, 409, cors);
      }
    }

    return json(
      { success: true, message: "Pedido registrado com sucesso." },
      200,
      cors,
    );
  }

  return json({ error: "Método não permitido." }, 405, cors);
});
