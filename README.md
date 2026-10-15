# Sala de Situação Alfredo Pisani

Reconstrução da Sala de Situação em **Next.js 16 + TypeScript + PostgreSQL**.
A aplicação PHP `spaguas-ss-ap` serve só de referência de comportamento (nesta máquina: `C:\xampp_\htdocs\spaguas-ss-ap`).

## Área restrita (`/acesso`) — igual à do PHP

A área restrita usa a mesma moldura do PHP (`acesso/includes/templates/`): barra superior, menu lateral por sala e por permissão, painel com indicadores e telas de login no cartão centralizado. O CSS é o próprio `acesso.css` do PHP, copiado para `src/styles/acesso/`, e as imagens ficam em `public/acesso/img/`.

| No PHP | No Next |
|---|---|
| `painel.php` | `/acesso` |
| `salas/sala.php?s=<sala>` | `/acesso/salas/sala?s=<sala>` |
| `boletins/`, `documentos/` (`?s=<sala>`) | `/acesso/boletins`, `/acesso/documentos` (`?sala=<id>`) |
| `previsoes/` | `/acesso/previsoes?sala=<id>` (atalhos para as páginas públicas de previsão) |
| `usuarios/` | `/acesso/usuarios` |
| `admin/salas.php`, `admin/tipos-boletim.php`, `admin/perfis.php` | `/acesso/salas`, `/acesso/tipos-boletim`, `/acesso/perfis` |
| `admin/logs.php` | `/acesso/auditoria` |
| `login.php`, `trocar-senha.php`, `redefinir-senha.php`, `esqueci-senha.php` | mesmos nomes, sem `.php` |

Os endereços antigos redirecionam para os novos (`next.config.ts`).

- **Diferença mantida de propósito:** salas, módulos e tipos de boletim continuam no banco (no PHP foram para `config/estrutura.php` em 28/09). A migração `0004` traz para o banco o que mudou no arquivo do PHP até 02/10.
- **Permissão `administrar_boletins`** (PHP de 02/10): edita e exclui qualquer boletim da sala, inclusive publicado. Só o Administrador do Sistema tem de início.
- **Boletim Diário PCJ** (`/acesso/boletim_pcj`, permissão `criar_boletim` na sala PCJ): mesma página editável do PHP, com o script e o CSS originais em `public/acesso/boletim_pcj/`. Os dados vêm de `/api/acesso/boletim_pcj/dados` (`src/lib/boletins-sala/pcj.ts`).
  - **Médias históricas:** "Salvar médias do mês" grava no banco (tabela `configuracoes`, migração `0005`), não mais em arquivo. Enquanto ninguém salvar, valem as de `src/conteudo/pcj-medias.json`.
  - **Chuva dos meses fechados:** pedida ao SIBH um mês por vez, por dia. Agrupado por mês, como no PHP, o SIBH leva cerca de 60 s e a consulta caía.
  - **SIBH lento:** a primeira consulta de um mês antigo às vezes passa de 20 s e é abandonada; o mês sai com `*` e vem ao clicar em "Carregar dados do SIBH" de novo.
