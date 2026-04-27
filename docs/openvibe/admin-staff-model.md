# Admin / staff model

Source of truth: `services/openvibe-network/server/api/staff.js`.

Role hierarchy mirrors the legacy hobo model so migrated users keep working:

```
user < streamer < global_mod < admin
```

Capability map (cumulative — a higher role inherits everything below it):

| Role        | Capabilities                                                                 |
|-------------|------------------------------------------------------------------------------|
| user        | (none)                                                                       |
| streamer    | `create_stream`, `manage_own_channel`                                        |
| global_mod  | `moderate_global`, `manage_site_bans`, `view_all_logs`                       |
| admin       | `admin_panel`, `manage_users`, `manage_roles`, `manage_settings`, `broadcast_notifications`, `manage_storage`, `manage_registry`, `manage_themes`, `manage_compat`, `manage_deploy` |

## Endpoints (mounted under `/api/v1`)

| Method | Path                          | Capability                |
|--------|-------------------------------|---------------------------|
| GET    | `/staff/capabilities`         | (any)                     |
| GET    | `/staff/global-moderators`    | `view_all_logs`           |
| PUT    | `/staff/roles/:id`            | `manage_roles`            |
| GET    | `/admin/users`                | `manage_users`            |
| PUT    | `/admin/users/:id/role`       | `manage_roles`            |
| PUT    | `/admin/users/:id/ban`        | `manage_site_bans`        |
| GET    | `/admin/audit`                | `view_all_logs`           |
| POST   | `/admin/broadcast`            | `broadcast_notifications` |

Tables (created by `ensureTables()`):

* `staff_roles(user_id PK, role, granted_by, granted_at, metadata_json)`
* `staff_audit(id PK, actor_id, actor_role, action, target_id, detail_json, recorded_at)` — append-only.

Every write goes through `recordAudit()` so the admin UI's Audit tab can show
exactly who promoted whom and when.
