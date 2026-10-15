-- PDFs de boletim como no PHP: cada tipo de boletim tem a sua pasta
-- (storage/boletins/<pasta>/<pasta>_<AAAAMMDD>.pdf) e o conteúdo do PDF fica
-- também guardado no banco — se o arquivo sumir da pasta, o sistema o regrava.

BEGIN;

-- Pasta do tipo (minúsculas, números e _). Em branco: boletim_<slug>.
ALTER TABLE tipos_boletim
    ADD COLUMN IF NOT EXISTS pasta varchar(60) CHECK (pasta ~ '^[a-z0-9_]{2,60}$');

-- As mesmas pastas de acesso/config/estrutura.php do PHP.
UPDATE tipos_boletim t
   SET pasta = v.pasta
  FROM (VALUES
        ('alfredo-pisani', 'diario',                  'boletim_diario'),
        ('alfredo-pisani', 'mensal',                  'boletim_mensal_chuva'),
        ('alfredo-pisani', 'spi',                     'boletim_spi'),
        ('alfredo-pisani', 'integrado',               'boletim_integrado_cetesb'),
        ('alfredo-pisani', 'integrado-arsesp',        'boletim_integrado_arsesp'),
        ('alfredo-pisani', 'integrado-ugrhi6',        'boletim_integrado_ugrhi6'),
        ('alfredo-pisani', 'sumario-tiete-pinheiros', 'sumario_tiete_pinheiros'),
        ('alfredo-pisani', 'sumario-ribeira',         'sumario_vale_ribeira'),
        ('pcj',            'boletim-diario',          'boletim_diario_pcj'),
        ('ribeira',        'sumario-cheias',          'sumario_vale_ribeira'),
        ('vale-paraiba',   'boletim-diario',          'boletim_diario_vale_paraiba'),
        ('cetesb',         'integrado-diario',        'boletim_integrado_cetesb_diario'),
        ('cetesb',         'integrado-mensal',        'boletim_integrado_cetesb_mensal')
       ) AS v (sala, tipo, pasta)
  JOIN salas s ON s.slug = v.sala
 WHERE t.sala_id = s.id AND t.slug = v.tipo AND t.pasta IS NULL;

-- Cópia do conteúdo dos PDFs de boletim (um registro por arquivo).
CREATE TABLE IF NOT EXISTS arquivos_conteudo (
    arquivo_id bigint PRIMARY KEY REFERENCES arquivos (id) ON DELETE CASCADE,
    dados      bytea  NOT NULL
);

INSERT INTO schema_migrations (versao) VALUES ('0006_pastas_boletins_copia_banco') ON CONFLICT DO NOTHING;

COMMIT;