- **Boletim Diário Vale do Paraíba** (`/acesso/boletim_paraiba`, permissão `criar_boletim` na sala): mesma página do PHP; dados em `/api/acesso/boletim_paraiba/dados` (`src/lib/boletins-sala/paraiba.ts`): chuva de 24 h e pontos em alerta (SIBH), previsão em 12 municípios (Open-Meteo) e reservatórios do SIN (SAR/ANA). Municípios e reservatórios ficam no início desse arquivo.
- **Defesa Civil** (`/acesso/defesa_civil`, para quem vê o painel de alguma sala): situação dos rios por UGRHI, texto formal e mensagem de WhatsApp prontos para copiar e mapa da UGRHI. As regras ficam em `src/lib/hidrologia/situacao-rios.ts`; o mapa usa o Leaflet e o script originais (`public/acesso/`), e as imagens de fundo vêm da Esri.
- **Scripts do PHP reaproveitados:** os de `public/acesso/boletim_*/` são copiados pelo `scripts/capturar-legado.mjs` (não edite lá; mude no PHP e rode o script). As páginas de boletim são documentos HTML completos, fora da moldura, porque viram PDF pela impressão do navegador.
- **Sistemas produtores** (`/acesso/sistemas_produtores?s=<sala>`, permissão `visualizar_graficos`): volume, chuva e vazões dos 12 últimos meses completos, com download em PNG. Séries mensais do SSD (`src/lib/hidrologia/sistemas-ssd.ts`); o catálogo do SSD fica em `src/lib/integracoes/ssd.ts`.
- **Gráficos** (`/acesso/graficos?sala=<id>`): lista com prévia, novo/editar com a tabela colada da planilha, publicar, despublicar e excluir (`src/lib/graficos.ts`; as regras da tabela, sem banco, em `graficos-tabela.ts`). O desenho é do script original (`public/acesso/js/graficos.js`).
  - **Afluência × MLT** (`/acesso/graficos/afluencia-mlt?s=<sala>`): vazão natural mensal de um sistema em até 4 anos contra a MLT, calculada da própria série do SSD desde 1930 (`src/lib/hidrologia/analise-mlt.ts`).
  - **Criar gráfico com MLT** (`/acesso/graficos/criar-mlt?s=<sala>`): chuva, vazão natural, vazão afluente ou volume de um sistema × MLT, por ano civil, período chuvoso, seco ou ano hidrológico; mês a mês, acumulado (só chuva) ou ano a ano. "Salvar na lista de gráficos" grava como rascunho; o gráfico é montado de novo no servidor a partir dos parâmetros (`src/lib/hidrologia/grafico-mlt.ts`).
  - **Gráficos com dados do SSD** (`/acesso/graficos/criar-ssd?s=<sala>`, em todas as salas com o módulo): qualquer série do catálogo do SSD. Três formatos: série no tempo (até 6 pares local + variável, diária ou mensal), comparação de anos × MLT e comparação de locais em barras. Regras em `src/lib/hidrologia/grafico-ssd.ts`; os seletores usam o script original (`ssd-seletor.js`).
  - **Ainda falta** uma tela de criação: projeções do volume útil × GDN (envio de CSV das simulações).
- **Ainda não migrado do PHP**: as projeções citadas acima, o Boletim Integrado SP Águas/CETESB, os Sumários Executivos de cheias e a cópia dos PDFs no banco (`arquivos_conteudo`).

## Primeira instalação (desenvolvimento, Windows)

1. **Criar o banco e as tabelas** (pede a senha do usuário `postgres`, sem mostrá-la na tela):

   ```powershell
   npm install
   powershell -ExecutionPolicy Bypass -File scripts\criar-banco-local.ps1
   ```

   O script cria o usuário `ssap_app` (sem superusuário) com uma senha forte gerada na hora e o banco `ssap` pertencendo a ele. Depois grava `DATABASE_URL` no `.env.local` e aplica as migrações. Se o banco já existir, ele mostra as tabelas e só apaga com confirmação.

2. **Criar o administrador e subir:**

   ```powershell
   npm run admin:criar    # a senha é digitada sem aparecer na tela
   npm run dev            # http://localhost:3000/acesso
   ```

As demais opções (`APP_URL`, `STORAGE_DIR`, `CACHE_DIR`, proxy) estão em `.env.example`.

## Docker

O passo a passo completo (instalação, backup, restauração, atualização, produção com HTTPS e desenvolvimento) está em **[DOCKER.md](DOCKER.md)**.

```bash
cp .env.docker.example .env.docker      # endereço público e opções
# senhas do banco em secrets/postgres_password.txt e secrets/app_db_password.txt (veja DOCKER.md)
docker compose up -d --build
docker compose run --rm ferramentas npm run admin:criar
```

| Serviço | O que é |
|---|---|
| `db` | PostgreSQL 18. Na primeira subida, `db/docker-init/` cria o usuário da aplicação sem superusuário |
| `permissoes` | Ajusta o dono dos volumes de arquivos e de cache e termina |
| `ferramentas` | Aplica as migrações e termina; também roda `admin:criar` e `integracoes:testar` |
| `app` | Next.js standalone, com usuário sem privilégios, sistema de arquivos somente leitura e checagem de saúde em `/api/saude`. Fica em `127.0.0.1:3000` |
| `proxy` | Opcional (`--profile proxy`): nginx com HTTPS na frente do site |
| `backup` / `restaurar` | Sob demanda: backup e restauração do banco e dos arquivos em `./backups` |

