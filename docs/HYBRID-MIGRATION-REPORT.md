# Kadris Hybrid Migration Report

## 1. Resumo

O Kadris passou de uma aplicação exclusivamente Electron para uma arquitetura com dois runtimes no mesmo código-fonte: Electron Desktop e Web Local. A mesma interface React, Monaco, xterm, explorador, documentos, visualizadores e agente é selecionada por uma `PlatformBridge`. A CLI `kadris` detecta o ambiente, inicia Electron quando ele está disponível em um desktop compatível e usa o servidor web local em ambientes headless, SSH, WSL, containers ou quando `--web` é solicitado.

## 2. Arquitetura anterior

O renderer React dependia diretamente de `window.kadris`, fornecido exclusivamente pelo preload Electron. Workspace, terminal, Codex e configurações eram acessados por IPC. Não havia CLI, build web independente, detector de ambiente, servidor da IDE para navegador, pacote npm executável ou instalador POSIX.

## 3. Arquitetura híbrida

- Electron: preserva main process, preload, IPC específico, menus, janela, diálogo nativo, `contextIsolation`, sandbox e terminal PTY.
- Web: reutiliza o mesmo renderer por `WebPlatformBridge`, `WebApiClient`, HTTP e WebSocket.
- CLI: escolhe runtime, workspace, host, porta, navegador e ciclo de vida.
- Core compartilhado: schemas Zod, contratos, workspace, Codex e classificação de ambiente.
- Platform Bridge: uma implementação Electron é exposta pelo preload e uma implementação Web é criada no bootstrap do navegador.
- Servidor: serve os assets Vite e APIs específicas para app, ambiente, workspace, arquivos, terminal, preview e agente.

## 4. Classificação de ambiente

O detector combina plataforma Node, arquitetura, kernel Android, variáveis Termux/PRoot, WSL, container, SSH, CI, sessão gráfica e disponibilidade do Electron. Evidências são registradas apenas como resultados resumidos, com pesos de 2 a 5 e sem valores sensíveis. A confiança é alta quando há um sinal decisivo ou um desktop nativo consistente.

## 5. Matriz de runtimes

| Ambiente | Decisão |
|---|---|
| Windows interativo compatível | Electron quando disponível |
| Linux X11/Wayland real | Electron quando disponível |
| Termux nativo | Web Local |
| Android PRoot | Bloqueado com orientação para Termux nativo |
| Linux headless | Web Local sem abertura automática |
| SSH | Web Local sem abertura automática |
| Docker/container | Web Local sem abertura automática |
| WSL | Web Local sem abertura automática |
| CI | Sem interface, salvo flag explícita |
| Desconhecido | Web seguro ou erro explícito |

## 6. Termux

A CLI não importa Electron e o pacote npm não instala Electron. O servidor usa Node, host loopback e navegador via `termux-open-url` quando disponível. Workspace, arquivos, terminal PTY opcional e agente Codex usam as mesmas APIs. Não houve teste em dispositivo Android real; por isso suporte oficial ao Termux ainda não é declarado.

## 7. Android Storage

- Termux Home: previsto como workspace padrão permitido.
- Compartilhado: depende de autorização feita pelo usuário com `termux-setup-storage`; o Kadris não executa esse comando.
- SAF: não implementado.
- Android Bridge: não implementado.
- Modos privilegiados: não implementados e não são necessários.
- Bloqueios: `/data`, `/data/data`, `/data/user`, `/data/user/0` e árvores `Android/data`/`Android/obb` são negados no runtime Android.

## 8. Electron

Foram preservados Electron 43, janela nativa, menu, restauração, preload, IPC validado, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, terminal desktop, Codex e empacotamento AppImage/DEB/NSIS configurado. `node-pty` é explicitamente externo no build Electron.

## 9. Arquivos criados

- `src/environment/*`: contratos, detector e matriz de runtime.
- `src/cli/*`: argumentos, navegador, descoberta desktop e comando principal.
- `src/local-server/*`: servidor seguro e terminal PTY sob demanda.
- `src/renderer/src/platform/*`: contexto, cliente API e bridge Web.
- `vite.web.config.ts`: build Web.
- `vite.node.config.ts`: builds CLI e servidor.
- `tests/environment-detector.test.ts`: matriz simulada.
- `tests/cli-arguments.test.ts`: flags e erros da CLI.
- `tests/local-server.test.ts`: autenticação, Origin, Host, payload, porta, WebSocket e confinamento.
- `install.sh`, `LICENSE`, `CHANGELOG.md`, workflows e templates GitHub.

