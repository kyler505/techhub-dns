# Database Retention Policy

## System Audit Logs

- **Hot table:** `system_audit_logs`
- **Archive table:** `system_audit_logs_archive`

Retention policy:

- Keep **90 days** of audit logs in `system_audit_logs`.
- Move older rows into `system_audit_logs_archive`.
- Keep **365 days** of data in `system_audit_logs_archive`, then delete older rows.

Notes:

- Maintenance is manual/scripted (no scheduler). See backend maintenance helpers.
