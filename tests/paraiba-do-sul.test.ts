import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DIAGRAMA_PARAIBA, LOCAIS_ONS, LOCAIS_SSD_PARAIBA, TRANSFERENCIAS_ONS } from '../src/conteudo/diagrama-paraiba';
import { ehPluviometro, ehPostoAna, ehPostoSibh, VD } from '../src/conteudo/diagramas-unifilares';
import { valoresOns } from '../src/lib/hidrologia/paraiba-do-sul';
import { lerXmlAna, porDia } from '../src/lib/integracoes/ana-telemetria';
import { lerCsvOns, ultimoDia } from '../src/lib/integracoes/ons';
import { normalizar, planoNoMapa } from '../src/app/acesso/painel_interativo/posicoes-mapa';
import hidrografia from '../src/conteudo/hidrografia-paraiba.json';
import contorno from '../src/conteudo/contorno-bacia-paraiba.json';
import { semVazao } from '../src/app/acesso/painel_interativo/valores-ssd';

// Recorte real do CSV do ONS (DADOS_HIDROLOGICOS_RES_2026.csv): bacia do Paraíba do Sul em 29 e 30/09/2026
// e uma linha de outra bacia (que precisa ficar de fora).
const CSV = readFileSync(new URL('./dados/ons-paraiba-2026-09.csv', import.meta.url), 'utf8');
const ONS = lerCsvOns(CSV, 'PARAIBA DO SUL');

test('ONS: só a bacia pedida, por reservatório e dia, com os valores numéricos (vazio = null)', () => {
  assert.equal(Object.keys(ONS).length, 18);
  assert.ok(!('SFXING' in ONS), 'outra bacia ficou de fora');
  const p = ONS.PBPARA!['2026-09-30']!;
  assert.deepEqual([p.nivel, p.volumePct, p.afluente, p.defluente], [703.51, 38.46, 40, 40]);
  assert.equal(p.transferida, null);
  assert.equal(ONS.PBSTAC!['2026-09-30']!.transferida, 120, 'bombeamento de Santa Cecília');
  assert.equal(ONS.RLFONT!['2026-09-30']!.volumePct, null, 'Fontes sem volume');
});

test('ONS: último dia com dado, recuando', () => {
  assert.equal(ultimoDia(ONS.PBFUNI, '2026-10-02'), '2026-09-30');
  assert.equal(ultimoDia(ONS.PBFUNI, '2026-09-29'), '2026-09-29');
  assert.equal(ultimoDia(ONS.PBFUNI, '2026-10-20'), null, 'mais de 7 dias sem dado');
});

test('valores do diagrama: volume, hm³ pela capacidade do ONS, vazões, variação do dia e transferências', () => {
  const v = valoresOns(ONS, '2026-10-01');
  const k = (space: number, variavel: number, sufixo = '') => v[`${space}:${variavel}${sufixo}`];
  // Paraibuna (9001): o dia mais recente é 30/09, com um dia de atraso
  assert.deepEqual(k(9001, VD.volumePct), { valor: 38.46, data: '2026-09-30' });
  assert.equal(k(9001, VD.volumeHm3)!.valor, Math.round(38.46 * 2631.17) / 100);
  assert.equal(k(9001, VD.nivel)!.valor, 703.51);
  // Funil (9004): afluência e defluência; variação no dia de 29 para 30/09
  assert.equal(k(9004, VD.afluente)!.valor, 141.9);
  assert.equal(k(9004, VD.defluente)!.valor, 161);
  assert.ok(k(9004, VD.volumePct, ':dia') !== undefined);
  // usina a fio d'água: sem volume (o ONS manda "volume" acima de 100%)
  assert.equal(k(9013, VD.volumePct), undefined);
  assert.equal(k(9013, VD.defluente)!.valor, 14);
  // Tocos, sem capacidade no cadastro: sem hm³
  assert.equal(k(9008, VD.volumeHm3), null);
  // transferências
  assert.equal(v[`9101:${VD.vazao}`]!.valor, 120);
  assert.equal(v[`9103:${VD.vazao}`]!.valor, 10);
});