## 10. Arquivos modificados

- `package.json`/`package-lock.json`: pacote `kadris`, bin, builds, whitelist e dependências opcionais.
- `src/shared/contracts.ts`: `PlatformBridge`, capacidades e workspace atual.
- `src/preload/index.ts`: implementação Electron da bridge.
- `src/renderer/src/App.tsx` e componentes: consumo da bridge injetada.
- `src/main/ipc/register-ipc.ts`: formas de resposta CRUD e payloads corrigidos.
- `src/main/services/workspace-service.ts`: rename para destino inexistente corrigido.
- `src/main/services/codex-service.ts`: app-server desacoplado do Electron, handshake e detecção assíncrona corrigidos.
- `src/main/services/live-server-service.ts`: confinamento canônico.
- `electron.vite.config.ts`: externalização explícita de `node-pty`.

## 11. Arquivos removidos

Nenhuma funcionalidade ou runtime foi removido. Um script provisório de smoke sem uso foi eliminado durante o desenvolvimento.

## 12. Dependências

- Adicionada: `ws` para WebSocket autenticado.
- Adicionada em desenvolvimento: `@types/ws`.
- Movida para opcional: `node-pty`, evitando falha obrigatória em plataformas sem binário compatível.
- Electron permanece dependência de desenvolvimento e não faz parte do tarball npm portátil.

## 13. CLI

Comandos implementados: `kadris`, `kadris .`, caminho específico, `--web`, `--desktop`, `--port`, `--host` loopback, `--no-open`, `--diagnose-env`, `--json`, `--safe-mode`, `--reset-session`, `--verbose`, `--help` e `--version`. Flags desconhecidas, combinações conflitantes, host público, porta inválida, workspace inválido e desktop incompatível retornam erros explícitos. Ctrl+C e SIGTERM encerram servidor, sockets, terminal e Codex.

## 14. npm e pnpm

Pacote preparado: `kadris@0.1.0`; bin: `kadris`; tarball aproximado: 5,1 MB compactado e 16 MB descompactado. O conteúdo contém CLI, servidor, web, documentos e instalador; não contém `out/main`, Electron, tokens ou `node_modules`. Instalação global isolada foi validada com npm e pnpm. O pacote não foi publicado.

## 15. GitHub

Foram preparados `ci.yml`, `publish-npm.yml`, `release.yml`, templates de issue, documentação, instalador e checksums. Publicação exige acionamento manual e alteração explícita de `private`. Este diretório não possui `.git`; nenhum push, release ou publish foi feito.

## 16. Segurança

- Host: somente `127.0.0.1` ou `localhost`.
- Token: 256 bits por processo, Bearer/cookie SameSite e WebSocket autenticado.
- CORS/Origin: nenhuma origem ampla; origem estrangeira ou `null` é rejeitada.
- DNS rebinding: `Host` deve corresponder exatamente à instância.
- CSP: scripts, workers, conexões, frames, objetos e formulários são limitados.
- Caminhos: normalização, `realpath`, relação canônica, symlinks e workspace são verificados.
- Limites: payload, WebSocket, arquivo, diretório e rate limit.
- Permissões: safe mode desativa terminal e agente; credenciais não são persistidas no runtime Web.

