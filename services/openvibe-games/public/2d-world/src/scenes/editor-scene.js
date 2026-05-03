function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function terrainColor(terrain) {
    switch (String(terrain || '').toLowerCase()) {
    case 'water': return '#2b6d9d';
    case 'sand': return '#b99c68';
    case 'road': return '#8d7f67';
    default: return '#31543b';
    }
}

function objectStyle(type) {
    switch (String(type || '').toLowerCase()) {
    case 'tree':
        return { color: '#5fb86c', accent: '#244229', label: 'T', size: 0.72, shape: 'circle' };
    case 'rock':
        return { color: '#9aa7b0', accent: '#303b44', label: 'R', size: 0.64, shape: 'diamond' };
    case 'chest':
        return { color: '#8b6136', accent: '#e1bc74', label: 'C', size: 0.68, shape: 'rect' };
    case 'sign':
        return { color: '#7b5636', accent: '#f0deb3', label: 'S', size: 0.56, shape: 'sign' };
    case 'bus':
        return { color: '#8a6a4d', accent: '#ffe0a6', label: 'BUS', size: 1.5, shape: 'bus' };
    case 'spawn':
        return { color: '#71e3ff', accent: '#13222a', label: '+', size: 0.76, shape: 'spawn' };
    default:
        return { color: '#8d6e63', accent: '#f0f4ff', label: '?', size: 0.62, shape: 'rect' };
    }
}

function cellKey(entry) {
    return `${Number(entry && entry.x) || 0}:${Number(entry && entry.y) || 0}`;
}

