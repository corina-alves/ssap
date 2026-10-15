'use client';

import { useRef, useState, useTransition } from 'react';
import { previsaoHero, type PrevisaoHero as Previsao } from './previsao-hero-acao';

/**
 * Seletor de município e previsão de hoje do cartão da página inicial. A troca
 * de município busca a previsão sem recarregar a página nem mudar o endereço.
 * Sem JavaScript, o formulário envia por GET (?municipio=) como antes.
 */
export function PrevisaoHero({ municipios, municipio, inicial }: { municipios: string[]; municipio: string; inicial: Previsao }) {
  const [previsao, setPrevisao] = useState(inicial);
  const [carregando, iniciar] = useTransition();
  const pedido = useRef(0);

  const trocar = (nome: string) => {
    const n = ++pedido.current;
    iniciar(async () => {
      const r = await previsaoHero(nome).catch((): Previsao => ({ ok: false, mensagem: 'Não foi possível carregar a previsão deste município.' }));
      // só a resposta da última escolha vale
      if (n === pedido.current) setPrevisao(r);
    });
  };

  return (
    <>
      <form method="get">
        <label htmlFor="municipioSelectHero" className="form-label">
          Selecione o município
          {carregando && (
            <span className="hp-carregando">
              <span className="spinner-border spinner-border-sm" aria-hidden /> Buscando previsão…
            </span>
          )}
        </label>
        <select id="municipioSelectHero" name="municipio" defaultValue={municipio} className="form-select hero-municipio-select" onChange={(e) => trocar(e.currentTarget.value)}>
          {municipios.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <noscript>
          <button type="submit" className="btn btn-sm btn-primary mt-2">
            Ver
          </button>
        </noscript>
      </form>
      <div id="boxPrevisaoMunicipioHero" aria-live="polite" aria-busy={carregando} style={{ opacity: carregando ? 0.55 : 1 }}>
        {previsao.ok ? (
          <>
            <h2>{previsao.nome}</h2>
            <div className="hp-previsao">
              <div className="hp-previsao__chuva">
                <i className="bi bi-cloud-rain-heavy-fill" />
                <div>
                  <strong>{previsao.chuva}</strong>
                  <small>Chuva prevista para o dia</small>
                </div>
              </div>
              <div>
                <strong>
                  <i className="bi bi-sun-fill" />
                  {previsao.tmax}
                </strong>
                <small>Temperatura máxima</small>
              </div>
              <div>
                <strong>
                  <i className="bi bi-moon-fill" />
                  {previsao.tmin}
                </strong>
                <small>Temperatura mínima</small>
              </div>
            </div>
          </>
        ) : (
          <div className="alert alert-warning mt-3 mb-0">{previsao.mensagem}</div>
        )}
      </div>
    </>
  );
}
