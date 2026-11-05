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

O comando `admin` solicita nome, usuário no formato `nome.sobrenome`, regional e senha. Não existem contas ou senhas padrão.
Abra **http://localhost:5173** (localhost e 127.0.0.1 são aceitos no desenvolvimento). Cadastre os quatro veículos em **Veículos** e as pessoas em **Usuários**.
O frontend usa a porta 5173; a API, 3001. A porta 5173 é fixa: se estiver ocupada, o Vite avisa em vez de mudar silenciosamente. Em produção, APP_ORIGIN deve corresponder à origem HTTPS pública; aliases locais não são liberados.

## Escopo inicial

- Login por usuário (`nome.sobrenome`) e senha, hash scrypt com salt individual e sessão de 8 horas em cookie HttpOnly/SameSite.
- Administrador: cadastrar veículos e usuários de todos os perfis; consultar, agendar e cancelar viagens.
- Gestor de Agenda: consultar a agenda e a frota e incluir agendamentos; não pode cancelar/excluir reservas, gerenciar veículos ou acessar a administração de usuários.
- Consulta: somente leitura da agenda e frota.
- Somente o administrador pode cadastrar e editar veículos, criar e editar usuários e desbloquear contas.
- Administrador pode editar nome, usuário, perfil e senha dos usuários da regional; o último administrador não pode perder esse perfil.
- Na edição de usuário pelo administrador, senha em branco mantém a atual; quando preenchida, exige de 8 a 128 caracteres, com maiúscula, minúscula, número e caractere especial.
- Alterações de usuário, senha ou perfil encerram as sessões do usuário editado.
- Calendário semanal responsivo, filtros, viagens de múltiplos dias e motivo obrigatório.
- Separação por regional no servidor. Para outra regional, execute `npm run admin` e informe outro nome.
- Conflitos impedidos por triggers SQLite e transações. Reservas adjacentes são permitidas.
- Somente o administrador cancela reservas; cancelamentos são preservados no banco e na trilha de auditoria.
- Manifesto PWA e tela de indisponibilidade de conexão. Reservas exigem internet; não há cache de dados autenticados.

Horários são armazenados em UTC e exibidos no fuso do dispositivo. Mantenha os dispositivos no fuso da regional.

## Senhas e bloqueio de acesso

A mesma regra de senha é aplicada no cadastro pelo terminal, na API e na interface: 8 a 128 caracteres, maiúscula, minúscula, número e caractere especial. Espaço não conta como caractere especial. Senhas já existentes continuam válidas até serem alteradas; não é possível avaliar sua composição a partir do hash.

Três falhas consecutivas de senha bloqueiam a conta sem expiração e encerram suas sessões. Um login bem-sucedido antes da terceira falha zera a contagem. O bloqueio é associado ao ID do usuário e persiste no SQLite, inclusive após reiniciar o servidor ou alterar seu usuário, perfil ou senha.

Somente um administrador autenticado da mesma regional pode usar **Usuários → Desbloquear**. O desbloqueio zera a contagem, mas não troca a senha. Bloqueios e desbloqueios são registrados na auditoria. O limite adicional por IP continua ativo contra abuso e é independente do bloqueio permanente da conta.

Mantenha outro administrador disponível: se todos os administradores forem bloqueados, não há desbloqueio pelo navegador. O responsável pelo servidor precisará criar uma nova conta administrativa com `npm run admin` para recuperar a gestão. Não existe desbloqueio automático por tempo.

## Verificar

```sh
npm test
npm run build
```

Testes de integração cobrem login, expiração/logout, perfis, isolamento entre regionais, reservas conflitantes, limites de datas e cancelamentos.

## Publicar no Fly.io

O projeto inclui Dockerfile, fly.toml e workflow de deploy. Leia [o diagnóstico e passo a passo do Fly.io](docs/DEPLOY_FLY.md) antes do primeiro deploy: é necessário manter uma única máquina e criar o volume persistente do SQLite.

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

- Recuperação de acesso e desativação de usuários.
- Edição de reservas (por enquanto cancelar e cadastrar novamente).
- Bloqueios de manutenção e desativação de veículos.
- Tela de histórico/auditoria e política de retenção.
- Validar instalação PWA em Android real e revisar usabilidade com a regional.
- Configurar domínio, HTTPS, serviço persistente e rotina externa de backup na hospedagem escolhida.

O banco local, `.env`, backups e dependências não são versionados. Consulte o estado do deploy no Fly e as próximas ações em [docs/DEPLOY_FLY.md](docs/DEPLOY_FLY.md).
