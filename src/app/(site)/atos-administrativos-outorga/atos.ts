/**
 * Atos administrativos de outorga dos Sistemas Produtores da RMSP
 * (lista de atos-administrativos-outorga.php do site PHP).
 *
 * Os PDFs ficam em public/legado/outorga/ (uma subpasta por sistema produtor).
 * Para incluir um ato: copie o PDF para a subpasta do sistema e acrescente a linha aqui.
 */
export type Ato = {
  sistema: string;
  tipo: string;
  numero: string;
  data: string;
  orgao: string;
  interessado: string;
  municipio: string;
  assunto: string;
  pdf: string;
};

// prettier-ignore
export const ATOS: Ato[] = [
  { sistema: 'Cantareira', tipo: 'Resolução ANA', numero: 'nº 1.931', data: '30/10/2017', orgao: 'ANA', interessado: 'SABESP', municipio: 'RMSP', assunto: 'Outorga de direito de uso pelo prazo de 10 anos (Documento nº 00000.071669/2017-32).', pdf: 'outorga/SistemaCantareira/RES_ANA_1931-2017.pdf' },
  { sistema: 'Cantareira', tipo: 'Portaria DAEE', numero: 'nº 4.563', data: '11/12/2017', orgao: 'DAEE', interessado: 'SABESP', municipio: 'RMSP', assunto: 'Direito de uso de recursos hídricos — Sistema Cantareira.', pdf: 'outorga/SistemaCantareira/DU.Port.Daee_4563.17_Sabesp_17.12.11.pdf' },
  { sistema: 'Cantareira', tipo: 'Resolução Conjunta ANA/DAEE', numero: 'nº 925', data: '29/05/2017', orgao: 'ANA / DAEE', interessado: 'SABESP', municipio: 'RMSP', assunto: 'Condições de operação do Sistema Cantareira — reservatórios Jaguari-Jacareí, Cachoeira, Atibainha e Paiva Castro (Documento nº 00000.031749/2017-55).', pdf: 'outorga/SistemaCantareira/Resolucao_Conjunta_ANA_DAEE_No_925_de_29-05-2017.pdf' },
  { sistema: 'Cantareira', tipo: 'Resolução Conjunta ANA/DAEE', numero: 'nº 926', data: '29/05/2017', orgao: 'ANA / DAEE', interessado: 'SABESP', municipio: 'RMSP', assunto: 'Sistema Cantareira (Documento nº 00000.031750/2017-80).', pdf: 'outorga/SistemaCantareira/Resolucao_Conjunta_ANA_DAEE_No_926_de_29-05-2017.pdf' },
  { sistema: 'Alto Tietê', tipo: 'Portaria DAEE', numero: 'nº 733', data: '09/02/2024', orgao: 'DAEE', interessado: 'SABESP', municipio: 'RMSP', assunto: 'Outorga de direito de uso — Sistema Produtor Alto Tietê (Processo DAEE nº 9916321).', pdf: 'outorga/AltoTiete/Portaria733_SPAT.pdf' },
  { sistema: 'Guarapiranga', tipo: 'Portaria DAEE', numero: 'nº 515', data: '04/02/2022', orgao: 'DAEE', interessado: 'SABESP', municipio: 'São Paulo', assunto: 'Reversão de bacia — Rio Capivari (Reservatório Capivari) para o Reservatório Guarapiranga.', pdf: 'outorga/Guarapiranga/Portaria 515_04-02-2022_ReversãoCapivariReservatorioGuarapiranga.pdf' },
  { sistema: 'Guarapiranga', tipo: 'Portaria DAEE', numero: 'nº 2.139', data: '07/04/2021', orgao: 'DAEE', interessado: 'SABESP', municipio: 'São Paulo', assunto: 'Reversão do braço Taquacetuba para o Reservatório Guarapiranga.', pdf: 'outorga/Guarapiranga/Portaria 2139_07-04-2021ReversãoTaquacetubaReservatorioGuarapiranga.pdf' },
  { sistema: 'Guarapiranga', tipo: 'Portaria DAEE', numero: 'nº 4.409', data: '14/07/2021', orgao: 'DAEE', interessado: 'SABESP', municipio: 'São Paulo', assunto: 'Retificação da Portaria DAEE nº 2.139/2021 — reversão Taquacetuba / Guarapiranga.', pdf: 'outorga/Guarapiranga/Portaria4409_15-07-2021RetifPort2139_ReversãoTaquacetubaReservatorioGuarapiranga.pdf' },
  { sistema: 'Guarapiranga', tipo: 'Portaria DAEE', numero: 'nº 2.192', data: '05/04/2021', orgao: 'DAEE', interessado: 'SABESP', municipio: 'São Paulo', assunto: 'Concessão para captação superficial na Represa Guarapiranga, 57.600 m³/h, prazo de 120 meses (Processo DAEE nº 9912990).', pdf: 'outorga/Guarapiranga/CA/2192_ATO202104140.pdf' },
  { sistema: 'Guarapiranga', tipo: 'Portaria DAEE', numero: 'nº 2.332', data: '12/04/2021', orgao: 'DAEE', interessado: 'SABESP', municipio: 'São Paulo', assunto: 'Captação superficial na Represa Guarapiranga (Processo DAEE nº 9912990); retificada pela Portaria DAEE nº 620/2022.', pdf: 'outorga/Guarapiranga/CA/2332.pdf' },
  { sistema: 'Guarapiranga', tipo: 'Portaria DAEE', numero: 'nº 620', data: '03/02/2022', orgao: 'DAEE', interessado: 'SABESP', municipio: 'São Paulo', assunto: 'Retificação da Portaria DAEE nº 2.332/2021 — captação para a ETA Alto da Boa Vista: vazão média mensal máxima de 50.400 m³/h.', pdf: 'outorga/Guarapiranga/CA/Portaria 620_3-02-2022 Captação ETA Boa Vista.pdf' },
  { sistema: 'Cotia', tipo: 'Portaria DAEE', numero: 'nº 1.176', data: '03/03/2022', orgao: 'DAEE', interessado: 'SABESP', municipio: 'Cotia', assunto: 'Captação para a ETA Alto Cotia.', pdf: 'outorga/Cotia/Portaria1176_03-03-2022__CapataçãoETAAltoCotia.pdf' },
  { sistema: 'Cotia', tipo: 'Portaria DAEE', numero: 'nº 3.975', data: '22/12/2016', orgao: 'DAEE', interessado: 'SABESP', municipio: 'Cotia', assunto: 'Captação para a ETA Baixo Cotia.', pdf: 'outorga/Cotia/Portaria3975_22-12-2016_CaptaçãoETABaixoCotia.pdf' },
  { sistema: 'Rio Grande', tipo: 'Portaria DAEE', numero: 'nº 2.920', data: '18/06/2020', orgao: 'DAEE', interessado: 'SABESP', municipio: 'RMSP', assunto: 'Reversão Rio Grande / Taiaçupeba / Rio Pequeno.', pdf: 'outorga/RioGrande/Portaria2920_18-06-2020_Reversão_Rio Grande_Taiaçupeba_Rio Pequeno_Rio Grande.pdf' },
  { sistema: 'Rio Grande', tipo: 'Portaria DAEE', numero: 'nº 3.373', data: '27/06/2018', orgao: 'DAEE', interessado: 'SABESP', municipio: 'RMSP', assunto: 'Captação para a ETA Ribeirão da Estiva.', pdf: 'outorga/RioGrande/Portaria 3373_27-06-2018_Captação ETA Ribeirão da Estiva.pdf' },
  { sistema: 'Rio Grande', tipo: 'Portaria DAEE', numero: 'nº 2.443', data: '03/08/2017', orgao: 'DAEE', interessado: 'SABESP', municipio: 'RMSP', assunto: 'Captação para a ETA Rio Grande.', pdf: 'outorga/RioGrande/Portaria2443_03-08-2017_CaptaçãoETARioGrande.pdf' },
  { sistema: 'Rio Claro', tipo: 'Portaria DAEE', numero: 'nº 2.792', data: '18/11/2023', orgao: 'DAEE', interessado: 'SABESP', municipio: 'RMSP', assunto: 'Sistema Rio Claro — captações e reservação.', pdf: 'outorga/RioClaro/Portaria279218-11-2023_4CA_2LA_6BASistemaRioClaro.pdf' },
  { sistema: 'Rio Claro', tipo: 'Portaria DAEE', numero: 'nº 2.518', data: '11/08/2015', orgao: 'DAEE', interessado: 'SABESP', municipio: 'RMSP', assunto: 'Reversão do Ribeirão Guaratuba para o Sistema Rio Claro.', pdf: 'outorga/RioClaro/Portaria2518_11-08-2015_ReversãoGuaratuvaparaRioClaro.pdf' },
  { sistema: 'São Lourenço', tipo: 'Portaria DAEE', numero: 'nº 3.062', data: '17/09/2021', orgao: 'DAEE', interessado: 'SABESP', municipio: 'RMSP', assunto: 'Captação — Sistema Produtor São Lourenço.', pdf: 'outorga/SaoLourenco/Portaria3062_17.09.21_CaptaçãoSãoLourenço.pdf' },
];
