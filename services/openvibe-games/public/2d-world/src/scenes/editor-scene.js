export class EditorScene {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.tiles = [];
        this.objects = [];
        this.cellSize = 24;
    }

    setWorld(world) {
        this.tiles = Array.isArray(world && world.tiles) ? world.tiles : [];
        this.objects = Array.isArray(world && world.objects) ? world.objects : [];
        this.render();
    }

    addTile(tile) {
        this.tiles.push(tile);
        this.render();
    }

    addObject(object) {
        this.objects.push(object);
        this.render();
    }

    render() {
        const { ctx, canvas, cellSize } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#18202d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        for (let x = 0; x < canvas.width; x += cellSize) {
            for (let y = 0; y < canvas.height; y += cellSize) {
                ctx.strokeRect(x, y, cellSize, cellSize);
            }
        }
        for (const tile of this.tiles) {
            ctx.fillStyle = tile.terrain === 'water' ? '#2874a6' : tile.terrain === 'sand' ? '#d4b483' : '#3f704d';
            ctx.fillRect(tile.x * cellSize, tile.y * cellSize, cellSize, cellSize);
        }
        for (const object of this.objects) {
            ctx.fillStyle = object.type === 'tree' ? '#4caf50' : '#8d6e63';
            ctx.fillRect(object.x * cellSize + 4, object.y * cellSize + 4, cellSize - 8, cellSize - 8);
        }
    }
}
