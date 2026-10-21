# Sala de Situação no Docker

Com o Docker, o site, o banco de dados e tudo de que eles dependem rodam em contêineres. No servidor só é preciso ter o Docker (com o Docker Compose) — nada de Node.js ou PostgreSQL instalados à parte.

Os comandos são os mesmos no Windows (PowerShell) e no Linux, sempre na pasta do projeto.

## O que sobe

| Serviço | O que é |
|---|---|
| `db` | PostgreSQL 18. Não tem porta aberta para fora: só os outros contêineres falam com ele. |
| `permissoes` | Ajusta o dono dos volumes de arquivos e de cache e termina (não mexe no conteúdo). |
| `ferramentas` | Aplica as migrações que faltam e termina. Também roda os scripts (`admin:criar`, `integracoes:testar`…). |
| `app` | O site (Next.js). Atende em `http://127.0.0.1:3000`, só na própria máquina. |
| `proxy` (opcional) | nginx com HTTPS na frente do site. Só sobe com `--profile proxy`. |
| `backup` / `restaurar` | Sob demanda, para backup e restauração. |

Onde ficam os dados (volumes do Docker — sobrevivem a reinício, atualização e `docker compose down`):

| Volume | Conteúdo | Backup? |
|---|---|---|
| `sala-situacao_banco` | Banco de dados | **Sim** |
| `sala-situacao_arquivos` | PDFs de boletins e documentos enviados | **Sim** |
| `sala-situacao_cache` | Cache das consultas às APIs | Não (descartável) |

> **Nunca use `docker compose down -v` nem `docker volume rm`**: o `-v` apaga os volumes, isto é, o banco e os arquivos.

## Primeira instalação

1. **Configuração.** Copie o modelo e ajuste o endereço público:

   ```
   cp .env.docker.example .env.docker
   ```

   - `APP_URL`: endereço que as pessoas usam (ex.: `https://salasituacao.sp.gov.br`).
   - `TRUST_PROXY`: `true` com proxy reverso na frente; `false` sem.
   - `SAISP_USUARIO` / `SAISP_SENHA`: login do SAISP para a imagem de radar do Boletim Diário (opcional).

2. **Senhas do banco.** Ficam em dois arquivos na pasta `secrets/`, que não vai para o repositório. Gere senhas longas e aleatórias, só com letras e números, sem quebra de linha no fim:

   Linux:
   ```
   mkdir -p secrets
   openssl rand -hex 24 | tr -d '\n' > secrets/postgres_password.txt
   openssl rand -hex 24 | tr -d '\n' > secrets/app_db_password.txt
   chmod 600 secrets/*.txt .env.docker
   ```

   Windows (PowerShell):
   ```
   New-Item -ItemType Directory -Force secrets | Out-Null
   foreach ($n in 'postgres_password','app_db_password') {
     $b = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
     [IO.File]::WriteAllText("$PWD\secrets\$n.txt", -join ($b | ForEach-Object { $_.ToString('x2') }))
   }
   ```

   - `postgres_password.txt`: administrador do PostgreSQL (só manutenção).
   - `app_db_password.txt`: usuário `ssap_app`, o único que o site usa (sem poderes de administrador).
   - As senhas valem a partir da **primeira** subida do banco. Trocar o arquivo depois não troca a senha no banco.

3. **Subir.**

   ```
   docker compose up -d --build
   ```

   Na primeira vez o banco é criado, as migrações são aplicadas e o site sobe.

4. **Criar o primeiro administrador** (pula se for restaurar um backup com usuários):

   ```
   docker compose run --rm ferramentas npm run admin:criar
   ```

5. **Conferir.**

   ```
   docker compose ps
   ```

   `db` e `app` devem aparecer como `healthy`. O site responde em `http://127.0.0.1:3000`.

### Trazer os dados de uma instalação sem Docker

Se já existe um banco PostgreSQL com dados (por exemplo, o da máquina de desenvolvimento), copie-o para dentro do Docker sem mexer no original:

```
mkdir -p backups/ssap_importacao
pg_dump --format=custom --no-owner --no-acl --file=backups/ssap_importacao/banco.dump "postgres://ssap_app:SENHA@localhost:5432/ssap"
tar -czf backups/ssap_importacao/arquivos.tar.gz -C storage .
docker compose stop app
docker compose run --rm -e CONFIRMAR=SIM restaurar ssap_importacao
docker compose up -d
```

