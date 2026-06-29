-- Fix permissions for hms_user on all tables in the ghana_hms database
-- Run this as a PostgreSQL superuser (e.g., postgres)

\connect ghana_hms

-- Grant usage on the public schema
GRANT USAGE ON SCHEMA public TO hms_user;

-- Grant all privileges on all existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hms_user;

-- Grant usage/select on all existing sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hms_user;

-- Set default privileges so future tables/sequences also get grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hms_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO hms_user;

-- Explicitly grant on tables added via migrations (in case they were missed)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.notification_preferences,
    public.notification_templates,
    public.notifications,
    public.in_app_notifications,
    public.backup_history,
    public.restore_history,
    public.system_settings,
    public.report_schedules,
    public.generated_reports,
    public.job_executions,
    public.dental_treatment_plans,
    public.visual_field_tests,
    public.patient_allergies,
    public.inventory_items,
    public.inventory_batches,
    public.stock_take_logs,
    public.patient_complaints,
    public.module_licenses
TO hms_user;

-- Verify
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'hms_user'
  AND table_schema = 'public'
ORDER BY table_name;
