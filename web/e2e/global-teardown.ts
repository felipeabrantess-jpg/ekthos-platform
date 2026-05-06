/**
 * Global Teardown — executa UMA vez depois de todos os testes.
 * Remove o auth file temporário.
 */

import path from 'path'
import fs from 'fs'

const AUTH_FILE = path.join('e2e', '.auth.json')

export default async function globalTeardown() {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE)
    console.log('[global-teardown] Auth file removido')
  }
}
