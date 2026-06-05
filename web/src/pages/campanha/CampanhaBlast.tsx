/**
 * CampanhaBlast — Disparo em massa faseado (WhatsApp)
 * Feature: campanha com vídeo para membros da igreja
 * Branch: feat/campanha-blast
 *
 * Fluxo:
 *   1. SETUP    → configurar campanha (mensagem, vídeo, instância, lotes)
 *   2. TEST     → testar com 2-3 números antes do disparo geral
 *   3. PREVIEW  → revisar lista completa e iniciar
 *   4. RUNNING  → disparo em lotes com throttle anti-ban
 *   5. DONE     → resumo final
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  Megaphone, Play, Square, CheckCircle2, XCircle,
  Clock, Users, AlertTriangle, ChevronRight,
  Send, RefreshCw, Info, Eye, EyeOff,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ── Tipos ────────────────────────────────────────────────────────────────────

type Phase =
  | 'setup'
  | 'testing'
  | 'test_result'
  | 'loading_recipients'
  | 'preview'
  | 'running'
  | 'done'

interface Recipient {
  id:    string
  name:  string | null
  phone: string
}

interface SendLog {
  phone:      string
  name:       string | null
  status:     'sent' | 'failed' | 'pending'
  message_id: string | null
  error:      string | null
  ts:         string
}

interface TestResult {
  phone:  string
  ok:     boolean
  msg_id: string | null
  error:  string | null
}

// ── Constantes padrão ────────────────────────────────────────────────────────

const DEFAULT_MESSAGE =
  'Domingo passado foi lindo… e eu creio que o próximo será ainda mais Especial! \n\nSerá uma Alegria te receber novamente conosco!!'

const DEFAULT_VIDEO_URL =
  'https://drive.google.com/file/d/1xok8F7I57i47TqvFG6cYO6pmrVbOTNMR/view?usp=drive_link'

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms))
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length >= 8) return `${d.slice(0, 4)}****${d.slice(-4)}`
  return phone
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CampanhaBlast() {
  const { churchId } = useAuth()

  // ── Formulário de setup ──
  const [title, setTitle]           = useState('Campanha Culto Domingo')
  const [message, setMessage]       = useState(DEFAULT_MESSAGE)
  const [videoUrl, setVideoUrl]     = useState(DEFAULT_VIDEO_URL)
  const [instanceId, setInstanceId] = useState('')
  const [instanceToken, setInstanceToken] = useState('')
  const [batchSize, setBatchSize]   = useState(10)
  const [intervalSec, setIntervalSec] = useState(180)
  const [showToken, setShowToken]   = useState(false)

  // ── Estado de fase ──
  const [phase, setPhase] = useState<Phase>('setup')

  // ── Campanha criada ──
  const [blastId, setBlastId] = useState<string | null>(null)

  // ── Teste ──
  const [testPhones, setTestPhones] = useState(['', ''])
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [testError, setTestError] = useState<string | null>(null)

  // ── Destinatários ──
  const [recipients, setRecipients]   = useState<Recipient[]>([])
  const [recipientError, setRecipientError] = useState<string | null>(null)

  // ── Progresso ──
  const [sentCount, setSentCount]   = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [batchCurrent, setBatchCurrent] = useState(0)
  const [batchTotal, setBatchTotal]     = useState(0)
  const [countdown, setCountdown]       = useState(0)
  const [log, setLog] = useState<SendLog[]>([])
  const [finalStatus, setFinalStatus] = useState<'completed' | 'cancelled' | null>(null)

  // ── Controle de parada ──
  const stopRef     = useRef(false)
  const mountedRef  = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Criar campanha no banco ──────────────────────────────────────────────────

  const handleCreateBlast = useCallback(async () => {
    if (!churchId) return
    if (!instanceId.trim() || !instanceToken.trim()) {
      alert('Preencha o Instance ID e o Token Z-API do seu número pessoal.')
      return
    }
    if (!message.trim()) {
      alert('A mensagem não pode estar vazia.')
      return
    }

    const { data, error } = await supabase
      .from('campaign_blasts')
      .insert({
        church_id:              churchId,
        title:                  title.trim() || 'Campanha',
        message_text:           message.trim(),
        video_url:              videoUrl.trim() || null,
        instance_id:            instanceId.trim(),
        instance_token:         instanceToken.trim(),
        batch_size:             batchSize,
        batch_interval_seconds: intervalSec,
        status:                 'draft',
      })
      .select('id')
      .single()

    if (error || !data) {
      alert(`Erro ao criar campanha: ${error?.message ?? 'desconhecido'}`)
      return
    }

    setBlastId(data.id)
    setPhase('testing')
  }, [churchId, title, message, videoUrl, instanceId, instanceToken, batchSize, intervalSec])

  // ── Enviar teste ────────────────────────────────────────────────────────────

  const handleTest = useCallback(async () => {
    if (!blastId) return
    const phones = testPhones.map(p => p.trim()).filter(Boolean)
    if (phones.length === 0) {
      setTestError('Adicione pelo menos 1 número de teste.')
      return
    }

    setTestError(null)
    setTestResults([])
    setPhase('testing')

    // Update blast to 'running' temporarily while testing
    await supabase.from('campaign_blasts').update({ status: 'running' }).eq('id', blastId)

    const results: TestResult[] = []
    for (const phone of phones) {
      const { data, error } = await supabase.functions.invoke('campaign-blast-sender', {
        body: {
          blast_id:    blastId,
          phone,
          person_id:   null,
          person_name: 'TESTE',
        },
      })
      results.push({
        phone,
        ok:     !error && !!data?.ok,
        msg_id: data?.message_id ?? null,
        error:  error?.message ?? data?.error ?? null,
      })
      await sleep(2000)
    }

    // Reset status to 'draft' after test (EF increments counters but that's OK for test)
    await supabase.from('campaign_blasts').update({ status: 'draft' }).eq('id', blastId)

    if (mountedRef.current) {
      setTestResults(results)
      setPhase('test_result')
    }
  }, [blastId, testPhones])

  // ── Carregar destinatários ───────────────────────────────────────────────────

  const handleLoadRecipients = useCallback(async () => {
    if (!churchId) return
    setPhase('loading_recipients')
    setRecipientError(null)

    const { data, error } = await supabase
      .from('people')
      .select('id, name, phone')
      .eq('church_id', churchId)
      .not('phone', 'is', null)
      .neq('phone', '')
      .order('name', { ascending: true })

    if (error || !data) {
      setRecipientError(error?.message ?? 'Erro ao carregar destinatários.')
      setPhase('test_result')
      return
    }

    const valid = data.filter(p => p.phone && p.phone.trim() !== '') as Recipient[]
    if (mountedRef.current) {
      setRecipients(valid)
      setPhase('preview')

      // Update total_recipients
      if (blastId) {
        await supabase
          .from('campaign_blasts')
          .update({ total_recipients: valid.length })
          .eq('id', blastId)
      }
    }
  }, [churchId, blastId])

  // ── Iniciar disparo completo ─────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    if (!blastId || recipients.length === 0) return

    stopRef.current = false
    setPhase('running')
    setSentCount(0)
    setFailedCount(0)
    setLog([])
    setCountdown(0)

    await supabase.from('campaign_blasts').update({ status: 'running' }).eq('id', blastId)

    const batches = chunk(recipients, batchSize)
    setBatchTotal(batches.length)
    setBatchCurrent(1)

    let stopped = false

    for (let bi = 0; bi < batches.length; bi++) {
      if (stopRef.current) { stopped = true; break }

      setBatchCurrent(bi + 1)
      const batch = batches[bi]

      for (const recipient of batch) {
        if (stopRef.current) { stopped = true; break }

        const ts = new Date().toLocaleTimeString('pt-BR')

        const { data, error } = await supabase.functions.invoke('campaign-blast-sender', {
          body: {
            blast_id:    blastId,
            phone:       recipient.phone,
            person_id:   recipient.id,
            person_name: recipient.name,
          },
        })

        const sendOk = !error && !!data?.ok
        const logEntry: SendLog = {
          phone:      recipient.phone,
          name:       recipient.name,
          status:     sendOk ? 'sent' : 'failed',
          message_id: data?.message_id ?? null,
          error:      error?.message ?? data?.error ?? null,
          ts,
        }

        if (mountedRef.current) {
          setLog(prev => [logEntry, ...prev.slice(0, 99)])
          if (sendOk) setSentCount(c => c + 1)
          else        setFailedCount(c => c + 1)
        }

        if (stopRef.current) { stopped = true; break }

        // Anti-ban: 2–5s random delay between messages
        const delay = Math.floor(Math.random() * 3000) + 2000
        await sleep(delay)
      }

      if (stopped) break

      // Countdown between batches (skip after last batch)
      if (bi < batches.length - 1) {
        for (let rem = intervalSec; rem > 0; rem--) {
          if (stopRef.current) { stopped = true; break }
          if (mountedRef.current) setCountdown(rem)
          await sleep(1000)
        }
        if (mountedRef.current) setCountdown(0)
      }
    }

    const status = stopped ? 'cancelled' : 'completed'
    await supabase.from('campaign_blasts').update({ status }).eq('id', blastId)

    if (mountedRef.current) {
      setFinalStatus(status)
      setPhase('done')
    }
  }, [blastId, recipients, batchSize, intervalSec])

  const handleStop = useCallback(() => {
    stopRef.current = true
  }, [])

  // ── Recomeçar ────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    stopRef.current = false
    setBlastId(null)
    setPhase('setup')
    setTestResults([])
    setRecipients([])
    setSentCount(0)
    setFailedCount(0)
    setLog([])
    setFinalStatus(null)
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────────

  const testPassed = testResults.length > 0 && testResults.every(r => r.ok)

  return (
    <div style={{ background: '#f9eedc', minHeight: '100vh', padding: '2rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{
            background: '#e13500', borderRadius: '12px', padding: '0.625rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Megaphone size={22} color="#fff" />
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.75rem', fontWeight: 600, color: '#161616', margin: 0 }}>
            Campanha de Culto
          </h1>
        </div>
        <p style={{ color: '#5A5A5A', fontSize: '0.9375rem', margin: 0 }}>
          Disparo faseado de vídeo + mensagem via WhatsApp — anti-ban integrado
        </p>
      </div>

      {/* ── FASE: SETUP ── */}
      {phase === 'setup' && (
        <SetupForm
          title={title} onTitle={setTitle}
          message={message} onMessage={setMessage}
          videoUrl={videoUrl} onVideoUrl={setVideoUrl}
          instanceId={instanceId} onInstanceId={setInstanceId}
          instanceToken={instanceToken} onInstanceToken={setInstanceToken}
          showToken={showToken} onShowToken={setShowToken}
          batchSize={batchSize} onBatchSize={setBatchSize}
          intervalSec={intervalSec} onIntervalSec={setIntervalSec}
          onSubmit={handleCreateBlast}
        />
      )}

      {/* ── FASE: TEST INPUT ── */}
      {phase === 'test_result' && testResults.length === 0 && (
        <TestPhase
          testPhones={testPhones}
          onTestPhones={setTestPhones}
          onRunTest={handleTest}
          error={testError}
        />
      )}

      {/* ── FASE: TESTING (aguardando envio) ── */}
      {phase === 'testing' && (
        <StatusCard icon={<RefreshCw size={24} className="animate-spin" color="#e13500" />} title="Enviando teste…" subtitle="Aguarde o resultado dos envios de teste." />
      )}

      {/* ── FASE: TEST RESULT ── */}
      {phase === 'test_result' && testResults.length > 0 && (
        <TestResults
          results={testResults}
          recipientError={recipientError}
          onLoadRecipients={handleLoadRecipients}
          onReconfigure={() => {
            setTestResults([])
            setTestError(null)
          }}
        />
      )}

      {/* ── FASE: CARREGANDO DESTINATÁRIOS ── */}
      {phase === 'loading_recipients' && (
        <StatusCard icon={<RefreshCw size={24} className="animate-spin" color="#e13500" />} title="Carregando destinatários…" subtitle="Buscando todos os membros com telefone válido." />
      )}

      {/* ── FASE: PREVIEW ── */}
      {phase === 'preview' && (
        <PreviewPhase
          recipients={recipients}
          batchSize={batchSize}
          intervalSec={intervalSec}
          onStart={handleStart}
          onBack={() => setPhase('test_result')}
        />
      )}

      {/* ── FASE: RUNNING ── */}
      {phase === 'running' && (
        <RunningPhase
          total={recipients.length}
          sent={sentCount}
          failed={failedCount}
          batchCurrent={batchCurrent}
          batchTotal={batchTotal}
          countdown={countdown}
          log={log}
          onStop={handleStop}
        />
      )}

      {/* ── FASE: DONE ── */}
      {phase === 'done' && (
        <DonePhase
          total={recipients.length}
          sent={sentCount}
          failed={failedCount}
          status={finalStatus}
          onReset={handleReset}
        />
      )}
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

