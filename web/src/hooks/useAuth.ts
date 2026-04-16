// ============================================================
// useAuth — re-exporta do AuthContext central.
//
// Mantém backward compatibility: qualquer componente que já
// importava de '@/hooks/useAuth' continua funcionando sem
// nenhuma alteração.
//
// A lógica real (refreshSession, onAuthStateChange) fica em
// web/src/lib/auth-context.tsx — veja comentários lá.
// ============================================================

export type { AuthState } from '@/lib/auth-context'
export { useAuth, useLogout } from '@/lib/auth-context'