test('confere com o boletim da ANA nº 06 (Acompanhamento do Sistema Hidráulico Paraíba do Sul, 30/09/2026)', () => {
  // As vazões do boletim são as do ONS; os volumes diferem em décimos porque o ONS revisou os dados depois
  // ("dados consistidos sujeitos a novas revisões"): o boletim é conferência, não fonte.
  const v = valoresOns(ONS, '2026-09-30');
  const vazoes: [string, number, number, number][] = [
    ['Paraibuna', 9001, 40, 40],
    ['Santa Branca', 9002, 40, 38],
    ['Jaguari', 9003, 21, 8],
    ['Funil', 9004, 141, 161],
  ];
  for (const [nome, space, aflu, deflu] of vazoes) {
    // o boletim mostra a afluência sem decimais (141,9 sai como 141)
    assert.ok(Math.abs(v[`${space}:${VD.afluente}`]!.valor - aflu) < 1, `afluência ${nome}`);
    assert.equal(v[`${space}:${VD.defluente}`]!.valor, deflu, `defluência ${nome}`);
  }
  assert.equal(v[`9005:${VD.defluente}`]!.valor, 74, 'defluência Santa Cecília');
  assert.equal(v[`9101:${VD.vazao}`]!.valor, 120, 'bombeada em Santa Cecília');
  assert.equal(v[`9018:${VD.defluente}`]!.valor, 130, 'defluência Pereira Passos');
  const volumes: [number, number][] = [
    [9001, 38.82],
    [9002, 40.09],
    [9003, 64.93],
    [9004, 76.64],
  ];
  for (const [space, boletim] of volumes) assert.ok(Math.abs(v[`${space}:${VD.volumePct}`]!.valor - boletim) < 1, `volume ${space} perto do boletim`);
});

test('ANA telemetria: leituras do XML (nível em cm → m), da mais antiga para a mais recente, e por dia', () => {
  const xml = `<?xml version="1.0"?><DataTable><xs:schema><xs:element name="DadosHidrometereologicos" /></xs:schema>
    <diffgr:diffgram><DocumentElement>
      <DadosHidrometereologicos diffgr:id="1" msdata:rowOrder="0"><CodEstacao>58974000</CodEstacao><DataHora>2026-11-17 15:15:00 </DataHora><Vazao>931.02</Vazao><Nivel>635.00</Nivel><Chuva>0.20</Chuva></DadosHidrometereologicos>
      <DadosHidrometereologicos diffgr:id="2" msdata:rowOrder="1"><CodEstacao>58974000</CodEstacao><DataHora>2026-11-17 15:00:00 </DataHora><Vazao>935.69</Vazao><Nivel>636.00</Nivel><Chuva>0.00</Chuva></DadosHidrometereologicos>
      <DadosHidrometereologicos diffgr:id="3" msdata:rowOrder="2"><CodEstacao>58974000</CodEstacao><DataHora>2026-11-16 23:45:00 </DataHora><Nivel>640.00</Nivel><Chuva>1.40</Chuva></DadosHidrometereologicos>
    </DocumentElement></diffgr:diffgram></DataTable>`;
  const l = lerXmlAna(xml);
  assert.deepEqual(
    l.map((x) => x.t),
    ['2026-11-16 23:45', '2026-11-17 15:00', '2026-11-17 15:15'],
  );
  assert.deepEqual(l[2], { t: '2026-11-17 15:15', vazao: 931.02, nivel: 6.35, chuva: 0.2 });
  assert.equal(l[0]!.vazao, null);
  const d = porDia(l);
  assert.deepEqual(d.find((x) => x.data === '2026-11-17'), { data: '2026-11-17', vazao: 933.36, nivel: 6.36, chuva: 0.2 });
  assert.deepEqual(d.find((x) => x.data === '2026-11-16'), { data: '2026-11-16', vazao: null, nivel: 6.4, chuva: 1.4 });
});

test('diagrama: todo valor aponta para um local do ONS, uma transferência ou a transposição do SSD', () => {
  const locais = new Set<number>([...LOCAIS_ONS.map((l) => l.space), ...TRANSFERENCIAS_ONS.map((t) => t.space), ...LOCAIS_SSD_PARAIBA]);
  const valores = [...DIAGRAMA_PARAIBA.ligacoes.map((l) => l.valor), ...DIAGRAMA_PARAIBA.nos.map((n) => (n.tipo === 'reservatorio' ? undefined : n.valor))].filter((v) => v !== undefined);
  for (const v of valores) assert.ok(locais.has(v.space), `local ${v.space}`);
  for (const n of DIAGRAMA_PARAIBA.nos) if (n.tipo === 'reservatorio') assert.ok(LOCAIS_ONS.some((l) => l.space === n.space), `reservatório ${n.nome}`);
  for (const t of TRANSFERENCIAS_ONS) assert.ok(LOCAIS_ONS.some((l) => l.ons === t.de), `transferência de ${t.de}`);
});

