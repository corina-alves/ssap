import type { NextConfig } from 'next';

const cabecalhosSeguranca = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Pacote mínimo para produção/Docker (.next/standalone + server.js).
  output: 'standalone',
  poweredByHeader: false,
  // pg e argon2 (módulo nativo) rodam só no Node, fora do bundle.
  serverExternalPackages: ['pg', '@node-rs/argon2'],
  experimental: {
    // Upload de PDF de boletim (até 30 MB) + folga do multipart.
    serverActions: { bodySizeLimit: '31mb' },
  },
  // Endereços do site antigo (PHP) → páginas novas, para não quebrar links salvos.
  async redirects() {
    return [
      { source: '/boletim-diario.php', destination: '/boletins/diario', permanent: true },
      { source: '/boletim-chuvas-mensal.php', destination: '/boletins/mensal', permanent: true },
      { source: '/boletim-spi.php', destination: '/boletins/spi', permanent: true },
      { source: '/boletim-integrado.php', destination: '/boletins/integrado', permanent: true },
      { source: '/boletins.php', destination: '/boletins', permanent: true },
      { source: '/reservatorios.php', destination: '/reservatorios', permanent: true },
      { source: '/precipitacao.php', destination: '/precipitacao', permanent: true },
      { source: '/vazao.php', destination: '/vazao', permanent: true },
      { source: '/previsao.php', destination: '/previsao', permanent: true },
      { source: '/index.php', destination: '/', permanent: true },
      { source: '/boletim-integrado-mensal.php', destination: '/boletins/integrado', permanent: true },
      { source: '/protocolo-escassez.php', destination: '/protocolo_escassez', permanent: true },
      { source: '/resolucao-regulatorio-ana-spaguas.php', destination: '/resolucao_regulatorio_ana_spaguas', permanent: true },
      { source: '/documentos/:categoria(resolucoes-cantareira|deliberacoes|atos-administrativos|outros-documentos).php', destination: '/documentos/:categoria', permanent: true },
      {
        source:
          '/:pagina(monitoramento_hidrologico|protocolo_escassez|protocolo|curva_contingencia|evolucao-sim-cant|nota_informativa|nota_informativa_conjunta|nota_informativa_conjunta2|resolucao_regulatorio_ana_spaguas|deliberacao_dss|situacao-outorgas|vazoes-outorgadas|atos-administrativos-outorga).php',
        destination: '/:pagina',
        permanent: true,
      },
      { source: '/previsao-reservatorios.php', destination: '/previsao-reservatorios', permanent: true },
      { source: '/painel/index.php', destination: '/painel', permanent: true },
      // Notas informativas conjuntas: em vez de página, abrem o PDF assinado.
      { source: '/nota_informativa_conjunta', destination: '/legado/nota_tecnica_arsesp_spaguas/SEI_0100243788_Informacao.pdf', permanent: false },
      { source: '/nota_informativa_conjunta2', destination: '/legado/nota_tecnica_arsesp_spaguas/Nota_Informativa_Conjunta2026-2027.pdf', permanent: false },
      // Endereços da área /acesso do PHP → páginas equivalentes no Next.
      { source: '/acesso/:pagina(login|trocar-senha|redefinir-senha|esqueci-senha).php', destination: '/acesso/:pagina', permanent: true },
      { source: '/acesso/:pagina(painel|index)(\\.php)?', destination: '/acesso', permanent: true },
      { source: '/acesso/admin/logs(\\.php)?', destination: '/acesso/auditoria', permanent: true },
      { source: '/acesso/admin/:pagina(salas|perfis|tipos-boletim)(\\.php)?', destination: '/acesso/:pagina', permanent: true },
      { source: '/acesso/salas/sala.php', destination: '/acesso/salas/sala', permanent: true },
      // Rotas da primeira versão em Next, antes de seguir os nomes do PHP.
      { source: '/chuvas', destination: '/precipitacao', permanent: true },
      { source: '/vazoes', destination: '/vazao', permanent: true },
      { source: '/previsao/sistemas', destination: '/previsao-reservatorios', permanent: true },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: cabecalhosSeguranca }];
  },
};

export default nextConfig;
