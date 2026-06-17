/**
 * igv-bible.ts — dados e client da Bíblia para a feature pública /igv/biblia
 *
 * Fonte: bible-api.com — tradução "almeida" (João Ferreira de Almeida, 1819)
 * Licença do texto: Public Domain (confirmado pelo campo translation_note da API)
 * LGPD R8: zero SELECT em people. Feature 100% pública, sem banco, sem dado de pessoa.
 */

export interface BibleBook {
  id: number
  name: string
  abbr: string
  apiSlug: string
  chapters: number
  testament: 'old' | 'new'
}

export interface BibleVerse {
  number: number
  text: string
}

const API_BASE = 'https://bible-api.com'
const TRANSLATION = 'almeida'
const CACHE_PREFIX = 'igv-bible-v1'

export const BIBLE_BOOKS: BibleBook[] = [
  // ── Antigo Testamento ──────────────────────────────────────────────
  { id: 1,  name: 'Gênesis',           abbr: 'Gn',   apiSlug: 'genesis',           chapters: 50,  testament: 'old' },
  { id: 2,  name: 'Êxodo',             abbr: 'Êx',   apiSlug: 'exodus',            chapters: 40,  testament: 'old' },
  { id: 3,  name: 'Levítico',          abbr: 'Lv',   apiSlug: 'leviticus',         chapters: 27,  testament: 'old' },
  { id: 4,  name: 'Números',           abbr: 'Nm',   apiSlug: 'numbers',           chapters: 36,  testament: 'old' },
  { id: 5,  name: 'Deuteronômio',      abbr: 'Dt',   apiSlug: 'deuteronomy',       chapters: 34,  testament: 'old' },
  { id: 6,  name: 'Josué',             abbr: 'Js',   apiSlug: 'joshua',            chapters: 24,  testament: 'old' },
  { id: 7,  name: 'Juízes',            abbr: 'Jz',   apiSlug: 'judges',            chapters: 21,  testament: 'old' },
  { id: 8,  name: 'Rute',              abbr: 'Rt',   apiSlug: 'ruth',              chapters: 4,   testament: 'old' },
  { id: 9,  name: '1 Samuel',          abbr: '1Sm',  apiSlug: '1+samuel',          chapters: 31,  testament: 'old' },
  { id: 10, name: '2 Samuel',          abbr: '2Sm',  apiSlug: '2+samuel',          chapters: 24,  testament: 'old' },
  { id: 11, name: '1 Reis',            abbr: '1Rs',  apiSlug: '1+kings',           chapters: 22,  testament: 'old' },
  { id: 12, name: '2 Reis',            abbr: '2Rs',  apiSlug: '2+kings',           chapters: 25,  testament: 'old' },
  { id: 13, name: '1 Crônicas',        abbr: '1Cr',  apiSlug: '1+chronicles',      chapters: 29,  testament: 'old' },
  { id: 14, name: '2 Crônicas',        abbr: '2Cr',  apiSlug: '2+chronicles',      chapters: 36,  testament: 'old' },
  { id: 15, name: 'Esdras',            abbr: 'Ed',   apiSlug: 'ezra',              chapters: 10,  testament: 'old' },
  { id: 16, name: 'Neemias',           abbr: 'Ne',   apiSlug: 'nehemiah',          chapters: 13,  testament: 'old' },
  { id: 17, name: 'Ester',             abbr: 'Et',   apiSlug: 'esther',            chapters: 10,  testament: 'old' },
  { id: 18, name: 'Jó',                abbr: 'Jó',   apiSlug: 'job',               chapters: 42,  testament: 'old' },
  { id: 19, name: 'Salmos',            abbr: 'Sl',   apiSlug: 'psalms',            chapters: 150, testament: 'old' },
  { id: 20, name: 'Provérbios',        abbr: 'Pv',   apiSlug: 'proverbs',          chapters: 31,  testament: 'old' },
  { id: 21, name: 'Eclesiastes',       abbr: 'Ec',   apiSlug: 'ecclesiastes',      chapters: 12,  testament: 'old' },
  { id: 22, name: 'Cantares',          abbr: 'Ct',   apiSlug: 'song+of+solomon',   chapters: 8,   testament: 'old' },
  { id: 23, name: 'Isaías',            abbr: 'Is',   apiSlug: 'isaiah',            chapters: 66,  testament: 'old' },
  { id: 24, name: 'Jeremias',          abbr: 'Jr',   apiSlug: 'jeremiah',          chapters: 52,  testament: 'old' },
  { id: 25, name: 'Lamentações',       abbr: 'Lm',   apiSlug: 'lamentations',      chapters: 5,   testament: 'old' },
  { id: 26, name: 'Ezequiel',          abbr: 'Ez',   apiSlug: 'ezekiel',           chapters: 48,  testament: 'old' },
  { id: 27, name: 'Daniel',            abbr: 'Dn',   apiSlug: 'daniel',            chapters: 12,  testament: 'old' },
  { id: 28, name: 'Oséias',            abbr: 'Os',   apiSlug: 'hosea',             chapters: 14,  testament: 'old' },
  { id: 29, name: 'Joel',              abbr: 'Jl',   apiSlug: 'joel',              chapters: 3,   testament: 'old' },
  { id: 30, name: 'Amós',              abbr: 'Am',   apiSlug: 'amos',              chapters: 9,   testament: 'old' },
  { id: 31, name: 'Obadias',           abbr: 'Ob',   apiSlug: 'obadiah',           chapters: 1,   testament: 'old' },
  { id: 32, name: 'Jonas',             abbr: 'Jn',   apiSlug: 'jonah',             chapters: 4,   testament: 'old' },
  { id: 33, name: 'Miquéias',          abbr: 'Mq',   apiSlug: 'micah',             chapters: 7,   testament: 'old' },
  { id: 34, name: 'Naum',              abbr: 'Na',   apiSlug: 'nahum',             chapters: 3,   testament: 'old' },
  { id: 35, name: 'Habacuque',         abbr: 'Hc',   apiSlug: 'habakkuk',          chapters: 3,   testament: 'old' },
  { id: 36, name: 'Sofonias',          abbr: 'Sf',   apiSlug: 'zephaniah',         chapters: 3,   testament: 'old' },
  { id: 37, name: 'Ageu',              abbr: 'Ag',   apiSlug: 'haggai',            chapters: 2,   testament: 'old' },
  { id: 38, name: 'Zacarias',          abbr: 'Zc',   apiSlug: 'zechariah',         chapters: 14,  testament: 'old' },
  { id: 39, name: 'Malaquias',         abbr: 'Ml',   apiSlug: 'malachi',           chapters: 4,   testament: 'old' },
  // ── Novo Testamento ───────────────────────────────────────────────
  { id: 40, name: 'Mateus',            abbr: 'Mt',   apiSlug: 'matthew',           chapters: 28,  testament: 'new' },
  { id: 41, name: 'Marcos',            abbr: 'Mc',   apiSlug: 'mark',              chapters: 16,  testament: 'new' },
  { id: 42, name: 'Lucas',             abbr: 'Lc',   apiSlug: 'luke',              chapters: 24,  testament: 'new' },
  { id: 43, name: 'João',              abbr: 'Jo',   apiSlug: 'john',              chapters: 21,  testament: 'new' },
  { id: 44, name: 'Atos',              abbr: 'At',   apiSlug: 'acts',              chapters: 28,  testament: 'new' },
  { id: 45, name: 'Romanos',           abbr: 'Rm',   apiSlug: 'romans',            chapters: 16,  testament: 'new' },
  { id: 46, name: '1 Coríntios',       abbr: '1Co',  apiSlug: '1+corinthians',     chapters: 16,  testament: 'new' },
  { id: 47, name: '2 Coríntios',       abbr: '2Co',  apiSlug: '2+corinthians',     chapters: 13,  testament: 'new' },
  { id: 48, name: 'Gálatas',           abbr: 'Gl',   apiSlug: 'galatians',         chapters: 6,   testament: 'new' },
  { id: 49, name: 'Efésios',           abbr: 'Ef',   apiSlug: 'ephesians',         chapters: 6,   testament: 'new' },
  { id: 50, name: 'Filipenses',        abbr: 'Fp',   apiSlug: 'philippians',       chapters: 4,   testament: 'new' },
  { id: 51, name: 'Colossenses',       abbr: 'Cl',   apiSlug: 'colossians',        chapters: 4,   testament: 'new' },
  { id: 52, name: '1 Tessalonicenses', abbr: '1Ts',  apiSlug: '1+thessalonians',   chapters: 5,   testament: 'new' },
  { id: 53, name: '2 Tessalonicenses', abbr: '2Ts',  apiSlug: '2+thessalonians',   chapters: 3,   testament: 'new' },
  { id: 54, name: '1 Timóteo',         abbr: '1Tm',  apiSlug: '1+timothy',         chapters: 6,   testament: 'new' },
  { id: 55, name: '2 Timóteo',         abbr: '2Tm',  apiSlug: '2+timothy',         chapters: 4,   testament: 'new' },
  { id: 56, name: 'Tito',              abbr: 'Tt',   apiSlug: 'titus',             chapters: 3,   testament: 'new' },
  { id: 57, name: 'Filemon',           abbr: 'Fm',   apiSlug: 'philemon',          chapters: 1,   testament: 'new' },
  { id: 58, name: 'Hebreus',           abbr: 'Hb',   apiSlug: 'hebrews',           chapters: 13,  testament: 'new' },
  { id: 59, name: 'Tiago',             abbr: 'Tg',   apiSlug: 'james',             chapters: 5,   testament: 'new' },
  { id: 60, name: '1 Pedro',           abbr: '1Pe',  apiSlug: '1+peter',           chapters: 5,   testament: 'new' },
  { id: 61, name: '2 Pedro',           abbr: '2Pe',  apiSlug: '2+peter',           chapters: 3,   testament: 'new' },
  { id: 62, name: '1 João',            abbr: '1Jo',  apiSlug: '1+john',            chapters: 5,   testament: 'new' },
  { id: 63, name: '2 João',            abbr: '2Jo',  apiSlug: '2+john',            chapters: 1,   testament: 'new' },
  { id: 64, name: '3 João',            abbr: '3Jo',  apiSlug: '3+john',            chapters: 1,   testament: 'new' },
  { id: 65, name: 'Judas',             abbr: 'Jd',   apiSlug: 'jude',              chapters: 1,   testament: 'new' },
  { id: 66, name: 'Apocalipse',        abbr: 'Ap',   apiSlug: 'revelation',        chapters: 22,  testament: 'new' },
]

export function getAllBooks(): BibleBook[] {
  return BIBLE_BOOKS
}

export async function fetchChapter(book: BibleBook, chapter: number): Promise<BibleVerse[]> {
  const cacheKey = `${CACHE_PREFIX}-${book.id}-${chapter}`

  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) return JSON.parse(cached) as BibleVerse[]
  } catch { /* storage unavailable */ }

  const url = `${API_BASE}/${book.apiSlug}+${chapter}?translation=${TRANSLATION}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Não foi possível carregar ${book.name} ${chapter}`)

  const data = await res.json() as { verses: { verse: number; text: string }[] }

  const verses: BibleVerse[] = data.verses.map(v => ({
    number: v.verse,
    text: v.text.trim().replace(/\s+/g, ' '),
  }))

  try {
    localStorage.setItem(cacheKey, JSON.stringify(verses))
  } catch { /* storage full, continue without cache */ }

  return verses
}
