# Histórico

## 2026-11-05 — Ajuste de perfis

- Gestor de Agenda pode consultar e criar agendamentos, sem cancelar reservas.
- Gerenciamento de veículos e usuários, incluindo listagem administrativa e desbloqueio, restrito ao Administrador.
- Interface e autorização da API atualizadas; Consulta permanece somente leitura.

## 2026-11-05 — Preparação para Fly.io

- `tsx` como dependência de produção, Docker com runtime explícito e cópia restrita dos arquivos necessários.
- Porta 3000, bind 0.0.0.0, origem HTTPS e SQLite em volume `/data` declarados no fly.toml.
- Health check `/healthz` e validação de dependências de produção no CI.
- Migrações antigas executadas em transação, com recriação dos triggers e rollback em caso de falha.
- Corrigido proxy do Vite para API local na porta 3001; `BACKUP_DIR` configurável.
- Diagnóstico e roteiro de operação em `docs/DEPLOY_FLY.md`.

## Alterações recentes

- Senhas novas exigem maiúscula, minúscula, número e caractere especial, com 8 a 128 caracteres.
- Bloqueio permanente após três falhas consecutivas, persistido no SQLite; desbloqueio somente por administrador da regional.
- Gestores podem alterar perfis entre Gestor e Consulta, sem atribuir Administrador.
- Edição de veículos por administrador e gestor.
- Edição de usuários com validação de perfil e regional, senha opcional e revogação de sessões ao alterar credenciais/perfil.
- Proteção do último administrador e registro de edições em auditoria.

## 0.1.0 — 2026-11-04

- Projeto independente com React/TypeScript, Express e SQLite.
- Login, sessões persistidas, três perfis e separação por regional.
- Frota, cadastro de usuários, calendário semanal e cancelamento de reservas.
- Proteção contra sobreposição no banco e auditoria de reservas.
- Base PWA, script de backup e testes de integração.
