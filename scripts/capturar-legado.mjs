/**
 * Captura as páginas de TEXTO FIXO do site PHP (documentos, notas, protocolo)
 * e grava o conteúdo em src/conteudo/legado/, para o Next servir no mesmo layout.
 *
 *   node scripts/capturar-legado.mjs [pasta do PHP] [php.exe]
 *
 * Rode de novo quando o texto de uma dessas páginas mudar no PHP. Páginas com
 * dados (gráficos, filtros) não entram aqui: são rotas próprias em src/app/(site).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PHP_DIR = process.argv[2] ?? 'C:/xampp_/htdocs/spaguas-ss-ap';
const PHP_EXE = process.argv[3] ?? 'C:/xampp_/php/php.exe';
const RAIZ = process.cwd();

// página do PHP → 'novo' (public_layout.php: hero + <main>) ou 'antigo' (components/header.php)
const PAGINAS = {
  protocolo_escassez: 'novo',
  nota_informativa: 'novo',
  'situacao-outorgas': 'novo',
  monitoramento_hidrologico: 'novo',
};

// Páginas que existem no Next com o mesmo nome do PHP (sem .php).
const ROTAS = new Set([
  ...Object.keys(PAGINAS),
  'reservatorios', 'precipitacao', 'vazao', 'previsao', 'previsao-reservatorios', 'boletins',
  'curva_contingencia', 'evolucao-sim-cant', 'vazoes-outorgadas', 'atos-administrativos-outorga',
  // páginas próprias em React (texto em src/conteudo/)
  'resolucao_regulatorio_ana_spaguas', 'deliberacao_dss', 'protocolo',
  // redirecionam para o PDF (next.config.ts)
  'nota_informativa_conjunta', 'nota_informativa_conjunta2',
]);

function recortar(html, tipo, pagina) {
  let ini;
  let fim;
  if (tipo === 'novo') {
    ini = html.indexOf('<section class="sssp-page-hero"');
    fim = html.indexOf('</main>') + '</main>'.length;
  } else {
    ini = html.indexOf('</script>', html.indexOf('sssp-core.js')) + '</script>'.length;
    fim = html.indexOf('<script src="assets/js/btn_topo.js">');
    if (fim < 0) fim = html.indexOf('<footer');
  }
  if (ini < 20 || fim <= ini) throw new Error(`${pagina}: não achei o início/fim do conteúdo`);
  // Modais do Bootstrap ficam depois do </main> no PHP; sem eles os botões que os abrem dão erro.
  const modais = tipo === 'novo' ? html.slice(fim).match(/<div class="modal fade"[\s\S]*?\n<\/div>/g) ?? [] : [];
  return [html.slice(ini, fim), ...modais].join('\n\n');
}

function limpar(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // carimbo da hora em que o PHP montou a página: num texto fixo, enganaria
    .replace(/<small>\s*Atualizado em[^<]*<\/small>/gi, '')
    .replace(/\b(src|href)="\/?assets\/(logo|img|nota_tecnica_spaguas_arsesp)\//g, '$1="/legado/$2/')
    .replace(/\bhref="\/?(?:index(?:\.php)?)?"/g, 'href="/"')
    .replace(/\bhref="\/?([\w-]+)\.php((?:\?|#)[^"]*)?"/g, (_, nome, resto = '') =>
      nome === 'index' ? `href="/${resto}"` : ROTAS.has(nome) ? `href="/${nome}${resto}"` : `href="/${nome}.php${resto}"`)
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const destino = join(RAIZ, 'src', 'conteudo', 'legado');
mkdirSync(destino, { recursive: true });

for (const [pagina, tipo] of Object.entries(PAGINAS)) {
  const bruto = execFileSync(PHP_EXE, [`${pagina}.php`], { cwd: PHP_DIR, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const html = limpar(recortar(bruto, tipo, pagina));
  const faltando = [...html.matchAll(/"(\/legado\/[^"]+)"/g)]
    .map((m) => decodeURI(m[1]))
    .filter((u) => !existsSync(join(RAIZ, 'public', u)));
  writeFileSync(
    join(destino, `${pagina}.ts`),
    `// Gerado por scripts/capturar-legado.mjs a partir de ${pagina}.php — não edite à mão.\nexport default ${JSON.stringify(html)};\n`,
  );
  console.log(`${pagina.padEnd(36)} ${String(html.length).padStart(6)} caracteres${faltando.length ? `  ARQUIVOS AUSENTES: ${[...new Set(faltando)].join(', ')}` : ''}`);
}

// Páginas de produção de boletim da área /acesso: o miolo (<main id="boletim">)
// é HTML fixo no PHP; o script e o CSS originais ficam em public/acesso/<pasta>/.
for (const pasta of ['boletim_pcj', 'boletim_paraiba']) {
  const origem = join(PHP_DIR, 'acesso', pasta);
  const fonte = readFileSync(join(origem, 'index.php'), 'utf8');
  const m = /<main id="boletim">[\s\S]*?<\/main>/.exec(fonte);
  if (!m) throw new Error(`${pasta}: miolo não encontrado`);
  // cabeçalho repetido em cada página do boletim (função $cab do PHP)
  const cab = /\$cab = static function \(\): void \{ \?>([\s\S]*?)<\?php \};/.exec(fonte)?.[1]?.trim() ?? '';
  const html = m[0].replace(/<\?php \$cab\(\); \?>/g, cab).replace(/\b(src|data-original)="img\//g, `$1="/acesso/${pasta}/img/`);
  if (html.includes('<?')) throw new Error(`${pasta}: sobrou PHP dentro do miolo`);

  // script, CSS e imagens originais → public/acesso/<pasta>/
  const publico = join(RAIZ, 'public', 'acesso', pasta);
  mkdirSync(join(publico, 'img'), { recursive: true });
  cpSync(join(origem, 'img'), join(publico, 'img'), { recursive: true });
  copyFileSync(join(origem, 'boletim.css'), join(publico, 'boletim.css'));
  // No PHP a página chamava "dados" (dados.php na mesma pasta); aqui a rota fica em /api.
  const js = readFileSync(join(origem, 'boletim.js'), 'utf8').replace("fetch('dados'", `fetch('/api/acesso/${pasta}/dados'`);
  writeFileSync(join(publico, 'boletim.js'), js);

  writeFileSync(
    join(destino, `${pasta}.ts`),
    `// Gerado por scripts/capturar-legado.mjs a partir de acesso/${pasta}/index.php — não edite à mão.\nexport default ${JSON.stringify(html)};\n`,
  );
  console.log(`acesso/${pasta}`.padEnd(36), String(html.length).padStart(6), 'caracteres');
}

// CSS das páginas. Os do layout novo vão como estão; os do layout antigo eram
// globais no PHP e aqui ficam presos ao bloco .doc-legado (aninhamento de CSS).
const css = join(RAIZ, 'src', 'styles', 'legado');
for (const a of ['pagina-protocolo-escassez', 'pagina-nota-informativa', 'pagina-monitoramento-hidrologico', 'pagina-atos-outorga', 'pagina-curva-contingencia']) {
  copyFileSync(join(PHP_DIR, 'assets', 'css', `${a}.css`), join(css, `${a}.css`));
}
for (const a of ['estilo', 'protocolo_escassez']) {
  const texto = readFileSync(join(PHP_DIR, 'assets', 'css', `${a}.css`), 'utf8');
  const regrasGlobais = texto.match(/@(keyframes|font-face|import)[^{;]*/g) ?? [];
  writeFileSync(join(css, `antigo-${a}.css`), `/* ${a}.css do PHP, restrito a .doc-legado (gerado por scripts/capturar-legado.mjs). */\n.doc-legado {\n${texto}\n}\n`);
  console.log(`antigo-${a}.css gerado${regrasGlobais.length ? `  ATENÇÃO, regras globais: ${regrasGlobais.join(' | ')}` : ''}`);
}