interface SetupFormProps {
  title: string; onTitle: (v: string) => void
  message: string; onMessage: (v: string) => void
  videoUrl: string; onVideoUrl: (v: string) => void
  instanceId: string; onInstanceId: (v: string) => void
  instanceToken: string; onInstanceToken: (v: string) => void
  showToken: boolean; onShowToken: (v: boolean) => void
  batchSize: number; onBatchSize: (v: number) => void
  intervalSec: number; onIntervalSec: (v: number) => void
  onSubmit: () => void
}

function SetupForm({
  title, onTitle, message, onMessage, videoUrl, onVideoUrl,
  instanceId, onInstanceId, instanceToken, onInstanceToken,
  showToken, onShowToken, batchSize, onBatchSize, intervalSec, onIntervalSec,
  onSubmit,
}: SetupFormProps) {
  const estimatedMin = Math.ceil(
    (batchSize * 3.5 / 60 + intervalSec / 60) * Math.ceil(182 / batchSize) // rough estimate for 182 people
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      {/* Coluna esquerda: conteúdo */}
      <div style={cardStyle}>
        <SectionTitle>📝 Conteúdo da campanha</SectionTitle>

        <FieldGroup label="Título interno">
          <input style={inputStyle} value={title} onChange={e => onTitle(e.target.value)} placeholder="Ex: Campanha Culto Domingo" />
        </FieldGroup>

        <FieldGroup label="Mensagem (legenda do vídeo)">
          <textarea
            style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }}
            value={message}
            onChange={e => onMessage(e.target.value)}
          />
        </FieldGroup>

        <FieldGroup label="URL do vídeo (Google Drive ou direta)">
          <input style={inputStyle} value={videoUrl} onChange={e => onVideoUrl(e.target.value)} placeholder="https://drive.google.com/file/d/..." />
          {videoUrl.includes('drive.google.com') && (
            <small style={{ color: '#2D7A4F', fontSize: '0.75rem' }}>
              ✓ Link Google Drive detectado — será convertido automaticamente para download direto
            </small>
          )}
        </FieldGroup>
      </div>

      {/* Coluna direita: instância + throttle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={cardStyle}>
          <SectionTitle>📱 Número de envio (Z-API)</SectionTitle>
          <div style={{ background: '#FDE8E0', border: '1px solid #FBBFAA', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.8125rem', color: '#C42E00' }}>
            <strong>⚠️ Use o número pessoal aquecido</strong> — NÃO use a instância de teste da Ekthos.
            Consulte o painel Z-API para obter o Instance ID e o Token.
          </div>
          <FieldGroup label="Instance ID">
            <input style={inputStyle} value={instanceId} onChange={e => onInstanceId(e.target.value)} placeholder="Ex: 3XXXXXXXXXXXXXXXX" />
          </FieldGroup>
          <FieldGroup label="Token da instância">
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...inputStyle, paddingRight: '2.5rem' }}
                type={showToken ? 'text' : 'password'}
                value={instanceToken}
                onChange={e => onInstanceToken(e.target.value)}
                placeholder="Token Z-API"
              />
              <button
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8A8A8A' }}
                onClick={() => onShowToken(!showToken)}
                type="button"
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <small style={{ color: '#8A8A8A', fontSize: '0.75rem' }}>
              Este é o token da instância (não o Client-Token da conta Z-API).
            </small>
          </FieldGroup>
        </div>

        <div style={cardStyle}>
          <SectionTitle>⏱ Throttle anti-ban</SectionTitle>
          <FieldGroup label={`Tamanho do lote: ${batchSize} mensagens`}>
            <input
              type="range" min={5} max={20} step={1}
              value={batchSize} onChange={e => onBatchSize(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#e13500' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#8A8A8A' }}>
              <span>5 (mais seguro)</span><span>20 (mais rápido)</span>
            </div>
          </FieldGroup>
          <FieldGroup label={`Intervalo entre lotes: ${formatSeconds(intervalSec)}`}>
            <input
              type="range" min={60} max={600} step={30}
              value={intervalSec} onChange={e => onIntervalSec(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#e13500' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#8A8A8A' }}>
              <span>1 min</span><span>10 min</span>
            </div>
          </FieldGroup>
          <div style={{ background: '#f9eedc', borderRadius: '8px', padding: '0.75rem', fontSize: '0.8125rem', color: '#5A5A5A', marginTop: '0.5rem' }}>
            + delay aleatório de 2–5s entre mensagens individuais (anti-ban automático)
          </div>
          <div style={{ background: '#E3F2FD', borderRadius: '8px', padding: '0.75rem', fontSize: '0.8125rem', color: '#2B6CB0', marginTop: '0.5rem' }}>
            <strong>Estimativa para ~182 pessoas:</strong> ≈ {estimatedMin} minutos no total
          </div>
        </div>

        <button
          onClick={onSubmit}
          style={{
            background: '#e13500', color: '#fff', border: 'none', borderRadius: '12px',
            padding: '0.875rem 2rem', fontWeight: 700, fontSize: '1rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            justifyContent: 'center', transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#FF4D1A')}
          onMouseLeave={e => (e.currentTarget.style.background = '#e13500')}
        >
          <ChevronRight size={18} />
          Criar campanha e testar
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface TestPhaseProps {
  testPhones: string[]
  onTestPhones: (phones: string[]) => void
  onRunTest: () => void
  error: string | null
}

function TestPhase({ testPhones, onTestPhones, onRunTest, error }: TestPhaseProps) {
  const updatePhone = (i: number, val: string) => {
    const next = [...testPhones]
    next[i] = val
    onTestPhones(next)
  }

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto' }}>
      <div style={cardStyle}>
        <SectionTitle>🧪 Teste com números reais</SectionTitle>
        <p style={{ color: '#5A5A5A', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Antes de disparar para todos, valide que o vídeo e a mensagem chegam corretamente.
          Insira 2–3 números de confiança (com DDD + 55, ex: 5521999999999).
        </p>

        {testPhones.map((phone, i) => (
          <FieldGroup key={i} label={`Número de teste ${i + 1}`}>
            <input
              style={inputStyle}
              value={phone}
              onChange={e => updatePhone(i, e.target.value)}
              placeholder="5521999999999"
            />
          </FieldGroup>
        ))}

        <button
          style={{ ...btnOutline, marginBottom: '0.5rem' }}
          onClick={() => onTestPhones([...testPhones, ''])}
          type="button"
        >
          + Adicionar número
        </button>

        {error && (
          <div style={{ color: '#C42E00', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{error}</div>
        )}

        <button
          onClick={onRunTest}
          style={{ ...btnPrimary, width: '100%', marginTop: '1rem' }}
        >
          <Send size={16} />
          Enviar teste agora
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface TestResultsProps {
  results: TestResult[]
  recipientError: string | null
  onLoadRecipients: () => void
  onReconfigure: () => void
}

function TestResults({ results, recipientError, onLoadRecipients, onReconfigure }: TestResultsProps) {
  const allOk = results.every(r => r.ok)

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto' }}>
      <div style={cardStyle}>
        <SectionTitle>📋 Resultado do teste</SectionTitle>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {results.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
              padding: '0.75rem', borderRadius: '10px',
              background: r.ok ? '#E8F5E9' : '#FDE8E0',
              border: `1px solid ${r.ok ? '#A5D6A7' : '#FBBFAA'}`,
            }}>
              {r.ok
                ? <CheckCircle2 size={18} color="#2D7A4F" style={{ flexShrink: 0, marginTop: '1px' }} />
                : <XCircle     size={18} color="#e13500" style={{ flexShrink: 0, marginTop: '1px' }} />
              }
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: r.ok ? '#2D7A4F' : '#C42E00' }}>
                  {maskPhone(r.phone)} — {r.ok ? 'Enviado ✓' : 'Falhou ✗'}
                </div>
                {r.ok && r.msg_id && (
                  <div style={{ fontSize: '0.75rem', color: '#5A5A5A', fontFamily: 'monospace' }}>
                    msg_id: {r.msg_id}
                  </div>
                )}
                {!r.ok && r.error && (
                  <div style={{ fontSize: '0.75rem', color: '#C42E00' }}>{r.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {recipientError && (
          <div style={{ color: '#C42E00', fontSize: '0.875rem', marginBottom: '1rem' }}>{recipientError}</div>
        )}

        {allOk ? (
          <div>
            <div style={{ background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: '10px', padding: '0.875rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#2D7A4F' }}>
              <strong>✅ Teste aprovado!</strong> O vídeo e a mensagem chegaram. Você pode prosseguir com o disparo completo.
            </div>
            <button onClick={onLoadRecipients} style={{ ...btnPrimary, width: '100%' }}>
              <Users size={16} />
              Carregar lista completa de destinatários
            </button>
          </div>
        ) : (
          <div>
            <div style={{ background: '#FDE8E0', border: '1px solid #FBBFAA', borderRadius: '10px', padding: '0.875rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#C42E00' }}>
              <strong>❌ Alguns envios falharam.</strong> Verifique o Instance ID e Token antes de prosseguir.
            </div>
            <button onClick={onReconfigure} style={{ ...btnOutline, width: '100%' }}>
              ↩ Retestar com os mesmos números
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface PreviewPhaseProps {
  recipients: Recipient[]
  batchSize: number
  intervalSec: number
  onStart: () => void
  onBack: () => void
}

function PreviewPhase({ recipients, batchSize, intervalSec, onStart, onBack }: PreviewPhaseProps) {
  const batches = Math.ceil(recipients.length / batchSize)
  const estimatedMin = Math.ceil(
    (batchSize * 3.5 / 60) * batches + (intervalSec / 60) * (batches - 1)
  )

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={cardStyle}>
        <SectionTitle>🚀 Pronto para disparar</SectionTitle>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox label="Destinatários" value={String(recipients.length)} color="#161616" />
          <StatBox label="Lotes de" value={`${batchSize} msgs`} color="#2B6CB0" />
          <StatBox label="Tempo estimado" value={`~${estimatedMin} min`} color="#C4841D" />
        </div>

        {/* Lista resumida */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.8125rem', color: '#5A5A5A', marginBottom: '0.5rem', fontWeight: 600 }}>
            Primeiros destinatários:
          </div>
          <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '10px' }}>
            {recipients.slice(0, 20).map((r, i) => (
              <div key={r.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.5rem 0.875rem',
                background: i % 2 === 0 ? '#fff' : '#f9eedc',
                fontSize: '0.8125rem',
              }}>
                <span style={{ color: '#161616' }}>{r.name ?? '(sem nome)'}</span>
                <span style={{ color: '#8A8A8A', fontFamily: 'monospace' }}>{maskPhone(r.phone)}</span>
              </div>
            ))}
            {recipients.length > 20 && (
              <div style={{ textAlign: 'center', padding: '0.5rem', color: '#8A8A8A', fontSize: '0.8125rem', background: '#f9eedc' }}>
                + {recipients.length - 20} outros
              </div>
            )}
          </div>
        </div>

        <div style={{ background: '#FFF3E0', border: '1px solid #FFD180', borderRadius: '10px', padding: '0.875rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: '#C4841D' }}>
          <strong>⚠️ Atenção:</strong> O disparo começará imediatamente e <strong>não pode ser desfeito</strong>.
          O botão Parar interrompe o loop, mas mensagens já enviadas permanecem entregues.
          Não feche ou recarregue esta página durante o disparo.
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={onBack} style={{ ...btnOutline, flex: 1 }}>
            ← Voltar
          </button>
          <button onClick={onStart} style={{ ...btnPrimary, flex: 2 }}>
            <Play size={16} />
            Iniciar disparo para {recipients.length} pessoas
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface RunningPhaseProps {
  total: number
  sent: number
  failed: number
  batchCurrent: number
  batchTotal: number
  countdown: number
  log: SendLog[]
  onStop: () => void
}

function RunningPhase({ total, sent, failed, batchCurrent, batchTotal, countdown, log, onStop }: RunningPhaseProps) {
  const done    = sent + failed
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0
  const waiting = countdown > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Progresso principal */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '1.125rem', color: '#161616', margin: 0 }}>
              {waiting ? '⏸ Aguardando próximo lote…' : '📤 Disparando…'}
            </h3>
            <div style={{ color: '#5A5A5A', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Lote {batchCurrent} de {batchTotal}
            </div>
          </div>
          <button
            onClick={onStop}
            style={{ background: '#161616', color: '#fff', border: 'none', borderRadius: '10px', padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}
          >
            <Square size={14} />
            Parar
          </button>
        </div>

        {/* Barra de progresso */}
        <div style={{ background: '#EDE0CC', borderRadius: '100px', height: '10px', overflow: 'hidden', marginBottom: '0.75rem' }}>
          <div style={{ background: '#e13500', height: '100%', width: `${pct}%`, borderRadius: '100px', transition: 'width 0.3s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: '#5A5A5A', marginBottom: '1.25rem' }}>
          <span>{done} / {total} processados ({pct}%)</span>
          <span style={{ color: '#2D7A4F' }}>✓ {sent} enviados</span>
          {failed > 0 && <span style={{ color: '#e13500' }}>✗ {failed} falhas</span>}
        </div>

        {/* Countdown */}
        {waiting && (
          <div style={{ background: '#E3F2FD', borderRadius: '10px', padding: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Clock size={18} color="#2B6CB0" />
            <span style={{ color: '#2B6CB0', fontWeight: 600, fontSize: '0.9375rem' }}>
              Aguardando {formatSeconds(countdown)} antes do próximo lote…
            </span>
          </div>
        )}
      </div>

      {/* Log de envios */}
      <div style={cardStyle}>
        <SectionTitle>📋 Log de envios (últimos {Math.min(log.length, 100)})</SectionTitle>
        <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
          {log.length === 0 ? (
            <div style={{ color: '#8A8A8A', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
              Aguardando envios…
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ background: '#f9eedc' }}>
                  <th style={{ ...thStyle }}>Horário</th>
                  <th style={{ ...thStyle }}>Nome</th>
                  <th style={{ ...thStyle }}>Telefone</th>
                  <th style={{ ...thStyle }}>Status</th>
                  <th style={{ ...thStyle }}>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={tdStyle}>{entry.ts}</td>
                    <td style={tdStyle}>{entry.name ?? '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{maskPhone(entry.phone)}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 600,
                        background: entry.status === 'sent' ? '#E8F5E9' : entry.status === 'failed' ? '#FDE8E0' : '#f9eedc',
                        color:      entry.status === 'sent' ? '#2D7A4F' : entry.status === 'failed' ? '#C42E00' : '#8A8A8A',
                      }}>
                        {entry.status === 'sent' ? '✓ Enviado' : entry.status === 'failed' ? '✗ Falhou' : '⏳ Pendente'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.7rem', color: '#8A8A8A', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.message_id ?? entry.error ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface DonePhaseProps {
  total: number
  sent: number
  failed: number
  status: 'completed' | 'cancelled' | null
  onReset: () => void
}

function DonePhase({ total, sent, failed, status, onReset }: DonePhaseProps) {
  const isComplete = status === 'completed'

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto' }}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          {isComplete
            ? <CheckCircle2 size={48} color="#2D7A4F" style={{ marginBottom: '0.75rem' }} />
            : <AlertTriangle size={48} color="#C4841D" style={{ marginBottom: '0.75rem' }} />
          }
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', fontWeight: 600, color: '#161616', margin: '0 0 0.25rem' }}>
            {isComplete ? 'Campanha concluída!' : 'Campanha interrompida'}
          </h2>
          <p style={{ color: '#5A5A5A', fontSize: '0.9375rem', margin: 0 }}>
            {isComplete
              ? 'Todos os destinatários foram processados.'
              : 'O disparo foi parado manualmente antes de terminar.'
            }
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatBox label="Total"    value={String(total)}  color="#161616" />
          <StatBox label="Enviados" value={String(sent)}   color="#2D7A4F" />
          <StatBox label="Falhas"   value={String(failed)} color={failed > 0 ? '#e13500' : '#8A8A8A'} />
        </div>

        <div style={{ background: isComplete ? '#E8F5E9' : '#FFF3E0', borderRadius: '10px', padding: '0.875rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: isComplete ? '#2D7A4F' : '#C4841D' }}>
          {isComplete
            ? `✅ ${sent} mensagens entregues com sucesso${failed > 0 ? `, ${failed} falharam` : ''}.`
            : `⏸ ${sent} mensagens foram entregues antes da parada. ${failed > 0 ? `${failed} falharam.` : ''}`
          }
        </div>

        <button onClick={onReset} style={{ ...btnOutline, width: '100%' }}>
          <RefreshCw size={16} />
          Criar nova campanha
        </button>
      </div>
    </div>
  )
}

// ── Componentes utilitários ───────────────────────────────────────────────────

function StatusCard({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{ maxWidth: '400px', margin: '4rem auto', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>{icon}</div>
      <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: '#161616', marginBottom: '0.5rem' }}>{title}</h3>
      <p style={{ color: '#5A5A5A', fontSize: '0.9rem' }}>{subtitle}</p>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '0.9375rem', color: '#161616', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1.25rem' }}>
      {children}
    </h3>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#5A5A5A', marginBottom: '0.4rem' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', background: '#f9eedc', borderRadius: '12px', padding: '1rem' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: '1.5rem', color }}>{value}</div>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#8A8A8A', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>{label}</div>
    </div>
  )
}

// ── Estilos inline reutilizáveis ──────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: '16px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1.5px solid rgba(0,0,0,0.12)',
  borderRadius: '10px',
  padding: '0.625rem 0.875rem',
  fontSize: '0.9375rem',
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
  background: '#fff',
  color: '#161616',
}

const btnPrimary: React.CSSProperties = {
  background: '#e13500', color: '#fff', border: 'none', borderRadius: '12px',
  padding: '0.75rem 1.5rem', fontWeight: 700, fontSize: '0.9375rem',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
  justifyContent: 'center',
}

const btnOutline: React.CSSProperties = {
  background: 'transparent', color: '#161616', border: '1.5px solid rgba(0,0,0,0.15)',
  borderRadius: '12px', padding: '0.75rem 1.5rem', fontWeight: 500, fontSize: '0.9375rem',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
  justifyContent: 'center',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600,
  color: '#5A5A5A', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em',
}

const tdStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem', color: '#161616',
}
