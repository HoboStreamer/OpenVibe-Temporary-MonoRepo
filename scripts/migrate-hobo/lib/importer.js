'use strict';

const path = require('path');

const {
    buildEntityId,
    createNdjsonWriter,
    ensureDir,
    forEachNdjson,
    maxRole,
    normalizeServiceName,
    readManifest,
    safeJsonParse,
    writeJson,
} = require('./common');

function createStatsTracker() {
    const datasets = {};
    return {
        datasets,
        ensure(name) {
            if (!datasets[name]) {
                datasets[name] = { source_records: 0, written_records: 0, merged_records: 0, skipped_records: 0 };
            }
            return datasets[name];
        },
        bump(name, key, amount) {
            const dataset = this.ensure(name);
            dataset[key] += amount == null ? 1 : amount;
        },
    };
}

function createLazyWriters(rootDir) {
    const writers = new Map();
    return {
        get(datasetName) {
            if (!writers.has(datasetName)) {
                const filePath = path.join(rootDir, `${datasetName}.ndjson`);
                ensureDir(path.dirname(filePath));
                writers.set(datasetName, createNdjsonWriter(filePath));
            }
            return writers.get(datasetName);
        },
        async closeAll() {
            const results = {};
            for (const [datasetName, writer] of writers.entries()) {
                await writer.end();
                results[datasetName] = writer.filePath;
            }
            return results;
        },
    };
}

function tableFile(sourceRoot, tableName) {
    return path.join(sourceRoot, 'tables', `${tableName}.ndjson`);
}

function makeLegacyRef(source, table, legacyId) {
    return {
        source,
        table,
        legacy_id: String(legacyId),
    };
}

function createImportContext(sourceDir, outDir, logger) {
    const root = path.join(outDir, 'openvibe-target');
    ensureDir(root);

    return {
        logger,
        root,
        sourceRoots: {
            hobostreamer: path.join(sourceDir, 'hobostreamer'),
            hobotools: path.join(sourceDir, 'hobotools'),
        },
        manifests: {
            hobostreamer: readManifest(path.join(sourceDir, 'hobostreamer')),
            hobotools: readManifest(path.join(sourceDir, 'hobotools')),
        },
        writers: createLazyWriters(root),
        stats: createStatsTracker(),
        warnings: [],
        exclusions: [],
        userContext: {
            users: new Map(),
            hoboToolsUsersByLegacyId: new Map(),
            hoboStreamerUsersByLegacyId: new Map(),
            serviceLinks: new Map(),
            linkedAccounts: [],
            hoboStreamerLinkedAccountsByUserId: new Map(),
            usernameConflicts: [],
            anonIds: new Set(),
        },
        streamContext: {
            channelsByLegacyId: new Map(),
            managedStreamsByLegacyId: new Map(),
            streamsByLegacyId: new Map(),
        },
    };
}