## 17. Comandos executados

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run build:web`
- `npm run build:portable`
- `npm run build:desktop`
- `npm pack --dry-run --json`
- `npm pack --json`
- `npm install --global --prefix <temporário> ./kadris-0.1.0.tgz`
- `pnpm add --global --global-dir <temporário> --global-bin-dir <temporário> ./kadris-0.1.0.tgz`
- `sh -n install.sh`
- `KADRIS_PACKAGE=./kadris-0.1.0.tgz sh install.sh` com prefixo npm isolado
- `node dist/cli/index.js --web --no-open --port <porta>`
- `google-chrome --headless ... <URL autenticada>`
- `xvfb-run ... electron-vite preview --entry out/main/index.js`

## 18. Verificações

| Verificação | Executada | Resultado | Evidência |
|---|---|---|---|
| Type-check | Sim | Passou | TypeScript estrito sem erros |
| Lint | Sim | Passou | ESLint sem warnings |
| Testes unitários/integração | Sim | Passou | 60 testes em 14 arquivos |
| Testes end-to-end | Parcial | Passou no host | Chrome headless Web e Xvfb Electron |
| Build web | Sim | Passou | `dist/web` |
| Build server | Sim | Passou | `dist/server/index.js` |
| Build CLI | Sim | Passou | `dist/cli/index.js` |
| Build Electron | Sim | Passou | `out/main`, `out/preload`, `out/renderer` |
| npm pack | Sim | Passou | `kadris-0.1.0.tgz` |
| Instalação npm | Sim | Passou | Prefixo global temporário, sem Electron |
| Instalação pnpm | Sim | Passou | Prefixo global temporário |
| Instalação via install.sh | Sim, local | Passou | Tarball local; download curl não testado |
| Linux real | Sim | Parcial | Electron e Web no host Linux |
| Windows real | Não | Não verificado | Sem host Windows funcional |
| Termux real | Não | Não verificado | Requer dispositivo Android real |
| Ubuntu/Debian PRoot | Simulado | Passou | Testes do detector e bloqueio |
| Servidor seguro | Sim | Passou | Testes de token, Host, Origin, payload, symlink e WS |
| Publicação npm | Não | Não realizada | `private: true` |
| GitHub Release | Não | Não realizada | Workflow apenas preparado |

## 19. Erros encontrados

- CRUD IPC retornava tipos diferentes do preload. Severidade alta. Respostas foram alinhadas e efeitos não são mais reportados falsamente como falha.
- Rename resolvia `realpath` de um destino inexistente. Severidade alta. Agora valida o pai canônico.
- Live server admitia risco de symlink/path traversal. Severidade alta. Foi adicionado confinamento canônico e testes.
- Codex tratava envelope JSON-RPC como resultado e aguardava resposta para notificação. Severidade alta. Handshake e `result` foram corrigidos.
- Primeiro status Codex competia com a descoberta do CLI. Severidade média. A detecção agora é aguardada.
- Tarball incluía `out/main` por causa de `main`. Severidade alta para Termux. O main npm agora é o servidor e o main desktop usa `extraMetadata`.
- Bin npm por symlink não passava na comparação de caminho. Severidade alta. A entrada CLI agora executa diretamente.
- `node-pty` opcional foi indevidamente empacotado pelo Electron. Severidade alta. O módulo foi marcado como externo.

## 20. Limitações

- Termux, Android ARM64 e PRoot real não foram testados em dispositivo.
- Windows real, instalador NSIS e macOS não foram testados neste host.
- Git, busca global, diagnósticos/LSP, patches com aprovação e recuperação completa de sessão ainda não foram implementados.
- SAF e Kadris Android Bridge não foram implementados.
- Reuso seguro de uma instância Web existente ainda não foi implementado.
- Acesso de rede é deliberadamente recusado; somente loopback está disponível.
- Terminal e agente Web foram validados no host Linux, não em Termux.

## 21. Riscos restantes

- Crítico: nenhum identificado nos fluxos testados.
- Alto: compatibilidade real de `node-pty` e Codex em Termux permanece desconhecida.
- Médio: TOCTOU em operações de filesystem não pode ser eliminado completamente com APIs Node comuns; testes em Windows junctions faltam.
- Médio: o runtime Web ainda não possui persistência segura de chaves de API.
- Baixo: bundle Monaco é grande e pode iniciar lentamente em dispositivos móveis.

## 22. Próximos passos

1. Testar npm, pnpm, terminal, Monaco, Codex, suspensão e Ctrl+C em Termux ARM64 real.
2. Implementar e testar Git, busca, diagnósticos e sistema de patches/permissões.
3. Adicionar persistência e reuso autenticado de instância local.
4. Testar Windows real, WSL, Ubuntu/Debian PRoot e containers reais.
5. Otimizar os chunks Monaco para memória e carregamento móvel.
6. Somente após essas etapas, remover `private`, publicar npm e criar GitHub Release versionada.
