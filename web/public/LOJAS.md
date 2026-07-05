# Publicar IGV nas Lojas

## Status atual
O app do fiel (`/igv`) é uma **PWA (Progressive Web App)** completa:
- Instalável no Android via Chrome (banner automático)
- Instalável no iPhone via Safari → "Adicionar à Tela de Início"
- Funciona offline (service worker + cache `igv-pwa-v3`)

---

## Android — Google Play Store (via TWA)

**Tecnologia:** Trusted Web Activity (TWA) — encapsula a PWA no Play Store sem precisar reescrever o app.

### Pré-requisitos
- Conta Google Play ($25 taxa única)
- Node.js instalado
- A PWA já está publicada em HTTPS ✓

### Passos

```bash
# 1. Instalar Bubblewrap (ferramenta oficial do Google)
npm install -g @bubblewrap/cli

# 2. Inicializar o projeto TWA
mkdir igv-android && cd igv-android
bubblewrap init --manifest https://ekthos-platform.vercel.app/manifest.json

# 3. Configurar durante o init:
#    - Package ID: net.ekthosai.igv (ou com.igv.app)
#    - App name: Igreja Gerando Vencedores
#    - Short name: IGV
#    - Start URL: /igv
#    - Display: standalone
#    - Signing: gerar nova keystore (guardar o .jks e a senha em local seguro)

# 4. Build APK/AAB para produção
bubblewrap build

# 5. O arquivo .aab gerado vai para o Google Play Console
```

### Verificação assetlinks.json (obrigatório para TWA)
O Chrome verifica se o site "confia" no app Android via:

```
https://ekthos-platform.vercel.app/.well-known/assetlinks.json
```

Conteúdo (substituir SHA-256 pelo fingerprint da sua keystore):
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "net.ekthosai.igv",
    "sha256_cert_fingerprints": ["AA:BB:CC:..."]
  }
}]
```

Para obter o SHA-256:
```bash
bubblewrap fingerprint
```

O arquivo deve ser servido como `vercel.json` rewrite ou arquivo estático em `/public/.well-known/assetlinks.json`.

---

## iPhone — Apple App Store (via Capacitor)

**Tecnologia:** Capacitor — converte a PWA em app nativo iOS com WebView.

> A Apple não aceita submissão de PWAs puras na App Store. É necessário o wrapper Capacitor.

### Pré-requisitos
- Mac com Xcode instalado (obrigatório para build iOS)
- Conta Apple Developer ($99/ano)
- Node.js + npm instalados

### Passos

```bash
# 1. Instalar Capacitor no projeto web
cd web
npm install @capacitor/core @capacitor/cli @capacitor/ios

# 2. Inicializar Capacitor
npx cap init "Igreja Gerando Vencedores" "net.ekthosai.igv" --web-dir dist

# 3. Build da PWA
npm run build

# 4. Adicionar plataforma iOS
npx cap add ios

# 5. Sincronizar
npx cap sync ios

# 6. Abrir no Xcode
npx cap open ios

# No Xcode:
# - Signing & Capabilities → selecionar Team e Bundle ID
# - Version e Build number
# - Ícones: usar igv-apple-touch-icon.png como base (gerar set completo com makeappicon.com)
# - Archive → Distribute App → App Store Connect
```

### Configuração do Capacitor (capacitor.config.ts)
```typescript
import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'net.ekthosai.igv',
  appName: 'Igreja Gerando Vencedores',
  webDir: 'dist',
  server: {
    // Usar servidor remoto (app busca conteúdo da Vercel)
    url: 'https://ekthos-platform.vercel.app/igv',
    cleartext: false,
  },
}

export default config
```

---

## Ícones necessários

| Plataforma | Tamanho | Arquivo |
|---|---|---|
| iOS (home screen) | 180×180 | `/icons/igv-apple-touch-icon.png` ✓ |
| Android launcher | 192×192 | `/icons/igv-icon-192.png` ✓ |
| Android maskable | 512×512 | `/icons/igv-icon-512.png` ✓ |
| iOS App Store | 1024×1024 | Gerar a partir da logo IGV |
| Android Play Store | 512×512 | Usar `igv-icon-512.png` ✓ |

---

## Alternativa rápida: PWABuilder (sem código)

Para gerar os pacotes sem linha de comando:
1. Acesse https://www.pwabuilder.com
2. Cole `https://ekthos-platform.vercel.app/igv`
3. Faça Download do pacote Android (.aab) e/ou iOS (.ipa)
4. Submeta manualmente nas lojas

---

## Checklist antes de publicar

- [ ] `assetlinks.json` publicado na Vercel (para TWA Android funcionar)
- [ ] Ícone 1024×1024 gerado para App Store
- [ ] Screenshots do app capturadas (mínimo 3 por plataforma)
- [ ] Descrição e categorias preenchidas nas lojas
- [ ] Privacy Policy publicada (Apple exige URL)
- [ ] Versão 1.0.0 definida