async function buildUserContext(context) {
    const { sourceRoots, userContext, stats } = context;
    const hoboToolsUsers = tableFile(sourceRoots.hobotools, 'users');
    const hoboToolsLinks = tableFile(sourceRoots.hobotools, 'linked_accounts');
    const hoboStreamerLinks = tableFile(sourceRoots.hobostreamer, 'linked_accounts');
    const hoboStreamerUsers = tableFile(sourceRoots.hobostreamer, 'users');

    await forEachNdjson(hoboToolsUsers, async (row) => {
        stats.bump('identity/users', 'source_records');
        const canonicalId = buildEntityId('user', 'hobotools', row.id);
        const user = {
            id: canonicalId,
            username: row.username,
            email: row.email || null,
            password_hash: row.password_hash || null,
            display_name: row.display_name || row.username,
            avatar_url: row.avatar_url || null,
            bio: row.bio || '',
            role: row.role || 'user',
            profile_color: row.profile_color || null,
            is_banned: !!row.is_banned,
            ban_reason: row.ban_reason || null,
            token_valid_after: row.token_valid_after || null,
            primary_source: 'hobotools',
            created_at: row.created_at || null,
            updated_at: row.updated_at || null,
            last_seen: row.last_seen || null,
            legacy_refs: [makeLegacyRef('hobotools', 'users', row.id)],
            source_profiles: {
                hobotools: {
                    legacy_id: String(row.id),
                    legacy_source: row.legacy_source || null,
                    legacy_user_id: row.legacy_id != null ? String(row.legacy_id) : null,
                },
            },
        };

        userContext.users.set(canonicalId, user);
        userContext.hoboToolsUsersByLegacyId.set(String(row.id), canonicalId);

        if (row.legacy_source && row.legacy_id != null) {
            const normalizedSource = normalizeServiceName(row.legacy_source);
            userContext.serviceLinks.set(`${normalizedSource}:${row.legacy_id}`, canonicalId);
        }
    });

    await forEachNdjson(hoboToolsLinks, async (row) => {
        const normalizedService = normalizeServiceName(row.service);
        const canonicalUserId = userContext.hoboToolsUsersByLegacyId.get(String(row.user_id));
        if (!canonicalUserId) return;

        userContext.serviceLinks.set(`${normalizedService}:${row.service_user_id}`, canonicalUserId);
        userContext.linkedAccounts.push({
            id: buildEntityId('linked-account', 'hobotools', row.id),
            user_id: canonicalUserId,
            source: 'hobotools',
            service: normalizedService,
            service_user_id: String(row.service_user_id),
            service_username: row.service_username || null,
            linked_at: row.linked_at || null,
            legacy_ref: makeLegacyRef('hobotools', 'linked_accounts', row.id),
        });
    });

    await forEachNdjson(hoboStreamerLinks, async (row) => {
        const normalizedService = normalizeServiceName(row.service);
        const links = userContext.hoboStreamerLinkedAccountsByUserId.get(String(row.user_id)) || [];
        links.push({ ...row, service: normalizedService });
        userContext.hoboStreamerLinkedAccountsByUserId.set(String(row.user_id), links);
    });

    await forEachNdjson(hoboStreamerUsers, async (row) => {
        stats.bump('identity/users', 'source_records');

        const directLinkedId = userContext.serviceLinks.get(`hobostreamer:${row.id}`);
        const hoboStreamerLinksForUser = userContext.hoboStreamerLinkedAccountsByUserId.get(String(row.id)) || [];

        let canonicalId = directLinkedId || null;
        if (!canonicalId) {
            for (const link of hoboStreamerLinksForUser) {
                if (link.service === 'hobotools') {
                    canonicalId = userContext.hoboToolsUsersByLegacyId.get(String(link.service_user_id)) || null;
                    if (canonicalId) break;
                }
                canonicalId = userContext.serviceLinks.get(`${link.service}:${link.service_user_id}`) || canonicalId;
                if (canonicalId) break;
            }
        }

        if (!canonicalId) {
            canonicalId = buildEntityId('user', 'hobostreamer', row.id);
            userContext.users.set(canonicalId, {
                id: canonicalId,
                username: row.username,
                email: row.email || null,
                password_hash: row.password_hash || null,
                display_name: row.display_name || row.username,
                avatar_url: row.avatar_url || null,
                bio: row.bio || '',
                role: row.role || 'user',
                profile_color: row.profile_color || null,
                is_banned: !!row.is_banned,
                ban_reason: row.ban_reason || null,
                token_valid_after: row.token_valid_after || null,
                primary_source: 'hobostreamer',
                created_at: row.created_at || null,
                updated_at: row.updated_at || null,
                last_seen: row.last_seen || null,
                legacy_refs: [makeLegacyRef('hobostreamer', 'users', row.id)],
                source_profiles: {
                    hobostreamer: {
                        legacy_id: String(row.id),
                    },
                },
            });
        } else {
            const existing = userContext.users.get(canonicalId);
            existing.role = maxRole(existing.role, row.role || 'user');
            existing.is_banned = existing.is_banned || !!row.is_banned;
            existing.ban_reason = existing.ban_reason || row.ban_reason || null;
            existing.avatar_url = existing.avatar_url || row.avatar_url || null;
            existing.bio = existing.bio || row.bio || '';
            existing.profile_color = existing.profile_color || row.profile_color || null;
            existing.display_name = existing.display_name || row.display_name || row.username;
            existing.password_hash = existing.password_hash || row.password_hash || null;
            existing.email = existing.email || row.email || null;
            existing.legacy_refs.push(makeLegacyRef('hobostreamer', 'users', row.id));
            existing.source_profiles.hobostreamer = { legacy_id: String(row.id) };
            stats.bump('identity/users', 'merged_records');

            if (existing.username && row.username && existing.username !== row.username) {
                userContext.usernameConflicts.push({
                    canonical_user_id: canonicalId,
                    hobotools_username: existing.username,
                    hobostreamer_username: row.username,
                    legacy_id: String(row.id),
                });
            }
        }

        userContext.hoboStreamerUsersByLegacyId.set(String(row.id), canonicalId);
        userContext.serviceLinks.set(`hobostreamer:${row.id}`, canonicalId);

        for (const link of hoboStreamerLinksForUser) {
            userContext.linkedAccounts.push({
                id: buildEntityId('linked-account', 'hobostreamer', link.id || `${row.id}:${link.service}:${link.service_user_id}`),
                user_id: canonicalId,
                source: 'hobostreamer',
                service: link.service,
                service_user_id: String(link.service_user_id),
                service_username: link.service_username || null,
                linked_at: link.linked_at || null,
                legacy_ref: makeLegacyRef('hobostreamer', 'linked_accounts', link.id || `${row.id}:${link.service}:${link.service_user_id}`),
            });
            userContext.serviceLinks.set(`${link.service}:${link.service_user_id}`, canonicalId);
        }
    });
}

function canonicalUserIdFor(context, sourceName, legacyUserId) {
    if (legacyUserId == null) return null;
    if (sourceName === 'hobotools') {
        return context.userContext.hoboToolsUsersByLegacyId.get(String(legacyUserId)) || null;
    }
    if (sourceName === 'hobostreamer') {
        return context.userContext.hoboStreamerUsersByLegacyId.get(String(legacyUserId)) || null;
    }
    return null;
}

