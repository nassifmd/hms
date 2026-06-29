-- ============================================================
-- BPE (Basic Periodontal Examination) table
-- Stores sextant scores (0–4, *) per dental chart
-- ============================================================

CREATE TABLE IF NOT EXISTS dental_bpe_examinations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dental_chart_id UUID NOT NULL REFERENCES dental_charts(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    examination_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Sextant scores: 0-4, or '*' for furcation involvement; NULL = not recorded
    sextant_1       VARCHAR(2),  -- Upper right  (17-14)
    sextant_2       VARCHAR(2),  -- Upper anterior (13-23)
    sextant_3       VARCHAR(2),  -- Upper left   (24-27)
    sextant_4       VARCHAR(2),  -- Lower left   (34-37)
    sextant_5       VARCHAR(2),  -- Lower anterior (33-43)
    sextant_6       VARCHAR(2),  -- Lower right  (44-47)
    overall_score   VARCHAR(2),  -- Highest sextant score
    clinical_notes  TEXT,
    treatment_need  VARCHAR(100), -- Derived treatment recommendation
    examined_by     UUID REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dental_bpe_chart   ON dental_bpe_examinations(dental_chart_id);
CREATE INDEX idx_dental_bpe_patient ON dental_bpe_examinations(patient_id);
