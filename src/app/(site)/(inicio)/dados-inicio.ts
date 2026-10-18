import { cache } from 'react';
import { painelReservatorios } from '@/lib/hidrologia/reservatorios';

/**
 * Painel dos reservatórios de hoje, uma consulta por requisição: "Acompanhamento
 * de Volume" e "Faixas de atuação" da página inicial usam o mesmo resultado.
 */
export const painelHoje = cache(() => painelReservatorios());
