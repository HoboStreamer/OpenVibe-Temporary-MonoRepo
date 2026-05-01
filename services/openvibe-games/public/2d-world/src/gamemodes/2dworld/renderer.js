import * as PIXI from '/vendor/pixi/pixi.mjs';

const textureCache = new Map();
const textureLoads = new Map();

function radians(deg) {
    return deg * (Math.PI / 180);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseColor(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        if (trimmed.startsWith('#')) {
            const parsed = Number.parseInt(trimmed.slice(1), 16);
            if (Number.isFinite(parsed)) return parsed;
        }
        if (trimmed.startsWith('0x')) {
            const parsed = Number.parseInt(trimmed.slice(2), 16);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return fallback;
}

function drawLabel(text, x, y, color = 0xffffff, size = 11) {
    const label = new PIXI.Text({
        text,
        style: {
            fill: color,
            fontSize: size,
            fontFamily: 'Tahoma, Verdana, sans-serif',
            fontWeight: '700',
            stroke: { color: 0x000000, width: 3 },
        },
    });
    label.anchor.set(0.5, 1);
    label.position.set(x, y);
    return label;
}

function drawBar(x, y, width, ratio, color) {
    const g = new PIXI.Graphics();
    g.roundRect(x - width / 2, y, width, 5, 3).fill({ color: 0x111111, alpha: 0.82 });
    g.roundRect(x - width / 2, y, width * clamp(ratio, 0, 1), 5, 3).fill({ color, alpha: 0.95 });
    return g;
}

function actorFacing(actor) {
    if (typeof actor.facing === 'number' && actor.facing !== 0) return actor.facing >= 0 ? 1 : -1;
    if (typeof actor.aim_x === 'number' && Math.abs(actor.aim_x - actor.x) > 2) return actor.aim_x >= actor.x ? 1 : -1;
    return actor.vx < 0 ? -1 : 1;
}

function actorSpeed(actor) {
    return Math.sqrt(((actor.vx || 0) * (actor.vx || 0)) + ((actor.vy || 0) * (actor.vy || 0)));
}

function actorAimAngle(actor, facing) {
    const dx = (actor.aim_x == null ? actor.x + (facing * 72) : actor.aim_x) - actor.x;
    const dy = (actor.aim_y == null ? actor.y : actor.aim_y) - actor.y;
    return Math.atan2(dy || 0, dx || facing || 1);
}

function resolveItemDefinition(catalog, itemId) {
    return catalog && catalog.items && catalog.items[itemId] || null;
}

function resolveNpcDefinition(catalog, actor) {
    return catalog && catalog.npcs && actor && actor.template_id && catalog.npcs[actor.template_id] || null;
}

function resolveResourceDefinition(catalog, resource) {
    return catalog && catalog.resources && resource && resource.kind && catalog.resources[resource.kind] || null;
}

function resolveStructureDefinition(catalog, structure) {
    return catalog && catalog.structures && structure && structure.kind && catalog.structures[structure.kind] || null;
}

function resolveRuntimeEntityDefinition(catalog, entity) {
    return catalog && catalog.runtime_entities && entity && entity.kind && catalog.runtime_entities[entity.kind]
        || catalog && catalog.structures && entity && entity.kind && catalog.structures[entity.kind]
        || null;
}

function paletteFor(actor, self = false, catalog = null) {
    const fallback = self
        ? { tunic: 0x2c4d7a, trim: 0x7de3ff, skin: 0xf3d8b6, leg: 0x1d2334, accent: 0x9cf5ff }
        : actor.kind === 'boss'
            ? { tunic: 0x5e2a2a, trim: 0xffb980, skin: 0xe8c3a0, leg: 0x2e1616, accent: 0xffd8b0 }
            : actor.kind === 'mob'
                ? { tunic: actor.template_id && actor.template_id.includes('boar') ? 0x5f4738 : 0x5d2e2e, trim: 0xff9191, skin: 0xd0b090, leg: 0x342018, accent: 0xffc7b8 }
                : { tunic: 0x365544, trim: 0xa7f2c2, skin: 0xf0d8bc, leg: 0x24352d, accent: 0xd8fff0 };
    const render = resolveNpcDefinition(catalog, actor) && resolveNpcDefinition(catalog, actor).render || null;
    const palette = render && isObject(render.palette) ? render.palette : {};
    return {
        tunic: parseColor(palette.tunic, fallback.tunic),
        trim: parseColor(palette.trim, fallback.trim),
        skin: parseColor(palette.skin, fallback.skin),
        leg: parseColor(palette.leg, fallback.leg),
        accent: parseColor(palette.accent, fallback.accent),
    };
}

function hitTint(base, actor) {
    return actor.hit_flash_until && Date.now() < actor.hit_flash_until ? 0xffb0b0 : base;
}

function resolveRotation(value) {
    const amount = Number(value) || 0;
    if (Math.abs(amount) > (Math.PI * 2)) return radians(amount);
    return amount;
}

function mapPoints(points = [], facing = 1, mirror = false) {
    const dir = mirror ? facing : 1;
    return points.map((point) => [Number(point[0]) * dir, Number(point[1])]);
}

function resolvePartColor(part, palette, fallback = 0xffffff) {
    if (!part) return fallback;
    if (part.palette && palette && palette[part.palette] != null) return parseColor(palette[part.palette], fallback);
    if (part.usePalette && palette && palette[part.usePalette] != null) return parseColor(palette[part.usePalette], fallback);
    return parseColor(part.color, fallback);
}

function spriteDescriptor(value) {
    if (!value) return null;
    if (typeof value === 'string') return { src: value };
    if (isObject(value) && typeof value.src === 'string' && value.src) return value;
    return null;
}

function requestTexture(src, onReady = null) {
    if (!src) return null;
    const cached = textureCache.get(src) || PIXI.Assets.get(src) || null;
    if (cached) {
        textureCache.set(src, cached);
        return cached;
    }
    let pending = textureLoads.get(src);
    if (!pending) {
        pending = PIXI.Assets.load(src)
            .then((asset) => {
                const texture = asset instanceof PIXI.Texture ? asset : PIXI.Assets.get(src) || null;
                if (texture) textureCache.set(src, texture);
                return texture;
            })
            .catch(() => null)
            .finally(() => textureLoads.delete(src));
        textureLoads.set(src, pending);
    }
    if (onReady) pending.then(() => onReady()).catch(() => {});
    return null;
}

function buildSprite(descriptor, { facing = 1, tint = null, alpha = null, onAssetReady = null } = {}) {
    const info = spriteDescriptor(descriptor);
    if (!info || !info.src) return null;
    const texture = requestTexture(info.src, onAssetReady);
    const sprite = texture ? new PIXI.Sprite(texture) : PIXI.Sprite.from(PIXI.Texture.WHITE);
    if (!texture) sprite.alpha = 0;
    sprite.anchor.set(Number(info.anchorX == null ? 0.5 : info.anchorX), Number(info.anchorY == null ? 0.5 : info.anchorY));
    if (info.x != null || info.y != null) sprite.position.set(Number(info.x) || 0, Number(info.y) || 0);
    if (info.w != null || info.h != null) {
        const naturalWidth = Math.max(1, Number(texture && (texture.orig && texture.orig.width || texture.width) || sprite.width || 1));
        const naturalHeight = Math.max(1, Number(texture && (texture.orig && texture.orig.height || texture.height) || sprite.height || 1));
        sprite.width = Number(info.w) || naturalWidth;
        sprite.height = Number(info.h) || naturalHeight;
    }
    sprite.alpha = alpha == null ? (info.alpha == null ? 1 : Number(info.alpha)) : alpha;
    const resolvedTint = tint == null ? (info.tint == null ? null : parseColor(info.tint, null)) : tint;
    if (resolvedTint != null) sprite.tint = resolvedTint;
    sprite.rotation = resolveRotation(info.rotation);
    if (facing < 0 && info.flipWithFacing !== false) {
        sprite.scale.x *= -1;
    }
    return sprite;
}

function drawConfiguredPart(part, palette, facing = 1) {
    if (!part) return null;
    const image = part.img || part.image || part.sprite || part.src || null;
    if (image) {
        const descriptor = spriteDescriptor(image) || spriteDescriptor({ src: image });
        if (!descriptor) return null;
        return buildSprite(Object.assign({}, descriptor, {
            x: part.x != null ? part.x : descriptor.x,
            y: part.y != null ? part.y : descriptor.y,
            w: part.w != null ? part.w : descriptor.w,
            h: part.h != null ? part.h : descriptor.h,
            anchorX: part.anchorX != null ? part.anchorX : descriptor.anchorX,
            anchorY: part.anchorY != null ? part.anchorY : descriptor.anchorY,
            rotation: part.rotation != null ? part.rotation : descriptor.rotation,
            alpha: part.alpha != null ? part.alpha : descriptor.alpha,
            tint: part.tint != null ? part.tint : descriptor.tint,
            flipWithFacing: part.flipWithFacing != null ? part.flipWithFacing : descriptor.flipWithFacing,
        }), { facing });
    }
    const shape = String(part.shape || '').toLowerCase();
    if (!shape) return null;
    const g = new PIXI.Graphics();
    const color = resolvePartColor(part, palette, 0xffffff);
    const alpha = part.alpha == null ? 1 : Number(part.alpha);
    const mirror = part.mirror === true;
    const dir = mirror ? facing : 1;
    switch (shape) {
    case 'rect':
        g.rect((Number(part.x) || 0) * dir, Number(part.y) || 0, Number(part.w) || 0, Number(part.h) || 0).fill({ color, alpha });
        break;
    case 'roundedrect':
        g.roundRect((Number(part.x) || 0) * dir, Number(part.y) || 0, Number(part.w) || 0, Number(part.h) || 0, Number(part.radius) || 4).fill({ color, alpha });
        break;
    case 'circle':
        g.circle((Number(part.x) || 0) * dir, Number(part.y) || 0, Number(part.radius) || 4).fill({ color, alpha });
        break;
    case 'ellipse':
        g.ellipse((Number(part.x) || 0) * dir, Number(part.y) || 0, Number(part.rx) || 8, Number(part.ry) || Number(part.rx) || 6).fill({ color, alpha });
        break;
    case 'line':
        g.moveTo((Number(part.x1) || 0) * dir, Number(part.y1) || 0)
            .lineTo((Number(part.x2) || 0) * dir, Number(part.y2) || 0)
            .stroke({ color, width: Number(part.width) || 2, alpha, cap: 'round' });
        break;
    case 'polygon':
        g.poly(mapPoints(part.points || [], facing, mirror)).fill({ color, alpha });
        break;
    default:
        return null;
    }
    if (part.stroke) {
        g.stroke({
            color: parseColor(part.stroke.color, 0x111111),
            width: Number(part.stroke.width) || 1,
            alpha: part.stroke.alpha == null ? 1 : Number(part.stroke.alpha),
        });
    }
    g.rotation = resolveRotation(part.rotation);
    return g;
}

function addConfiguredParts(container, parts, { palette = null, facing = 1 } = {}) {
    const list = Array.isArray(parts) ? [...parts] : [];
    list.sort((a, b) => (Number(a && a.layer) || 0) - (Number(b && b.layer) || 0));
    for (const part of list) {
        const displayObject = drawConfiguredPart(part, palette, facing);
        if (displayObject) container.addChild(displayObject);
    }
}

function drawTerrainPatch(patch) {
    if (!patch || typeof patch !== 'object') return null;
    const type = String(patch.type || patch.shape || '').toLowerCase();
    if (type === 'label') {
        return drawLabel(patch.label || '', Number(patch.x) || 0, Number(patch.y) || 0, parseColor(patch.color, 0xe8fff3), Number(patch.size) || 18);
    }
    const g = new PIXI.Graphics();
    const color = parseColor(patch.color, 0xffffff);
    const alpha = patch.alpha == null ? 1 : Number(patch.alpha);
    switch (type) {
    case 'rect':
        g.rect(Number(patch.x) || 0, Number(patch.y) || 0, Number(patch.w) || 0, Number(patch.h) || 0).fill({ color, alpha });
        break;
    case 'ellipse':
        g.ellipse(Number(patch.x) || 0, Number(patch.y) || 0, Number(patch.rx) || 0, Number(patch.ry) || Number(patch.rx) || 0).fill({ color, alpha });
        break;
    case 'ring':
        g.circle(Number(patch.x) || 0, Number(patch.y) || 0, Number(patch.radius) || 0).stroke({ color, width: Number(patch.width) || 16, alpha });
        break;
    case 'path': {
        const points = Array.isArray(patch.points) ? patch.points : [];
        if (!points.length) return null;
        g.moveTo(Number(points[0].x) || 0, Number(points[0].y) || 0);
        for (const point of points.slice(1)) {
            g.lineTo(Number(point.x) || 0, Number(point.y) || 0);
        }
        g.stroke({ color, width: Number(patch.width) || 48, alpha, cap: 'round', join: 'round' });
        break;
    }
    case 'scatter': {
        const points = Array.isArray(patch.points) ? patch.points : [];
        for (const point of points) {
            g.ellipse(Number(point.x) || 0, Number(point.y) || 0, Number(point.rx) || Number(point.radius) || 12, Number(point.ry) || Number(point.radius) || 8)
                .fill({ color: parseColor(point.color, color), alpha: point.alpha == null ? alpha : Number(point.alpha) });
        }
        break;
    }
    default:
        return null;
    }
    return g;
}

function imageish(icon) {
    return typeof icon === 'string' && (icon.includes('/') || icon.endsWith('.png') || icon.endsWith('.jpg') || icon.endsWith('.webp') || icon.endsWith('.gif') || icon.endsWith('.svg'));
}

function buildClassicPlayer(actor, worldDefinition, { self = false, catalog = null } = {}) {
    const style = worldDefinition && (worldDefinition.player_render || worldDefinition.presentation && worldDefinition.presentation.player_render) || null;
    if (!style) return null;
    const facing = actorFacing(actor);
    const colors = paletteFor(actor, self, catalog);
    const itemDefinition = resolveItemDefinition(catalog, actor.held_item || actor.equip_weapon || '');
    const aimAngle = actorAimAngle(actor, facing);
    const movingSpeed = clamp(actorSpeed(actor) / 220, 0, 1.35);
    const phase = Number(actor.step_phase || 0) + ((performance.now() / 160) * movingSpeed * 0.9);
    const stride = Math.sin(phase) * 5 * movingSpeed;
    const bob = Math.cos(phase * 2) * 1.5 * movingSpeed;
    const container = new PIXI.Container();
    container.position.set(actor.x, actor.y);

    const shadow = new PIXI.Graphics();
    const shadowDef = style.shadow || {};
    shadow.ellipse(0, Number(shadowDef.y) || 28, Number(shadowDef.rx) || 18, Number(shadowDef.ry) || 7).fill({ color: 0x000000, alpha: Number(shadowDef.alpha) || 0.18 });
    container.addChild(shadow);

    const body = new PIXI.Container();
    body.y = bob;
    container.addChild(body);

    const bodyShape = new PIXI.Graphics();
    const bodyDef = style.body || { x: -20, y: -44, w: 40, h: 80, radius: 8 };
    bodyShape.roundRect(Number(bodyDef.x) || -20, Number(bodyDef.y) || -44, Number(bodyDef.w) || 40, Number(bodyDef.h) || 80, Number(bodyDef.radius) || 8)
        .fill(hitTint(colors.tunic, actor));
    body.addChild(bodyShape);

    const leftFoot = buildSprite(style.shoe, { facing });
    if (leftFoot) {
        const footPos = style.leftFoot || { x: -13, y: 33 };
        leftFoot.position.set(Number(footPos.x) || -13, (Number(footPos.y) || 33) + stride);
        body.addChild(leftFoot);
    }
    const rightFoot = buildSprite(style.shoe, { facing });
    if (rightFoot) {
        const footPos = style.rightFoot || { x: 13, y: 33 };
        rightFoot.position.set(Number(footPos.x) || 13, (Number(footPos.y) || 33) - stride);
        body.addChild(rightFoot);
    }

    const face = buildSprite(style.face, { facing });
    if (face) body.addChild(face);

    let handSource = style.handLight;
    if (colors.skin <= 0xc6a079 && style.handDark) handSource = style.handDark;
    if (colors.skin <= 0x8b6f52 && style.handDarkest) handSource = style.handDarkest;
    const hand = buildSprite(handSource, { facing });
    const handX = (Number(style.handOffsetX) || 22) * facing;
    const handY = Number(style.handOffsetY) || -4;
    if (hand) {
        hand.position.set(handX, handY);
        hand.rotation = aimAngle;
        body.addChild(hand);
    }

    const weapon = drawWeapon(actor.held_item || actor.equip_weapon || '', aimAngle, handX + (Math.cos(aimAngle) * 6), handY + (Math.sin(aimAngle) * 6), itemDefinition);
    if (weapon) body.addChild(weapon);

    addConfiguredParts(body, resolveNpcDefinition(catalog, actor) && resolveNpcDefinition(catalog, actor).render && resolveNpcDefinition(catalog, actor).render.parts, { palette: colors, facing });
    container.addChild(drawBar(0, Number(style.hpBarY) || -46, 30, actor.max_hp ? actor.hp / actor.max_hp : 0, self ? 0x7de3ff : 0x53d769));
    container.addChild(drawLabel(actor.display_name || actor.name || actor.id, 0, Number(style.labelY) || -48, self ? 0xbaf6ff : 0xffffff));
    return container;
}

function defaultWeaponType(itemId) {
    if (itemId.includes('sword')) return 'blade';
    if (itemId.includes('spear')) return 'spear';
    if (itemId.includes('bow')) return 'bow';
    if (itemId.includes('hatchet') || itemId.includes('axe')) return 'axe';
    if (itemId.includes('pickaxe')) return 'pickaxe';
    if (itemId.includes('fishing_rod')) return 'rod';
    if (itemId.includes('hoe')) return 'hoe';
    if (itemId === 'hammer') return 'hammer';
    return 'club';
}

function weaponProfile(itemId = '', itemDefinition = null) {
    const render = itemDefinition && isObject(itemDefinition.render) ? itemDefinition.render : {};
    const fallbackType = defaultWeaponType(itemId || '');
    const fallback = {
        blade: { type: 'blade', length: 34, color: 0xe8edf8, accent: 0x6b4c2d },
        spear: { type: 'spear', length: 42, color: 0xc7d2de, accent: 0x7f5539 },
        bow: { type: 'bow', length: 34, color: 0xb07a3c, accent: 0xdcc18f },
        axe: { type: 'axe', length: 28, color: 0x8c613c, accent: 0xb8c4cf },
        pickaxe: { type: 'pickaxe', length: 30, color: 0x8c613c, accent: 0xb8c4cf },
        rod: { type: 'rod', length: 40, color: 0xb78e58, accent: 0x7de3ff },
        hoe: { type: 'hoe', length: 30, color: 0x8e6b41, accent: 0xadb8c2 },
        hammer: { type: 'hammer', length: 24, color: 0x8b633e, accent: 0x9ba8b3 },
        club: { type: 'club', length: 26, color: 0x8c613c, accent: 0xb08d57 },
    }[fallbackType];
    return {
        type: render.weapon_type || fallback.type,
        length: Number(render.length) || fallback.length,
        color: parseColor(render.color, fallback.color),
        accent: parseColor(render.accent, fallback.accent),
        sprite: spriteDescriptor(render.sprite),
    };
}

function drawWeapon(itemId, angle, x, y, itemDefinition = null) {
    const profile = weaponProfile(itemId || '', itemDefinition);
    if (profile.sprite) {
        const weapon = buildSprite(Object.assign({}, profile.sprite, {
            x,
            y,
            rotation: angle,
            anchorX: profile.sprite.anchorX == null ? 0.18 : profile.sprite.anchorX,
            anchorY: profile.sprite.anchorY == null ? 0.5 : profile.sprite.anchorY,
            flipWithFacing: false,
        }));
        return weapon;
    }
    const weapon = new PIXI.Container();
    weapon.position.set(x, y);
    weapon.rotation = angle;
    const g = new PIXI.Graphics();
    switch (profile.type) {
    case 'blade':
        g.roundRect(-2, -3, 10, 6, 2).fill(profile.accent);
        g.roundRect(8, -2, profile.length, 4, 2).fill(profile.color);
        g.poly([[profile.length + 8, -2], [profile.length + 16, 0], [profile.length + 8, 2]]).fill(profile.color);
        break;
    case 'spear':
        g.roundRect(-2, -2, profile.length, 4, 2).fill(profile.color);
        g.poly([[profile.length, -4], [profile.length + 12, 0], [profile.length, 4]]).fill(0xe6ecf5);
        break;
    case 'bow':
        g.arc(12, 0, 12, radians(-70), radians(70)).stroke({ color: profile.color, width: 3 });
        g.moveTo(16, -11).lineTo(16, 11).stroke({ color: profile.accent, width: 1.5 });
        break;
    case 'axe':
        g.roundRect(-2, -2, profile.length, 4, 2).fill(profile.color);
        g.poly([[profile.length - 2, -8], [profile.length + 10, -2], [profile.length - 2, 6]]).fill(profile.accent);
        break;
    case 'pickaxe':
        g.roundRect(-2, -2, profile.length, 4, 2).fill(profile.color);
        g.moveTo(profile.length - 4, -10).lineTo(profile.length + 10, 0).lineTo(profile.length - 4, 10).stroke({ color: profile.accent, width: 4 });
        break;
    case 'rod':
        g.roundRect(-2, -1.5, profile.length, 3, 2).fill(profile.color);
        g.moveTo(profile.length - 2, 0).quadraticCurveTo(profile.length + 18, -10, profile.length + 26, -26).stroke({ color: profile.accent, width: 2 });
        break;
    case 'hoe':
        g.roundRect(-2, -2, profile.length, 4, 2).fill(profile.color);
        g.roundRect(profile.length - 4, -10, 12, 5, 2).fill(profile.accent);
        break;
    case 'hammer':
        g.roundRect(-2, -2, profile.length, 4, 2).fill(profile.color);
        g.roundRect(profile.length - 3, -8, 12, 10, 2).fill(profile.accent);
        break;
    default:
        g.roundRect(-2, -3, profile.length, 7, 4).fill(profile.color);
        g.circle(profile.length - 2, 0, 4).fill(profile.accent);
        break;
    }
    weapon.addChild(g);
    return weapon;
}

function drawSpriteEntity(entity, render, { label = null, healthRatio = null, healthColor = 0xf0c85a, tint = null } = {}) {
    const descriptor = spriteDescriptor(render && render.sprite);
    if (!descriptor) return null;
    const container = new PIXI.Container();
    container.position.set(entity.x, entity.y);
    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, 8, Math.max(10, Number(descriptor.w || 44) * 0.22), Math.max(5, Number(descriptor.h || 44) * 0.08)).fill({ color: 0x000000, alpha: 0.16 });
    container.addChild(shadow);
    const sprite = buildSprite(descriptor, { tint });
    if (sprite) container.addChild(sprite);
    if (healthRatio != null) container.addChild(drawBar(0, -(Number(descriptor.h) || 46) * 0.9, Math.max(22, Number(descriptor.w) * 0.35), healthRatio, healthColor));
    if (label) container.addChild(drawLabel(label, 0, -(Number(descriptor.h) || 46) * 0.92));
    addConfiguredParts(container, render && render.parts, { facing: actorFacing(entity) });
    return container;
}

function drawHumanoid(actor, { self = false, catalog = null, worldDefinition = null } = {}) {
    const presentation = worldDefinition && (worldDefinition.presentation || {});
    if (presentation && presentation.player_render && (actor.kind === 'self' || actor.user_id || actor.display_name)) {
        const classic = buildClassicPlayer(actor, worldDefinition, { self, catalog });
        if (classic) return classic;
    }

    const definition = resolveNpcDefinition(catalog, actor) || null;
    if (definition && definition.render && definition.render.sprite && !(definition.render.body === 'humanoid' && Array.isArray(definition.render.parts))) {
        const spriteNpc = drawSpriteEntity(actor, definition.render, {
            label: actor.display_name || actor.name || actor.id,
            healthRatio: actor.max_hp ? actor.hp / actor.max_hp : 0,
            healthColor: self ? 0x7de3ff : 0x53d769,
            tint: actor.hit_flash_until && Date.now() < actor.hit_flash_until ? 0xffb0b0 : null,
        });
        if (spriteNpc) return spriteNpc;
    }

    const facing = actorFacing(actor);
    const colors = paletteFor(actor, self, catalog);
    const definitionRender = definition && definition.render || {};
    const itemDefinition = resolveItemDefinition(catalog, actor.held_item || actor.equip_weapon || '');
    const movingSpeed = clamp(actorSpeed(actor) / 220, 0, 1.35);
    const phase = Number(actor.step_phase || 0) + ((performance.now() / 160) * movingSpeed * 0.9);
    const stride = Math.sin(phase) * 6 * movingSpeed;
    const bob = Math.cos(phase * 2) * 1.8 * movingSpeed;
    const leanBase = actor.vy < -8 ? (facing > 0 ? 10 : -10) : actor.vy > 8 ? (facing > 0 ? -10 : 10) : 0;
    const lean = radians(leanBase + clamp((actor.vx || 0) / 32, -5, 5));
    const aimAngle = actorAimAngle(actor, facing);
    const attackWindow = Math.max(0, Number(actor.attack_anim_until || 0) - Date.now());
    const attackProgress = attackWindow > 0 ? 1 - (attackWindow / 280) : 0;
    const attackSwing = attackProgress > 0 ? Math.sin(attackProgress * Math.PI) : 0;
    const frontWeapon = weaponProfile(actor.held_item || actor.equip_weapon || '', itemDefinition);
    const frontArmAngle = aimAngle + (attackWindow ? (frontWeapon.type === 'bow' ? Math.sin(attackProgress * Math.PI) * 0.08 : facing * -0.95 * attackSwing) : 0);
    const backArmAngle = aimAngle - (facing * 0.45);
    const container = new PIXI.Container();
    container.position.set(actor.x, actor.y);

    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, 24, self ? 18 : 16, self ? 7 : 6).fill({ color: 0x000000, alpha: 0.22 });
    container.addChild(shadow);

    const body = new PIXI.Container();
    body.y = bob;
    body.rotation = lean;
    container.addChild(body);

    addConfiguredParts(body, definitionRender.back_parts, { palette: colors, facing });

    const legColor = hitTint(colors.leg, actor);
    const addLimb = (startX, startY, angle, length, width, color) => {
        const limb = new PIXI.Graphics();
        const endX = startX + (Math.cos(angle) * length);
        const endY = startY + (Math.sin(angle) * length);
        limb.moveTo(startX, startY).lineTo(endX, endY).stroke({ color, width, cap: 'round' });
        limb.circle(endX, endY, width * 0.35).fill(color);
        body.addChild(limb);
        return { endX, endY };
    };

    addLimb(-5, 10, radians(90) + (stride * 0.045), 18, 5, legColor);
    addLimb(5, 10, radians(90) - (stride * 0.045), 18, 5, legColor);

    const torso = new PIXI.Graphics();
    torso.roundRect(-12, -12, 24, 28, 8).fill(hitTint(colors.tunic, actor));
    torso.roundRect(-12, -12, 24, 6, 8).fill(colors.trim);
    body.addChild(torso);

    const head = new PIXI.Graphics();
    head.circle(0, -22, 8).fill(hitTint(colors.skin, actor));
    head.circle(facing * 2, -23, 1.3).fill(0x1b1b1b);
    head.moveTo(-3, -17).lineTo(3, -17).stroke({ color: 0x5a3422, width: 1.2 });
    body.addChild(head);

    addConfiguredParts(body, definitionRender.parts, { palette: colors, facing });

    addLimb(-8, -4, backArmAngle, 16, 4.5, hitTint(colors.skin, actor));
    const frontHand = addLimb(8, -4, frontArmAngle, 18, 4.8, hitTint(colors.skin, actor));
    const weapon = drawWeapon(actor.held_item || actor.equip_weapon || '', frontArmAngle, frontHand.endX, frontHand.endY, itemDefinition);
    if (weapon) body.addChild(weapon);

    container.addChild(drawBar(0, -38, 30, actor.max_hp ? actor.hp / actor.max_hp : 0, self ? 0x7de3ff : 0x53d769));
    container.addChild(drawLabel(actor.display_name || actor.name || actor.id, 0, -40, self ? 0xbaf6ff : 0xffffff));
    return container;
}

