BEGIN;

CREATE TABLE IF NOT EXISTS sedes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    acronimo VARCHAR(50) UNIQUE NOT NULL,
    estado BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    old_id INTEGER 
);

-- Copy Sedes
INSERT INTO sedes (nombre, acronimo, estado, old_id)
SELECT nombre, acronimo, estado, id
FROM dependencias
WHERE tipo IN ('sede', 'universidad', 'extension')
ON CONFLICT (acronimo) DO NOTHING;

-- Add col
ALTER TABLE dependencias ADD COLUMN IF NOT EXISTS sede_id INTEGER REFERENCES sedes(id);

-- Update logic using Recursive CTE to propagate Sede down the tree
WITH RECURSIVE Ancestors AS (
    -- Logic: Find the nearest ancestor that is a Sede
    -- Actually, simpler:
    -- 1. Identify which deps are 'officially' offices (not sedes).
    -- 2. Walk up their parent_id until we hit a node that is in 'sedes' table (via old_id).
    
    -- Base case: Offices whose DIRECT parent is a Sede
    SELECT d.id as dep_id, s.id as new_sede_id
    FROM dependencias d
    JOIN sedes s ON d.parent_id = s.old_id
    WHERE d.tipo NOT IN ('sede', 'universidad', 'extension')

    UNION ALL

    -- Recursive: Offices whose parent is an Office (which has a sede_id)
    -- Wait, we can't join on 'sede_id' of parent because we are updating it.
    -- We join on Ancestors CTE.
    SELECT d.id, a.new_sede_id
    FROM dependencias d
    JOIN Ancestors a ON d.parent_id = a.dep_id
    WHERE d.tipo NOT IN ('sede', 'universidad', 'extension')
)
UPDATE dependencias d
SET sede_id = a.new_sede_id
FROM Ancestors a
WHERE d.id = a.dep_id;

-- Break Parent Links to Sedes
UPDATE dependencias
SET parent_id = NULL
WHERE parent_id IN (SELECT old_id FROM sedes);

-- Delete Old Sede Rows
-- Note: We must disable the self-referencing FK or handle cascading if any.
-- The FK "dependencias_parent_fk" is ON DELETE RESTRICT usually.
-- But we just set parent_id = NULL for children, so RESTRICT shouldn't trigger for children.
DELETE FROM dependencias WHERE tipo IN ('sede', 'universidad', 'extension');

-- Cleanup
ALTER TABLE sedes DROP COLUMN old_id;
-- ALTER TABLE dependencias ALTER COLUMN sede_id SET NOT NULL; -- Might fail if orphans exist, skip strict enforcement in migration for safety.

COMMIT;