async function writeIdentityDatasets(context) {
    const usersWriter = context.writers.get('identity/users');
    const linkedWriter = context.writers.get('identity/linked-accounts');
    const conflictWriter = context.writers.get('identity/username-conflicts');

    for (const user of context.userContext.users.values()) {
        usersWriter.write(user);
        context.stats.bump('identity/users', 'written_records');
    }

    for (const link of context.userContext.linkedAccounts) {
        linkedWriter.write(link);
        context.stats.bump('identity/linked-accounts', 'written_records');
        context.stats.bump('identity/linked-accounts', 'source_records');
    }

    for (const conflict of context.userContext.usernameConflicts) {
        conflictWriter.write(conflict);
        context.stats.bump('identity/username-conflicts', 'written_records');
    }

    await forEachNdjson(tableFile(context.sourceRoots.hobotools, 'anon_users'), async (row) => {
        const record = {
            id: buildEntityId('anon-user', 'hobotools', row.id),
            source: 'hobotools',
            anon_number: row.anon_number,
            session_token: row.session_token,
            display_name: row.display_name || null,
            preferences: safeJsonParse(row.preferences, {}),
            total_messages: row.total_messages || 0,
            total_commands: row.total_commands || 0,
            first_seen: row.first_seen || null,
            last_seen: row.last_seen || null,
            legacy_ref: makeLegacyRef('hobotools', 'anon_users', row.id),
        };
        context.userContext.anonIds.add(record.id);
        context.writers.get('identity/anon-users').write(record);
        context.stats.bump('identity/anon-users', 'source_records');
        context.stats.bump('identity/anon-users', 'written_records');
    });

    const seenVerificationKeys = new Set();
    for (const sourceName of ['hobotools', 'hobostreamer']) {
        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'verification_keys'), async (row) => {
            const dedupeKey = `${row.key}`;
            if (seenVerificationKeys.has(dedupeKey)) {
                context.stats.bump('identity/verification-keys', 'merged_records');
                return;
            }
            seenVerificationKeys.add(dedupeKey);

            const record = {
                id: buildEntityId('verification-key', sourceName, row.id || row.key),
                source: sourceName,
                key: row.key,
                target_username: row.target_username,
                note: row.note || '',
                status: row.status || 'active',
                created_by_user_id: canonicalUserIdFor(context, sourceName, row.created_by),
                used_by_user_id: canonicalUserIdFor(context, sourceName, row.used_by),
                created_at: row.created_at || null,
                used_at: row.used_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'verification_keys', row.id || row.key),
            };
            context.writers.get('identity/verification-keys').write(record);
            context.stats.bump('identity/verification-keys', 'source_records');
            context.stats.bump('identity/verification-keys', 'written_records');
        });
    }

    await forEachNdjson(tableFile(context.sourceRoots.hobotools, 'user_effects'), async (row) => {
        const record = {
            id: buildEntityId('user-effect', 'hobotools', `${row.user_id}:${row.effect_type}:${row.effect_id}`),
            user_id: canonicalUserIdFor(context, 'hobotools', row.user_id),
            effect_type: row.effect_type,
            effect_id: row.effect_id,
            is_active: !!row.is_active,
            acquired_at: row.acquired_at || null,
            legacy_ref: makeLegacyRef('hobotools', 'user_effects', `${row.user_id}:${row.effect_type}:${row.effect_id}`),
        };
        context.writers.get('identity/user-effects').write(record);
        context.stats.bump('identity/user-effects', 'source_records');
        context.stats.bump('identity/user-effects', 'written_records');
    });
}