function drawResource(resource, catalog = null) {
    const definition = resolveResourceDefinition(catalog, resource) || {};
    const render = definition.render || {};
    if (render.sprite) {
        return drawSpriteEntity(resource, render, {
            healthRatio: resource.max_hp ? resource.hp / resource.max_hp : 0,
            healthColor: 0xf0c85a,
            tint: resource.hit_flash_until && Date.now() < resource.hit_flash_until ? parseColor(render.hit, 0xd2dee7) : null,
        });
    }
    const g = new PIXI.Container();
    const art = new PIXI.Graphics();
    if (resource.kind === 'tree') {
        const hit = resource.hit_flash_until && Date.now() < resource.hit_flash_until;
        const foliage = Array.isArray(render.foliage) ? render.foliage : [0x4caf50, 0x3f9850, 0x56b85b];
        art.circle(0, -12, 18).fill(hit ? parseColor(render.hit, 0x8cff8c) : parseColor(foliage[0], 0x4caf50));
        art.circle(-10, -4, 12).fill(hit ? parseColor(render.hit, 0x8cff8c) : parseColor(foliage[1], 0x3f9850));
        art.circle(10, -2, 12).fill(hit ? parseColor(render.hit, 0x8cff8c) : parseColor(foliage[2], 0x56b85b));
        art.roundRect(-5, 6, 10, 22, 4).fill(parseColor(render.trunk, 0x8d6e63));
    } else if (resource.kind === 'rock') {
        art.poly([[-18, 10], [-8, -12], [10, -14], [20, 6], [0, 20]]).fill(resource.hit_flash_until && Date.now() < resource.hit_flash_until ? parseColor(render.hit, 0xd2dee7) : parseColor(render.rock, 0x95a5a6));
    } else {
        const hit = resource.hit_flash_until && Date.now() < resource.hit_flash_until;
        const shrub = Array.isArray(render.shrub) ? render.shrub : [0x7ed957, 0x6dc44e];
        art.circle(0, 0, 12).fill(hit ? parseColor(render.hit, 0xb3ff9c) : parseColor(shrub[0], 0x7ed957));
        art.circle(-8, 3, 9).fill(hit ? parseColor(render.hit, 0xb3ff9c) : parseColor(shrub[1], 0x6dc44e));
        art.circle(8, 3, 9).fill(hit ? parseColor(render.hit, 0xb3ff9c) : parseColor(shrub[1], 0x6dc44e));
    }
    g.addChild(art);
    g.addChild(drawBar(0, -30, 26, resource.max_hp ? resource.hp / resource.max_hp : 0, 0xf0c85a));
    g.position.set(resource.x, resource.y);
    return g;
}

