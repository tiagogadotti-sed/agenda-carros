# Fly.io — diagnóstico e operação

Revisão em 5 de novembro de 2026. Aplicativo `agenda-carros`, região `gru`, endereço `https://agenda-carros.fly.dev`.

## Causa confirmada da queda

Os logs remotos mostram `sh: 1: tsx: not found` e `Main child exited normally with code: 127`. O status da máquina confirma `oom_killed=false`: a queda observada não foi falta de memória.

O script `npm start` executa `tsx server/index.ts`. Antes da correção, `tsx` estava em `devDependencies`, e o Docker executava `npm prune --omit=dev` após o build. Assim, compilava, mas o executável necessário desaparecia antes da inicialização.

Também faltavam configurações que seriam necessárias após resolver o primeiro erro:

| Item            | Estado encontrado                                 | Configuração preparada                                                     |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Runtime         | `tsx` removido pelo prune                         | Dependência de produção; Docker inicia `node --import tsx server/index.ts` |
| Rede            | Fly em 3000; Node por padrão em 127.0.0.1:3001    | `HOST=0.0.0.0`, `PORT=3000`, `internal_port=3000`                          |
| Origem          | Sem APP_ORIGIN no fly.toml; nenhum secret listado | `APP_ORIGIN=https://agenda-carros.fly.dev`                                 |
| Banco           | Sem volume, arquivo no disco temporário           | Volume `agenda_data` em `/data`; `DB_PATH=/data/agenda.sqlite`             |
| Instâncias      | Duas máquinas paradas, sem volumes                | Uma única máquina para este SQLite sem replicação                          |
| Saúde           | Sem checks                                        | `GET /healthz`, verifica acesso ao SQLite                                  |
| Desenvolvimento | Proxy Vite apontando para 0.0.0.0:3000            | Proxy para 127.0.0.1:3001                                                  |

As correções estão no checkout local. Durante esta revisão não foram criados volumes, alteradas máquinas, publicados commits ou executado deploy. O estado remoto continua sendo o consultado acima até executar os passos seguintes.

## Estado funcional da aplicação

- React/TypeScript/PWA, backend Express e SQLite nativo do Node 24.
- O login atual é por **usuário `nome.sobrenome`**, conforme as alterações feitas no outro desenvolvimento; a documentação antiga por e-mail estava desatualizada.
- Veículo atualmente tem nome; a placa foi removida.
- Administrador com gestão completa da regional; Gestor de Agenda pode consultar e incluir agendamentos; Consulta tem somente leitura. Cancelamento de reservas e administração de veículos e usuários são exclusivos do administrador. Bloqueio permanente de acesso e desbloqueio pelo administrador.
- Agenda semanal, motivo da viagem, cancelamento com histórico e bloqueio de sobreposição.
- Tela de troca de senha no primeiro acesso e troca de senha autenticada.

Na migração do modelo antigo, foi reproduzida uma falha ao reconstruir `vehicles`: o trigger referenciava a tabela removida e o erro era apenas registrado. A migração foi corrigida para remover/recriar os triggers na mesma transação, preservar os registros e fazer rollback se houver colisões de nomes de usuário ou outro erro. O banco real local não foi usado para esses testes nem transferido para o Fly.

### Validação nesta revisão

- Build de produção passou e os 10 testes de integração passaram.
- Instalação limpa com apenas dependências de produção iniciou o backend, criou o SQLite e serviu a interface e o health check.
- `flyctl config validate` aceitou o arquivo preparado.
- O banco local foi consultado em modo somente leitura: integridade OK, sem violações de chave estrangeira, 4 usuários, 6 veículos e 3 reservas.
- Uma cópia consistente desse banco foi aberta com a migração corrigida em pasta temporária, preservando essas contagens e os vínculos das 3 reservas.
- Existe `vehicles_new` remanescente com 3 registros no banco local; a tabela ativa `vehicles` tem 6. A aplicação usa `vehicles`. A tabela remanescente foi preservada e não deve ser mesclada ou removida sem comparar os registros e guardar backup.

### Pontos para revisão funcional posterior

