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

const GAME_SOURCE_PRIORITY = Object.freeze(['hoboquest', 'hobostreamer']);

const DAILY_QUEST_DEFINITIONS = Object.freeze({
    'canvas-placements': {
        title: 'Canvas Explorer',
        description: 'Place 5 pixels on the shared community canvas.',
        goal: 5,
        reward: { coins: 25, loyalty_points: 10 },
    },
    'stockpile-items': {
        title: 'Pack Rat',
        description: 'Add 10 items to your adventure inventory.',
        goal: 10,
        reward: { coins: 40, loyalty_points: 20 },
    },
    'bank-trip': {
        title: 'Safe Storage',
        description: 'Make 1 deposit into the bank vault.',
        goal: 1,
        reward: { coins: 20, loyalty_points: 5 },
    },
});

const DAILY_QUEST_TIER_FALLBACK = Object.freeze({
    1: 'canvas-placements',
    2: 'stockpile-items',
    3: 'bank-trip',
});

function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function earliestTimestamp(left, right) {
    if (!left) return right || null;
    if (!right) return left;
    return left <= right ? left : right;
}

function latestTimestamp(left, right) {
    if (!left) return right || null;
    if (!right) return left;
    return left >= right ? left : right;
}

function normalizeAnonNumber(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function anonDisplayNameForNumber(anonNumber) {
    return anonNumber ? `Anonymous #${anonNumber}` : 'Anonymous';
}

function extractAnonNumberHint(...values) {
    for (const value of values) {
        const candidate = String(value == null ? '' : value).trim();
        if (!candidate) continue;
        let match = candidate.match(/^anonymous\s*#\s*(\d+)$/i);
        if (match) return normalizeAnonNumber(match[1]);
        match = candidate.match(/^hobo_anon(\d+)$/i);
        if (match) return normalizeAnonNumber(match[1]);
        match = candidate.match(/^anon(\d+)$/i);
        if (match) return normalizeAnonNumber(match[1]);
    }
    return null;
}

function deriveHoboQuestAnonNumber(legacyUserId, hints) {
    const hintSource = hints || {};
    const hintedNumber = extractAnonNumberHint(
        hintSource.display_name,
        hintSource.username,
        hintSource.label,
    );
    if (hintedNumber) return hintedNumber;
    const numericId = Number(legacyUserId);
    if (!Number.isFinite(numericId) || numericId >= 0) return null;
    return Math.abs(Math.trunc(numericId));
}

function appendAnonLegacyRef(record, legacyRef) {
    if (!record || !legacyRef) return;
    if (!record.legacy_ref) {
        record.legacy_ref = legacyRef;
    }
    if (!Array.isArray(record.legacy_refs)) {
        record.legacy_refs = record.legacy_ref ? [record.legacy_ref] : [];
    }
    const key = `${legacyRef.source}:${legacyRef.table}:${legacyRef.legacy_id}`;
    const existing = new Set(record.legacy_refs.map((ref) => `${ref.source}:${ref.table}:${ref.legacy_id}`));
    if (!existing.has(key)) {
        record.legacy_refs.push(legacyRef);
    }
}

function ensureRowMetadata(row) {
    if (!row.metadata || typeof row.metadata !== 'object') {
        row.metadata = {};
    }
    if (!Array.isArray(row.metadata.sources)) {
        row.metadata.sources = row.source ? [row.source] : [];
    }
    if (!Array.isArray(row.metadata.legacy_refs)) {
        row.metadata.legacy_refs = row.legacy_ref ? [row.legacy_ref] : [];
    }
    return row.metadata;
}

function appendSourceMetadata(row, source, legacyRef) {
    const metadata = ensureRowMetadata(row);
    if (source && !metadata.sources.includes(source)) {
        metadata.sources.push(source);
    }
    if (legacyRef) {
        const key = `${legacyRef.source}:${legacyRef.table}:${legacyRef.legacy_id}`;
        const existing = new Set(metadata.legacy_refs.map((ref) => `${ref.source}:${ref.table}:${ref.legacy_id}`));
        if (!existing.has(key)) {
            metadata.legacy_refs.push(legacyRef);
        }
    }
}

function queueImportWarning(context, message) {
    if (!context.warnings.includes(message)) {
        context.warnings.push(message);
    }
}

function resolveRequiredCanonicalUserId(context, dataset, sourceName, legacyUserId) {
    const canonicalId = canonicalUserIdFor(context, sourceName, legacyUserId);
    if (!canonicalId) {
        context.stats.bump(dataset, 'skipped_records');
        queueImportWarning(context, `Skipped ${dataset} row from ${sourceName} because legacy user ${legacyUserId} could not be mapped to a canonical identity.`);
        return null;
    }
    return canonicalId;
}

function resolveOptionalCanonicalUserId(context, sourceName, legacyUserId) {
    return canonicalUserIdFor(context, sourceName, legacyUserId);
}

function defaultDailyQuestDefinition(questId) {
    if (DAILY_QUEST_DEFINITIONS[questId]) {
        return DAILY_QUEST_DEFINITIONS[questId];
    }
    const label = String(questId || 'legacy-quest')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
    return {
        title: label,
        description: 'Migrated legacy daily quest progress.',
        goal: 1,
        reward: {},
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
            hoboquest: path.join(sourceDir, 'hoboquest'),
        },
        manifests: {
            hobostreamer: readManifest(path.join(sourceDir, 'hobostreamer')),
            hobotools: readManifest(path.join(sourceDir, 'hobotools')),
            hoboquest: readManifest(path.join(sourceDir, 'hoboquest')),
        },
        writers: createLazyWriters(root),
        stats: createStatsTracker(),
        warnings: [],
        exclusions: [],
        userContext: {
            users: new Map(),
            hoboToolsUsersByLegacyId: new Map(),
            hoboStreamerUsersByLegacyId: new Map(),
            anonRecordsById: new Map(),
            anonUsersByNumber: new Map(),
            hoboQuestAnonUsersByLegacyId: new Map(),
            hoboQuestAnonRecordsById: new Map(),
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
    const hoboToolsAnonUsers = tableFile(sourceRoots.hobotools, 'anon_users');
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

    await forEachNdjson(hoboToolsAnonUsers, async (row) => {
        const canonicalId = buildEntityId('anon-user', 'hobotools', row.id);
        const anonNumber = normalizeAnonNumber(row.anon_number);
        const legacyRef = makeLegacyRef('hobotools', 'anon_users', row.id);
        const record = {
            id: canonicalId,
            source: 'hobotools',
            anon_number: anonNumber,
            session_token: row.session_token || null,
            display_name: anonDisplayNameForNumber(anonNumber),
            preferences: safeJsonParse(row.preferences, {}),
            total_messages: row.total_messages || 0,
            total_commands: row.total_commands || 0,
            first_seen: row.first_seen || null,
            last_seen: row.last_seen || null,
            legacy_ref: legacyRef,
            legacy_refs: [legacyRef],
        };
        userContext.anonRecordsById.set(canonicalId, record);
        userContext.anonIds.add(canonicalId);
        if (anonNumber) {
            userContext.anonUsersByNumber.set(String(anonNumber), canonicalId);
        }
    });
}

function canonicalUserIdFor(context, sourceName, legacyUserId) {
    if (legacyUserId == null) return null;
    if (sourceName === 'hobotools') {
        return context.userContext.hoboToolsUsersByLegacyId.get(String(legacyUserId)) || null;
    }
    if (sourceName === 'hoboquest') {
        if (Number.isFinite(Number(legacyUserId)) && Number(legacyUserId) < 0) {
            return ensureHoboQuestAnonUser(context, legacyUserId);
        }
        return context.userContext.hoboToolsUsersByLegacyId.get(String(legacyUserId)) || null;
    }
    if (sourceName === 'hobostreamer') {
        return context.userContext.hoboStreamerUsersByLegacyId.get(String(legacyUserId)) || null;
    }
    return null;
}

function defaultHoboQuestAnonDisplayName(legacyUserId) {
    return anonDisplayNameForNumber(deriveHoboQuestAnonNumber(legacyUserId));
}

function rememberHoboQuestAnonHint(context, sourceName, legacyUserId, hints) {
    if (sourceName !== 'hoboquest') return null;
    const numericId = Number(legacyUserId);
    if (!Number.isFinite(numericId) || numericId >= 0) return null;
    return ensureHoboQuestAnonUser(context, legacyUserId, hints);
}

function ensureHoboQuestAnonUser(context, legacyUserId, hints) {
    const legacyKey = String(legacyUserId);
    const existingCanonicalId = context.userContext.hoboQuestAnonUsersByLegacyId.get(legacyKey);
    const hintSource = hints || {};
    const primaryLegacyRef = makeLegacyRef('hoboquest', hintSource.table || 'game_players', legacyKey);
    const derivedAnonNumber = deriveHoboQuestAnonNumber(legacyUserId, hintSource);

    if (!existingCanonicalId) {
        const linkedCanonicalId = derivedAnonNumber
            ? context.userContext.anonUsersByNumber.get(String(derivedAnonNumber)) || null
            : null;
        if (linkedCanonicalId) {
            const linkedRecord = context.userContext.anonRecordsById.get(linkedCanonicalId);
            if (linkedRecord) {
                const nextAnonNumber = normalizeAnonNumber(linkedRecord.anon_number) || derivedAnonNumber;
                linkedRecord.anon_number = nextAnonNumber;
                linkedRecord.display_name = anonDisplayNameForNumber(nextAnonNumber);
                linkedRecord.first_seen = earliestTimestamp(linkedRecord.first_seen, hintSource.created_at || null);
                linkedRecord.last_seen = latestTimestamp(linkedRecord.last_seen, hintSource.updated_at || null);
                appendAnonLegacyRef(linkedRecord, primaryLegacyRef);
            }
            context.userContext.hoboQuestAnonUsersByLegacyId.set(legacyKey, linkedCanonicalId);
            return linkedCanonicalId;
        }

        const canonicalId = buildEntityId('anon-user', 'hoboquest', legacyKey);
        const record = {
            id: canonicalId,
            source: 'hoboquest',
            anon_number: derivedAnonNumber,
            session_token: null,
            display_name: anonDisplayNameForNumber(derivedAnonNumber),
            preferences: {
                migrated_from: 'hoboquest',
                legacy_game_user_id: legacyKey,
                username: hintSource.username || null,
                legacy_tables: [hintSource.table || 'game_players'],
            },
            total_messages: 0,
            total_commands: 0,
            first_seen: hintSource.created_at || null,
            last_seen: hintSource.updated_at || null,
            legacy_ref: primaryLegacyRef,
            legacy_refs: [primaryLegacyRef],
        };
        context.userContext.hoboQuestAnonUsersByLegacyId.set(legacyKey, canonicalId);
        context.userContext.hoboQuestAnonRecordsById.set(canonicalId, record);
        context.userContext.anonRecordsById.set(canonicalId, record);
        context.userContext.anonIds.add(canonicalId);
        if (derivedAnonNumber) {
            context.userContext.anonUsersByNumber.set(String(derivedAnonNumber), canonicalId);
        }
        return canonicalId;
    }

    const record = context.userContext.hoboQuestAnonRecordsById.get(existingCanonicalId)
        || context.userContext.anonRecordsById.get(existingCanonicalId);
    if (!record) return existingCanonicalId;

    if (!record.preferences || typeof record.preferences !== 'object') {
        record.preferences = {};
    }
    if (!Array.isArray(record.preferences.legacy_tables)) {
        record.preferences.legacy_tables = [];
    }

    const nextAnonNumber = normalizeAnonNumber(record.anon_number) || derivedAnonNumber;
    if (nextAnonNumber) {
        record.anon_number = nextAnonNumber;
        record.display_name = anonDisplayNameForNumber(nextAnonNumber);
        context.userContext.anonUsersByNumber.set(String(nextAnonNumber), existingCanonicalId);
    }

    if (hintSource.username && !record.preferences.username) {
        record.preferences.username = hintSource.username;
    }
    if (hintSource.table && !record.preferences.legacy_tables.includes(hintSource.table)) {
        record.preferences.legacy_tables.push(hintSource.table);
    }
    if (hintSource.created_at) {
        record.first_seen = earliestTimestamp(record.first_seen, hintSource.created_at);
    }
    if (hintSource.updated_at) {
        record.last_seen = latestTimestamp(record.last_seen, hintSource.updated_at);
    }
    appendAnonLegacyRef(record, primaryLegacyRef);
    return existingCanonicalId;
}

function flushHoboQuestAnonUsers(context) {
    const anonWriter = context.writers.get('identity/anon-users');
    for (const record of context.userContext.hoboQuestAnonRecordsById.values()) {
        if (record._written) continue;
        anonWriter.write(record);
        record._written = true;
        context.stats.bump('identity/anon-users', 'source_records');
        context.stats.bump('identity/anon-users', 'written_records');
    }
}

async function writeGamesDatasets(context) {
    const writers = {
        worldState: context.writers.get('games/world-state'),
        players: context.writers.get('games/players'),
        inventory: context.writers.get('games/inventory'),
        bank: context.writers.get('games/bank'),
        structures: context.writers.get('games/structures'),
        farmPlots: context.writers.get('games/farm-plots'),
        recipes: context.writers.get('games/recipes'),
        effects: context.writers.get('games/effects'),
        battleStats: context.writers.get('games/battle-stats'),
        dungeonRuns: context.writers.get('games/dungeon-runs'),
        leaderboards: context.writers.get('games/leaderboards'),
        fishCollection: context.writers.get('games/fish-collection'),
        dailyQuests: context.writers.get('games/daily-quests'),
        achievements: context.writers.get('games/achievements'),
        cosmetics: context.writers.get('games/cosmetics'),
        tags: context.writers.get('games/tags'),
        equippedTags: context.writers.get('games/equipped-tags'),
        tagGuardianDefeats: context.writers.get('games/tag-guardian-defeats'),
        canvasSettings: context.writers.get('games/canvas-settings'),
        canvasTiles: context.writers.get('games/canvas-tiles'),
        canvasActions: context.writers.get('games/canvas-actions'),
        canvasSnapshots: context.writers.get('games/canvas-snapshots'),
        canvasRegionLocks: context.writers.get('games/canvas-region-locks'),
        canvasBans: context.writers.get('games/canvas-bans'),
        canvasUserOverrides: context.writers.get('games/canvas-user-overrides'),
    };

    const worldStateMap = new Map();
    const playerMap = new Map();
    const inventoryMap = new Map();
    const bankMap = new Map();
    const farmPlotMap = new Map();
    const recipeMap = new Map();
    const battleStatsMap = new Map();
    const fishCollectionMap = new Map();
    const dailyQuestMap = new Map();
    const achievementMap = new Map();
    const cosmeticMap = new Map();
    const tagMap = new Map();
    const equippedTagMap = new Map();
    const tagGuardianMap = new Map();
    const canvasSettingsMap = new Map();
    const canvasUserOverridesMap = new Map();
    const equippedCosmeticsBySource = new Map();

    for (const sourceName of GAME_SOURCE_PRIORITY) {
        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_world_state'), async (row) => {
            context.stats.bump('games/world-state', 'source_records');
            if (worldStateMap.has(String(row.key))) {
                context.stats.bump('games/world-state', 'merged_records');
                return;
            }
            worldStateMap.set(String(row.key), {
                id: buildEntityId('game-world-state', sourceName, row.key),
                key: String(row.key),
                value: row.value == null ? '' : String(row.value),
                type: safeJsonParse(row.value, null) != null ? 'json' : 'string',
                source: sourceName,
                metadata: {},
                legacy_ref: makeLegacyRef(sourceName, 'game_world_state', row.key),
            });
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_players'), async (row) => {
            context.stats.bump('games/players', 'source_records');
            rememberHoboQuestAnonHint(context, sourceName, row.user_id, {
                table: 'game_players',
                display_name: row.display_name || null,
                username: row.display_name || null,
                created_at: row.created_at || null,
                updated_at: row.last_action || row.updated_at || null,
            });
            const userId = resolveRequiredCanonicalUserId(context, 'games/players', sourceName, row.user_id);
            if (!userId) return;

            const incoming = {
                id: buildEntityId('game-player', sourceName, row.user_id),
                user_id: userId,
                display_name: row.display_name || null,
                avatar_url: row.avatar_url || null,
                class_name: row.class_name || 'wanderer',
                world_id: row.world_id || 'main',
                zone: row.zone || 'outpost',
                x: toNumber(row.x, 4096),
                y: toNumber(row.y, 4096),
                coins: toNumber(row.coins, 0),
                loyalty_points: toNumber(row.loyalty_points, 0),
                mining_xp: toNumber(row.mining_xp, 0),
                fishing_xp: toNumber(row.fishing_xp, 0),
                woodcut_xp: toNumber(row.woodcut_xp, 0),
                farming_xp: toNumber(row.farming_xp, 0),
                combat_xp: toNumber(row.combat_xp, 0),
                crafting_xp: toNumber(row.crafting_xp, 0),
                smithing_xp: toNumber(row.smithing_xp, 0),
                agility_xp: toNumber(row.agility_xp, 0),
                hp: toNumber(row.hp, 100),
                max_hp: toNumber(row.max_hp, 100),
                stamina: toNumber(row.stamina, 100),
                max_stamina: toNumber(row.max_stamina, 100),
                equip_pickaxe: row.equip_pickaxe || null,
                equip_rod: row.equip_rod || null,
                equip_axe: row.equip_axe || null,
                equip_hat: row.equip_hat || '',
                equip_weapon: row.equip_weapon || '',
                equip_armor: row.equip_armor || '',
                source: sourceName,
                metadata: {
                    attack: toNumber(row.attack, 0),
                    defense: toNumber(row.defense, 0),
                    last_stamina_tick: row.last_stamina_tick || null,
                    sleeping_bag_x: row.sleeping_bag_x == null ? null : toNumber(row.sleeping_bag_x, null),
                    sleeping_bag_y: row.sleeping_bag_y == null ? null : toNumber(row.sleeping_bag_y, null),
                    sprite_skin: toNumber(row.sprite_skin, 0),
                    name_effect: row.name_effect || '',
                    particle_effect: row.particle_effect || '',
                    chat_color: row.chat_color || null,
                    total_coins_earned: toNumber(row.total_coins_earned, 0),
                    total_items_crafted: toNumber(row.total_items_crafted, 0),
                    total_monsters_killed: toNumber(row.total_monsters_killed, 0),
                    total_deaths: toNumber(row.total_deaths, 0),
                    battle_wins: toNumber(row.battle_wins, 0),
                    battle_losses: toNumber(row.battle_losses, 0),
                    structures_built: toNumber(row.structures_built, 0),
                    resources_gathered: toNumber(row.resources_gathered, 0),
                    total_chests_opened: toNumber(row.total_chests_opened, 0),
                    total_tiles_traveled: toNumber(row.total_tiles_traveled, 0),
                    total_dungeon_wins: toNumber(row.total_dungeon_wins, 0),
                    legacy_user_id: String(row.user_id),
                },
                created_at: row.created_at || null,
                updated_at: row.last_action || row.updated_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'game_players', row.user_id),
            };

            if (!playerMap.has(userId)) {
                playerMap.set(userId, incoming);
                return;
            }

            const existing = playerMap.get(userId);
            const maxFields = [
                'coins', 'loyalty_points', 'mining_xp', 'fishing_xp', 'woodcut_xp', 'farming_xp',
                'combat_xp', 'crafting_xp', 'smithing_xp', 'agility_xp', 'hp', 'max_hp', 'stamina', 'max_stamina',
            ];
            for (const field of maxFields) {
                existing[field] = Math.max(toNumber(existing[field], 0), toNumber(incoming[field], 0));
            }
            existing.display_name = existing.display_name || incoming.display_name;
            existing.avatar_url = existing.avatar_url || incoming.avatar_url;
            existing.class_name = existing.class_name || incoming.class_name;
            existing.world_id = existing.world_id || incoming.world_id;
            existing.zone = existing.zone || incoming.zone;
            existing.x = incoming.x != null ? incoming.x : existing.x;
            existing.y = incoming.y != null ? incoming.y : existing.y;
            for (const field of ['equip_pickaxe', 'equip_rod', 'equip_axe', 'equip_hat', 'equip_weapon', 'equip_armor']) {
                existing[field] = existing[field] || incoming[field];
            }
            const existingMeta = ensureRowMetadata(existing);
            for (const [key, value] of Object.entries(incoming.metadata || {})) {
                if (typeof value === 'number') {
                    existingMeta[key] = Math.max(toNumber(existingMeta[key], 0), value);
                } else if (existingMeta[key] == null || existingMeta[key] === '' || existingMeta[key] === 0) {
                    existingMeta[key] = value;
                }
            }
            existing.created_at = earliestTimestamp(existing.created_at, incoming.created_at);
            existing.updated_at = latestTimestamp(existing.updated_at, incoming.updated_at);
            appendSourceMetadata(existing, sourceName, incoming.legacy_ref);
            context.stats.bump('games/players', 'merged_records');
        });

        for (const [tableName, datasetName, destination] of [
            ['game_inventory', 'games/inventory', inventoryMap],
            ['game_bank', 'games/bank', bankMap],
        ]) {
            await forEachNdjson(tableFile(context.sourceRoots[sourceName], tableName), async (row) => {
                context.stats.bump(datasetName, 'source_records');
                rememberHoboQuestAnonHint(context, sourceName, row.user_id, {
                    table: tableName,
                    updated_at: row.updated_at || row.created_at || null,
                });
                const userId = resolveRequiredCanonicalUserId(context, datasetName, sourceName, row.user_id);
                if (!userId) return;
                const itemId = String(row.item_id);
                const key = `${userId}:${itemId}`;
                const incoming = {
                    id: buildEntityId(tableName, sourceName, `${row.user_id}:${itemId}`),
                    user_id: userId,
                    item_id: itemId,
                    quantity: toNumber(row.quantity, 0),
                    source: sourceName,
                    metadata: {
                        legacy_user_id: String(row.user_id),
                    },
                    updated_at: row.updated_at || row.created_at || null,
                    legacy_ref: makeLegacyRef(sourceName, tableName, row.id != null ? row.id : `${row.user_id}:${itemId}`),
                };
                if (!destination.has(key)) {
                    destination.set(key, incoming);
                    return;
                }
                const existing = destination.get(key);
                existing.quantity = Math.max(toNumber(existing.quantity, 0), incoming.quantity);
                existing.updated_at = latestTimestamp(existing.updated_at, incoming.updated_at);
                appendSourceMetadata(existing, sourceName, incoming.legacy_ref);
                context.stats.bump(datasetName, 'merged_records');
            });
        }

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_structures'), async (row) => {
            context.stats.bump('games/structures', 'source_records');
            const ownerUserId = resolveOptionalCanonicalUserId(context, sourceName, row.owner_id);
            writers.structures.write({
                id: buildEntityId('game-structure', sourceName, row.id),
                type: row.type,
                world_id: row.world_id || 'main',
                x: row.x != null ? toNumber(row.x, 0) : toNumber(row.tile_x, 0),
                y: row.y != null ? toNumber(row.y, 0) : toNumber(row.tile_y, 0),
                owner_user_id: ownerUserId,
                source: sourceName,
                data: safeJsonParse(row.data, safeJsonParse(row.data_json, {})),
                metadata: {
                    hp: toNumber(row.hp, 0),
                    max_hp: toNumber(row.max_hp, 0),
                    legacy_owner_id: row.owner_id != null ? String(row.owner_id) : null,
                },
                created_at: row.placed_at || row.built_at || null,
                updated_at: row.updated_at || row.placed_at || row.built_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'game_structures', row.id),
            });
            context.stats.bump('games/structures', 'written_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_farm_plots'), async (row) => {
            context.stats.bump('games/farm-plots', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/farm-plots', sourceName, row.user_id);
            if (!userId) return;
            const key = `${userId}:${toNumber(row.plot_index, 0)}`;
            const incoming = {
                id: buildEntityId('farm-plot', sourceName, row.id != null ? row.id : `${row.user_id}:${row.plot_index}`),
                user_id: userId,
                plot_index: toNumber(row.plot_index, 0),
                seed_id: row.seed_id || row.crop_id || null,
                stage: row.stage || 'empty',
                source: sourceName,
                planted_at: row.planted_at || null,
                watered_at: row.watered_at || null,
                ready_at: row.ready_at || null,
                metadata: {
                    fertilized: !!row.fertilized,
                    legacy_user_id: String(row.user_id),
                },
                updated_at: row.updated_at || row.watered_at || row.planted_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'game_farm_plots', row.id != null ? row.id : `${row.user_id}:${row.plot_index}`),
            };
            if (!farmPlotMap.has(key)) {
                farmPlotMap.set(key, incoming);
                return;
            }
            const existing = farmPlotMap.get(key);
            existing.seed_id = existing.seed_id || incoming.seed_id;
            existing.stage = existing.stage === 'empty' ? incoming.stage : existing.stage;
            existing.planted_at = earliestTimestamp(existing.planted_at, incoming.planted_at);
            existing.watered_at = latestTimestamp(existing.watered_at, incoming.watered_at);
            existing.ready_at = latestTimestamp(existing.ready_at, incoming.ready_at);
            if (incoming.metadata.fertilized) {
                ensureRowMetadata(existing).fertilized = true;
            }
            existing.updated_at = latestTimestamp(existing.updated_at, incoming.updated_at);
            appendSourceMetadata(existing, sourceName, incoming.legacy_ref);
            context.stats.bump('games/farm-plots', 'merged_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_recipes'), async (row) => {
            context.stats.bump('games/recipes', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/recipes', sourceName, row.user_id);
            if (!userId) return;
            const recipeId = String(row.recipe_id);
            const key = `${userId}:${recipeId}`;
            if (recipeMap.has(key)) {
                const existing = recipeMap.get(key);
                existing.unlocked_at = earliestTimestamp(existing.unlocked_at, row.unlocked_at || null);
                appendSourceMetadata(existing, sourceName, makeLegacyRef(sourceName, 'game_recipes', row.id != null ? row.id : `${row.user_id}:${recipeId}`));
                context.stats.bump('games/recipes', 'merged_records');
                return;
            }
            recipeMap.set(key, {
                id: buildEntityId('recipe', sourceName, row.id != null ? row.id : `${row.user_id}:${recipeId}`),
                user_id: userId,
                recipe_id: recipeId,
                source: sourceName,
                metadata: {
                    legacy_user_id: String(row.user_id),
                },
                unlocked_at: row.unlocked_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'game_recipes', row.id != null ? row.id : `${row.user_id}:${recipeId}`),
            });
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_effects'), async (row) => {
            context.stats.bump('games/effects', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/effects', sourceName, row.user_id || row.leader_id);
            if (!userId) return;
            writers.effects.write({
                id: buildEntityId('game-effect', sourceName, row.id != null ? row.id : `${row.user_id || row.leader_id}:${row.effect_type}:${row.effect_id || row.expires_at || 'effect'}`),
                user_id: userId,
                effect_type: row.effect_type || 'legacy-effect',
                effect_id: row.effect_id || null,
                expires_at: row.expires_at || null,
                charges: row.charges == null ? null : toNumber(row.charges, 0),
                source: sourceName,
                data: safeJsonParse(row.data, {}),
                created_at: row.created_at || null,
                updated_at: row.updated_at || row.created_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'game_effects', row.id != null ? row.id : `${row.user_id || row.leader_id}:${row.effect_type}`),
            });
            context.stats.bump('games/effects', 'written_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_battle_stats'), async (row) => {
            context.stats.bump('games/battle-stats', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/battle-stats', sourceName, row.user_id);
            if (!userId) return;
            const incoming = {
                id: buildEntityId('battle-stats', sourceName, row.user_id),
                user_id: userId,
                battles_won: toNumber(row.battles_won, 0),
                battles_lost: toNumber(row.battles_lost, 0),
                total_stolen: toNumber(row.total_stolen, 0),
                total_lost: toNumber(row.total_lost, 0),
                kill_streak: toNumber(row.kill_streak, 0),
                best_streak: toNumber(row.best_streak, 0),
                fatalities: toNumber(row.fatalities, 0),
                kills: toNumber(row.kills, 0),
                deaths: toNumber(row.deaths, 0),
                source: sourceName,
                metadata: {
                    legacy_user_id: String(row.user_id),
                },
                updated_at: row.updated_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'game_battle_stats', row.user_id),
            };
            if (!battleStatsMap.has(userId)) {
                battleStatsMap.set(userId, incoming);
                return;
            }
            const existing = battleStatsMap.get(userId);
            for (const field of ['battles_won', 'battles_lost', 'total_stolen', 'total_lost', 'kill_streak', 'best_streak', 'fatalities', 'kills', 'deaths']) {
                existing[field] = Math.max(toNumber(existing[field], 0), toNumber(incoming[field], 0));
            }
            existing.updated_at = latestTimestamp(existing.updated_at, incoming.updated_at);
            appendSourceMetadata(existing, sourceName, incoming.legacy_ref);
            context.stats.bump('games/battle-stats', 'merged_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_dungeon_runs'), async (row) => {
            context.stats.bump('games/dungeon-runs', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/dungeon-runs', sourceName, row.user_id != null ? row.user_id : row.leader_id);
            if (!userId) return;
            writers.dungeonRuns.write({
                id: buildEntityId('dungeon-run', sourceName, row.id),
                user_id: userId,
                dungeon_id: row.dungeon_id || 'legacy-dungeon',
                floor_reached: toNumber(row.floor_reached, 1),
                status: row.status || 'active',
                source: sourceName,
                party: safeJsonParse(row.party, safeJsonParse(row.party_data, [])),
                metadata: {
                    legacy_leader_id: row.leader_id != null ? String(row.leader_id) : null,
                },
                started_at: row.started_at || null,
                ended_at: row.ended_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'game_dungeon_runs', row.id),
            });
            context.stats.bump('games/dungeon-runs', 'written_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_leaderboard'), async (row) => {
            context.stats.bump('games/leaderboards', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/leaderboards', sourceName, row.user_id);
            if (!userId) return;
            const board = row.board || row.board_type || 'legacy';
            writers.leaderboards.write({
                id: buildEntityId('leaderboard-entry', sourceName, row.id != null ? row.id : `${board}:${row.user_id}:${row.rank || 0}`),
                board,
                rank: toNumber(row.rank, 0),
                user_id: userId,
                username: row.username || null,
                value: toNumber(row.value != null ? row.value : row.score, 0),
                source: sourceName,
                metadata: {
                    legacy_user_id: String(row.user_id),
                },
                updated_at: row.updated_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'game_leaderboard', row.id != null ? row.id : `${board}:${row.user_id}:${row.rank || 0}`),
            });
            context.stats.bump('games/leaderboards', 'written_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_fish_collection'), async (row) => {
            context.stats.bump('games/fish-collection', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/fish-collection', sourceName, row.user_id);
            if (!userId) return;
            const fishId = String(row.fish_id);
            const key = `${userId}:${fishId}`;
            const incoming = {
                id: buildEntityId('fish-collection', sourceName, `${row.user_id}:${fishId}`),
                user_id: userId,
                fish_id: fishId,
                count: toNumber(row.count != null ? row.count : row.times_caught, 0),
                best_weight: toNumber(row.best_weight != null ? row.best_weight : row.max_weight, 0),
                source: sourceName,
                metadata: {
                    legacy_user_id: String(row.user_id),
                },
                first_caught: row.first_caught || null,
                legacy_ref: makeLegacyRef(sourceName, 'game_fish_collection', `${row.user_id}:${fishId}`),
            };
            if (!fishCollectionMap.has(key)) {
                fishCollectionMap.set(key, incoming);
                return;
            }
            const existing = fishCollectionMap.get(key);
            existing.count = Math.max(toNumber(existing.count, 0), incoming.count);
            existing.best_weight = Math.max(toNumber(existing.best_weight, 0), incoming.best_weight);
            existing.first_caught = earliestTimestamp(existing.first_caught, incoming.first_caught);
            appendSourceMetadata(existing, sourceName, incoming.legacy_ref);
            context.stats.bump('games/fish-collection', 'merged_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_daily_quest_progress'), async (row) => {
            context.stats.bump('games/daily-quests', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/daily-quests', sourceName, row.user_id);
            if (!userId) return;
            const questId = String(row.quest_id || row.stat_key || 'legacy-quest');
            const questDate = String(row.quest_date);
            const definition = defaultDailyQuestDefinition(questId);
            const key = `${userId}:${questDate}:${questId}`;
            const incomingRef = makeLegacyRef(sourceName, 'game_daily_quest_progress', `${row.user_id}:${questDate}:${questId}`);
            if (!dailyQuestMap.has(key)) {
                dailyQuestMap.set(key, {
                    id: buildEntityId('daily-quest', sourceName, `${row.user_id}:${questDate}:${questId}`),
                    user_id: userId,
                    quest_date: questDate,
                    quest_id: questId,
                    title: definition.title,
                    description: definition.description,
                    progress: toNumber(row.value, 0),
                    goal: toNumber(row.goal, definition.goal),
                    reward: definition.reward,
                    claimed_at: null,
                    source: sourceName,
                    metadata: {
                        stat_key: row.stat_key || questId,
                        legacy_user_id: String(row.user_id),
                    },
                    updated_at: row.updated_at || null,
                    legacy_ref: incomingRef,
                });
                return;
            }
            const existing = dailyQuestMap.get(key);
            existing.progress = Math.max(toNumber(existing.progress, 0), toNumber(row.value, 0));
            existing.goal = Math.max(toNumber(existing.goal, 1), toNumber(row.goal, 0) || definition.goal);
            existing.updated_at = latestTimestamp(existing.updated_at, row.updated_at || null);
            appendSourceMetadata(existing, sourceName, incomingRef);
            context.stats.bump('games/daily-quests', 'merged_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_daily_quest_claims'), async (row) => {
            context.stats.bump('games/daily-quests', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/daily-quests', sourceName, row.user_id);
            if (!userId) return;
            const questId = String(row.quest_id || DAILY_QUEST_TIER_FALLBACK[toNumber(row.tier, 0)] || `legacy-tier-${row.tier}`);
            const questDate = String(row.quest_date);
            const definition = defaultDailyQuestDefinition(questId);
            const key = `${userId}:${questDate}:${questId}`;
            const incomingRef = makeLegacyRef(sourceName, 'game_daily_quest_claims', `${row.user_id}:${questDate}:${questId}`);
            if (!dailyQuestMap.has(key)) {
                dailyQuestMap.set(key, {
                    id: buildEntityId('daily-quest', sourceName, `${row.user_id}:${questDate}:${questId}`),
                    user_id: userId,
                    quest_date: questDate,
                    quest_id: questId,
                    title: definition.title,
                    description: definition.description,
                    progress: 0,
                    goal: definition.goal,
                    reward: definition.reward,
                    claimed_at: row.claimed_at || null,
                    source: sourceName,
                    metadata: {
                        legacy_user_id: String(row.user_id),
                        tier: row.tier == null ? null : toNumber(row.tier, 0),
                    },
                    updated_at: row.claimed_at || null,
                    legacy_ref: incomingRef,
                });
                return;
            }
            const existing = dailyQuestMap.get(key);
            existing.claimed_at = earliestTimestamp(existing.claimed_at, row.claimed_at || null);
            existing.updated_at = latestTimestamp(existing.updated_at, row.claimed_at || null);
            appendSourceMetadata(existing, sourceName, incomingRef);
            context.stats.bump('games/daily-quests', 'merged_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'game_achievements'), async (row) => {
            context.stats.bump('games/achievements', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/achievements', sourceName, row.user_id);
            if (!userId) return;
            const achievementId = String(row.achievement_id);
            const key = `${userId}:${achievementId}`;
            if (achievementMap.has(key)) {
                const existing = achievementMap.get(key);
                existing.unlocked_at = earliestTimestamp(existing.unlocked_at, row.unlocked_at || row.completed_at || null);
                appendSourceMetadata(existing, sourceName, makeLegacyRef(sourceName, 'game_achievements', `${row.user_id}:${achievementId}`));
                context.stats.bump('games/achievements', 'merged_records');
                return;
            }
            achievementMap.set(key, {
                id: buildEntityId('achievement', sourceName, `${row.user_id}:${achievementId}`),
                user_id: userId,
                achievement_id: achievementId,
                title: row.title || null,
                description: row.description || null,
                source: sourceName,
                metadata: {
                    legacy_user_id: String(row.user_id),
                },
                unlocked_at: row.unlocked_at || row.completed_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'game_achievements', `${row.user_id}:${achievementId}`),
            });
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'user_equipped'), async (row) => {
            context.stats.bump('games/cosmetics', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/cosmetics', sourceName, row.user_id);
            if (!userId) return;
            equippedCosmeticsBySource.set(`${sourceName}:${userId}:${String(row.slot)}`, String(row.item_id));
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'user_cosmetics'), async (row) => {
            context.stats.bump('games/cosmetics', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/cosmetics', sourceName, row.user_id);
            if (!userId) return;
            const slot = String(row.slot || row.type || row.category || 'cosmetic');
            const itemId = String(row.item_id);
            const key = `${userId}:${slot}:${itemId}`;
            const incoming = {
                id: buildEntityId('cosmetic', sourceName, `${row.user_id}:${slot}:${itemId}`),
                user_id: userId,
                slot,
                item_id: itemId,
                equipped: equippedCosmeticsBySource.get(`${sourceName}:${userId}:${slot}`) === itemId,
                source: row.source || sourceName,
                metadata: {
                    category: row.category || row.type || slot,
                    legacy_user_id: String(row.user_id),
                },
                acquired_at: row.acquired_at || row.unlocked_at || null,
                updated_at: row.updated_at || row.acquired_at || row.unlocked_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'user_cosmetics', `${row.user_id}:${slot}:${itemId}`),
            };
            if (!cosmeticMap.has(key)) {
                cosmeticMap.set(key, incoming);
                return;
            }
            const existing = cosmeticMap.get(key);
            existing.equipped = existing.equipped || incoming.equipped;
            existing.acquired_at = earliestTimestamp(existing.acquired_at, incoming.acquired_at);
            existing.updated_at = latestTimestamp(existing.updated_at, incoming.updated_at);
            appendSourceMetadata(existing, sourceName, incoming.legacy_ref);
            context.stats.bump('games/cosmetics', 'merged_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'user_tags'), async (row) => {
            context.stats.bump('games/tags', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/tags', sourceName, row.user_id);
            if (!userId) return;
            const tagId = String(row.tag_id);
            const key = `${userId}:${tagId}`;
            if (tagMap.has(key)) {
                const existing = tagMap.get(key);
                existing.granted_at = earliestTimestamp(existing.granted_at, row.granted_at || null);
                appendSourceMetadata(existing, sourceName, makeLegacyRef(sourceName, 'user_tags', row.id != null ? row.id : `${row.user_id}:${tagId}`));
                context.stats.bump('games/tags', 'merged_records');
                return;
            }
            tagMap.set(key, {
                id: buildEntityId('tag', sourceName, row.id != null ? row.id : `${row.user_id}:${tagId}`),
                user_id: userId,
                tag_id: tagId,
                source: row.source || sourceName,
                metadata: {
                    legacy_user_id: String(row.user_id),
                },
                granted_at: row.granted_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'user_tags', row.id != null ? row.id : `${row.user_id}:${tagId}`),
            });
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'user_equipped_tag'), async (row) => {
            context.stats.bump('games/equipped-tags', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/equipped-tags', sourceName, row.user_id);
            if (!userId) return;
            if (equippedTagMap.has(userId)) {
                appendSourceMetadata(equippedTagMap.get(userId), sourceName, makeLegacyRef(sourceName, 'user_equipped_tag', `${row.user_id}:${row.tag_id}`));
                context.stats.bump('games/equipped-tags', 'merged_records');
                return;
            }
            equippedTagMap.set(userId, {
                id: buildEntityId('equipped-tag', sourceName, row.user_id),
                user_id: userId,
                tag_id: String(row.tag_id),
                source: sourceName,
                metadata: {
                    legacy_user_id: String(row.user_id),
                },
                updated_at: row.updated_at || row.granted_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'user_equipped_tag', `${row.user_id}:${row.tag_id}`),
            });
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'tag_guardian_defeats'), async (row) => {
            context.stats.bump('games/tag-guardian-defeats', 'source_records');
            const userId = resolveRequiredCanonicalUserId(context, 'games/tag-guardian-defeats', sourceName, row.user_id);
            if (!userId) return;
            if (tagGuardianMap.has(userId)) {
                const existing = tagGuardianMap.get(userId);
                existing.defeated_at = earliestTimestamp(existing.defeated_at, row.defeated_at || null);
                appendSourceMetadata(existing, sourceName, makeLegacyRef(sourceName, 'tag_guardian_defeats', row.user_id));
                context.stats.bump('games/tag-guardian-defeats', 'merged_records');
                return;
            }
            tagGuardianMap.set(userId, {
                id: buildEntityId('tag-guardian-defeat', sourceName, row.user_id),
                user_id: userId,
                source: sourceName,
                metadata: {
                    legacy_user_id: String(row.user_id),
                },
                defeated_at: row.defeated_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'tag_guardian_defeats', row.user_id),
            });
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'canvas_settings'), async (row) => {
            context.stats.bump('games/canvas-settings', 'source_records');
            const key = String(row.key);
            if (canvasSettingsMap.has(key)) {
                context.stats.bump('games/canvas-settings', 'merged_records');
                return;
            }
            canvasSettingsMap.set(key, {
                id: buildEntityId('canvas-setting', sourceName, key),
                key,
                value: row.value == null ? '' : String(row.value),
                type: safeJsonParse(row.value, null) != null ? 'json' : 'string',
                source: sourceName,
                metadata: {},
                updated_at: row.updated_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'canvas_settings', key),
            });
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'canvas_tiles'), async (row) => {
            context.stats.bump('games/canvas-tiles', 'source_records');
            rememberHoboQuestAnonHint(context, sourceName, row.user_id, {
                table: 'canvas_tiles',
                display_name: row.username || null,
                username: row.username || null,
                updated_at: row.placed_at || row.updated_at || null,
            });
            const userId = resolveOptionalCanonicalUserId(context, sourceName, row.user_id);
            writers.canvasTiles.write({
                id: buildEntityId('canvas-tile', sourceName, `${row.x}:${row.y}`),
                x: toNumber(row.x, 0),
                y: toNumber(row.y, 0),
                color_index: toNumber(row.color_index, 0),
                user_id: userId,
                username: row.username || null,
                ip_address: row.ip_address || null,
                source: sourceName,
                metadata: {
                    legacy_user_id: row.user_id != null ? String(row.user_id) : null,
                },
                updated_at: row.placed_at || row.updated_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'canvas_tiles', `${row.x}:${row.y}`),
            });
            context.stats.bump('games/canvas-tiles', 'written_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'canvas_actions'), async (row) => {
            context.stats.bump('games/canvas-actions', 'source_records');
            rememberHoboQuestAnonHint(context, sourceName, row.user_id, {
                table: 'canvas_actions',
                display_name: row.username || null,
                username: row.username || null,
                updated_at: row.created_at || null,
            });
            const userId = resolveOptionalCanonicalUserId(context, sourceName, row.user_id);
            writers.canvasActions.write({
                id: toNumber(row.id, 0),
                action_type: row.action_type || 'place',
                x: toNumber(row.x, 0),
                y: toNumber(row.y, 0),
                prev_color_index: row.prev_color_index == null ? toNumber(row.prev_color, null) : toNumber(row.prev_color_index, null),
                color_index: row.color_index == null ? toNumber(row.new_color, 0) : toNumber(row.color_index, 0),
                user_id: userId,
                username: row.username || null,
                ip_address: row.ip || row.ip_address || null,
                source: sourceName,
                metadata: {
                    legacy_user_id: row.user_id != null ? String(row.user_id) : null,
                },
                created_at: row.created_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'canvas_actions', row.id),
            });
            context.stats.bump('games/canvas-actions', 'written_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'canvas_snapshots'), async (row) => {
            context.stats.bump('games/canvas-snapshots', 'source_records');
            writers.canvasSnapshots.write({
                id: buildEntityId('canvas-snapshot', sourceName, row.id),
                name: row.name || 'snapshot',
                board_data: safeJsonParse(row.board_data, row.board_data || null),
                created_by_user_id: resolveOptionalCanonicalUserId(context, sourceName, row.created_by),
                source: sourceName,
                metadata: {
                    legacy_created_by: row.created_by != null ? String(row.created_by) : null,
                },
                created_at: row.created_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'canvas_snapshots', row.id),
            });
            context.stats.bump('games/canvas-snapshots', 'written_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'canvas_region_locks'), async (row) => {
            context.stats.bump('games/canvas-region-locks', 'source_records');
            writers.canvasRegionLocks.write({
                id: toNumber(row.id, 0),
                label: row.label || '',
                mode: row.mode || 'locked',
                x1: toNumber(row.x1, 0),
                y1: toNumber(row.y1, 0),
                x2: toNumber(row.x2, 0),
                y2: toNumber(row.y2, 0),
                reason: row.reason || '',
                created_by_user_id: resolveOptionalCanonicalUserId(context, sourceName, row.locked_by || row.created_by),
                source: sourceName,
                metadata: {
                    legacy_created_by: row.locked_by != null ? String(row.locked_by) : (row.created_by != null ? String(row.created_by) : null),
                },
                created_at: row.created_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'canvas_region_locks', row.id),
            });
            context.stats.bump('games/canvas-region-locks', 'written_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'canvas_bans'), async (row) => {
            context.stats.bump('games/canvas-bans', 'source_records');
            rememberHoboQuestAnonHint(context, sourceName, row.user_id, {
                table: 'canvas_bans',
                updated_at: row.created_at || null,
            });
            rememberHoboQuestAnonHint(context, sourceName, row.banned_by || row.created_by, {
                table: 'canvas_bans',
                updated_at: row.created_at || null,
            });
            writers.canvasBans.write({
                id: toNumber(row.id, 0),
                user_id: resolveOptionalCanonicalUserId(context, sourceName, row.user_id),
                ip_address: row.ip || row.ip_address || null,
                action_type: row.action_type || row.ban_type || 'ban',
                reason: row.reason || '',
                expires_at: row.expires_at || null,
                created_by_user_id: resolveOptionalCanonicalUserId(context, sourceName, row.banned_by || row.created_by),
                source: sourceName,
                metadata: {
                    legacy_user_id: row.user_id != null ? String(row.user_id) : null,
                    legacy_created_by: row.banned_by != null ? String(row.banned_by) : (row.created_by != null ? String(row.created_by) : null),
                },
                created_at: row.created_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'canvas_bans', row.id),
            });
            context.stats.bump('games/canvas-bans', 'written_records');
        });

        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'canvas_user_overrides'), async (row) => {
            context.stats.bump('games/canvas-user-overrides', 'source_records');
            rememberHoboQuestAnonHint(context, sourceName, row.user_id, {
                table: 'canvas_user_overrides',
                updated_at: row.updated_at || null,
            });
            rememberHoboQuestAnonHint(context, sourceName, row.updated_by, {
                table: 'canvas_user_overrides',
                updated_at: row.updated_at || null,
            });
            const userId = resolveRequiredCanonicalUserId(context, 'games/canvas-user-overrides', sourceName, row.user_id);
            if (!userId) return;
            if (canvasUserOverridesMap.has(userId)) {
                const existing = canvasUserOverridesMap.get(userId);
                if (existing.cooldown_seconds == null) {
                    if (row.cooldown_seconds != null) {
                        existing.cooldown_seconds = toNumber(row.cooldown_seconds, null);
                    } else if (row.cooldown_ms != null) {
                        existing.cooldown_seconds = Math.max(0, Math.round(toNumber(row.cooldown_ms, 0) / 1000));
                    }
                }
                existing.placements_per_minute = existing.placements_per_minute == null ? toNumber(row.max_placements, null) : existing.placements_per_minute;
                existing.note = existing.note || row.note || '';
                existing.updated_at = latestTimestamp(existing.updated_at, row.updated_at || null);
                appendSourceMetadata(existing, sourceName, makeLegacyRef(sourceName, 'canvas_user_overrides', row.user_id));
                context.stats.bump('games/canvas-user-overrides', 'merged_records');
                return;
            }
            canvasUserOverridesMap.set(userId, {
                id: buildEntityId('canvas-user-override', sourceName, row.user_id),
                user_id: userId,
                cooldown_seconds: row.cooldown_seconds == null
                    ? (row.cooldown_ms == null ? null : Math.max(0, Math.round(toNumber(row.cooldown_ms, 0) / 1000)))
                    : toNumber(row.cooldown_seconds, null),
                placements_per_minute: row.placements_per_minute == null ? toNumber(row.max_placements, null) : toNumber(row.placements_per_minute, null),
                bypass_read_only: !!row.bypass_read_only,
                note: row.note || '',
                updated_by_user_id: resolveOptionalCanonicalUserId(context, sourceName, row.updated_by),
                source: sourceName,
                metadata: {
                    legacy_user_id: String(row.user_id),
                },
                updated_at: row.updated_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'canvas_user_overrides', row.user_id),
            });
        });
    }

    for (const sourceName of GAME_SOURCE_PRIORITY) {
        await forEachNdjson(tableFile(context.sourceRoots[sourceName], 'user_equipped'), async (row) => {
            const userId = resolveRequiredCanonicalUserId(context, 'games/cosmetics', sourceName, row.user_id);
            if (!userId) return;
            const slot = String(row.slot);
            const itemId = String(row.item_id);
            const key = `${userId}:${slot}:${itemId}`;
            if (cosmeticMap.has(key)) return;
            cosmeticMap.set(key, {
                id: buildEntityId('cosmetic', sourceName, `${row.user_id}:${slot}:${itemId}`),
                user_id: userId,
                slot,
                item_id: itemId,
                equipped: true,
                source: sourceName,
                metadata: {
                    legacy_user_id: String(row.user_id),
                    synthesized_from_equipped: true,
                },
                acquired_at: null,
                updated_at: row.updated_at || null,
                legacy_ref: makeLegacyRef(sourceName, 'user_equipped', `${row.user_id}:${slot}`),
            });
        });
    }

    for (const row of worldStateMap.values()) {
        writers.worldState.write(row);
        context.stats.bump('games/world-state', 'written_records');
    }
    for (const row of playerMap.values()) {
        writers.players.write(row);
        context.stats.bump('games/players', 'written_records');
    }
    for (const row of inventoryMap.values()) {
        writers.inventory.write(row);
        context.stats.bump('games/inventory', 'written_records');
    }
    for (const row of bankMap.values()) {
        writers.bank.write(row);
        context.stats.bump('games/bank', 'written_records');
    }
    for (const row of farmPlotMap.values()) {
        writers.farmPlots.write(row);
        context.stats.bump('games/farm-plots', 'written_records');
    }
    for (const row of recipeMap.values()) {
        writers.recipes.write(row);
        context.stats.bump('games/recipes', 'written_records');
    }
    for (const row of battleStatsMap.values()) {
        writers.battleStats.write(row);
        context.stats.bump('games/battle-stats', 'written_records');
    }
    for (const row of fishCollectionMap.values()) {
        writers.fishCollection.write(row);
        context.stats.bump('games/fish-collection', 'written_records');
    }
    for (const row of dailyQuestMap.values()) {
        writers.dailyQuests.write(row);
        context.stats.bump('games/daily-quests', 'written_records');
    }
    for (const row of achievementMap.values()) {
        writers.achievements.write(row);
        context.stats.bump('games/achievements', 'written_records');
    }
    for (const row of cosmeticMap.values()) {
        writers.cosmetics.write(row);
        context.stats.bump('games/cosmetics', 'written_records');
    }
    for (const row of tagMap.values()) {
        writers.tags.write(row);
        context.stats.bump('games/tags', 'written_records');
    }
    for (const row of equippedTagMap.values()) {
        writers.equippedTags.write(row);
        context.stats.bump('games/equipped-tags', 'written_records');
    }
    for (const row of tagGuardianMap.values()) {
        writers.tagGuardianDefeats.write(row);
        context.stats.bump('games/tag-guardian-defeats', 'written_records');
    }
    for (const row of canvasSettingsMap.values()) {
        writers.canvasSettings.write(row);
        context.stats.bump('games/canvas-settings', 'written_records');
    }
    for (const row of canvasUserOverridesMap.values()) {
        writers.canvasUserOverrides.write(row);
        context.stats.bump('games/canvas-user-overrides', 'written_records');
    }

    flushHoboQuestAnonUsers(context);
}

async function writeIdentityDatasets(context) {
    const usersWriter = context.writers.get('identity/users');
    const anonWriter = context.writers.get('identity/anon-users');
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

    for (const record of context.userContext.anonRecordsById.values()) {
        if (record.source !== 'hobotools' || record._written) continue;
        anonWriter.write(record);
        record._written = true;
        context.stats.bump('identity/anon-users', 'source_records');
        context.stats.bump('identity/anon-users', 'written_records');
    }

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

async function writeLoyaltyDatasets(context) {
    const tables = [
        ['coin_transactions', 'loyalty/coin-transactions'],
        ['coin_rewards', 'loyalty/coin-rewards'],
        ['coin_redemptions', 'loyalty/coin-redemptions'],
        ['watch_time', 'loyalty/watch-time'],
    ];

    for (const [tableName, datasetName] of tables) {
        await forEachNdjson(tableFile(context.sourceRoots.hobostreamer, tableName), async (row) => {
            const syntheticId = row.id != null
                ? row.id
                : `${row.user_id || 'user'}:${row.reward_id || row.redemption_id || row.created_at || JSON.stringify(row)}`;
            context.writers.get(datasetName).write({
                id: buildEntityId(tableName, 'hobostreamer', syntheticId),
                source: 'hobostreamer',
                user_id: row.user_id != null ? canonicalUserIdFor(context, 'hobostreamer', row.user_id) : null,
                payload: row,
                legacy_ref: makeLegacyRef('hobostreamer', tableName, syntheticId),
            });
            context.stats.bump(datasetName, 'source_records');
            context.stats.bump(datasetName, 'written_records');
        });
    }
}

async function importCanonicalBundle(options) {
    const { sourceDir, outDir, logger } = options;
    const context = createImportContext(sourceDir, outDir, logger);

    context.exclusions = [
        ...(context.manifests.hobostreamer ? context.manifests.hobostreamer.exclusions || [] : []),
        ...(context.manifests.hobotools ? context.manifests.hobotools.exclusions || [] : []),
        ...(context.manifests.hoboquest ? context.manifests.hoboquest.exclusions || [] : []),
    ];

    await buildUserContext(context);
    await writeIdentityDatasets(context);
    await writeThemeAndControlPlaneDatasets(context);
    await writeSocialDatasets(context);
    await writeLiveDatasets(context);
    await writeChatAndCommunityDatasets(context);
    await writeMediaDatasets(context);
    await writeBillingDatasets(context);
    await writeLoyaltyDatasets(context);
    await writeGamesDatasets(context);

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