function drawStructure(structure, catalog = null) {
    const definition = resolveStructureDefinition(catalog, structure) || {};
    const render = definition.render || {};
    if (render.sprite) {
        return drawSpriteEntity(structure, render);
    }
    const g = new PIXI.Container();
    const art = new PIXI.Graphics();
    const size = structure.size || 48;
    const state = structure.data || {};
    const opened = !!state.opened;
    const color = parseColor(render.color, structure.kind && String(structure.kind).includes('door') ? 0xb5651d : 0x786452);
    const accent = parseColor(render.accent, 0x0f0f0f);
    switch (String(render.shape || structure.kind || 'block')) {
    case 'wall':
        art.roundRect(-size / 2, -size * 0.26, size, size * 0.52, 6).fill({ color, alpha: 0.94 }).stroke({ color: accent, width: 2, alpha: 0.28 });
        break;
    case 'wall_half':
        art.roundRect(-size / 2, -size * 0.18, size, size * 0.34, 6).fill({ color, alpha: 0.94 }).stroke({ color: accent, width: 2, alpha: 0.28 });
        break;
    case 'door':
        art.roundRect(-size / 2, -size / 2, size, size, 8).fill({ color, alpha: opened ? 0.24 : 0.95 }).stroke({ color: accent, width: 2, alpha: opened ? 0.5 : 0.3 });
        art.circle(size / 4, 0, 2.4).fill(parseColor(render.accent, 0xf0c85a));
        break;
    case 'forcefield': {
        const fieldAlpha = opened ? 0.12 : 0.48;
        art.roundRect(-size / 2, -size / 2, size, size, 10).stroke({ color, width: 2, alpha: 0.82 });
        for (let x = -size * 0.35; x <= size * 0.35; x += size * 0.18) {
            art.moveTo(x, -size * 0.42).lineTo(x, size * 0.42).stroke({ color, width: 2, alpha: fieldAlpha });
        }
        art.roundRect(-size / 2, -size / 2, size, size, 10).fill({ color: parseColor(render.accent, 0xdff8ff), alpha: fieldAlpha * 0.25 });
        break;
    }
    case 'bed':
        art.roundRect(-size / 2, -size * 0.24, size, size * 0.5, 6).fill({ color, alpha: 0.95 }).stroke({ color: accent, width: 2, alpha: 0.25 });
        break;
    case 'chest':
        art.roundRect(-size / 2, -size * 0.28, size, size * 0.56, 6).fill({ color, alpha: 0.96 }).stroke({ color: accent, width: 2, alpha: 0.3 });
        art.circle(0, 0, 2.2).fill(0xf7e3a0);
        break;
    case 'sign':
        art.roundRect(-size * 0.08, -size * 0.08, size * 0.16, size * 0.62, 4).fill({ color: 0x6b4f38, alpha: 0.96 });
        art.roundRect(-size * 0.36, -size * 0.5, size * 0.72, size * 0.34, 6).fill({ color, alpha: 0.96 }).stroke({ color: accent, width: 2, alpha: 0.25 });
        break;
    case 'tool_cupboard':
        art.roundRect(-size * 0.34, -size * 0.48, size * 0.68, size * 0.82, 6).fill({ color, alpha: 0.96 }).stroke({ color: accent, width: 2, alpha: 0.28 });
        art.roundRect(-size * 0.24, -size * 0.12, size * 0.48, size * 0.14, 4).fill({ color: parseColor(render.accent, 0xe8ddb0), alpha: 0.7 });
        break;
    case 'workbench':
        art.roundRect(-size / 2, -size * 0.14, size, size * 0.18, 4).fill({ color, alpha: 0.96 });
        break;
    case 'furnace':
        art.roundRect(-size * 0.38, -size * 0.34, size * 0.76, size * 0.72, 10).fill({ color, alpha: 0.95 }).stroke({ color: accent, width: 2, alpha: 0.3 });
        art.circle(0, size * 0.06, size * 0.14).fill({ color: parseColor(render.accent, 0xffc96b), alpha: 0.76 });
        break;
    case 'farm_plot':
        art.roundRect(-size / 2, -size / 2, size, size, 6).fill({ color, alpha: 0.88 }).stroke({ color: accent, width: 2, alpha: 0.2 });
        break;
    case 'campfire':
        art.moveTo(-size * 0.22, size * 0.16).lineTo(size * 0.22, -size * 0.16).stroke({ color, width: 6, alpha: 0.88, cap: 'round' });
        art.moveTo(-size * 0.22, -size * 0.16).lineTo(size * 0.22, size * 0.16).stroke({ color, width: 6, alpha: 0.88, cap: 'round' });
        art.poly([[0, -size * 0.28], [size * 0.14, 0], [0, size * 0.16], [-size * 0.14, 0]]).fill({ color: parseColor(render.accent, 0xffd166), alpha: 0.92 });
        break;
    case 'barbed_wire':
        art.moveTo(-size * 0.46, 0).lineTo(size * 0.46, 0).stroke({ color, width: 3, alpha: 0.8 });
        for (let x = -size * 0.38; x <= size * 0.38; x += size * 0.2) {
            art.moveTo(x - 4, -6).lineTo(x + 4, 6).stroke({ color: accent, width: 1.5, alpha: 0.9 });
            art.moveTo(x - 4, 6).lineTo(x + 4, -6).stroke({ color: accent, width: 1.5, alpha: 0.9 });
        }
        break;
    default:
        art.roundRect(-size / 2, -size / 2, size, size, 6).fill({ color, alpha: 0.95 }).stroke({ color: accent, width: 2, alpha: 0.3 });
        break;
    }
    g.addChild(art);
    g.position.set(structure.x, structure.y);
    return g;
}