// Sumários Executivos de Cheias (acesso/sumario_executivo_cheias): o HTML
// original vai inteiro (só mudam os endereços que ele chama) e é servido pela rota depois do login;
// imagens e contornos (sem dado restrito) ficam em public/acesso/sumario_executivo_cheias/.
{
  const pasta = 'sumario_executivo_cheias';
  const origem = join(PHP_DIR, 'acesso', pasta);
  const publico = join(RAIZ, 'public', 'acesso', pasta);
  for (const chave of ['ribeira_iguape', 'tiete_pinheiros']) {
    // As chamadas do sumário (proxy do SIBH e captura do diagrama) ganham os nomes das rotas do Next.
    const html = readFileSync(join(origem, `sumario_executivo_${chave}.html`), 'utf8')
      .replaceAll('api_proxy.php', 'api-sibh')
      .replaceAll('capturar_diagrama_ribeira.php', 'capturar-diagrama-ribeira')
      .replaceAll('capturar_diagrama.php', 'capturar-diagrama');
    if (/[\w-]+\.php/.test(html)) throw new Error(`sumário ${chave}: sobrou chamada a .php`);
    writeFileSync(
      join(destino, `sumario_cheias_${chave}.ts`),
      `// Gerado por scripts/capturar-legado.mjs a partir de acesso/${pasta}/sumario_executivo_${chave}.html — não edite à mão.\nexport default ${JSON.stringify(html)};\n`,
    );
    console.log(`acesso/${pasta}/${chave}`.padEnd(36), String(html.length).padStart(6), 'caracteres');
  }
  for (const a of ['img/spaguas.png', 'img/diagrama.png', 'img/diagrama_vale_do_ribeira.png', 'geo/rmsp_municipios.geojson', 'geo/ugrhi11_municipios.geojson']) {
    mkdirSync(join(publico, a, '..'), { recursive: true });
    copyFileSync(join(origem, a), join(publico, a));
  }
}

// Sumário Executivo — Situação Hídrica (acesso/sumario/sumario_novo_c_descargas.php):
// a página (HTML, estilo e script) vai como está; os dados (?ajax=1) são montados
// em src/lib/boletins-sala/sumario-hidrico.ts. "__HOJE__" é trocado pela data na rota.
{
  const fonte = readFileSync(join(PHP_DIR, 'acesso', 'sumario', 'sumario_novo_c_descargas.php'), 'utf8');
  const html = fonte
    .slice(fonte.indexOf('<!DOCTYPE html>'))
    .replace("<?= date('Y-m-d') ?>", '__HOJE__')
    .replace(/\bsrc="\.\.\/assets\/img\//g, 'src="/acesso/img/');
  if (!html.includes('__HOJE__') || html.includes('<?')) throw new Error('sumario_novo_c_descargas: sobrou PHP na página');
  writeFileSync(
    join(destino, 'sumario_hidrico.ts'),
    `// Gerado por scripts/capturar-legado.mjs a partir de acesso/sumario/sumario_novo_c_descargas.php — não edite à mão.\nexport default ${JSON.stringify(html)};\n`,
  );
  console.log('acesso/sumario'.padEnd(36), String(html.length).padStart(6), 'caracteres');
}