async function writeThemeAndControlPlaneDatasets(context) {
    const catalogWriter = context.writers.get('themes/catalog');
    const preferenceWriter = context.writers.get('themes/preferences');
    const preferenceStateWriter = context.writers.get('control-plane/user-preferences');

    for (const sourceName of ['hobotools', 'hobostreamer']) {
        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'themes'), async (row) => {
            const record = {
                id: buildEntityId('theme', sourceName, row.id),
                source: sourceName,
                scope: sourceName === 'hobotools' ? 'network' : 'live',
                slug: row.slug,
                name: row.name,
                author_user_id: canonicalUserIdFor(context, sourceName, row.author_id),
                description: row.description || '',
                mode: row.mode || 'dark',
                variables: safeJsonParse(row.variables, {}),
                preview_colors: safeJsonParse(row.preview_colors, {}),
                is_builtin: !!row.is_builtin,
                is_public: row.is_public == null ? true : !!row.is_public,
                tags: safeJsonParse(row.tags, []),
                created_at: row.created_at || null,
                updated_at: row.updated_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'themes', row.id),
            };
            catalogWriter.write(record);
            context.stats.bump('themes/catalog', 'source_records');
            context.stats.bump('themes/catalog', 'written_records');
        });
    }

    await forEachNdjson(tableFile(context.sourceRoots.hobotools, 'user_preferences'), async (row) => {
        const record = {
            id: buildEntityId('preference', 'hobotools', row.user_id),
            user_id: canonicalUserIdFor(context, 'hobotools', row.user_id),
            source: 'hobotools',
            scope: 'network',
            language: row.language || 'en',
            notifications_enabled: row.notifications_enabled == null ? true : !!row.notifications_enabled,
            custom_theme_variables: safeJsonParse(row.custom_theme_variables, {}),
            legacy_ref: makeLegacyRef('hobotools', 'user_preferences', row.user_id),
        };
        preferenceStateWriter.write(record);
        context.stats.bump('control-plane/user-preferences', 'source_records');
        context.stats.bump('control-plane/user-preferences', 'written_records');

        preferenceWriter.write({
            id: buildEntityId('theme-preference', 'hobotools', row.user_id),
            user_id: canonicalUserIdFor(context, 'hobotools', row.user_id),
            source: 'hobotools',
            scope: 'network',
            theme_id: row.theme_id ? buildEntityId('theme', 'hobotools', row.theme_id) : null,
            custom_variables: safeJsonParse(row.custom_theme_variables, {}),
            legacy_ref: makeLegacyRef('hobotools', 'user_preferences', row.user_id),
        });
        context.stats.bump('themes/preferences', 'source_records');
        context.stats.bump('themes/preferences', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'user_preferences'), async (row) => {
        preferenceStateWriter.write({
            id: buildEntityId('preference', 'hobostreamer', row.user_id),
            user_id: canonicalUserIdFor(context, 'hobostreamer', row.user_id),
            source: 'hobostreamer',
            scope: 'live',
            chat_settings: safeJsonParse(row.chat_settings, {}),
            legacy_ref: makeLegacyRef('hobostreamer', 'user_preferences', row.user_id),
        });
        context.stats.bump('control-plane/user-preferences', 'source_records');
        context.stats.bump('control-plane/user-preferences', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'user_themes'), async (row) => {
        preferenceWriter.write({
            id: buildEntityId('theme-preference', 'hobostreamer', row.id),
            user_id: canonicalUserIdFor(context, 'hobostreamer', row.user_id),
            source: 'hobostreamer',
            scope: 'live',
            theme_id: row.theme_id != null ? buildEntityId('theme', 'hobostreamer', row.theme_id) : null,
            custom_variables: safeJsonParse(row.custom_variables, {}),
            is_custom: !!row.is_custom,
            legacy_ref: makeLegacyRef('hobostreamer', 'user_themes', row.id),
        });
        context.stats.bump('themes/preferences', 'source_records');
        context.stats.bump('themes/preferences', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobotools, 'url_registry'), async (row) => {
        context.writers.get('control-plane/url-registry').write({
            id: buildEntityId('url-registry', 'hobotools', row.key),
            key: row.key,
            label: row.label,
            category: row.category,
            service: row.service,
            scope: row.scope,
            type: row.type,
            value: row.value,
            description: row.description || null,
            source: row.source || 'admin',
            updated_by_user_id: canonicalUserIdFor(context, 'hobotools', row.updated_by),
            updated_at: row.updated_at || null,
            legacy_ref: makeLegacyRef('hobotools', 'url_registry', row.key),
        });
        context.stats.bump('control-plane/url-registry', 'source_records');
        context.stats.bump('control-plane/url-registry', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobotools, 'oauth_clients'), async (row) => {
        context.writers.get('control-plane/oauth-clients').write({
            id: buildEntityId('oauth-client', 'hobotools', row.client_id),
            client_id: row.client_id,
            name: row.name,
            redirect_uris: safeJsonParse(row.redirect_uris, []),
            is_first_party: !!row.is_first_party,
            client_secret_redacted: !!row.client_secret_redacted,
            created_at: row.created_at || null,
            legacy_ref: makeLegacyRef('hobotools', 'oauth_clients', row.client_id),
        });
        context.stats.bump('control-plane/oauth-clients', 'source_records');
        context.stats.bump('control-plane/oauth-clients', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobotools, 'notifications'), async (row) => {
        context.writers.get('control-plane/notifications').write({
            id: buildEntityId('notification', 'hobotools', row.id),
            user_id: canonicalUserIdFor(context, 'hobotools', row.user_id),
            sender_user_id: canonicalUserIdFor(context, 'hobotools', row.sender_id),
            type: row.type,
            category: row.category,
            priority: row.priority,
            title: row.title,
            message: row.message || null,
            icon: row.icon || null,
            sender_name: row.sender_name || null,
            sender_avatar: row.sender_avatar || null,
            service: row.service || null,
            url: row.url || null,
            rich_content: safeJsonParse(row.rich_content, null),
            is_read: !!row.is_read,
            is_dismissed: !!row.is_dismissed,
            is_emailed: !!row.is_emailed,
            expires_at: row.expires_at || null,
            created_at: row.created_at || null,
            legacy_ref: makeLegacyRef('hobotools', 'notifications', row.id),
        });
        context.stats.bump('control-plane/notifications', 'source_records');
        context.stats.bump('control-plane/notifications', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobotools, 'notification_preferences'), async (row) => {
        context.writers.get('control-plane/notification-preferences').write({
            id: buildEntityId('notification-preference', 'hobotools', `${row.user_id}:${row.category}`),
            user_id: canonicalUserIdFor(context, 'hobotools', row.user_id),
            category: row.category,
            enabled: row.enabled == null ? true : !!row.enabled,
            sound: row.sound == null ? true : !!row.sound,
            toasts: row.toasts == null ? true : !!row.toasts,
            email: row.email == null ? false : !!row.email,
            legacy_ref: makeLegacyRef('hobotools', 'notification_preferences', `${row.user_id}:${row.category}`),
        });
        context.stats.bump('control-plane/notification-preferences', 'source_records');
        context.stats.bump('control-plane/notification-preferences', 'written_records');
    });
}

async function writeSocialDatasets(context) {
    await forEachNdjson(tableFile(context.sourceRoots.hobotools, 'follows'), async (row) => {
        context.writers.get('social/follows').write({
            id: buildEntityId('follow', 'hobotools', `${row.follower_id}:${row.followed_id}`),
            source: 'hobotools',
            scope: 'network',
            follower_user_id: canonicalUserIdFor(context, 'hobotools', row.follower_id),
            followed_user_id: canonicalUserIdFor(context, 'hobotools', row.followed_id),
            created_at: row.created_at || null,
            legacy_ref: makeLegacyRef('hobotools', 'follows', `${row.follower_id}:${row.followed_id}`),
        });
        context.stats.bump('social/follows', 'source_records');
        context.stats.bump('social/follows', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'follows'), async (row) => {
        context.writers.get('social/follows').write({
            id: buildEntityId('follow', 'hobostreamer', `${row.follower_id}:${row.streamer_id}`),
            source: 'hobostreamer',
            scope: 'live',
            follower_user_id: canonicalUserIdFor(context, 'hobostreamer', row.follower_id),
            followed_user_id: canonicalUserIdFor(context, 'hobostreamer', row.streamer_id),
            email_notify: !!row.email_notify,
            push_notify: !!row.push_notify,
            created_at: row.created_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'follows', `${row.follower_id}:${row.streamer_id}`),
        });
        context.stats.bump('social/follows', 'source_records');
        context.stats.bump('social/follows', 'written_records');
    });
}

async function writeLiveDatasets(context) {
    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'channels'), async (row) => {
        const ownerUserId = canonicalUserIdFor(context, 'hobostreamer', row.user_id);
        const ownerUser = ownerUserId ? context.userContext.users.get(ownerUserId) : null;
        const channelId = buildEntityId('channel', 'hobostreamer', row.id);
        context.streamContext.channelsByLegacyId.set(String(row.id), channelId);

        context.writers.get('live/channels').write({
            id: channelId,
            source: 'hobostreamer',
            owner_user_id: ownerUserId,
            slug: ownerUser ? ownerUser.username : `legacy-channel-${row.id}`,
            title: row.title || 'Untitled Channel',
            description: row.description || '',
            category: row.category || 'irl',
            tags: safeJsonParse(row.tags, []),
            protocol: row.protocol || 'webrtc',
            is_nsfw: !!row.is_nsfw,
            auto_record: !!row.auto_record,
            offline_banner_url: row.offline_banner_url || null,
            emote_sources: safeJsonParse(row.emote_sources, {}),
            default_vod_visibility: row.default_vod_visibility || 'public',
            default_clip_visibility: row.default_clip_visibility || 'public',
            control_mode: row.control_mode || 'open',
            anon_controls_enabled: row.anon_controls_enabled == null ? true : !!row.anon_controls_enabled,
            control_rate_limit_ms: row.control_rate_limit_ms || 0,
            metadata: {
                panels: safeJsonParse(row.panels, []),
                weather_zip: row.weather_zip || null,
                weather_detail: row.weather_detail || null,
                weather_show_location: !!row.weather_show_location,
                video_click_enabled: !!row.video_click_enabled,
                video_click_rate_limit_ms: row.video_click_rate_limit_ms || 0,
                active_control_config_id: row.active_control_config_id != null ? String(row.active_control_config_id) : null,
            },
            created_at: row.created_at || null,
            updated_at: row.updated_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'channels', row.id),
        });
        context.stats.bump('live/channels', 'source_records');
        context.stats.bump('live/channels', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'managed_streams'), async (row) => {
        const definitionId = buildEntityId('stream-definition', 'hobostreamer', row.id);
        context.streamContext.managedStreamsByLegacyId.set(String(row.id), definitionId);
        context.writers.get('live/stream-definitions').write({
            id: definitionId,
            source: 'hobostreamer',
            owner_user_id: canonicalUserIdFor(context, 'hobostreamer', row.user_id),
            channel_id: row.channel_id != null ? context.streamContext.channelsByLegacyId.get(String(row.channel_id)) || null : null,
            slug: row.slug || null,
            title: row.title || 'Untitled Stream',
            description: row.description || '',
            category: row.category || 'irl',
            tags: safeJsonParse(row.tags, []),
            protocol: row.protocol || 'webrtc',
            stream_key_present: !!row.stream_key,
            is_nsfw: !!row.is_nsfw,
            control_config_id: row.control_config_id != null ? String(row.control_config_id) : null,
            sort_order: row.sort_order || 0,
            created_at: row.created_at || null,
            updated_at: row.updated_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'managed_streams', row.id),
        });
        context.stats.bump('live/stream-definitions', 'source_records');
        context.stats.bump('live/stream-definitions', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'streams'), async (row) => {
        const streamId = buildEntityId('stream-session', 'hobostreamer', row.id);
        context.streamContext.streamsByLegacyId.set(String(row.id), streamId);
        context.writers.get('live/stream-sessions').write({
            id: streamId,
            source: 'hobostreamer',
            owner_user_id: canonicalUserIdFor(context, 'hobostreamer', row.user_id),
            channel_id: row.channel_id != null ? context.streamContext.channelsByLegacyId.get(String(row.channel_id)) || null : null,
            stream_definition_id: row.managed_stream_id != null ? context.streamContext.managedStreamsByLegacyId.get(String(row.managed_stream_id)) || null : null,
            title: row.title || 'Untitled Stream',
            description: row.description || '',
            category: row.category || 'irl',
            tags: safeJsonParse(row.tags, []),
            protocol: row.protocol || 'webrtc',
            status: row.ended_at ? 'ended' : row.is_live ? 'live' : 'created',
            is_live: !!row.is_live,
            is_nsfw: !!row.is_nsfw,
            viewer_count: row.viewer_count || 0,
            peak_viewers: row.peak_viewers || 0,
            follower_count: row.follower_count || 0,
            thumbnail_url: row.thumbnail_url || null,
            multi_cam: !!row.multi_cam,
            started_at: row.started_at || null,
            ended_at: row.ended_at || null,
            last_heartbeat: row.last_heartbeat || null,
            duration_seconds: row.duration_seconds || 0,
            metadata: {
                control_config_id: row.control_config_id != null ? String(row.control_config_id) : null,
            },
            legacy_ref: makeLegacyRef('hobostreamer', 'streams', row.id),
        });
        context.stats.bump('live/stream-sessions', 'source_records');
        context.stats.bump('live/stream-sessions', 'written_records');
    });

    const genericLiveTables = [
        'restream_destinations',
        'channel_moderators',
        'channel_moderation_settings',
        'vibe_coding_sessions',
        'vibe_coding_events',
        'viewer_snapshots',
        'stream_analytics',
        'stream_controls',
        'control_configs',
        'control_config_buttons',
        'camera_profiles',
        'camera_presets',
        'media_request_settings',
        'media_requests',
        'robotstreamer_integrations',
    ];

    for (const tableName of genericLiveTables) {
        await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, tableName), async (row) => {
            context.writers.get(`live/${tableName}`).write({
                id: buildEntityId(tableName, 'hobostreamer', row.id != null ? row.id : JSON.stringify(row)),
                source: 'hobostreamer',
                payload: row,
                legacy_ref: makeLegacyRef('hobostreamer', tableName, row.id != null ? row.id : JSON.stringify(row)),
            });
            context.stats.bump(`live/${tableName}`, 'source_records');
            context.stats.bump(`live/${tableName}`, 'written_records');
        });
    }
}

function messageRoomRef(context, row) {
    if (row.is_global) {
        return { room_type: 'global', room_ref: 'global' };
    }
    if (row.stream_id != null) {
        return {
            room_type: 'stream',
            room_ref: context.streamContext.streamsByLegacyId.get(String(row.stream_id)) || buildEntityId('stream-session', 'hobostreamer', row.stream_id),
        };
    }
    return { room_type: 'channel', room_ref: null };
}

async function writeChatAndCommunityDatasets(context) {
    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'chat_messages'), async (row) => {
        const room = messageRoomRef(context, row);
        context.writers.get('chat/messages').write({
            id: buildEntityId('chat-message', 'hobostreamer', row.id),
            source: 'hobostreamer',
            room_type: room.room_type,
            room_ref: room.room_ref,
            sender_type: row.user_id != null ? 'user' : 'anon',
            sender_id: row.user_id != null
                ? canonicalUserIdFor(context, 'hobostreamer', row.user_id)
                : row.anon_id ? buildEntityId('anon-chat', 'hobostreamer', row.anon_id) : null,
            username: row.username || null,
            message_type: row.message_type || 'chat',
            body: row.message || '',
            reply_to_legacy_id: row.reply_to_id != null ? String(row.reply_to_id) : null,
            is_deleted: !!row.is_deleted,
            is_filtered: !!row.is_filtered,
            source_platform: row.source_platform || null,
            deleted_by_user_id: canonicalUserIdFor(context, 'hobostreamer', row.deleted_by),
            deleted_at: row.deleted_at || null,
            auto_delete_at: row.auto_delete_at || null,
            timestamp: row.timestamp || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'chat_messages', row.id),
        });
        context.stats.bump('chat/messages', 'source_records');
        context.stats.bump('chat/messages', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'bans'), async (row) => {
        context.writers.get('chat/moderation-bans').write({
            id: buildEntityId('ban', 'hobostreamer', row.id),
            source: 'hobostreamer',
            scope_type: row.stream_id != null ? 'stream' : 'global',
            scope_ref: row.stream_id != null ? context.streamContext.streamsByLegacyId.get(String(row.stream_id)) || null : 'global',
            target_user_id: canonicalUserIdFor(context, 'hobostreamer', row.user_id),
            target_anon_id: row.anon_id || null,
            ip_address: row.ip_address || null,
            reason: row.reason || null,
            banned_by_user_id: canonicalUserIdFor(context, 'hobostreamer', row.banned_by),
            expires_at: row.expires_at || null,
            created_at: row.created_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'bans', row.id),
        });
        context.stats.bump('chat/moderation-bans', 'source_records');
        context.stats.bump('chat/moderation-bans', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'pastes'), async (row) => {
        context.writers.get('community/pastes').write({
            id: buildEntityId('paste', 'hobostreamer', row.id),
            source: 'hobostreamer',
            slug: row.slug,
            type: row.type || 'paste',
            title: row.title || 'Untitled',
            body: row.content || null,
            language: row.language || 'text',
            visibility: row.visibility || 'public',
            author_user_id: canonicalUserIdFor(context, 'hobostreamer', row.user_id),
            stream_session_id: row.stream_id != null ? context.streamContext.streamsByLegacyId.get(String(row.stream_id)) || null : null,
            screenshot_path: row.screenshot_path || null,
            metadata: safeJsonParse(row.metadata, {}),
            burn_after_read: !!row.burn_after_read,
            forked_from_paste_id: row.forked_from != null ? buildEntityId('paste', 'hobostreamer', row.forked_from) : null,
            pinned: !!row.pinned,
            views: row.views || 0,
            likes: row.likes || 0,
            copies: row.copies || 0,
            is_nsfw: !!row.is_nsfw,
            created_at: row.created_at || null,
            updated_at: row.updated_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'pastes', row.id),
        });
        context.stats.bump('community/pastes', 'source_records');
        context.stats.bump('community/pastes', 'written_records');
    });

    for (const tableName of ['paste_likes', 'paste_comments']) {
        await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, tableName), async (row) => {
            context.writers.get(`community/${tableName}`).write({
                id: buildEntityId(tableName, 'hobostreamer', row.id != null ? row.id : `${row.paste_id}:${row.user_id}`),
                source: 'hobostreamer',
                payload: row,
                legacy_ref: makeLegacyRef('hobostreamer', tableName, row.id != null ? row.id : `${row.paste_id}:${row.user_id}`),
            });
            context.stats.bump(`community/${tableName}`, 'source_records');
            context.stats.bump(`community/${tableName}`, 'written_records');
        });
    }

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'comments'), async (row) => {
        const mediaRefId = row.content_type === 'vod'
            ? buildEntityId('media', 'hobostreamer-vod', row.content_id)
            : buildEntityId('media', 'hobostreamer-clip', row.content_id);
        context.writers.get('community/comments').write({
            id: buildEntityId('comment', 'hobostreamer', row.id),
            source: 'hobostreamer',
            ref_type: row.content_type,
            ref_id: mediaRefId,
            author_user_id: canonicalUserIdFor(context, 'hobostreamer', row.user_id),
            parent_comment_id: row.parent_id != null ? buildEntityId('comment', 'hobostreamer', row.parent_id) : null,
            body: row.message,
            is_deleted: !!row.is_deleted,
            created_at: row.created_at || null,
            updated_at: row.updated_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'comments', row.id),
        });
        context.stats.bump('community/comments', 'source_records');
        context.stats.bump('community/comments', 'written_records');
    });
}