function drawRuntimeEntity(entity, catalog = null) {
    const definition = resolveRuntimeEntityDefinition(catalog, entity) || {};
    const render = definition.render || {};
    const state = entity.metadata || {};
    if (render.sprite) return drawSpriteEntity(entity, render);
    if (String(render.shape || entity.kind || '') === 'pickup' || entity.kind === 'pickup') {
        return drawLoot({
            x: entity.x,
            y: entity.y,
            item_id: state.item_id || 'coins',
            quantity: Math.max(1, Number(state.quantity || 1)),
        }, catalog);
    }
    if (String(render.shape || entity.kind || '') === 'vehicle') {
        const container = new PIXI.Container();
        const art = new PIXI.Graphics();
        const size = Number(state.size || definition.size || 68);
        art.roundRect(-size * 0.46, -size * 0.18, size * 0.92, size * 0.36, 10).fill({ color: parseColor(render.color, 0x6c717c), alpha: 0.96 }).stroke({ color: parseColor(render.accent, 0xcfd8e3), width: 2, alpha: 0.28 });
        art.roundRect(-size * 0.18, -size * 0.34, size * 0.42, size * 0.22, 8).fill({ color: parseColor(render.accent, 0xcfd8e3), alpha: 0.8 });
        art.circle(-size * 0.26, size * 0.22, size * 0.11).fill(0x1b1b1b);
        art.circle(size * 0.26, size * 0.22, size * 0.11).fill(0x1b1b1b);
        if (render.lightColor) art.roundRect(-size * 0.1, -size * 0.42, size * 0.2, size * 0.07, 4).fill({ color: parseColor(render.lightColor, 0xff5b5b), alpha: 0.9 });
        container.addChild(art);
        container.position.set(entity.x, entity.y);
        return container;
    }
    if (String(render.shape || entity.kind || '') === 'weed_plant') {
        const container = new PIXI.Container();
        const art = new PIXI.Graphics();
        const color = parseColor(render.color, 0x5aa95a);
        const accent = parseColor(render.accent, 0xc8ff90);
        art.moveTo(0, 8).lineTo(-10, -18).stroke({ color, width: 4, alpha: 0.9, cap: 'round' });
        art.moveTo(0, 8).lineTo(10, -16).stroke({ color, width: 4, alpha: 0.9, cap: 'round' });
        art.moveTo(0, 10).lineTo(0, -22).stroke({ color, width: 4, alpha: 0.95, cap: 'round' });
        art.poly([[-2, -16], [-14, -26], [-8, -10]]).fill({ color: accent, alpha: 0.9 });
        art.poly([[2, -16], [14, -24], [8, -8]]).fill({ color: accent, alpha: 0.9 });
        art.poly([[0, -24], [-9, -38], [5, -30]]).fill({ color: accent, alpha: 0.82 });
        container.addChild(art);
        container.position.set(entity.x, entity.y);
        return container;
    }
    if (String(render.shape || entity.kind || '') === 'lab') {
        const container = new PIXI.Container();
        const art = new PIXI.Graphics();
        const size = Number(state.size || definition.size || 64);
        art.roundRect(-size * 0.34, -size * 0.42, size * 0.68, size * 0.84, 8).fill({ color: parseColor(render.color, 0x56606d), alpha: 0.96 }).stroke({ color: parseColor(render.accent, 0x8fd3ff), width: 2, alpha: 0.3 });
        art.circle(-size * 0.14, -size * 0.1, size * 0.1).fill({ color: parseColor(render.accent, 0x8fd3ff), alpha: 0.75 });
        art.circle(size * 0.14, -size * 0.1, size * 0.1).fill({ color: parseColor(render.accent, 0x8fd3ff), alpha: 0.75 });
        art.roundRect(-size * 0.2, size * 0.1, size * 0.4, size * 0.14, 4).fill({ color: 0x1d232c, alpha: 0.9 });
        container.addChild(art);
        container.position.set(entity.x, entity.y);
        return container;
    }
    return drawStructure({ kind: entity.kind, x: entity.x, y: entity.y, size: Number(state.size || definition.size || 48), data: state }, {
        structures: catalog && catalog.structures || {},
    });
}

