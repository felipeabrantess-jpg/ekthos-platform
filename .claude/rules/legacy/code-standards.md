# Padrões de Código — Ekthos Platform

> Código de qualidade não é luxo, é necessidade. Em um sistema que gerencia dados sensíveis de comunidades religiosas, código ruim é risco.

---

## 1. TypeScript Obrigatório — Sem Exceções

Todo código novo deve ser escrito em TypeScript com tipagem explícita.

### Proibições Absolutas

```typescript
// PROIBIDO: Tipo any
function processData(data: any): any { } // ERRADO

// PROIBIDO: Ignorar erros de tipo com comentários
// @ts-ignore
const result = riskyFunction(); // ERRADO

// PROIBIDO: Casting desnecessário
const id = (someValue as any).id; // ERRADO

// PROIBIDO: Tipo implícito
function getData() { // ERRADO — retorno implícito
  return fetch('/api/data');
}
```

### Correto

```typescript
// CORRETO: Tipos explícitos sempre
interface Person {
  id: string;
  churchId: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  createdAt: Date;
}

// CORRETO: Tipos de retorno explícitos
async function findPersonByEmail(
  churchId: string,
  email: string
): Promise<Person | null> {
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('church_id', churchId)
    .eq('email', email)
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar pessoa: ${error.message}`);
  return data ? mapPersonFromDb(data) : null;
}

// CORRETO: Generics quando apropriado
async function fetchById<T>(
  table: string,
  id: string,
  churchId: string
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .eq('church_id', churchId)
    .maybeSingle();

  if (error) throw new Error(`Erro em ${table}: ${error.message}`);
  return data as T | null;
}
```

---

## 2. Funções Puras Sempre que Possível

Funções puras são previsíveis, testáveis e fáceis de depurar.

```typescript
// CORRETO: Função pura — sem side effects, mesmo input = mesmo output
function formatCurrency(amount: number, currency: 'BRL' | 'USD' = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(amount);
}

// CORRETO: Transformação pura de dados
function mapPersonFromDb(dbRecord: PersonDbRecord): Person {
  return {
    id: dbRecord.id,
    churchId: dbRecord.church_id,
    name: dbRecord.name,
    email: dbRecord.email,
    phone: dbRecord.phone,
    tags: dbRecord.tags ?? [],
    createdAt: new Date(dbRecord.created_at),
  };
}

// CORRETO: Validação pura
function isValidCpf(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  if (/^(\d)\1+$/.test(cleaned)) return false;
  // ... lógica de validação dos dígitos verificadores
  return true;
}
```

---

## 3. Tratamento de Erros Explícito

Nunca silenciar erros. Nunca assumir que uma operação vai funcionar.

```typescript
// CORRETO: Tratamento explícito com contexto útil
async function createDonation(
  churchId: string,
  donorId: string,
  amount: number,
  category: DonationCategory
): Promise<Donation> {
  if (amount <= 0) {
    throw new Error(`Valor de doação inválido: ${amount}. Deve ser positivo.`);
  }

  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`Categoria de doação inválida: ${category}`);
  }

  const { data, error } = await supabase
    .from('donations')
    .insert({
      church_id: churchId,
      donor_id: donorId,
      amount,
      category,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    // Log estruturado para facilitar debugging
    console.error('[createDonation] Erro ao criar doação', {
      churchId,
      donorId,
      amount,
      category,
      supabaseError: error.message,
      supabaseCode: error.code,
    });
    throw new Error(`Falha ao registrar doação: ${error.message}`);
  }

  return mapDonationFromDb(data);
}

// ERRADO: Erro silenciado
async function createDonationBad(amount: number) {
  try {
    const { data } = await supabase.from('donations').insert({ amount });
    return data; // E se der erro? Retorna undefined silenciosamente
  } catch (e) {
    console.log(e); // Loga mas não relança — erro engolido
    return null;
  }
}
```

---

## 4. Nomenclatura

### Código: Inglês
```typescript
// Variáveis, funções, classes, interfaces: inglês
const churchId = '...';
function fetchDonations() {}
interface PersonProfile {}
class WhatsAppAgent {}