- A obrigação de trocar a senha inicial está aplicada na interface; o middleware ainda não bloqueia as demais operações da API enquanto `must_change_password=1`.
- O limitador de login identifica o cliente pelo cabeçalho `Fly-Client-IP` quando `FLY_APP_NAME` está definido pelo runtime do Fly. Endereços são validados e IPv6 é agrupado pelo `ipKeyGenerator`; cabeçalho ausente/inválido usa o IP da conexão. Fora do Fly o cabeçalho é ignorado. Não é usado `trust proxy=true`. O bloqueio permanente por conta após três falhas continua independente do limite por IP. Se adicionar outro proxy (por exemplo, Cloudflare) antes do Fly, reavalie a identificação de IP conforme a cadeia de proxies.
- Com uma única máquina e volume, haverá indisponibilidade durante substituição, falha ou manutenção da máquina. Não há replicação do SQLite nem failover implementados.

## 1. Conferir e validar localmente

No PowerShell, na pasta do projeto:

```powershell
Set-Location 'C:\Users\Tiago Gadotti\projetos\agenda-carros'
npm ci
npm run build
npm test
npm run test:production
flyctl config validate --config fly.toml
```

`test:production` monta uma instalação temporária sem devDependencies, inicia o processo em modo produção e verifica SQLite, frontend, autenticação e `/healthz`. Isso captura a classe de falha `tsx: not found`. Os checks de CI e de deploy também executam esse teste.

Não havia Docker disponível na máquina desta revisão. O build completo da imagem Linux e a conectividade real do Fly ainda precisam ser confirmados pelo próximo deploy. O smoke test não substitui essa validação.

## 2. Ajustar os recursos já existentes

Confira o estado antes de repetir comandos de criação:

```powershell
flyctl status -a agenda-carros
flyctl machines list -a agenda-carros
flyctl volumes list -a agenda-carros
```

Na consulta desta revisão havia duas máquinas e nenhum volume. Para a arquitetura atual, reduza para uma máquina e crie um volume de 1 GB na mesma região:

```powershell
flyctl scale count 1 -a agenda-carros
flyctl volumes create agenda_data --region gru --size 1 -a agenda-carros
```

Criar volume provisiona armazenamento cobrado pela plataforma. Execute a criação apenas se ainda não existir um volume adequado. Reduzir a quantidade remove uma máquina: preserve qualquer dado que tenha sido criado nela antes. Os logs consultados indicam que o servidor anterior nem chegou a iniciar.

Não mantenha duas máquinas com dois bancos SQLite independentes. Volumes do Fly não são compartilhados nem sincronizados automaticamente entre máquinas.

## 3. Publicar o código corrigido

```powershell
flyctl deploy --remote-only --ha=false -a agenda-carros
flyctl status -a agenda-carros
flyctl checks list -a agenda-carros
flyctl logs --no-tail -a agenda-carros
Invoke-RestMethod https://agenda-carros.fly.dev/healthz
```

`--ha=false` evita a criação automática de uma instância extra; não remove as instâncias que já existiam. Por isso a redução para uma máquina vem antes. O deploy continua usando a estratégia rolling padrão, compatível com volume, com breve interrupção durante a atualização.

O log esperado é `Agenda CRE ouvindo em http://0.0.0.0:3000` e `/healthz` deve retornar `status: ok`.