function drawLoot(drop, catalog = null) {
    const definition = resolveItemDefinition(catalog, drop.item_id || drop.itemId || 'coins') || {};
    if (definition && definition.render && (definition.render.icon || definition.render.sprite)) {
        const descriptor = spriteDescriptor(definition.render.sprite) || spriteDescriptor(definition.render.icon);
        if (descriptor) {
            const container = new PIXI.Container();
            container.position.set(drop.x, drop.y);
            const sprite = buildSprite(Object.assign({}, descriptor, {
                w: descriptor.w || 30,
                h: descriptor.h || 30,
                anchorX: descriptor.anchorX == null ? 0.5 : descriptor.anchorX,
                anchorY: descriptor.anchorY == null ? 0.72 : descriptor.anchorY,
            }));
            if (sprite) container.addChild(sprite);
            container.addChild(drawLabel(`x${drop.quantity}`, 0, -18, 0xffef9f, 10));
            return container;
        }
    }
    const g = new PIXI.Container();
    const art = new PIXI.Graphics();
    art.roundRect(-14, -9, 28, 18, 5).fill(0x5e35b1).stroke({ color: 0xffffff, width: 1, alpha: 0.18 });
    g.addChild(art);
    g.addChild(drawLabel(`x${drop.quantity}`, 0, -12, 0xffef9f, 10));
    g.position.set(drop.x, drop.y);
    return g;
}