- **Volumes:**
  - `banco`: o PostgreSQL. Faça backup.
  - `arquivos`: PDFs e documentos. Faça backup.
  - `cache`: descartável.
- **Senhas:** as do banco ficam em arquivos de segredo (`secrets/`), fora do repositório e das variáveis de ambiente.
- **Publicação:** use o perfil `proxy` ou coloque o proxy reverso da instituição (nginx, IIS) na frente de `127.0.0.1:3000`, com `TRUST_PROXY=true` e `APP_URL` apontando para o endereço público. Em produção o login exige HTTPS.
- **Desenvolvimento:** `docker compose -f compose.yaml -f compose.dev.yaml up --build`.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `db/migrations/` | Schema e dados iniciais, em ordem (veja `db/README.md`) |
| `scripts/` | Linha de comando: `migrar.ts`, `criar-admin.ts`, `link-senha.ts`, `testar-integracoes.ts`, `criar-banco-local.ps1`, `capturar-legado.mjs` |
| `src/conteudo/` | Conteúdo fixo vindo do PHP: páginas de texto (`legado/`) e curvas de contingência |
| `public/legado/`, `public/acesso/` | Imagens, logos e PDFs copiados do PHP |
| `src/lib/acesso/` | Menu lateral e indicadores do painel da área restrita |
| `src/components/acesso/` | Moldura (topo + menu), cabeçalho de página, campo de senha, indicadores |
| `src/lib/` | Banco (`db.ts`), configuração (`env.ts`, `config.ts`), auditoria |
| `src/lib/auth/` | Senhas (argon2id), sessões, login, links de senha e permissões por sala |
| `src/lib/admin/` | Regras de usuários, perfis, salas, tipos de boletim e consulta da auditoria |
| `src/lib/boletins.ts` | Boletins: criação, edição, fluxo de status, versões |
| `src/lib/documentos.ts` | Documentos: envio, edição, exclusão, consulta pública |
| `src/lib/storage.ts`, `arquivos.ts` | Arquivos no disco (fora da pasta pública) e download seguro |
| `src/lib/publico.ts` | Consultas do site público (só boletins publicados) |
| `src/lib/integracoes/` | Fontes externas: SABESP, ANA, SIBH, SSD (SP Águas), Open-Meteo, IBGE, com cache e status |
| `src/lib/hidrologia/` | Regras das telas de dados (reservatórios: estágios, Cantareira pela ANA, comparações) |
| `src/components/graficos/` | Gráficos (barras, colunas, linha, medidor, dica, tabela de dados) |
| `tests/` | Testes automatizados sem rede (`npm test`) |
| `src/app/acesso/` | Páginas públicas da área restrita: login, troca de senha, definir senha por link |
| `src/app/acesso/(app)/` | Páginas logadas: início, boletins, usuários, salas, tipos de boletim, perfis, auditoria |
| `src/app/(site)/` | Site público: início, reservatórios, chuvas, vazões, previsão, boletins (`/boletins`, `/boletins/diario`, `mensal`, `spi`, `integrado`) e `/documentos` |
| `src/app/api/publico/` | API pública em JSON (`/api/publico/boletins`, `/api/publico/documentos`) |
| `src/proxy.ts` | Recusa POST/PUT/DELETE em `/api` vindos de outra origem |

## Usuários

- **Cadastro sem senha:** o administrador não define a senha de ninguém. Ao cadastrar, o sistema mostra uma única vez um link de uso único, válido por 72 horas, para o próprio usuário criar a senha. O link de redefinição vale 24 horas, e gerar um novo invalida o anterior.
- **Proteções:** ninguém desativa, exclui ou tira o próprio perfil de administrador. O sistema também não deixa ficar sem nenhum Administrador do Sistema ativo.
- **Efeito imediato:** desativar, bloquear ou excluir um usuário encerra as sessões dele na hora.
- **Auditoria:** o administrador vê todos os registros; o gestor de sala vê só os das salas dele.

Sem servidor de e-mail, o administrador envia o link ao usuário por um canal seguro, como o e-mail institucional ou o Teams. Defina `APP_URL` no `.env.local` para que o link use o endereço público.

**Esqueceu a senha e não há outro administrador?** Quem tem acesso ao servidor gera o link pelo terminal:

```powershell
npm run senha:link -- <login ou e-mail>
```

