BEGIN;

CREATE TABLE IF NOT EXISTS campus (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    estado BOOLEAN DEFAULT true 
);

INSERT INTO campus (nombre) VALUES 
('Pasto'), 
('Ipiales'), 
('Tumaco'), 
('Túquerres')
ON CONFLICT DO NOTHING;

ALTER TABLE sedes ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campus(id);

-- Link Sedes to Campus
UPDATE sedes SET campus_id = (SELECT id FROM campus WHERE nombre='Pasto') 
WHERE nombre ILIKE '%Pasto%' OR nombre ILIKE '%Centro%' OR nombre ILIKE '%Torobajo%' OR nombre ILIKE '%Panamericana%' OR nombre ILIKE '%Universidad%';

UPDATE sedes SET campus_id = (SELECT id FROM campus WHERE nombre='Ipiales') 
WHERE nombre ILIKE '%Ipiales%';

UPDATE sedes SET campus_id = (SELECT id FROM campus WHERE nombre='Tumaco') 
WHERE nombre ILIKE '%Tumaco%';

UPDATE sedes SET campus_id = (SELECT id FROM campus WHERE nombre='Túquerres') 
WHERE nombre ILIKE '%Túquerres%';

COMMIT;