function drawProjectile(projectile) {
    const art = new PIXI.Graphics();
    art.moveTo(-(projectile.vx || 0) * 0.035, -(projectile.vy || 0) * 0.035).lineTo(0, 0).stroke({ color: 0xfff2b0, width: 3, alpha: 0.55 });
    art.circle(0, 0, 4).fill(0xffd166);
    art.position.set(projectile.x, projectile.y);
    return art;
}

function drawPromptOverlay(prompt) {
    const container = new PIXI.Container();
    const ring = new PIXI.Graphics();
    ring.circle(0, 0, 26).stroke({ color: 0xfff2a6, width: 2, alpha: 0.6 });
    ring.circle(0, 0, 30).stroke({ color: 0x000000, width: 5, alpha: 0.15 });
    container.addChild(ring);
    container.addChild(drawLabel(prompt.label, 0, -34, 0xfff2a6, 12));
    if (prompt.description) container.addChild(drawLabel(prompt.description, 0, -18, 0xd7f3ff, 10));
    container.position.set(prompt.x, prompt.y);
    return container;
}

function buildLayerDisplay(layer, bounds = {}) {
    if (!layer || !layer.src) return null;
    const descriptor = Object.assign({}, layer);
    if (String(layer.fit || '').toLowerCase() === 'bounds') {
        descriptor.x = Number(bounds.x) || 0;
        descriptor.y = Number(bounds.y) || 0;
        descriptor.w = Number(bounds.w) || descriptor.w;
        descriptor.h = Number(bounds.h) || descriptor.h;
        descriptor.anchorX = 0;
        descriptor.anchorY = 0;
    }
    return buildSprite(descriptor, { onAssetReady: layer.onAssetReady || null });
}