## Dia a dia

| Para… | Comando |
|---|---|
| Iniciar | `docker compose up -d` |
| Parar (os dados ficam) | `docker compose stop` |
| Parar e remover os contêineres (os dados ficam) | `docker compose down` |
| Reiniciar tudo | `docker compose restart` |
| Reiniciar só o site | `docker compose restart app` |
| Ver a situação | `docker compose ps` |
| Ver os logs | `docker compose logs -f` |
| Logs só do site (últimas 200 linhas) | `docker compose logs --tail 200 app` |
| Logs do banco | `docker compose logs --tail 200 db` |
| Testar as APIs externas | `docker compose run --rm ferramentas npm run integracoes:testar` |
| Gerar link de definição de senha | `docker compose run --rm ferramentas npm run senha:link` |
| Abrir o `psql` | `docker compose exec db psql -U postgres ssap` |

Os serviços têm `restart: unless-stopped`: voltam sozinhos se caírem e quando o servidor reinicia, desde que o Docker inicie com o sistema (`sudo systemctl enable docker` no Linux; no Docker Desktop, "Start Docker Desktop when you sign in").

Os logs de cada serviço são limitados a 5 arquivos de 10 MB; não enchem o disco.

## Migrações

As migrações de `db/migrations` são aplicadas **sozinhas** a cada `docker compose up`, antes de o site subir. Só entram as que ainda faltam; cada uma roda numa transação (se falhar, nada dela fica aplicado e o site não sobe com o banco pela metade).

Para rodar à mão:

```
docker compose run --rm ferramentas npm run db:migrar
```

## Backup

```
docker compose run --rm backup
```

Cria uma pasta `backups/ssap_AAAAMMDD-HHMMSS/` com:

- `banco.dump` — o banco inteiro;
- `arquivos.tar.gz` — os PDFs e documentos enviados;
- `SHA256SUMS` — para conferir a integridade.

Pode rodar com o site no ar. No Linux, a pasta `backups/` precisa ser gravável pelo usuário 1000: `mkdir -p backups && sudo chown 1000:1000 backups`.

**Backup diário automático (Linux)** — `crontab -e`:

```
30 2 * * * cd /opt/ssap && docker compose run --rm -T backup >> backups/backup.log 2>&1
```

Para apagar sozinho os backups com mais de 30 dias, acrescente `-e BACKUP_MANTER_DIAS=30` depois de `run --rm -T`. Sem isso, nenhum backup é apagado.

**Copie a pasta `backups/` para outra máquina** (rsync, fita, armazenamento da instituição). Backup no mesmo disco do servidor não protege contra a perda do servidor.

## Restauração

> A restauração **substitui o banco** pelo do backup: o que foi cadastrado depois dele é perdido. Faça um backup novo antes, se o banco atual ainda tiver algo que importa.

```
docker compose stop app
docker compose run --rm -e CONFIRMAR=SIM restaurar ssap_AAAAMMDD-HHMMSS
docker compose up -d
```

- Sem `-e CONFIRMAR=SIM` o comando só avisa e não faz nada. Sem o nome da pasta, lista os backups disponíveis.
- O banco é restaurado numa transação: ou volta inteiro, ou fica como estava.
- Os arquivos do backup são copiados de volta; nenhum arquivo que já esteja no volume é apagado.

## Atualizar o site

1. Faça um backup: `docker compose run --rm backup`
2. Traga o código novo: `git pull`
3. Reconstrua e suba: `docker compose up -d --build`

O banco e os arquivos não são tocados pela atualização: ficam nos volumes. As migrações novas são aplicadas antes de o site voltar. O site fica fora do ar por alguns segundos durante a troca.

Para voltar à versão anterior: `git checkout <versão anterior>` e `docker compose up -d --build`. Se a versão nova tiver aplicado migrações, restaure também o backup do passo 1.

Limpeza de imagens antigas (não mexe em volumes): `docker image prune -f`.

## Logs

A aplicação escreve **uma linha JSON por evento** no stdout (info, debug) e no stderr (warn, error); o Docker guarda e rotaciona. Nenhum log fica acessível pelo site.