async function writeMediaDatasets(context) {
    const mediaWriter = context.writers.get('media/objects');

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'vods'), async (row) => {
        mediaWriter.write({
            id: buildEntityId('media', 'hobostreamer-vod', row.id),
            source: 'hobostreamer',
            legacy_table: 'vods',
            owner_user_id: canonicalUserIdFor(context, 'hobostreamer', row.user_id),
            namespace: 'live.vods',
            media_type: 'vod',
            visibility: row.is_public ? 'public' : 'private',
            title: row.title || null,
            description: row.description || '',
            stream_session_id: row.stream_id != null ? context.streamContext.streamsByLegacyId.get(String(row.stream_id)) || null : null,
            file_path: row.file_path || null,
            thumbnail_url: row.thumbnail_url || null,
            size_bytes: row.file_size || 0,
            duration_seconds: row.duration_seconds || 0,
            view_count: row.view_count || 0,
            created_at: row.created_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'vods', row.id),
        });
        context.stats.bump('media/objects', 'source_records');
        context.stats.bump('media/objects', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'clips'), async (row) => {
        mediaWriter.write({
            id: buildEntityId('media', 'hobostreamer-clip', row.id),
            source: 'hobostreamer',
            legacy_table: 'clips',
            owner_user_id: canonicalUserIdFor(context, 'hobostreamer', row.user_id),
            namespace: 'live.clips',
            media_type: 'clip',
            visibility: row.is_public ? 'public' : 'private',
            title: row.title || 'Untitled Clip',
            description: row.description || '',
            stream_session_id: row.stream_id != null ? context.streamContext.streamsByLegacyId.get(String(row.stream_id)) || null : null,
            parent_media_id: row.vod_id != null ? buildEntityId('media', 'hobostreamer-vod', row.vod_id) : null,
            file_path: row.file_path || null,
            thumbnail_url: row.thumbnail_url || null,
            start_time: row.start_time || 0,
            end_time: row.end_time || 0,
            duration_seconds: row.duration_seconds || 0,
            view_count: row.view_count || 0,
            created_at: row.created_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'clips', row.id),
        });
        context.stats.bump('media/objects', 'source_records');
        context.stats.bump('media/objects', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'users'), async (row) => {
        if (!row.avatar_url) return;
        mediaWriter.write({
            id: buildEntityId('media', 'hobostreamer-avatar', row.id),
            source: 'hobostreamer',
            legacy_table: 'users.avatar_url',
            owner_user_id: canonicalUserIdFor(context, 'hobostreamer', row.id),
            namespace: 'user.profile_images',
            media_type: 'image',
            visibility: 'public',
            file_path: row.avatar_url,
            created_at: row.created_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'users', row.id),
        });
        context.stats.bump('media/objects', 'source_records');
        context.stats.bump('media/objects', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'emotes'), async (row) => {
        mediaWriter.write({
            id: buildEntityId('media', 'hobostreamer-emote', row.id),
            source: 'hobostreamer',
            legacy_table: 'emotes',
            owner_user_id: canonicalUserIdFor(context, 'hobostreamer', row.user_id),
            namespace: 'chat.attachments',
            media_type: 'emote',
            visibility: row.is_global ? 'public' : 'restricted',
            code: row.code,
            file_path: row.url,
            metadata: {
                animated: !!row.animated,
                width: row.width || 28,
                height: row.height || 28,
                is_global: !!row.is_global,
                is_approved: row.is_approved == null ? true : !!row.is_approved,
            },
            created_at: row.created_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'emotes', row.id),
        });
        context.stats.bump('media/objects', 'source_records');
        context.stats.bump('media/objects', 'written_records');
    });

    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'pastes'), async (row) => {
        if (!row.screenshot_path) return;
        mediaWriter.write({
            id: buildEntityId('media', 'hobostreamer-paste-screenshot', row.id),
            source: 'hobostreamer',
            legacy_table: 'pastes.screenshot_path',
            owner_user_id: canonicalUserIdFor(context, 'hobostreamer', row.user_id),
            namespace: 'community.attachments',
            media_type: 'image',
            visibility: row.visibility || 'public',
            attached_to_type: 'paste',
            attached_to_id: buildEntityId('paste', 'hobostreamer', row.id),
            file_path: row.screenshot_path,
            created_at: row.created_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'pastes', row.id),
        });
        context.stats.bump('media/objects', 'source_records');
        context.stats.bump('media/objects', 'written_records');
    });
}