O link é de uso único, vale 24 horas, invalida os anteriores e fica registrado na auditoria. Definir a nova senha também tira o bloqueio temporário por tentativas.

## Perfis, salas e tipos de boletim

- **Perfis** (`gerenciar_permissoes`): a matriz perfil × permissão vale na hora. O Administrador do Sistema tem sempre todas as permissões, para ninguém trancar o sistema por engano. Perfis de fábrica ou atribuídos a algum usuário não podem ser excluídos.
- **Salas** (`gerenciar_salas`): o identificador fica fixo depois de criado. Sala não é apagada; desativada, ela some das telas e os dados ficam preservados. Os módulos são habilitados por sala.
- **Tipos de boletim** (`gerenciar_salas`): a sala e o identificador ficam fixos. Cada tipo define a periodicidade, se exige revisão antes de publicar, se é público ou interno e se está ativo.

## Boletins

- **Cadastro:** por upload do PDF, até 30 MB. O arquivo é aceito só com extensão `.pdf` e assinatura `%PDF-`. Ele é gravado em `STORAGE_DIR` (padrão `./storage`, fora da pasta pública) com nome aleatório, e o SHA-256 fica registrado.
- **Fluxo:** rascunho → em revisão → aprovado → publicado, com as opções de devolver (exige motivo), despublicar, arquivar e reabrir.
  - Cada passo exige uma permissão **na sala do boletim**.
  - Um tipo sem revisão obrigatória pode publicar direto do rascunho.
  - Um tipo interno nunca é publicado.
- **Versões:** cada mudança gera uma versão, e o PDF de cada versão continua disponível. Boletim publicado não pode ser editado nem excluído: é preciso despublicar antes.
- **Site público:**
  - `/boletins/<tipo>` mostra os 7 mais recentes, com pesquisa em todo o histórico, e `/boletins` lista todos com filtros.
  - O PDF só sai em `/boletins/arquivo/<id>` se o boletim estiver publicado.
  - Os endereços antigos (`boletim-diario.php` e outros) redirecionam para as páginas novas.

## Documentos

- **Formatos:** notas técnicas, relatórios, atas etc., em PDF, DOCX, XLSX, PPTX, CSV, TXT, PNG, JPG ou ZIP, até 30 MB. A extensão precisa bater com o conteúdo: PDF começa com `%PDF-`, Office e ZIP com `PK`, PNG e JPG com as assinaturas próprias, e CSV/TXT não podem conter bytes binários.
- **Categorias:** as comuns a todas as salas, mais as próprias de cada sala.
- **Permissões, na sala do documento:** ver, enviar/editar e excluir. A sala do documento não muda depois do envio.
- **Arquivos:** ao substituir um arquivo, o anterior continua no disco para rastreabilidade. A exclusão é lógica.
- **Site e navegador:** documentos marcados como públicos aparecem em `/documentos` e na API. Só PDF e imagens abrem no navegador; os demais formatos são baixados.

## Integrações externas

Toda consulta a fonte externa passa por `src/lib/integracoes/`. Nenhuma página chama uma API diretamente.

| Fonte | Dados | Cache |
|---|---|---|
| SABESP — Mananciais | resumo diário dos 7 sistemas produtores + SIM | 30 min no dia corrente; dia passado, permanente |
| ANA — SAR | volume do Cantareira ("Dado: ANA") e do Jaguari/Paraíba do Sul | 1 h; dia passado, permanente |
| SIBH — SP Águas | chuva da última hora em ~1100 postos | 10 min |
| SP Águas — SSD | séries temporais; transposição Jaguari → Atibainha e limite anual | 1 h |
| Open-Meteo | previsão por sistema, por ponto e em grade do Estado; geocodificação | 1 h; geocodificação, 30 dias |
| IBGE | municípios de SP | 30 dias |

- **Cache:** fica em memória e em arquivo (`CACHE_DIR`, padrão `./.cache/integracoes`). É descartável e não precisa de backup.
- **Pedidos simultâneos:** viram uma única chamada à fonte.
- **Fonte fora do ar:** a tela mostra o último dado guardado, marcado como desatualizado (até 7 dias). Depois de uma falha, a fonte só é chamada de novo após 1 minuto.
- **Recuo de datas:**
  - SABESP: o dia só conta com pelo menos 5 dos 7 sistemas com volume, porque a publicação sai aos poucos de manhã. Senão, usa o dia anterior.
  - ANA: o Paraíba do Sul chega com 1 dia de atraso, então o recuo vai até 7 dias.