```
{"ts":"2026-10-20T14:03:12.481Z","nivel":"warn","evento":"api_falha","req":"6639f24d-…","fonte":"sibh","endpoint":"https://apps.spaguas.sp.gov.br/sibh/api/v2/…","ms":12004,"http":null,"proxy":true,"sucesso":false,"tipo":"timeout",…}
```

| Evento | Nível | Quando |
|---|---|---|
| `app_iniciada`, `banco_ok` / `banco_falha` | info / error | subida da aplicação (proxy, pastas, nível de log) e teste do banco |
| `app_encerrando`, `app_encerrada` | info | parada (sinal do Docker) e código de saída |
| `requisicao_erro` | error | erro em página, rota, ação ou proxy — com a rota, o `req` e o `digest` mostrado na tela de erro |
| `excecao_nao_tratada`, `promessa_rejeitada_sem_tratamento` | error | falhas sem tratamento no servidor |
| `banco_erro`, `banco_lento`, `banco_transacao_desfeita`, `banco_conexao_encerrada` | error / warn | PostgreSQL: erro (código, começo do SQL, sem valores), consulta acima de `LOG_DB_LENTO_MS` |
| `api_falha`, `api_lenta`, `api_ok` | warn / warn / debug | cada chamada real a uma fonte externa: `fonte`, `endpoint` (sem credenciais), `ms`, `http`, `proxy`, `tipo` = `timeout`, `dns`, `conexao`, `proxy`, `certificado`, `autenticacao`, `http` ou `resposta_invalida` |
| `auditoria` | info / warn | login, falha de login, bloqueio, acesso negado, logout, troca de senha e ações administrativas — só o id do usuário (nome, login digitado, IP e navegador ficam só na tabela `auditoria` do banco) |
| `rota_falha` | error | falha tratada numa rota interna (ex.: montagem do boletim integrado) |

Senhas, tokens, cookies, cabeçalhos de autorização, usuário/senha do proxy e conteúdo das respostas **nunca** são registrados. `X-Request-Id`: toda resposta do site traz esse cabeçalho; o mesmo valor aparece como `"req"` nos logs da requisição (e no log do nginx do perfil `proxy`).

Níveis (no `.env.docker`, recriando o app com `docker compose up -d app`): `LOG_NIVEL=info` (padrão). Para investigar, `LOG_NIVEL=debug` registra também cada chamada bem-sucedida às APIs — volte para `info` depois. Limites: `LOG_DB_LENTO_MS` (1000) e `LOG_API_LENTA_MS` (8000).

**Consultar:**

```
docker compose logs -f --tail=100 app                                  # tempo real
docker compose logs --since 24h app | grep '"nivel":"error"'             # erros das últimas 24 h
docker compose logs --since 24h app | grep '"evento":"api_falha"'        # falhas das APIs externas
docker compose logs --since 24h app | grep '"evento":"api_falha"' | grep '"fonte":"sibh"'   # só uma fonte
docker compose logs --since 7d app | grep '"evento":"auditoria"' | grep '"nivel":"warn"'     # falhas de login e acessos negados
docker compose logs --since 24h app | grep '"req":"6639f24d-ef29-43e9-9148-64f2791534b1"'    # tudo de uma requisição
docker compose logs app | grep '"digest":"3833714216"'                   # o erro de uma tela "Código de referência"
```

Com o `jq` instalado no servidor, um resumo das falhas por fonte e tipo:

```
docker compose logs --no-log-prefix --since 24h app | grep '^{' | jq -r 'select(.evento=="api_falha") | "\(.fonte) \(.tipo) \(.http)"' | sort | uniq -c
```

**Armazenamento e histórico.** No padrão (`compose.yaml`), cada serviço usa o driver `json-file` com rotação e compressão: a aplicação guarda até 10 arquivos de 20 MB e os demais serviços 5 de 10 MB. Esses logs ficam **dentro do contêiner**: somem quando ele é recriado (todo `docker compose up -d --build`).

Para manter o histórico entre recriações no servidor Linux, use o **journald** (nativo do Docker, sem armazenamento duplicado):

1. No arquivo `.env` do servidor (o mesmo do `APP_PORTA`), acrescente `COMPOSE_FILE=compose.yaml:compose.journald.yaml`. Todos os comandos `docker compose …` passam a usar os dois arquivos.
2. Defina a retenção em `/etc/systemd/journald.conf` e reinicie o serviço (`sudo systemctl restart systemd-journald`):

   ```
   [Journal]
   Storage=persistent
   SystemMaxUse=2G
   MaxRetentionSec=90day
   ```

