-- Título fixo por tipo de boletim: quando preenchido, o título do boletim não é
-- digitado — é sempre "<titulo_fixo> — <data de referência em DD/MM/AAAA>".

BEGIN;

ALTER TABLE tipos_boletim
    ADD COLUMN IF NOT EXISTS titulo_fixo varchar(200) CHECK (btrim(titulo_fixo) <> '');

UPDATE tipos_boletim t
   SET titulo_fixo = v.titulo
  FROM (VALUES
        ('alfredo-pisani', 'sumario-tiete-pinheiros', 'Sumário Executivo Tietê Pinheiros'),
        ('alfredo-pisani', 'sumario-ribeira',         'Sumário Executivo Ribeira'),
        ('ribeira',        'sumario-cheias',          'Sumário Executivo Ribeira')
       ) AS v (sala, tipo, titulo)
  JOIN salas s ON s.slug = v.sala
 WHERE t.sala_id = s.id AND t.slug = v.tipo AND t.titulo_fixo IS NULL;

-- Boletins já cadastrados nesses tipos passam a seguir o título fixo.
UPDATE boletins b
   SET titulo = t.titulo_fixo || ' — ' || to_char(b.data_referencia, 'DD/MM/YYYY')
  FROM tipos_boletim t
 WHERE t.id = b.tipo_id AND t.titulo_fixo IS NOT NULL
   AND b.titulo IS DISTINCT FROM t.titulo_fixo || ' — ' || to_char(b.data_referencia, 'DD/MM/YYYY');

INSERT INTO schema_migrations (versao) VALUES ('0007_titulo_fixo_tipo_boletim') ON CONFLICT DO NOTHING;

COMMIT;