As variáveis necessárias já estão no `[env]` do `fly.toml` e não são segredos:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
APP_ORIGIN=https://agenda-carros.fly.dev
DB_PATH=/data/agenda.sqlite
```

Se usar domínio próprio, atualize `APP_ORIGIN` para a origem HTTPS exata e configure DNS/certificado. Secrets de mesmo nome podem sobrescrever essas variáveis; na consulta atual não havia secrets no app.

## 4. Criar o primeiro administrador no banco do volume

O volume novo começa sem os registros do seu computador. Não há senha padrão nem seed automático. Para uma instalação nova:

```powershell
flyctl ssh console -a agenda-carros --pty -C 'npm --prefix /app run admin'
```

Informe nome, usuário `nome.sobrenome`, regional e senha forte. O comando herda `DB_PATH=/data/agenda.sqlite` da máquina. A senha é solicitada no terminal, não como argumento do comando.

Se o SSH informar que não há máquina iniciada, consulte `flyctl machines list -a agenda-carros` e execute `flyctl machine start <ID> -a agenda-carros`, substituindo `<ID>` pelo ID atual. Então repita o SSH.

Para aproveitar os dados locais, use um backup consistente e planeje a restauração no volume antes de começar a cadastrar dados no ambiente novo. Não copie apenas o arquivo ativo `.sqlite` enquanto houver escrita em WAL. Não mescle o banco local com um banco remoto que já recebeu novos cadastros.

Não use `release_command` para criar o administrador ou migrar esse SQLite: o comando de release roda em uma máquina temporária sem o volume. As migrações devem acontecer no processo que abre o banco montado.

## 5. GitHub Actions

O workflow `.github/workflows/fly-deploy.yml` já faz deploy em push para main/master ou por execução manual. Ele agora executa testes, build e smoke test de produção antes de publicar.

No GitHub, mantenha o secret de Actions `FLY_API_TOKEN` com um token de deploy limitado ao app. Não adicionar token ao repositório ou ao fly.toml. Após preparar máquina e volume, o código pode ser commitado e enviado; o push na branch principal acionará o deploy automaticamente.

## 6. Backup e operação

Criar um backup consistente dentro do volume:

```powershell
flyctl ssh console -a agenda-carros -C 'env BACKUP_DIR=/data/backups npm --prefix /app run backup'
```

O comando imprime o caminho exato do backup criado. Baixe esse arquivo, substituindo o nome de exemplo pelo caminho retornado:

```powershell
flyctl ssh sftp get /data/backups/agenda-TIMESTAMP.sqlite ./agenda-backup.sqlite -a agenda-carros
```

Agende a execução e a cópia externa, defina retenção e teste restauração. Backups na mesma pasta/volume não protegem contra a perda do próprio volume. Não restaurar sobre o banco em uso.

`auto_stop_machines='stop'`, `auto_start_machines=true` e `min_machines_running=0` permitem parar a máquina ociosa para reduzir custo de CPU/RAM. Isso não apaga o volume, mas o primeiro acesso pode demorar enquanto a máquina acorda. O volume continua sendo um recurso cobrado. Se preferir resposta imediata, configure `min_machines_running=1` e considere o custo de mantê-la ligada.

## Acessar o SQLite pelo terminal

O Dockerfile inclui o cliente `sqlite3` na imagem final. Depois do deploy dessa imagem:

```powershell
flyctl ssh console -a agenda-carros
```

Dentro do servidor:

```sh
sqlite3 /data/agenda.sqlite
```

No console SQLite, habilite as chaves estrangeiras para essa conexão e um tempo de espera para gravações concorrentes:

```sql
PRAGMA foreign_keys=ON;
.timeout 5000
.headers on
.mode column
.tables
.schema vehicles
SELECT * FROM vehicles;
```

O cliente permite SELECT, INSERT, UPDATE e DELETE. Para conferir uma alteração antes de confirmar, use uma transação. Exemplo de edição (ajuste o ID ao registro desejado):

```sql
BEGIN;
UPDATE vehicles SET name='Veículo 01' WHERE id=1;
SELECT changes();
SELECT * FROM vehicles WHERE id=1;
```

Use `COMMIT;` para confirmar ou `ROLLBACK;` para desfazer, e `.quit` para sair. Faça backup antes de alterações manuais. SQL direto não executa as verificações de perfil, criação de hash de senha e auditoria feitas pelo backend; as constraints e triggers do SQLite continuam sendo aplicadas.

Se a imagem atual ainda não tiver o cliente, é possível instalar na sessão SSH com `apt-get update && apt-get install --no-install-recommends -y sqlite3`. Essa instalação manual é temporária e pode desaparecer ao recriar a máquina; a inclusão no Dockerfile disponibiliza o cliente a cada deploy.

## Fontes oficiais consultadas

- [Volumes para JavaScript e SQLite](https://docs.fly.io/js/the-basics/volumes)
- [Troubleshooting: endereço e porta de escuta](https://docs.fly.io/getting-started/troubleshooting)
- [fly.toml: checks, mounts, deploy e release_command](https://docs.fly.io/reference/configuration)