export class TwoDWorldRenderer {
    constructor(mount) {
        this.mount = mount;
        this.app = null;
        this.camera = new PIXI.Container();
        this.background = new PIXI.Container();
        this.scenery = new PIXI.Container();
        this.worldLayer = new PIXI.Container();
        this.overlayLayer = new PIXI.Container();
        this.state = null;
        this.preview = null;
        this.backgroundBuilt = false;
        this.cameraWorld = null;
        this.catalog = { items: {}, npcs: {}, resources: {}, structures: {} };
        this.worldDefinition = { bounds: { x: 0, y: 0, w: 8192, h: 8192 }, chunk_size: 256, terrain_patches: [], landmarks: [], camera: {}, ambience: {}, presentation: {} };
    }

    async init() {
        this.app = new PIXI.Application();
        await this.app.init({ resizeTo: this.mount, backgroundColor: 0x0b1020, autoDensity: true, antialias: true, preference: 'webgl' });
        this.mount.replaceChildren(this.app.canvas);
        this.app.stage.addChild(this.camera);
        this.camera.addChild(this.background, this.scenery, this.worldLayer, this.overlayLayer);
    }

    setCatalog(catalog) {
        const definitions = catalog && catalog.definitions || {};
        this.catalog = {
            items: definitions.items || {},
            npcs: definitions.npcs || {},
            resources: definitions.resources || {},
            structures: definitions.structures || {},
            runtime_entities: definitions.runtime_entities || {},
        };
        this.worldDefinition = catalog && (catalog.worldDefinition || catalog.world_definition) || this.worldDefinition;
        this.background.removeChildren();
        this.scenery.removeChildren();
        this.backgroundBuilt = false;
        this.cameraWorld = null;
    }

    presentation() {
        return this.worldDefinition && this.worldDefinition.presentation || {};
    }

