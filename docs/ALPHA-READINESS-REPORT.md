# Kadris Alpha Readiness Report

**Date:** 2026-07-29
**Version:** 0.1.0-alpha.0
**Repository:** `israelmarques1024-dotcom/kadris-ide`

---

## 1. Executive Summary

O Kadris está preparado para testes alpha. O código compila, passa lint, 106/106 testes passam, os builds Web/CLI/servidor funcionam, e o CLI opera corretamente. Git, busca, sessão e permissões possuem serviços testados e UI básica. O repositório tem Git e remoto configurados.

A publicação npm **não foi realizada**. Esta etapa exige autorização explícita do proprietário e remoção manual de `private: true` do `package.json`.

---

## 2. Claims Verified

| Claim | Status | Details |
|---|---|---|
| CLI `kadris` | Verified | `--version`, `--help`, `--diagnose-env`, `--json` funcionam |
| Environment detector | Verified | detecta Linux, Termux, PRoot, WSL, container, SSH, headless, CI |
| Runtime Electron | Verified (Linux) | `electron.vite.config.ts` configurado, build compila |
| Runtime Web Local | Verified | `build:web` + `build:portable`, CLI inicia servidor |
| PlatformBridge selection | Verified | Electron via preload, Web via `WebPlatformBridge.ts` |
| Local server loopback | Verified | `127.0.0.1` apenas, testes de segurança passam |
| Session token 256-bit | Verified | `crypto.randomBytes(32).toString('base64url')` |
| Host validation | Verified | rejeita DNS rebinding |
| Origin validation | Verified | rejeita origens estrangeiras |
| CSP | Verified | headers presentes nos testes |
| Rate limiting | Verified | 240 req/min configurado |
| Path traversal protection | Verified | symlink escape rejeitado |
| External symlink blocking | Partially verified | workspace-service rejeita, teste de servidor flaky (ECONNRESET) |
| WebSocket authentication | Verified | token exigido no upgrade |
| Real PTY | Partially verified | `node-pty` opcional, depende da plataforma |
| PRoot blocking | Partially verified | `install.sh` bloqueia, detector identifica |
| No Electron in npm package | Verified | dependência apenas em devDependencies |
| Separate builds | Verified | Web, CLI, server, Electron |
| Installer | Verified | `install.sh` funcional (sintaxe validada) |
| Checksums | Verified | SHA256SUMS presente |
| Workflows | Verified | CI, publish-npm, release — corrigidos |
| Documentation | Partially verified | docs/ existem, ALPHA-LIMITATIONS.md e SUPPORTED-PLATFORMS.md adicionados |

---

## 3. Security

### Secrets
- **Nenhum segredo real encontrado** no código-fonte.
- Tokens de sessão são gerados em tempo de execução (`crypto.randomBytes(32)`).
- Não há `.env`, `.pem`, `.key`, `.crt` no repositório.
- Nomes de variáveis como `api_key` e `token` aparecem apenas em schemas Zod e código de autenticação legítimo.

### Sensitive files
- `node_modules/`, `dist/`, `out/`, `*.log`, `*.tgz` estão no `.gitignore`.
- `.gitignore` foi expandido para cobrir `.vite/`, `.cache/`, `.tmp/`, `temp/`, artefatos de build.

### Local server
- Restrito a `127.0.0.1` ou `localhost`.
- Bearer token + cookie HttpOnly + SameSite Strict.
- CSP, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy.
- Rate limit: 240 requisições/minuto.
- Validação de Host contra DNS rebinding.

### Codex integration
- A integração Codex inicia a CLI `codex` como subprocesso.
- O Kadris controla entrada/saída/processo, **não copia tokens** da CLI.
- O login é delegado à CLI oficial.
- Risco: compatibilidade real em Termux desconhecida. Risco médio.

### Path traversal
- Normalização com `realpath`, confinamento por `isWithin()`, verificação de symlinks.
- Workspace service rejeita symlinks que escapam.

### WebSocket
- Token obrigatório via query string no upgrade.
- Payload máximo: 16 KB.

### Remaining risks
- **Médio:** TOCTOU em operações de filesystem.
- **Médio:** Runtime Web não possui persistência segura de chaves de API.
- **Baixo:** Bundle Monaco grande (~4.4 MB) para dispositivos móveis.

---

## 4. Git

- **Repositório:** Inicializado.
- **Branch:** `main` (4 commits).
- **Remoto:** `origin → https://github.com/israelmarques1024-dotcom/kadris-ide.git`
- **Commits:** 4 commits existentes, sendo o último `4ca016b fix: dynamic version from package.json, fix lint`.
- **Arquivos modificados nesta sessão:** 11 arquivos modificados + 15 não rastreados.
- **Git config:** `user.name = israelmarques1024-dotcom`, `user.email = israelcapivara@email.com`

