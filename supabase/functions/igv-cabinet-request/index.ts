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

  const url = new URL(req.url);

  // ── GET ?action=pastors ── lista pastores ativos da IGV ──────────────────
  if (req.method === "GET" && url.searchParams.get("action") === "pastors") {
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
      id:       m.id,
      name:     m.people?.name ?? null,
      role:     m.role,
      bio:      m.bio ?? null,
      photo_url: m.photo_url ?? null,
    }));

    return json({ pastors }, 200, cors);
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

    // ── Montar payload do agendamento ──────────────────────────────────────
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
    };

    if (preferred_datetime_text) {
      apptPayload.preferred_datetime_text = preferred_datetime_text.slice(0, 200);
    }

    if (cabinet_pastor_id) {
      const { data: pastor } = await supabase
        .from("pastoral_cabinet")
        .select("id")
        .eq("id", cabinet_pastor_id)
        .eq("church_id", IGV_CHURCH_ID)
        .eq("is_active", true)
        .maybeSingle();
      if (pastor) {
        apptPayload.cabinet_pastor_id = cabinet_pastor_id;
      }
    }

    const { error: apptErr } = await supabase
      .from("pastoral_appointments")
      .insert(apptPayload);

    if (apptErr) {
      // LGPD: apenas código de erro, sem dados sensíveis
      console.error("[igv-cabinet-request] appointment insert error:", apptErr.code);
      return json({ error: "Erro ao registrar pedido." }, 500, cors);
    }

    return json(
      { success: true, message: "Pedido registrado com sucesso." },
      200,
      cors,
    );
  }

  return json({ error: "Método não permitido." }, 405, cors);
});
