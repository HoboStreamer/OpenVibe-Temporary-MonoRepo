import * as PIXI from '/vendor/pixi/pixi.mjs';

function radians(deg) {
    return deg * (Math.PI / 180);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function drawLabel(text, x, y, color = 0xffffff, size = 11) {
    const label = new PIXI.Text({ text, style: { fill: color, fontSize: size, fontFamily: 'monospace', stroke: { color: 0x000000, width: 3 } } });
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

function paletteFor(actor, self = false) {
    if (self) return { tunic: 0x2c4d7a, trim: 0x7de3ff, skin: 0xf3d8b6, leg: 0x1d2334, accent: 0x9cf5ff };
    if (actor.kind === 'boss') return { tunic: 0x5e2a2a, trim: 0xffb980, skin: 0xe8c3a0, leg: 0x2e1616, accent: 0xffd8b0 };
    if (actor.kind === 'mob') return { tunic: actor.template_id && actor.template_id.includes('boar') ? 0x5f4738 : 0x5d2e2e, trim: 0xff9191, skin: 0xd0b090, leg: 0x342018, accent: 0xffc7b8 };
    return { tunic: 0x365544, trim: 0xa7f2c2, skin: 0xf0d8bc, leg: 0x24352d, accent: 0xd8fff0 };
}

function hitTint(base, actor) {
    return actor.hit_flash_until && Date.now() < actor.hit_flash_until ? 0xffb0b0 : base;
}

function weaponProfile(itemId = '') {
    if (itemId.includes('sword')) return { type: 'blade', length: 34, color: 0xe8edf8, accent: 0x6b4c2d };
    if (itemId.includes('spear')) return { type: 'spear', length: 42, color: 0xc7d2de, accent: 0x7f5539 };
    if (itemId.includes('bow')) return { type: 'bow', length: 34, color: 0xb07a3c, accent: 0xdcc18f };
    if (itemId.includes('hatchet') || itemId.includes('axe')) return { type: 'axe', length: 28, color: 0x8c613c, accent: 0xb8c4cf };
    if (itemId.includes('pickaxe')) return { type: 'pickaxe', length: 30, color: 0x8c613c, accent: 0xb8c4cf };
    if (itemId.includes('fishing_rod')) return { type: 'rod', length: 40, color: 0xb78e58, accent: 0x7de3ff };
    if (itemId.includes('hoe')) return { type: 'hoe', length: 30, color: 0x8e6b41, accent: 0xadb8c2 };
    if (itemId === 'hammer') return { type: 'hammer', length: 24, color: 0x8b633e, accent: 0x9ba8b3 };
    return { type: 'club', length: 26, color: 0x8c613c, accent: 0xb08d57 };
}

function drawWeapon(itemId, angle, x, y) {
    const profile = weaponProfile(itemId || '');
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

function addLimb(container, startX, startY, angle, length, width, color) {
    const limb = new PIXI.Graphics();
    const endX = startX + (Math.cos(angle) * length);
    const endY = startY + (Math.sin(angle) * length);
    limb.moveTo(startX, startY).lineTo(endX, endY).stroke({ color, width, cap: 'round' });
    limb.circle(endX, endY, width * 0.35).fill(color);
    container.addChild(limb);
    return { endX, endY };
}

function drawHumanoid(actor, { self = false } = {}) {
    const facing = actorFacing(actor);
    const colors = paletteFor(actor, self);
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
    const frontArmAngle = aimAngle + (attackWindow ? (weaponProfile(actor.held_item || actor.equip_weapon || '').type === 'bow' ? Math.sin(attackProgress * Math.PI) * 0.08 : facing * -0.95 * attackSwing) : 0);
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

    const legColor = hitTint(colors.leg, actor);
    addLimb(body, -5, 10, radians(90) + (stride * 0.045), 18, 5, legColor);
    addLimb(body, 5, 10, radians(90) - (stride * 0.045), 18, 5, legColor);

    const torso = new PIXI.Graphics();
    torso.roundRect(-12, -12, 24, 28, 8).fill(hitTint(colors.tunic, actor));
    torso.roundRect(-12, -12, 24, 6, 8).fill(colors.trim);
    body.addChild(torso);

    const head = new PIXI.Graphics();
    head.circle(0, -22, 8).fill(hitTint(colors.skin, actor));
    head.circle(facing * 2, -23, 1.3).fill(0x1b1b1b);
    head.moveTo(-3, -17).lineTo(3, -17).stroke({ color: 0x5a3422, width: 1.2 });
    body.addChild(head);

    addLimb(body, -8, -4, backArmAngle, 16, 4.5, hitTint(colors.skin, actor));
    const frontHand = addLimb(body, 8, -4, frontArmAngle, 18, 4.8, hitTint(colors.skin, actor));
    body.addChild(drawWeapon(actor.held_item || actor.equip_weapon || '', frontArmAngle, frontHand.endX, frontHand.endY));

    container.addChild(drawBar(0, -38, 30, actor.max_hp ? actor.hp / actor.max_hp : 0, self ? 0x7de3ff : 0x53d769));
    container.addChild(drawLabel(actor.display_name || actor.name || actor.id, 0, -40, self ? 0xbaf6ff : 0xffffff));
    return container;
}

function drawBoar(actor) {
    const container = new PIXI.Container();
    container.position.set(actor.x, actor.y);
    const facing = actorFacing(actor);
    const movingSpeed = clamp(actorSpeed(actor) / 180, 0, 1.2);
    const phase = Number(actor.step_phase || 0) + ((performance.now() / 140) * movingSpeed);
    const stride = Math.sin(phase) * 4 * movingSpeed;
    const body = new PIXI.Graphics();
    body.ellipse(0, 0, 18, 12).fill(hitTint(0x5f4738, actor));
    body.circle(14 * facing, -2, 8).fill(hitTint(0x755744, actor));
    body.circle((18 * facing), 0, 2).fill(0xf7f0df);
    body.circle((18 * facing), 3, 2).fill(0xf7f0df);
    body.circle((15 * facing), -4, 1.2).fill(0x0b0b0b);
    body.moveTo(8 * facing, -2).lineTo(20 * facing, -8).stroke({ color: 0xf4efe7, width: 1.3 });
    body.moveTo(8 * facing, 2).lineTo(20 * facing, 8).stroke({ color: 0xf4efe7, width: 1.3 });
    body.moveTo(-8, 10).lineTo(-8 + stride, 18).stroke({ color: 0x2e2118, width: 3, cap: 'round' });
    body.moveTo(0, 10).lineTo(0 - stride, 18).stroke({ color: 0x2e2118, width: 3, cap: 'round' });
    body.moveTo(8, 10).lineTo(8 + stride, 18).stroke({ color: 0x2e2118, width: 3, cap: 'round' });
    body.moveTo(15, 8).lineTo(15 - stride, 18).stroke({ color: 0x2e2118, width: 3, cap: 'round' });
    container.addChild(body);
    container.addChild(drawBar(0, -24, 28, actor.max_hp ? actor.hp / actor.max_hp : 0, 0xf08c6d));
    container.addChild(drawLabel(actor.name || actor.id, 0, -26));
    return container;
}

function drawResource(resource) {
    const g = new PIXI.Container();
    const art = new PIXI.Graphics();
    if (resource.kind === 'tree') {
        art.circle(0, -12, 18).fill(resource.hit_flash_until && Date.now() < resource.hit_flash_until ? 0x8cff8c : 0x4caf50);
        art.circle(-10, -4, 12).fill(resource.hit_flash_until && Date.now() < resource.hit_flash_until ? 0x8cff8c : 0x3f9850);
        art.circle(10, -2, 12).fill(resource.hit_flash_until && Date.now() < resource.hit_flash_until ? 0x8cff8c : 0x56b85b);
        art.roundRect(-5, 6, 10, 22, 4).fill(0x8d6e63);
    } else if (resource.kind === 'rock') {
        art.poly([[-18, 10], [-8, -12], [10, -14], [20, 6], [0, 20]]).fill(resource.hit_flash_until && Date.now() < resource.hit_flash_until ? 0xd2dee7 : 0x95a5a6);
    } else {
        art.circle(0, 0, 12).fill(resource.hit_flash_until && Date.now() < resource.hit_flash_until ? 0xb3ff9c : 0x7ed957);
        art.circle(-8, 3, 9).fill(resource.hit_flash_until && Date.now() < resource.hit_flash_until ? 0xb3ff9c : 0x6dc44e);
        art.circle(8, 3, 9).fill(resource.hit_flash_until && Date.now() < resource.hit_flash_until ? 0xb3ff9c : 0x6dc44e);
    }
    g.addChild(art);
    g.addChild(drawBar(0, -30, 26, resource.max_hp ? resource.hp / resource.max_hp : 0, 0xf0c85a));
    g.position.set(resource.x, resource.y);
    return g;
}

function drawStructure(structure) {
    const g = new PIXI.Container();
    const art = new PIXI.Graphics();
    const size = structure.size || 48;
    const color = structure.kind && String(structure.kind).includes('door') ? 0xb5651d : 0x786452;
    art.roundRect(-size / 2, -size / 2, size, size, 6).fill({ color, alpha: 0.95 }).stroke({ color: 0x0f0f0f, width: 2, alpha: 0.3 });
    if (String(structure.kind).includes('door')) art.circle(size / 4, 0, 2).fill(0xf0c85a);
    g.addChild(art);
    g.position.set(structure.x, structure.y);
    return g;
}

function drawLoot(drop) {
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

export class PixiWorldRenderer {
    constructor(mount) {
        this.mount = mount;
        this.app = null;
        this.camera = new PIXI.Container();
        this.background = new PIXI.Container();
        this.worldLayer = new PIXI.Container();
        this.overlayLayer = new PIXI.Container();
        this.state = null;
        this.preview = null;
        this.backgroundBuilt = false;
        this.cameraWorld = null;
    }

    async init() {
        this.app = new PIXI.Application();
        await this.app.init({ resizeTo: this.mount, backgroundColor: 0x0b1020, autoDensity: true, antialias: true, preference: 'webgl' });
        this.mount.replaceChildren(this.app.canvas);
        this.app.stage.addChild(this.camera);
        this.camera.addChild(this.background, this.worldLayer, this.overlayLayer);
    }

    ensureBackground() {
        if (this.backgroundBuilt) return;
        this.backgroundBuilt = true;
        const bg = new PIXI.Graphics();
        bg.rect(0, 0, 8192, 8192).fill(0x2f5d50);
        bg.rect(3650, 3820, 760, 640).fill(0x7e6a54);
        bg.rect(4850, 3450, 1600, 1180).fill(0x556b2f);
        bg.rect(2800, 5000, 620, 520).fill(0x8bc34a);
        bg.rect(2320, 4300, 280, 240).fill(0x2874a6);
        bg.rect(5840, 5840, 360, 320).fill(0x3b2d1f);
        for (let x = 0; x <= 8192; x += 256) bg.moveTo(x, 0).lineTo(x, 8192).stroke({ color: 0xffffff, width: 1, alpha: 0.03 });
        for (let y = 0; y <= 8192; y += 256) bg.moveTo(0, y).lineTo(8192, y).stroke({ color: 0xffffff, width: 1, alpha: 0.03 });
        this.background.addChild(bg);
        this.background.addChild(drawLabel('Outpost', 4096, 3880, 0xe8fff3, 18));
        this.background.addChild(drawLabel('Wilderness', 5600, 3520, 0xffd8b8, 18));
        this.background.addChild(drawLabel('Farm Island', 3110, 4990, 0xe8fff3, 18));
        this.background.addChild(drawLabel('Dock', 2450, 4270, 0xdff4ff, 18));
        this.background.addChild(drawLabel('Dungeon Depths', 6020, 5820, 0xffd8d8, 18));
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
        this.ensureBackground();
        if (!this.cameraWorld) this.cameraWorld = { x: self.x, y: self.y };
        this.cameraWorld.x += (self.x - this.cameraWorld.x) * 0.18;
        this.cameraWorld.y += (self.y - this.cameraWorld.y) * 0.18;
        this.camera.position.set((width / 2) - this.cameraWorld.x, (height / 2) - this.cameraWorld.y);
        this.worldLayer.removeChildren();
        this.overlayLayer.removeChildren();

        for (const resource of snapshot.entities.resources || []) this.worldLayer.addChild(drawResource(resource));
        for (const structure of snapshot.entities.structures || []) this.worldLayer.addChild(drawStructure(structure));
        for (const loot of snapshot.entities.loot || []) this.worldLayer.addChild(drawLoot(loot));
        for (const npc of snapshot.entities.npcs || []) {
            this.worldLayer.addChild(npc.template_id && npc.template_id.includes('boar') ? drawBoar(npc) : drawHumanoid(npc));
        }
        for (const player of snapshot.entities.players || []) this.worldLayer.addChild(drawHumanoid(player));
        this.worldLayer.addChild(drawHumanoid(Object.assign({}, self, { kind: 'self' }), { self: true }));
        for (const projectile of snapshot.entities.projectiles || []) this.worldLayer.addChild(drawProjectile(projectile));

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