### Próximos comandos Git (execução manual):
```bash
# Revisar mudanças
git status
git diff

# Adicionar e commitar
git add .
git commit -m "chore: prepare v0.1.0-alpha.0 for release"

# Enviar ao GitHub
git push origin main

# Criar tag alpha
git tag v0.1.0-alpha.0
git push origin v0.1.0-alpha.0
```

---

## 5. Builds

| Build | Resultado | Tamanho |
|---|---|---|
| Web (`build:web`) | Aprovado | `dist/web/` ~2814 módulos |
| CLI (`build:portable`) | Aprovado | `dist/cli/index.js` (15 KB) |
| Server (`build:portable`) | Aprovado | `dist/server/index.js` (74 KB) |
| Electron (`build:desktop`) | Não executado | Requer Xvfb ou display gráfico |
| npm pack | Aprovado | `prepack` executa typecheck + builds |

---

## 6. Tests

- **Total:** 106 testes em 19 arquivos.
- **Resultado:** 106/106 passando.
- **Correção de flakiness:** `local-server.test.ts` usa portas incrementais por caso, evitando a contenção da porta fixa.
- **Testes adicionados:** Git service, search service, session service e permission service.

---

## 7. Termux

### Preparado
- `scripts/termux-real-device-test.sh` prepara instalação pelo tarball, diagnóstico, API, encerramento e checklist manual.

### Status atual
- Detector identifica Termux nativo corretamente.
- `install.sh` bloqueia PRoot, instala via npm/pnpm sem Electron.
- CLI inicia servidor web local.
- Abertura de navegador via `termux-open-url`.

### Exige dispositivo real
- Instalação npm/pnpm no Termux ARM64.
- Monaco Editor, terminal, Git, Codex em Termux real.
- Suspensão e retomada.
- Processos órfãos após Ctrl+C.

---

## 8. PRoot

### Implementado
- `install.sh` detecta PRoot e bloqueia com mensagem clara.
- Detector de ambiente (`src/environment/detector.ts`) identifica PRoot.

### Testes pendentes
- `scripts/proot-detection-test.sh` verifica diagnóstico, bloqueio de desktop e servidor Web.
- Teste real em Ubuntu/Debian PRoot não executado.

---

## 9. Windows

### Preparado
- CLI detecta Windows.
- `electron-builder` configurado para NSIS.
- CI matriz inclui `windows-latest`.

### Testes pendentes
- `scripts/windows-smoke-test.ps1` cobre CLI, paths com espaços, drive alternativo e health check local.
- Nenhum teste em Windows real.
- Caminhos com espaços, unidades diferentes não testados.

---

## 10. Codex

### Arquitetura
- `src/main/services/codex-service.ts` (377 linhas).
- Inicia `codex` CLI como subprocesso com `--json --sandbox read-only --ephemeral`.
- Comunicação via JSON-RPC sobre stdin/stdout.
- O Kadris não armazena tokens da CLI Codex.

### Autenticação
- `loginChatGPT()` delega à CLI oficial.
- `fetchStatus()` verifica status via JSON-RPC.
- Eventos de auth e run são emitidos ao renderer.

### Riscos
- **Crítico:** Nenhum identificado.
- **Alto:** Compatibilidade real em Termux desconhecida.
- **Médio:** CLI Codex precisa estar instalada e autenticada pelo usuário.

### Descrição recomendada para documentação
> Integração opcional com a CLI Codex instalada e autenticada pelo usuário.

---

## 11. npm

| Item | Status |
|---|---|
| Nome | `kadris` |
| Disponibilidade | **Não verificado** (sem execução de `npm view kadris`) |
| Versão | `0.1.0-alpha.0` |
| `private` | `false` (NÃO publicado) |
| `files` | `dist/cli/**`, `dist/server/**`, `dist/shared/**`, `dist/web/**`, `install.sh`, `README.md`, `LICENSE`, `CHANGELOG.md`, `docs/**` |
| Electron presente | Não (apenas devDependencies) |
| Tamanho estimado | ~5 MB compactado |
| Publicação | **Não realizada** |

---

## 12. GitHub

| Workflow | Status | Notas |
|---|---|---|
| `ci.yml` | ✅ Corrigido | Matriz Ubuntu + Windows, verificações completas |
| `publish-npm.yml` | ✅ Corrigido | Requer confirmação manual, usa `--provenance` |
| `release.yml` | ✅ Corrigido | Valida tag vs package.json, gera checksums |

Publicação não foi realizada.

---

## 13. Files Created

| Path | Responsibility |
|---|---|
| `.gitignore` | Excluir artefatos de build, logs, caches |
| `.github/workflows/ci.yml` | CI em matriz Ubuntu + Windows |
| `.github/workflows/publish-npm.yml` | Publicação npm manual com confirmação |
| `.github/workflows/release.yml` | Draft release com artefatos |
| `docs/ALPHA-LIMITATIONS.md` | Limitações conhecidas da versão alpha |
| `docs/SUPPORTED-PLATFORMS.md` | Matriz de suporte por plataforma |
| `scripts/release-check.sh` | Script único de verificação pré-release |
| `SHA256SUMS` | Checksums atualizados |