3. Recrie os contêineres: `docker compose up -d`.

`docker compose logs` continua funcionando. Para o histórico antigo, também por data:

```
journalctl SYSLOG_IDENTIFIER=sala-situacao/sala-situacao-app-1 --since "2026-10-01" --until "2026-10-15" -o cat | grep '"nivel":"error"'
```

O Docker Desktop (Windows) não tem journald: em desenvolvimento fica o `json-file`.

## Implantar no servidor de produção (Linux)

1. **Instale o Docker Engine com o plugin Compose** (documentação oficial do Docker para a sua distribuição) e ative-o no início do sistema: `sudo systemctl enable --now docker`.
2. **Copie o projeto** para o servidor, por exemplo em `/opt/ssap` (`git clone` ou cópia da pasta, sem `node_modules`, `.next`, `storage` e `.env.local`).
3. Siga a **Primeira instalação** acima (`.env.docker`, `secrets/`, `docker compose up -d --build`).
4. **Dados existentes:** leve a pasta de um backup para `backups/` no servidor e use a **Restauração**.
5. **HTTPS.** O login só funciona por HTTPS em produção (o cookie de sessão é marcado como seguro). Escolha um:

   **a) nginx do próprio projeto.** Coloque o certificado em `deploy/certs/fullchain.pem` e `deploy/certs/privkey.pem`, defina `SERVIDOR_NOME` e `TRUST_PROXY=true` no `.env.docker` e suba com o perfil:

   ```
   docker compose --profile proxy up -d --build
   ```

   Ele atende nas portas 80 (redireciona para HTTPS) e 443. Ao renovar o certificado: `docker compose --profile proxy restart proxy`. Com o perfil ligado, use `--profile proxy` também nos outros comandos (`ps`, `logs`, `down`). Se as portas 80/443 estiverem ocupadas, defina `PROXY_PORTA_HTTP` e `PROXY_PORTA_HTTPS` no arquivo `.env`.

   **b) proxy reverso da instituição** (nginx, IIS, balanceador). Aponte-o para `http://127.0.0.1:3000`. Ele precisa enviar `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto` e `X-Forwarded-For`, aceitar envio de até 32 MB e esperar até 300 s por resposta. O arquivo `deploy/nginx/ssap.conf.template` serve de modelo.

6. **Firewall:** libere só 80 e 443. A porta 3000 fica presa a `127.0.0.1` e o banco não tem porta publicada.
7. **Agende o backup** (seção Backup) e a cópia para fora do servidor.

### Rede da instituição

- **Proxy de saída** para as APIs externas (como o `SSSP_PROXY` do site PHP publicado): no `.env.docker`, descomente e preencha

  ```
  SSSP_PROXY=10.200.12.140:80
  SSSP_PROXY_AUTH=usuario:senha   (só se o proxy pedir login)
  ```

  e recrie a aplicação: `docker compose up -d app`. Ao subir, o log mostra `entrada: APIs externas via proxy http://…` (a senha aparece como `***`). O banco e a própria máquina nunca passam pelo proxy; outros hosts internos vão em `SSSP_NO_PROXY` (separados por vírgula). Só proxy **http** é aceito (`SSSP_PROXY_TYPE=socks5` faz a aplicação parar com um aviso). Quem preferir pode usar as variáveis padrão do Node (`NODE_USE_ENV_PROXY=1`, `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` com `db`); com `HTTPS_PROXY` definida, o `SSSP_PROXY` é ignorado.
  Para testar a saída pelo proxy: `docker compose exec app node -e "fetch('https://api.open-meteo.com/v1/forecast?latitude=-23.5&longitude=-46.6&current=temperature_2m').then(r=>console.log(r.status))"` deve mostrar `200`.
- **Proxy que inspeciona HTTPS** (certificado próprio da instituição): a verificação de certificado nunca é desligada. Monte o certificado raiz no serviço `app` e aponte `NODE_EXTRA_CA_CERTS` para ele, num arquivo `compose.override.yaml`:

  ```yaml
  services:
    app:
      volumes:
        - ./deploy/certs/ca-instituicao.pem:/certs/ca-instituicao.pem:ro
  ```

