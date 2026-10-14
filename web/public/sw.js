// Service worker do PWA da IGV.
// v4: network-first. A v3 servia o cache ANTES da rede, o que prendia o index.html antigo
// (e, com ele, os bundles antigos) em quem já tinha visitado /igv. Agora a rede sempre
// tem prioridade e o cache só serve de reserva offline.
const CACHE = 'igv-pwa-v4'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    const antigos = keys.filter(k => k !== CACHE)
    await Promise.all(antigos.map(k => caches.delete(k)))
    await self.clients.claim()
    // Atualização de uma versão anterior: recarrega as abas abertas uma única vez,
    // para que ninguém continue com o bundle antigo. Primeira instalação não recarrega.
    if (antigos.length > 0) {
      const abas = await self.clients.matchAll({ type: 'window' })
      await Promise.all(abas.map(c => c.navigate(c.url).catch(() => {})))
    }
  })())
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const { pathname } = new URL(req.url)
  if (!pathname.startsWith('/igv') && pathname !== '/manifest.json') return
  e.respondWith((async () => {
    try {
      const res = await fetch(req)
      if (res && res.ok) {
        const copia = res.clone()
        caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {})
      }
      return res
    } catch (err) {
      const cached = await caches.match(req)
      if (cached) return cached
      throw err
    }
  })())
})