    ensureBackground() {
        if (this.backgroundBuilt) return;
        this.backgroundBuilt = true;
        const bounds = Object.assign({ x: 0, y: 0, w: 8192, h: 8192 }, this.worldDefinition && this.worldDefinition.bounds || {});
        const chunkSize = Number(this.worldDefinition && this.worldDefinition.chunk_size) || 256;
        const ambience = this.worldDefinition && this.worldDefinition.ambience || {};
        const presentation = this.presentation();

        const bg = new PIXI.Graphics();
        bg.rect(bounds.x, bounds.y, bounds.w, bounds.h).fill(parseColor(ambience.base_color, 0x2f5d50));
        this.background.addChild(bg);

        const spriteLayers = presentation && presentation.sprite_layers || {};
        const invalidateBackground = () => {
            if (!this.backgroundBuilt) return;
            this.backgroundBuilt = false;
            this.background.removeChildren();
            this.scenery.removeChildren();
        };
        for (const layer of spriteLayers.background || []) {
            const display = buildLayerDisplay(Object.assign({}, layer, { onAssetReady: invalidateBackground }), bounds);
            if (display) this.background.addChild(display);
        }
        for (const layer of spriteLayers.detail || []) {
            const display = buildLayerDisplay(Object.assign({}, layer, { onAssetReady: invalidateBackground }), bounds);
            if (display) this.scenery.addChild(display);
        }

        if (presentation.show_terrain_patches !== false) {
            for (const patch of this.worldDefinition && this.worldDefinition.terrain_patches || []) {
                const displayObject = drawTerrainPatch(patch);
                if (displayObject) this.background.addChild(displayObject);
            }
        }

        if (presentation.show_grid !== false) {
            const grid = new PIXI.Graphics();
            for (let x = bounds.x; x <= bounds.x + bounds.w; x += chunkSize) {
                grid.moveTo(x, bounds.y).lineTo(x, bounds.y + bounds.h).stroke({ color: 0xffffff, width: 1, alpha: Number(ambience.grid_alpha) || 0.03 });
            }
            for (let y = bounds.y; y <= bounds.y + bounds.h; y += chunkSize) {
                grid.moveTo(bounds.x, y).lineTo(bounds.x + bounds.w, y).stroke({ color: 0xffffff, width: 1, alpha: Number(ambience.grid_alpha) || 0.03 });
            }
            this.background.addChild(grid);
        }

        if (presentation.show_landmarks !== false) {
            for (const landmark of this.worldDefinition && this.worldDefinition.landmarks || []) {
                const displayObject = drawTerrainPatch(landmark);
                if (displayObject) this.background.addChild(displayObject);
            }
        }
    }

    setBuildPreview(preview) {
        this.preview = preview;
    }

    screenToWorld(x, y) {
        const camera = this.camera.position;
        return { x: x - camera.x, y: y - camera.y };
    }

    render(snapshot) {
        if (!this.app || !snapshot) return;
        this.state = snapshot;
        const self = snapshot.self;
        const width = this.app.screen.width;
        const height = this.app.screen.height;
        const cameraConfig = Object.assign({ damping: 0.18, look_ahead: 0.18, max_lead: 120 }, this.worldDefinition && this.worldDefinition.camera || {}, snapshot.world && snapshot.world.camera || {});
        const leadX = clamp((self.vx || 0) * Number(cameraConfig.look_ahead || 0), -(Number(cameraConfig.max_lead) || 120), Number(cameraConfig.max_lead) || 120);
        const leadY = clamp((self.vy || 0) * Number(cameraConfig.look_ahead || 0), -(Number(cameraConfig.max_lead) || 120), Number(cameraConfig.max_lead) || 120);
        this.ensureBackground();
        if (!this.cameraWorld) this.cameraWorld = { x: self.x, y: self.y };
        this.cameraWorld.x += ((self.x + leadX) - this.cameraWorld.x) * Number(cameraConfig.damping || 0.18);
        this.cameraWorld.y += ((self.y + leadY) - this.cameraWorld.y) * Number(cameraConfig.damping || 0.18);
        this.camera.position.set((width / 2) - this.cameraWorld.x, (height / 2) - this.cameraWorld.y);
        this.worldLayer.removeChildren();
        this.overlayLayer.removeChildren();

        const ambience = snapshot.world && snapshot.world.ambience || {};
        if (ambience && ambience.tint) {
            const overlay = new PIXI.Graphics();
            const overlayRange = Math.max(width, height) * 1.8;
            overlay.rect(self.x - overlayRange, self.y - overlayRange, overlayRange * 2, overlayRange * 2).fill({ color: parseColor(ambience.tint, 0xffffff), alpha: Number(ambience.alpha) || 0.05 });
            this.overlayLayer.addChild(overlay);
        }

        const worldObjects = [];
        for (const resource of snapshot.entities.resources || []) {
            const display = drawResource(resource, this.catalog);
            if (display) worldObjects.push({ y: resource.y || 0, display });
        }
        for (const structure of snapshot.entities.structures || []) {
            const display = drawStructure(structure, this.catalog);
            if (display) worldObjects.push({ y: structure.y || 0, display });
        }
        for (const entity of snapshot.entities.runtime_entities || []) {
            const display = drawRuntimeEntity(entity, this.catalog);
            if (display) worldObjects.push({ y: entity.y || 0, display });
        }
        for (const loot of snapshot.entities.loot || []) {
            const display = drawLoot(loot, this.catalog);
            if (display) worldObjects.push({ y: loot.y || 0, display });
        }
        for (const npc of snapshot.entities.npcs || []) {
            const display = drawHumanoid(npc, { catalog: this.catalog, worldDefinition: this.worldDefinition });
            if (display) worldObjects.push({ y: npc.y || 0, display });
        }
        for (const player of snapshot.entities.players || []) {
            const display = drawHumanoid(player, { catalog: this.catalog, worldDefinition: this.worldDefinition });
            if (display) worldObjects.push({ y: player.y || 0, display });
        }
        const selfDisplay = drawHumanoid(Object.assign({}, self, { kind: 'self' }), { self: true, catalog: this.catalog, worldDefinition: this.worldDefinition });
        if (selfDisplay) worldObjects.push({ y: self.y || 0, display: selfDisplay });
        for (const projectile of snapshot.entities.projectiles || []) {
            const display = drawProjectile(projectile);
            if (display) worldObjects.push({ y: projectile.y || 0, display });
        }

        worldObjects.sort((a, b) => a.y - b.y);
        for (const entry of worldObjects) this.worldLayer.addChild(entry.display);

        if (snapshot.interaction && snapshot.interaction.prompt) {
            this.overlayLayer.addChild(drawPromptOverlay(snapshot.interaction.prompt));
        }

        if (this.preview) {
            const p = new PIXI.Graphics();
            p.roundRect(this.preview.x - 24, this.preview.y - 24, 48, 48, 6).fill({ color: 0x66ccff, alpha: 0.35 }).stroke({ color: 0xffffff, width: 2, alpha: 0.6 });
            this.overlayLayer.addChild(p);
        }
    }
}