async function writeBillingDatasets(context) {
    await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, 'subscriptions'), async (row) => {
        context.writers.get('billing/subscriptions').write({
            id: buildEntityId('subscription', 'hobostreamer', row.id),
            source: 'hobostreamer',
            subscriber_user_id: canonicalUserIdFor(context, 'hobostreamer', row.subscriber_id),
            creator_user_id: canonicalUserIdFor(context, 'hobostreamer', row.streamer_id),
            tier: row.tier || 1,
            is_active: !!row.is_active,
            started_at: row.started_at || null,
            expires_at: row.expires_at || null,
            legacy_ref: makeLegacyRef('hobostreamer', 'subscriptions', row.id),
        });
        context.stats.bump('billing/subscriptions', 'source_records');
        context.stats.bump('billing/subscriptions', 'written_records');
    });
}

async function importCanonicalBundle(options) {
    const { sourceDir, outDir, logger } = options;
    const context = createImportContext(sourceDir, outDir, logger);

    context.exclusions = [
        ...(context.manifests.hobostreamer ? context.manifests.hobostreamer.exclusions || [] : []),
        ...(context.manifests.hobotools ? context.manifests.hobotools.exclusions || [] : []),
    ];

    await buildUserContext(context);
    await writeIdentityDatasets(context);
    await writeThemeAndControlPlaneDatasets(context);
    await writeSocialDatasets(context);
    await writeLiveDatasets(context);
    await writeChatAndCommunityDatasets(context);
    await writeMediaDatasets(context);
    await writeBillingDatasets(context);

    const files = await context.writers.closeAll();
    const report = {
        generated_at: new Date().toISOString(),
        source_dir: sourceDir,
        bundle_dir: context.root,
        manifests: context.manifests,
        datasets: Object.fromEntries(
            Object.entries(context.stats.datasets).map(([name, data]) => [
                name,
                {
                    ...data,
                    file: files[name] ? path.relative(context.root, files[name]) : null,
                },
            ])
        ),
        exclusions: context.exclusions,
        warnings: context.warnings,
        user_merge: {
            canonical_users: context.userContext.users.size,
            username_conflicts: context.userContext.usernameConflicts.length,
        },
    };

    writeJson(path.join(context.root, 'audit', 'import-report.json'), report);
    return report;
}

module.exports = { importCanonicalBundle };