- **Segurança:** o certificado TLS é sempre verificado. Atrás de proxy corporativo, use `NODE_USE_ENV_PROXY=1` e `HTTPS_PROXY`.
- **Acompanhamento:** `/acesso/integracoes` mostra a situação de cada fonte. `npm run integracoes:testar` consulta todas ao vivo, pelo terminal.
- **Parâmetro regulatório:** o limite anual da transposição fica em `LIMITES_TRANSPOSICAO` (`ssd.ts`). Atualize quando sair um novo comunicado.

## Reservatórios (`/reservatorios`)

- **Fontes:** SABESP para o resumo diário dos 7 sistemas e do SIM, recuando para o dia anterior enquanto a SABESP não publica o dia completo. ANA para o Cantareira, com o rótulo "Dado: ANA" e queda para o valor da SABESP se a ANA estiver fora. ANA para o Jaguari. SP Águas para a transposição.
- **Estágios do Protocolo de Escassez:** E0 Normal (≥ 60%), E1 Atenção (≥ 40%), E2 Alerta (≥ 30%), E3 Crítico (≥ 20%), E4 Emergência (< 20%). Aparecem sempre com código e nome, nunca só pela cor.
- **Comparação:** com o **mesmo dia do ano anterior**. A referência fixava 2025.
- **Diferença do dia:** calculada sempre com a mesma fonte (SABESP com SABESP).
- **Séries desde 2010:** Cantareira e SIM. Valores negativos indicam uso da reserva técnica (2014–2015).
- **Carregamento:** as seções mais lentas carregam em seguida, sem travar o resto da página. A primeira visita do dia leva alguns segundos; as seguintes usam o cache.
- **Gráficos:** desenhados no servidor, com dica no mouse e no teclado e tabela equivalente. As cores foram validadas para daltonismo e para os temas claro e escuro.

## Layout do site público

As páginas públicas seguem o layout e os menus do site PHP: mesmo cabeçalho com submenus (Análises, Boletins, Documentos e Outorgas), faixa de título, cartões de seção e rodapé. Os CSS do PHP ficam copiados em `src/styles/legado/`, e os ajustes ficam em `src/styles/site.css`. O site público usa sempre o tema claro.

- **Endereços:** os mesmos nomes do PHP, sem `.php` (`/precipitacao`, `/vazao`, `/previsao-reservatorios`, `/protocolo_escassez`...). Os endereços `.php` antigos e as rotas da primeira versão (`/chuvas`, `/vazoes`, `/previsao/sistemas`) redirecionam para as novas (veja `next.config.ts`).
- **Páginas de texto fixo** (Protocolo de Escassez, Deliberação nº 10/2025, Notas Informativas, Deliberação CRH nº 287, Resolução ANA/DAEE nº 925, Monitoramento Hidrológico, Outorgas): o conteúdo é o HTML que o próprio PHP gera, capturado por `node scripts/capturar-legado.mjs` para `src/conteudo/legado/`. Quando o texto mudar no PHP, rode o script de novo; para mudar só aqui, edite o PHP de referência ou transforme a página numa rota comum. Os CSS do layout antigo do PHP ficam presos ao bloco `.doc-legado` (`src/styles/legado/antigo-*.css`).
- **Páginas com dados:**
  - `/evolucao-sim-cant`: Cantareira e SIM no mesmo dia de cada ano (SABESP).
  - `/curva_contingencia`: curvas de referência (`src/conteudo/curva-contingencia.json`, vindas de `series/*.csv` do PHP) × observado. A primeira abertura de um período novo consulta a SABESP dia a dia e demora (cerca de 25 s para 5 meses); depois vem do cache.
  - `/vazoes-outorgadas`: captação × limite de retirada. Os limites são parâmetro regulatório e ficam em `OUTORGAS` (`src/lib/hidrologia/outorgas.ts`).
  - `/atos-administrativos-outorga`: lista em `atos.ts`, PDFs em `public/legado/outorga/`.