test('diagrama: postos sem repetição e tudo dentro do desenho', () => {
  const sibh = DIAGRAMA_PARAIBA.nos.filter(ehPostoSibh).map((n) => n.sibh.id);
  const ana = DIAGRAMA_PARAIBA.nos.filter(ehPostoAna).map((n) => n.ana.codigo);
  const pluvio = DIAGRAMA_PARAIBA.nos.filter(ehPluviometro).map((n) => n.pluvio);
  for (const l of [sibh, ana, pluvio]) assert.equal(new Set<unknown>(l).size, l.length);
  assert.ok(sibh.length >= 8 && ana.length >= 8 && pluvio.length >= 8);
  const { largura, altura } = DIAGRAMA_PARAIBA;
  for (const n of DIAGRAMA_PARAIBA.nos) assert.ok(n.x >= 0 && n.x <= largura && n.y >= 0 && n.y <= altura, `${n.nome} dentro`);
  for (const l of DIAGRAMA_PARAIBA.ligacoes) for (const [x, y] of l.pontos) assert.ok(x >= 0 && x <= largura && y >= 0 && y <= altura, `ponto ${x},${y} dentro`);
});

test('transposição sem dado aparece parada (não bombeando); rio sem dado continua correndo', () => {
  const [ida, volta] = DIAGRAMA_PARAIBA.ligacoes.filter((l) => l.valor?.space === 44 || l.valor?.space === 41);
  assert.equal(semVazao(volta!, null), true, 'Atibainha → Jaguari sem dado');
  assert.equal(semVazao(ida!, 0), true, 'Jaguari → Atibainha em zero');
  assert.equal(semVazao(ida!, 7.8), false, 'Jaguari → Atibainha bombeando');
  assert.equal(semVazao({ tipo: 'rio', valor: { space: 9001, v: VD.defluente } }, null), false);
  assert.equal(semVazao({ tipo: 'rio' }, null), false);
});

test('mapa: todo nó com coordenada na bacia e todo rio do diagrama pelo traçado da hidrografia', () => {
  for (const n of DIAGRAMA_PARAIBA.nos) {
    const [lat, lon] = n.ll ?? [NaN, NaN];
    assert.ok(lat > -23.8 && lat < -20.8 && lon > -46.6 && lon < -40.9, `${n.nome}: coordenada na bacia`);
  }
  const h = hidrografia.sistemas['paraiba-do-sul'];
  // rio com o nome do rótulo (é por ele que a ponta solta segue) e num traçado só (o desenho vai de um ponto a outro por ele)
  const nomes = new Set(h.rios.map((r) => normalizar(r.n)));
  for (const l of DIAGRAMA_PARAIBA.ligacoes) if (l.rotulo) assert.ok(nomes.has(normalizar(l.rotulo.texto)), `hidrografia com o ${l.rotulo.texto}`);
  for (const r of h.rios) assert.equal(r.c.length, 1, `${r.n} num traçado só`);
  // no mapa, só túnel e bombeamento em linha reta: cada ligação de rio segue a hidrografia (mais de 2 pontos)
  const e = planoNoMapa(DIAGRAMA_PARAIBA, h.rios as never, h.aguas as never).naEscala(2 ** 9);
  DIAGRAMA_PARAIBA.ligacoes.forEach((l, k) => {
    if (l.tipo === 'rio') assert.ok(e.linhas[k]!.length > 2, `ligação ${k} (${l.rotulo?.texto ?? l.valor?.space ?? ''}) pelo rio`);
  });
});

test('mapa: contorno da bacia (ANA), só a linha, com as represas do Paraíba dentro e Lajes, Guandu e Atibainha fora', () => {
  assert.equal(DIAGRAMA_PARAIBA.mapa?.contorno, 'paraiba');
  const anel = contorno.geometry.coordinates[0] as [number, number][];
  assert.equal(contorno.geometry.coordinates.length, 1, 'um anel, sem buraco');
  assert.deepEqual(anel[0], anel.at(-1), 'anel fechado');
  assert.ok(anel.length > 1000 && anel.length < 10000, 'simplificado, sem perder a forma');
  // ponto no polígono (raio para a direita)
  const dentro = ([lat, lon]: [number, number]) => {
    let d = false;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i]!, [xj, yj] = anel[j]!;
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d;
    }
    return d;
  };
  const no = (nome: string) => DIAGRAMA_PARAIBA.nos.find((n) => n.nome === nome)!.ll!;
  for (const nome of ['Paraibuna', 'Santa Branca', 'Jaguari', 'Funil', 'Santa Cecília']) assert.ok(dentro(no(nome)), `${nome} na bacia`);
  // a água bombeada em Santa Cecília vai para a bacia do Guandu; o Atibainha é do PCJ
  for (const nome of ['Lajes', 'Atibainha']) assert.ok(!dentro(no(nome)), `${nome} fora da bacia`);
});
