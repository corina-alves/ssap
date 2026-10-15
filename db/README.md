# Banco de dados (PostgreSQL 15+)

As migrações ficam em `migrations/` e são aplicadas em ordem. Cada uma roda em uma transação e grava sua versão em `schema_migrations`.

| Arquivo | Conteúdo |
|---|---|
| `0001_schema.sql` | Tabelas, índices, triggers e views de publicação |
| `0002_seed.sql` | Salas, módulos, permissões, perfis, tipos de boletim e categorias. Pode rodar de novo sem duplicar nada |
| `0003_categorias_documentos_site.sql` | Categorias de documento das páginas públicas `/documentos/<categoria>` |
| `0005_configuracoes.sql` | Tabela `configuracoes`: valores editados pela área restrita (médias históricas do Boletim PCJ) |
| `0004_ajustes_acesso_php.sql` | Mudanças do PHP de 02/10: permissão `administrar_boletins`, tipo Integrado SP Águas/ARSESP, nomes novos de tipos e da sala CETESB |
| `0006_pastas_boletins_copia_banco.sql` | Pasta de cada tipo de boletim (`tipos_boletim.pasta`) e tabela `arquivos_conteudo`, com a cópia dos PDFs de boletim |
| `0007_titulo_fixo_tipo_boletim.sql` | `tipos_boletim.titulo_fixo`: tipos em que o título do boletim é fixo ("<título> — <data de referência>"), como o Sumário Executivo Tietê Pinheiros e o Sumário Executivo Ribeira |

## Criar o banco (Windows, recomendado)

Na pasta do projeto:

```powershell
npm install
powershell -ExecutionPolicy Bypass -File scripts\criar-banco-local.ps1
npm run admin:criar
npm run dev
```

O script pede a senha do usuário `postgres`, que não fica gravada. Ele cria o usuário `ssap_app` (sem superusuário) e o banco `ssap`, grava `DATABASE_URL` no `.env.local` e aplica as migrações em UTF-8. Se o banco já existir, mostra as tabelas e só apaga com confirmação.

Nenhum usuário do sistema é criado por SQL: o administrador vem do `npm run admin:criar`, que pede a senha no terminal.

## Atualizar um banco existente

```powershell
npm run db:migrar       # aplica só as migrações que faltam (usa o DATABASE_URL do .env.local)
npm run arquivos:banco  # depois da 0006: leva os PDFs de boletim já enviados para a pasta do tipo e copia para o banco
```

## Alternativa manual com psql

Os comandos `psql` falham no Windows se a codificação não for UTF-8, porque os dados iniciais têm acentos e o erro é `sequência de bytes é inválida para codificação "UTF8"`. Defina a codificação antes:

```powershell
$env:PGCLIENTENCODING = "UTF8"
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
& $psql -U postgres -c "CREATE DATABASE ssap"
& $psql -U postgres -d ssap -v ON_ERROR_STOP=1 -f db/migrations/0001_schema.sql
& $psql -U postgres -d ssap -v ON_ERROR_STOP=1 -f db/migrations/0002_seed.sql
```

Atenção: assim as tabelas pertencem ao `postgres`, e a aplicação passaria a se conectar como superusuário. Prefira o script.

## Regras que o próprio banco garante

- **E-mail e login:** únicos sem diferenciar maiúsculas. Um usuário excluído libera o e-mail e o login.
- **Perfis:** um perfil global só entra em `usuario_perfis` e um perfil de sala só entra em `usuario_salas` (FK composta com o escopo).
- **Tipo do boletim:** precisa ser da mesma sala do boletim.
- **Boletim publicado:** exige PDF e data de publicação. Enquanto ele estiver publicado, o PDF não pode ser apagado.
- **`arquivos.caminho`:** sempre relativo, sem `..` e sem unidade de disco.
- **`auditoria`:** somente inserção. `UPDATE`, `DELETE` e `TRUNCATE` são bloqueados por trigger.
- **`atualizado_em`:** preenchido por trigger.

## O que fica fora do banco

- **Arquivos:** documentos ficam no disco ou no Blob, e o banco guarda só os metadados. A exceção são os PDFs de boletim: ficam em `storage/boletins/<pasta do tipo>/<pasta>_<AAAAMMDD>.pdf` (diário, mensal, integrado...) e também em `arquivos_conteudo`; se o arquivo sumir da pasta, é regravado a partir do banco quando alguém o abre.
- **Listas fixas:** atalhos das salas, estações, links e textos de rodapé ficam em arquivos de configuração.