- **Arquivos estáticos do PHP** (logos, imagens, PDFs das notas e das outorgas): copiados de `assets/` e `outorga/` para `public/legado/`.
- **`next dev` com 404 em todas as páginas** depois de apagar ou renomear uma rota: pare o servidor, apague a pasta `.next` e suba de novo.
- **Defeito do PHP corrigido:** entre 1200 e 1399 px o menu transbordava a tela; o espaçamento foi apertado nessa faixa.

## Página inicial (`/`)

Mesma estrutura do `index.php`: faixa com a previsão do município escolhido, Acesso rápido, Chuva Agora, Acompanhamento de Volume, Previsão dos Sistemas Produtores, Salas de Situação, Faixas de atuação e Destaques.

- **Chuva Agora:** rede do SIBH na última hora; conta como "posto com chuva" o valor acima de 0,2 mm, e lista as 5 maiores leituras.
- **Previsão do município:** escolhido na lista do IBGE e enviado pela URL (`?municipio=`), funcionando também sem JavaScript.

## Precipitação (`/precipitacao`) e Vazões (`/vazao`)

- **Sistemas produtores:** dia, últimos 7 dias, mês, média histórica, % da MLT e o mesmo mês no ano anterior e nos anos de crise de 2021 e 2014.
- **SIM:** nas chuvas é a média dos 7 sistemas (regra da referência); nas vazões é o agregado informado pela SABESP.
- **Gráficos:** dois gráficos de um eixo cada (mês × média histórica e % da MLT, com linha em 100%), no lugar do gráfico único da referência com 7 séries e segundo eixo.
- **Diferenças em relação à referência:** "7 dias" são os 7 dias que terminam na data usada (a referência somava 8 na chuva), e o ano anterior acompanha a data, em vez de 2025 fixo.

## Previsão (`/previsao` e `/previsao-reservatorios`)

- **Por município:** o nome é aceito só se estiver na lista oficial do IBGE (sem diferenciar acento nem maiúscula); as coordenadas vêm da geocodificação da Open-Meteo, e a capital tem coordenada fixa.
- **Mapa do Estado:** grade de 165 pontos da Open-Meteo, recortada pelo contorno oficial de SP (malha do IBGE), para hoje, 48 h, 72 h ou 7 dias.
  - A escala de chuva vai de "< 1" a "≥ 60 mm", em 7 degraus de azul validados nos temas claro e escuro.
  - Passar o mouse numa célula mostra o valor e as coordenadas.
- **Sistemas produtores:** panorama em cartões, mapa com os pontos dos sistemas, evolução diária em mapa de calor e tabela Hoje / 48 h / 72 h / 7 dias. No PHP, as colunas "Hoje" e "24 h" mostravam o mesmo valor; aqui cada coluna tem o seu acumulado.

**Backup:** faça backup da pasta `STORAGE_DIR` junto com o banco. Os PDFs ficam só no disco.

**Formulários com Server Actions:** passe identificadores em campos ocultos (`<input type="hidden" name="id">`), não com `acao.bind(null, id)` num componente cliente. No envio sem JavaScript, a ação vinculada deixava a resposta presa.

## Segurança

Os mesmos parâmetros da referência:

- **Sessão:** vale por 60 minutos sem uso e no máximo 8 horas desde o login.
- **Bloqueio da conta:** após 5 senhas erradas seguidas, a conta fica bloqueada por 15 minutos.
- **Bloqueio do IP:** após 20 falhas a partir do mesmo IP em 15 minutos, o endereço é recusado.
- **Senha:** no mínimo 10 caracteres, com letras e números, sem o nome, o login ou o e-mail.

Como funciona:

- **Sessão:** o cookie `HttpOnly`, `SameSite=Strict` e `Secure` (em produção) leva um token aleatório. O banco guarda só o SHA-256 do token.
- **Revogação:** trocar a senha encerra as outras sessões do usuário. O logout, a desativação ou o bloqueio da conta invalidam a sessão na hora.
- **CSRF:** as Server Actions conferem a origem sozinhas, e as rotas `/api` passam pelo `proxy.ts`.
- **Auditoria:** somente inserção, garantida por trigger no banco.

**Em produção**, rode atrás de um proxy reverso (IIS/nginx) com HTTPS e `TRUST_PROXY=true`. Sem ele, o IP do cliente pode ser forjado, e o limite por IP deixa de ser confiável. O bloqueio por conta continua valendo.
