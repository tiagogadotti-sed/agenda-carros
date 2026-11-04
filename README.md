# Agenda CRE

Aplicativo de agendamento de veículos para Coordenadorias Regionais de Educação.
React + TypeScript + Vite, Express e SQLite nativo do Node.js. Repositório independente do projeto pai.

## Executar localmente

Requer Node.js 24.14 ou superior da linha 24 e npm.

```powershell
npm ci
Copy-Item .env.example .env
npm run admin
npm run dev
```

O comando `admin` solicita nome, e-mail, regional e senha. Não existem contas ou senhas padrão.
Abra **http://localhost:5173** (localhost e 127.0.0.1 são aceitos no desenvolvimento). Cadastre os quatro veículos em **Veículos** e as pessoas em **Usuários**.
O frontend usa a porta 5173; a API, 3001. A porta 5173 é fixa: se estiver ocupada, o Vite avisa em vez de mudar silenciosamente. Em produção, APP_ORIGIN deve corresponder à origem HTTPS pública; aliases locais não são liberados.

## Escopo inicial

- Login por e-mail/senha, hash scrypt com salt individual e sessão de 8 horas em cookie HttpOnly/SameSite.
- Administrador: cadastrar veículos e usuários de todos os perfis; consultar, agendar e cancelar viagens.
- Gestor: consultar, agendar, cancelar e cadastrar usuários de consulta.
- Consulta: somente leitura da agenda e frota.
- Calendário semanal responsivo, filtros, viagens de múltiplos dias e motivo obrigatório.
- Separação por regional no servidor. Para outra regional, execute `npm run admin` e informe outro nome.
- Conflitos impedidos por triggers SQLite e transações. Reservas adjacentes são permitidas.
- Cancelamentos preservados no banco e trilha de auditoria.
- Manifesto PWA e tela de indisponibilidade de conexão. Reservas exigem internet; não há cache de dados autenticados.

Horários são armazenados em UTC e exibidos no fuso do dispositivo. Mantenha os dispositivos no fuso da regional.

## Verificar

```sh
npm test
npm run build
```

Testes de integração cobrem login, expiração/logout, perfis, isolamento entre regionais, reservas conflitantes, limites de datas e cancelamentos.

## Publicar em uma VPS

1. Instale Node.js 24 e clone o repositório. Execute `npm ci` e `npm run build`.
2. Crie `.env` com `NODE_ENV=production`, `APP_ORIGIN=https://agenda.seu-dominio`, `HOST=127.0.0.1`, `PORT=3001` e `DB_PATH=/var/lib/agenda-cre/agenda.sqlite`.
3. Dê acesso à pasta do banco apenas ao usuário do serviço. Execute `npm run admin` antes de disponibilizar o acesso.
4. Rode `npm start` como serviço (systemd) e use Caddy/Nginx na frente para HTTPS. Exemplo Caddy: `agenda.seu-dominio { reverse_proxy 127.0.0.1:3001 }`.
5. Mantenha uma única instância Node. O próprio Express serve o frontend compilado; não é preciso outra hospedagem.
6. Preserve a pasta do banco nas atualizações e agende backups externos. Não exponha a porta 3001 à internet.

O limitador de login inicialmente considera o IP do proxy, de forma conservadora. Antes de ampliar o uso, configure a confiança no proxy somente para a infraestrutura real e teste limites por cliente.

## Backup e recuperação

`npm run backup` usa a API de backup do SQLite, segura com o banco em uso, e grava em `backups/`.
Agende esse comando diariamente e copie os backups para outro equipamento/serviço; a criação de um backup local não oferece proteção contra perda da VPS.
Para restaurar: pare a aplicação, preserve o banco atual e seus arquivos WAL/SHM em outro diretório, coloque o backup no caminho DB_PATH, ajuste permissões e reinicie. Teste a recuperação antes do uso oficial.

## Próximas etapas

- Alteração/recuperação de senha, desativação de usuários e edição de perfis.
- Edição de reservas (por enquanto cancelar e cadastrar novamente).
- Bloqueios de manutenção e desativação de veículos.
- Tela de histórico/auditoria e política de retenção.
- Validar instalação PWA em Android real e revisar usabilidade com a regional.
- Configurar domínio, HTTPS, serviço persistente e rotina externa de backup na hospedagem escolhida.

O banco local, `.env`, backups e dependências não são versionados. Esta primeira versão não foi publicada em produção.
