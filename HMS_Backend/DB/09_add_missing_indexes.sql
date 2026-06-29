-- ============================================================================
-- HMS - HOSPITAL MANAGEMENT SYSTEM
-- Migration: Add missing indexes for query performance
-- Target: patient_next_of_kin(patient_id), patient_insurance(patient_id)
-- ============================================================================

-- Index for patient_next_of_kin lookups (used by Patient.findById)
CREATE INDEX IF NOT EXISTS idx_patient_next_of_kin_patient
    ON patient_next_of_kin(patient_id);

-- Index for patient_insurance lookups (used by Patient.findById)
CREATE INDEX IF NOT EXISTS idx_patient_insurance_patient
    ON patient_insurance(patient_id);

-- Index for patients(facility_id) - used by many dashboard/report queries
CREATE INDEX IF NOT EXISTS idx_patients_facility
    ON patients(facility_id);

-- Index for visits(facility_id, visit_date) - used by dashboard referral stats
CREATE INDEX IF NOT EXISTS idx_visits_facility_date
    ON visits(facility_id, visit_date);