// Enums: inglês
enum DonationStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Cancelled = 'cancelled',
}
```

### Documentação e Comentários: Português
```typescript
/**
 * Busca todas as doações de um tenant em um período específico.
 * Aplica filtros por categoria e status automaticamente baseado
 * nas permissões do usuário autenticado.
 *
 * @param churchId - Identificador único da igreja (validado via RLS)
 * @param startDate - Data de início do período (inclusiva)
 * @param endDate - Data de fim do período (inclusiva)
 * @param filters - Filtros opcionais de categoria e status
 * @returns Lista de doações com dados do doador (exceto dados sensíveis)
 */
async function fetchDonationsForPeriod(
  churchId: string,
  startDate: Date,
  endDate: Date,
  filters?: DonationFilters
): Promise<Donation[]> {
  // Converte datas para ISO string para compatibilidade com Postgres
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  // Monta query base — church_id sempre incluído para garantir isolamento
  let query = supabase
    .from('donations')
    .select('*, people!donor_id(name, email)')
    .eq('church_id', churchId)
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  // Aplica filtros opcionais apenas se fornecidos
  if (filters?.category) {
    query = query.eq('category', filters.category);
  }

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw new Error(`Erro ao buscar doações: ${error.message}`);
  return (data ?? []).map(mapDonationFromDb);
}
```

---

## 5. Estrutura de Arquivos e Módulos

### Convenção de Nomenclatura de Arquivos
```
# Edge Functions Supabase
supabase/functions/
  whatsapp-webhook/index.ts         # kebab-case para pastas
  process-donation/index.ts
  onboard-church/index.ts

# Utilitários compartilhados
supabase/functions/_shared/
  tenant-context.ts                 # kebab-case para arquivos
  rate-limiter.ts
  response-helpers.ts
  types.ts

# Frontend (futuro)
src/
  components/
    DashboardHeader.tsx             # PascalCase para componentes React
    DonationTable.tsx
  hooks/
    useTenantContext.ts             # camelCase para hooks
    useDonations.ts
  lib/
    formatters.ts                   # kebab-case para utilitários
    validators.ts
  types/
    database.types.ts               # Gerado pelo Supabase CLI
    app.types.ts                    # Tipos da aplicação
```

---

## 6. Organização de Imports

```typescript
// Ordem de imports (sempre nesta sequência):
// 1. Node/Deno built-ins
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

// 2. Dependências externas
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 3. Imports internos absolutos
import { validateWebhook } from '../_shared/webhook-validator.ts';
import { loadTenantContext } from '../_shared/tenant-context.ts';

// 4. Tipos (sempre ao final)
import type { TenantContext, WebhookPayload } from '../_shared/types.ts';
```

---

## 7. Padrões para Edge Functions

```typescript
// Template padrão para Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Trata preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Inicializa cliente com contexto do usuário autenticado
    const supabase = createClient<Database>(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Valida autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Processa a requisição
    const result = await handleRequest(supabase, user, req);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Log estruturado do erro
    console.error('[FunctionName] Erro não tratado:', error);

    return new Response(JSON.stringify({
      error: 'Erro interno do servidor',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

---

## 8. Testes

```typescript
// Testes obrigatórios para funções críticas (usando Deno.test)

// Teste de validação de CPF
Deno.test('isValidCpf — CPF válido', () => {
  assertEquals(isValidCpf('123.456.789-09'), true);
});

Deno.test('isValidCpf — CPF inválido', () => {
  assertEquals(isValidCpf('111.111.111-11'), false);
  assertEquals(isValidCpf('000.000.000-00'), false);
  assertEquals(isValidCpf('abc.def.ghi-jk'), false);
});

// Teste de isolamento de tenant
Deno.test('fetchDonations — deve filtrar por church_id', async () => {
  const churchA = 'uuid-church-a';
  const churchB = 'uuid-church-b';

  const donationsA = await fetchDonations(churchA);
  const hasLeakage = donationsA.some(d => d.churchId !== churchA);

  assertEquals(hasLeakage, false, 'Dados de outro tenant foram retornados!');
});
```

---

## 9. Checklist de Code Review

Antes de aprovar qualquer PR:

- [ ] Sem uso de `any` no TypeScript
- [ ] Todos os erros têm tratamento explícito
- [ ] Funções têm tipos de retorno declarados
- [ ] `church_id` presente em todas as queries relevantes
- [ ] Comentários em português para lógica complexa
- [ ] Nomes de variáveis e funções em inglês
- [ ] Sem dados sensíveis nos logs
- [ ] Testes existem para funções críticas de negócio
- [ ] Imports organizados conforme convenção
- [ ] Sem hardcode de valores que deveriam ser configuráveis
