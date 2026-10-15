'use client';

import { useState } from 'react';

/** Campo de senha com botão mostrar/ocultar (partials/campo_senha.php). */
export function CampoSenha({
  nome,
  rotulo,
  autoComplete,
  ajuda,
  minLength,
}: {
  nome: string;
  rotulo: string;
  autoComplete: 'current-password' | 'new-password';
  ajuda?: string;
  minLength?: number;
}) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="mb-3">
      <label htmlFor={nome} className="form-label">
        {rotulo}
      </label>
      <div className="acesso-senha">
        <input
          type={visivel ? 'text' : 'password'}
          className="form-control"
          id={nome}
          name={nome}
          autoComplete={autoComplete}
          maxLength={1024}
          minLength={minLength}
          required
        />
        <button
          type="button"
          className="acesso-senha__ver"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        >
          <i className={`bi ${visivel ? 'bi-eye-slash' : 'bi-eye'}`} />
        </button>
      </div>
      {ajuda && <div className="form-text">{ajuda}</div>}
    </div>
  );
}
