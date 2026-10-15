'use client';

import { useId } from 'react';

/**
 * Campo de busca com autocompletar: ao digitar, o navegador mostra as
 * sugestões que contêm o texto; escolher uma (ou limpar o campo pelo "x") já
 * envia o formulário. Enter continua buscando pelo texto digitado.
 * As sugestões vêm prontas do servidor (títulos, nomes...).
 */
export function BuscaAutocompletar({
  sugestoes,
  name,
  defaultValue = '',
  id,
  className,
  placeholder,
  rotulo,
}: {
  sugestoes: string[];
  name: string;
  defaultValue?: string;
  id?: string;
  className?: string;
  placeholder?: string;
  /** aria-label, quando o campo não tem <label>. */
  rotulo?: string;
}) {
  const lista = useId();
  const unicas = [...new Set(sugestoes.map((s) => s.trim()).filter(Boolean))];
  return (
    <>
      <input
        type="search"
        id={id}
        name={name}
        className={className}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={rotulo}
        list={lista}
        autoComplete="off"
        onInput={(e) => {
          const campo = e.currentTarget;
          const escolheu = unicas.includes(campo.value) && campo.value !== defaultValue;
          const limpou = campo.value === '' && defaultValue !== '';
          if (escolheu || limpou) campo.form?.requestSubmit();
        }}
      />
      <datalist id={lista}>
        {unicas.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