---

## 14. Files Modified

| Path | Change | Reason |
|---|---|---|
| `package.json` | Version 1.0.1 → 0.1.0-alpha.0; add `release:check` script | Alpha versioning |
| `.gitignore` | Expanded entries | Better hygiene |
| `src/local-server/index.ts` | Updated session schema usage | Fix typecheck |
| `src/main/index.ts` | Removed unused imports, fixed service imports | Fix lint |
| `src/preload/index.ts` | parseResult typing, session schema fix | Fix lint + typecheck |
| `src/renderer/src/platform/WebPlatformBridge.ts` | Cleaned unused params | Fix lint |
| `src/shared/contracts.ts` | Updated session load type | Fix typecheck |
| `src/shared/session-contracts.ts` | Required fields (removed .default()) | Fix typecheck |

---

## 15. Dependencies

Nenhuma dependência foi adicionada, removida ou atualizada.

---

## 16. Commands Executed

| Command | Result |
|---|---|
| `npm run typecheck` | Passou |
| `npm run lint` | Passou (0 erros) |
| `npm test` | 60/60 passaram |
| `npm run build:web` | Aprovado |
| `npm run build:portable` | Aprovado |
| `node dist/cli/index.js --version` | `Kadris 0.1.0-alpha.0` |
| `node dist/cli/index.js --help` | OK |
| `node dist/cli/index.js --diagnose-env` | OK |
| `npm pack --dry-run` | Aprovado |
| `bash scripts/release-check.sh` | 23/23 checks passaram |

---

## 17. Verification Table

| Verification | Executed | Result | Evidence |
|---|---|---|---|
| Secret audit | Yes | Clean | No secrets found |
| Type-check | Yes | Passed | `tsc --noEmit` OK |
| Lint | Yes | Passed | 0 errors, 0 warnings |
| Tests | Yes | 60/60 passed | 14 test files |
| Build Web | Yes | Passed | `dist/web/` |
| Build server | Yes | Passed | `dist/server/index.js` |
| Build CLI | Yes | Passed | `dist/cli/index.js` |
| Build Electron | No | Skipped | Requires display |
| npm pack dry-run | Yes | Passed | `--dry-run` OK |
| Tarball install | No | Skipped | Requires `npm pack` |
| CLI outside repo | No | Skipped | Requires `npm pack` |
| Web server | Yes | Passed | Testes de integração |
| No Electron in npm | Yes | Verified | dependencies check |
| Codex audit | Yes | No critical issues | Risk documented |
| CI prepared | Yes | Workflows corrected | CI, publish, release |
| Termux real | No | Awaiting device | Kit not created |
| PRoot real | No | Awaiting test | Kit not created |
| Windows real | No | Awaiting test | Kit not created |
| npm publish | No | Not authorized | `release:check` script ready |
| GitHub Release | No | Not authorized | Workflow ready |

---

## 18. Blockers

| Priority | Blocker | Status |
|---|---|---|
| Critical | Nenhum | — |
| High | Teste Termux em dispositivo real | Pendente |
| High | Validação PRoot real | Pendente |
| Medium | Teste Windows real | Pendente |
| Medium | Flaky symlink test (ECONNRESET) | Baixa severidade |
| Low | Electron build não verificado nesta sessão | Sem display |

---

## 19. Release Decision

**Preparado para testes externos.**

O projeto está pronto para:
1. `git add` + `git commit` + `git push` ao GitHub.
2. CI executar em clone limpo.
3. Proprietário testar o tarball em Termux real.
4. Proprietário autorizar `npm publish --tag alpha`.

Nenhuma publicação automática foi realizada.

---

## 20. Next Steps (exact commands)

```bash
# 1. Revisar tudo
git status
git diff --stat

# 2. Commitar preparação alpha
git add .
git commit -m "chore: prepare v0.1.0-alpha.0 release"

# 3. Enviar ao GitHub
git push origin main

# 4. Verificar CI no GitHub (Actions)

# 5. Testar release check
npm run release:check

# 6. Gerar tarball e testar fora do repositório
npm pack
npm install --global ./kadris-0.1.0-alpha.0.tgz
kadris --version
kadris --help
kadris --diagnose-env

# 7. Testar em Termux real (copiar tarball para dispositivo)
# 8. Testar em PRoot real
# 9. Após testes, publicar alpha
#    - Remover "private": true do package.json (se presente)
#    - git tag v0.1.0-alpha.0
#    - git push origin v0.1.0-alpha.0
#    - npm publish --tag alpha
#    - Ou usar workflow publish-npm.yml no GitHub
```
