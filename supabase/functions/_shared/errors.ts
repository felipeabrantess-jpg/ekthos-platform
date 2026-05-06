// Shared error helper for admin Edge Functions.
// NEVER expose error.message to the client — it leaks schema details.

export function jsonError(
  corsHeaders: Record<string, string>,
  status = 500,
): Response {
  return new Response(
    JSON.stringify({ error: 'Internal server error' }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}