- O servidor precisa alcançar por HTTPS: `mananciais.sabesp.com.br`, `www.ana.gov.br`, `apps.spaguas.sp.gov.br` (SIBH), `sssp.spaguas.sp.gov.br` (SSD), `api.open-meteo.com`, `geocoding-api.open-meteo.com` (localização dos municípios na previsão), `servicodados.ibge.gov.br`, `simqua.cetesb.sp.gov.br` (qualidade da água da CETESB, boletim integrado), `www.saisp.br`, `saisp-temp.s3.amazonaws.com` e `www.ipmetradar.com.br`.
- Para testar todas de uma vez, de dentro do contêiner (cada linha deve mostrar `200` ou outro código HTTP; `ERRO` indica bloqueio na rede):

  ```
  docker compose exec app node -e "for (const h of ['mananciais.sabesp.com.br','www.ana.gov.br','apps.spaguas.sp.gov.br','sssp.spaguas.sp.gov.br','api.open-meteo.com','geocoding-api.open-meteo.com','servicodados.ibge.gov.br','simqua.cetesb.sp.gov.br','www.saisp.br','www.ipmetradar.com.br']) fetch('https://'+h+'/',{signal:AbortSignal.timeout(20000)}).then(r=>console.log(r.status,h),e=>console.log('ERRO',h,e.cause?.code||e.message))"
  ```

## Desenvolvimento

O `compose.dev.yaml` roda o site com `next dev`, lendo o código da pasta (alterou o arquivo, a página recarrega), e abre o banco em `127.0.0.1:5433`:

```
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Também dá para usar só o banco do Docker e continuar com `npm run dev` fora dele: suba com o comando acima e use `DATABASE_URL=postgres://ssap_app:<senha de secrets/app_db_password.txt>@127.0.0.1:5433/ssap` no `.env.local`.

Para mudar a porta local do site (padrão 3000), crie um arquivo `.env` com `APP_PORTA=3001`.

Para voltar ao modo de produção depois de usar o de desenvolvimento: `docker compose up -d`.

As dependências do desenvolvimento ficam num volume (`dev_node_modules`), preenchido só na primeira subida. Depois de um `package.json` novo, atualize o volume com `docker compose -f compose.yaml -f compose.dev.yaml exec -u root app npm install`.

As duas imagens trazem o Chromium sem interface (Playwright), com o qual os sumários de cheias capturam o diagrama do SIBH em cores para o PDF. O navegador sai pelo mesmo proxy das APIs (`SSSP_PROXY`).

## Segurança — o que já vem configurado

- O site roda como usuário sem privilégios (`node`), com o sistema de arquivos somente leitura (só escreve nos volumes), sem capacidades extras do Linux.
- As senhas do banco ficam em arquivos de segredo, fora do repositório e fora das variáveis de ambiente dos contêineres.
- O banco não é publicado: fica numa rede interna do Docker, sem acesso de fora nem saída para a internet.
- O site usa um usuário do banco sem poderes de administrador.
- As senhas dos usuários continuam com Argon2id.
- Os arquivos enviados ficam fora da pasta pública, num volume próprio, e só saem pelas rotas que conferem a permissão.
- Versões fixas: Node 24.21.0, PostgreSQL 18.6, nginx 1.30.5. Atualize de propósito, trocando a versão no `Dockerfile`/`compose.yaml` e testando.
- Limites de CPU e memória por serviço (`deploy.resources.limits` no `compose.yaml`).

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `app` não sobe e `ferramentas` saiu com erro | Migração falhou: `docker compose logs ferramentas`. |
| Sumário de cheias: "pacote playwright não instalado" | Imagem antiga: refaça com `--build`; no desenvolvimento, atualize também o volume `dev_node_modules` (veja Desenvolvimento). |
| `entrada: segredo da senha do banco não encontrado` | Falta `secrets/app_db_password.txt`. |
| `password authentication failed` | O arquivo de senha foi trocado depois da primeira subida do banco, ou tem quebra de linha do Windows. |
| Login volta para a tela de login sem erro | Acesso por HTTP em produção: use HTTPS (item 5 da implantação). |
| Páginas de dados com "indisponível" | Sem saída para as APIs: `docker compose run --rm ferramentas npm run integracoes:testar`. |
| Porta 3000 já em uso | Outro programa na porta: crie `.env` com `APP_PORTA=3001`. |