export class EditorScene {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.tiles = [];
        this.objects = [];
        this.bounds = { x: 0, y: 0, w: 16384, h: 16384 };
        this.cellSize = 64;
        this.camera = { x: 4096, y: 4096, zoom: 0.72 };
        this.hoverCell = null;
        this.preview = null;
        this.viewport = { width: canvas.clientWidth || 960, height: canvas.clientHeight || 720 };
        if (typeof ResizeObserver === 'function') {
            this.resizeObserver = new ResizeObserver(() => this.render());
            this.resizeObserver.observe(canvas);
        }
    }

    setWorld(world) {
        this.tiles = Array.isArray(world && world.tiles) ? [...world.tiles] : [];
        this.objects = Array.isArray(world && world.objects) ? [...world.objects] : [];
        this.bounds = Object.assign({}, this.bounds, world && world.bounds || {});
        this.cellSize = Math.max(16, Number(world && world.cellSize) || this.cellSize || 64);
        if (world && world.camera) {
            this.camera = {
                x: Number(world.camera.x) || this.camera.x,
                y: Number(world.camera.y) || this.camera.y,
                zoom: clamp(Number(world.camera.zoom) || this.camera.zoom, 0.35, 2.4),
            };
        }
        this.render();
    }

    setHoverCell(cell) {
        this.hoverCell = cell;
        this.render();
    }

    setPreview(preview) {
        this.preview = preview;
        this.render();
    }

    syncCanvasSize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(320, Math.round(rect.width * dpr));
        const height = Math.max(240, Math.round(rect.height * dpr));
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        this.viewport = { width: Math.max(320, rect.width || 320), height: Math.max(240, rect.height || 240), dpr };
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return this.viewport;
    }

    screenToWorld(screenX, screenY) {
        const viewport = this.syncCanvasSize();
        return {
            x: this.camera.x + ((Number(screenX) - (viewport.width / 2)) / this.camera.zoom),
            y: this.camera.y + ((Number(screenY) - (viewport.height / 2)) / this.camera.zoom),
        };
    }

    worldToScreen(worldX, worldY) {
        const viewport = this.viewport;
        return {
            x: ((Number(worldX) - this.camera.x) * this.camera.zoom) + (viewport.width / 2),
            y: ((Number(worldY) - this.camera.y) * this.camera.zoom) + (viewport.height / 2),
        };
    }

    screenToCell(screenX, screenY) {
        const world = this.screenToWorld(screenX, screenY);
        return {
            x: Math.floor((world.x - this.bounds.x) / this.cellSize),
            y: Math.floor((world.y - this.bounds.y) / this.cellSize),
        };
    }

    cellToWorld(cell) {
        return {
            x: this.bounds.x + (Number(cell && cell.x) || 0) * this.cellSize,
            y: this.bounds.y + (Number(cell && cell.y) || 0) * this.cellSize,
        };
    }

    centerOfCell(cell) {
        const origin = this.cellToWorld(cell);
        return {
            x: origin.x + (this.cellSize / 2),
            y: origin.y + (this.cellSize / 2),
        };
    }

    panBy(screenDx, screenDy) {
        this.camera.x -= Number(screenDx || 0) / this.camera.zoom;
        this.camera.y -= Number(screenDy || 0) / this.camera.zoom;
        this._clampCamera();
        this.render();
    }

    zoomBy(delta, anchorX, anchorY) {
        const before = this.screenToWorld(anchorX, anchorY);
        const nextZoom = clamp(this.camera.zoom * (delta > 0 ? 0.9 : 1.1), 0.35, 2.4);
        this.camera.zoom = nextZoom;
        const after = this.screenToWorld(anchorX, anchorY);
        this.camera.x += before.x - after.x;
        this.camera.y += before.y - after.y;
        this._clampCamera();
        this.render();
    }

    _clampCamera() {
        const viewport = this.viewport;
        const halfWidth = viewport.width / (2 * this.camera.zoom);
        const halfHeight = viewport.height / (2 * this.camera.zoom);
        this.camera.x = clamp(this.camera.x, this.bounds.x + halfWidth, this.bounds.x + this.bounds.w - halfWidth);
        this.camera.y = clamp(this.camera.y, this.bounds.y + halfHeight, this.bounds.y + this.bounds.h - halfHeight);
    }

    _drawBackground(ctx, viewport) {
        const gradient = ctx.createLinearGradient(0, 0, 0, viewport.height);
        gradient.addColorStop(0, '#132137');
        gradient.addColorStop(0.5, '#0d1423');
        gradient.addColorStop(1, '#060910');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, viewport.width, viewport.height);
    }

    _drawBounds(ctx) {
        const topLeft = this.worldToScreen(this.bounds.x, this.bounds.y);
        const bottomRight = this.worldToScreen(this.bounds.x + this.bounds.w, this.bounds.y + this.bounds.h);
        ctx.fillStyle = 'rgba(24, 33, 50, 0.28)';
        ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        ctx.strokeStyle = 'rgba(122, 154, 199, 0.32)';
        ctx.lineWidth = 1;
        ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    }

    _drawGrid(ctx, viewport) {
        const worldLeft = this.camera.x - (viewport.width / (2 * this.camera.zoom));
        const worldRight = this.camera.x + (viewport.width / (2 * this.camera.zoom));
        const worldTop = this.camera.y - (viewport.height / (2 * this.camera.zoom));
        const worldBottom = this.camera.y + (viewport.height / (2 * this.camera.zoom));
        const startX = Math.floor((worldLeft - this.bounds.x) / this.cellSize);
        const endX = Math.ceil((worldRight - this.bounds.x) / this.cellSize);
        const startY = Math.floor((worldTop - this.bounds.y) / this.cellSize);
        const endY = Math.ceil((worldBottom - this.bounds.y) / this.cellSize);
        for (let cellX = startX; cellX <= endX; cellX += 1) {
            const worldX = this.bounds.x + (cellX * this.cellSize);
            const screen = this.worldToScreen(worldX, this.bounds.y);
            ctx.strokeStyle = cellX % 4 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
            ctx.lineWidth = cellX % 4 === 0 ? 1.2 : 1;
            ctx.beginPath();
            ctx.moveTo(screen.x, 0);
            ctx.lineTo(screen.x, viewport.height);
            ctx.stroke();
        }
        for (let cellY = startY; cellY <= endY; cellY += 1) {
            const worldY = this.bounds.y + (cellY * this.cellSize);
            const screen = this.worldToScreen(this.bounds.x, worldY);
            ctx.strokeStyle = cellY % 4 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
            ctx.lineWidth = cellY % 4 === 0 ? 1.2 : 1;
            ctx.beginPath();
            ctx.moveTo(0, screen.y);
            ctx.lineTo(viewport.width, screen.y);
            ctx.stroke();
        }
    }

    _drawTiles(ctx) {
        const seen = new Set();
        for (const tile of this.tiles) {
            const key = cellKey(tile);
            if (seen.has(key)) continue;
            seen.add(key);
            const origin = this.cellToWorld(tile);
            const screen = this.worldToScreen(origin.x, origin.y);
            const size = this.cellSize * this.camera.zoom;
            ctx.fillStyle = terrainColor(tile.terrain);
            ctx.globalAlpha = 0.88;
            ctx.fillRect(screen.x, screen.y, size, size);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.strokeRect(screen.x + 0.5, screen.y + 0.5, size - 1, size - 1);
        }
    }

    _drawObject(ctx, object) {
        const style = objectStyle(object.type);
        const center = this.centerOfCell(object);
        const screen = this.worldToScreen(center.x, center.y);
        const cellPx = this.cellSize * this.camera.zoom;
        const size = cellPx * style.size;
        ctx.save();
        ctx.translate(screen.x, screen.y);
        ctx.fillStyle = style.color;
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 2;
        if (style.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, size * 0.48, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (style.shape === 'diamond') {
            ctx.beginPath();
            ctx.moveTo(0, -size * 0.45);
            ctx.lineTo(size * 0.45, 0);
            ctx.lineTo(0, size * 0.45);
            ctx.lineTo(-size * 0.45, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (style.shape === 'sign') {
            ctx.fillRect(-size * 0.08, -size * 0.1, size * 0.16, size * 0.7);
            ctx.strokeRect(-size * 0.08, -size * 0.1, size * 0.16, size * 0.7);
            ctx.fillRect(-size * 0.38, -size * 0.52, size * 0.76, size * 0.28);
            ctx.strokeRect(-size * 0.38, -size * 0.52, size * 0.76, size * 0.28);
        } else if (style.shape === 'bus') {
            const busWidth = size * 1.2;
            const busHeight = size * 0.46;
            ctx.beginPath();
            ctx.roundRect(-busWidth / 2, -busHeight / 2, busWidth, busHeight, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgba(10, 16, 22, 0.85)';
            ctx.fillRect(-busWidth * 0.22, -busHeight * 0.28, busWidth * 0.44, busHeight * 0.24);
            ctx.fillStyle = style.accent;
            ctx.beginPath();
            ctx.arc(-busWidth * 0.28, busHeight * 0.52, busHeight * 0.18, 0, Math.PI * 2);
            ctx.arc(busWidth * 0.28, busHeight * 0.52, busHeight * 0.18, 0, Math.PI * 2);
            ctx.fill();
        } else if (style.shape === 'spawn') {
            ctx.beginPath();
            ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-size * 0.5, 0);
            ctx.lineTo(size * 0.5, 0);
            ctx.moveTo(0, -size * 0.5);
            ctx.lineTo(0, size * 0.5);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.roundRect(-size / 2, -size / 2, size, size, 8);
            ctx.fill();
            ctx.stroke();
        }
        if (style.label) {
            ctx.fillStyle = '#f4f7ff';
            ctx.font = `${Math.max(10, size * 0.26)}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(style.label, 0, style.shape === 'bus' ? 0 : 1);
        }
        ctx.restore();
    }

    _drawObjects(ctx) {
        const deduped = new Map();
        for (const object of this.objects) deduped.set(cellKey(object), object);
        deduped.forEach((object) => this._drawObject(ctx, object));
    }

    _drawPreview(ctx) {
        const cell = this.preview || this.hoverCell;
        if (!cell) return;
        const origin = this.cellToWorld(cell);
        const screen = this.worldToScreen(origin.x, origin.y);
        const size = this.cellSize * this.camera.zoom;
        ctx.save();
        ctx.strokeStyle = 'rgba(113, 227, 255, 0.92)';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.strokeRect(screen.x + 1, screen.y + 1, size - 2, size - 2);
        ctx.restore();
    }

    _drawOverlay(ctx, viewport) {
        ctx.save();
        ctx.fillStyle = 'rgba(6, 10, 16, 0.72)';
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(18, 18, 230, 72, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#d9e5f8';
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        ctx.fillText('SourceVibe world space', 32, 42);
        ctx.fillStyle = '#9fb0cc';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.fillText(`camera ${Math.round(this.camera.x)}, ${Math.round(this.camera.y)}`, 32, 62);
        ctx.fillText(`zoom ${Math.round(this.camera.zoom * 100)}% · cell ${this.cellSize}px`, 32, 80);
        ctx.restore();
    }

    render() {
        const viewport = this.syncCanvasSize();
        this._clampCamera();
        const { ctx } = this;
        ctx.clearRect(0, 0, viewport.width, viewport.height);
        this._drawBackground(ctx, viewport);
        this._drawBounds(ctx);
        this._drawGrid(ctx, viewport);
        this._drawTiles(ctx);
        this._drawObjects(ctx);
        this._drawPreview(ctx);
        this._drawOverlay(ctx, viewport);
    }
}
