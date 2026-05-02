'use strict';

const assert = require('assert');
const { EditorRoom } = require('../server/realtime/rooms/editor-room');

const room = new EditorRoom({
    emitToSocket: () => {},
    publish: () => {},
});

const joined = room.join({ socketId: 'socket-editor', worldId: 'draft:editor-room' });
assert.ok(joined);
assert.strictEqual(joined.id, 'draft:editor-room');
assert.strictEqual(joined.cellSize, 64);
assert.ok(joined.bounds && joined.bounds.w >= 16384);

let result = room.applyEdit('socket-editor', { kind: 'tile', x: 64, y: 64, terrain: 'grass' });
assert.strictEqual(result.ok, true);
assert.strictEqual(result.world.tiles.length, 1);
assert.strictEqual(result.world.tiles[0].terrain, 'grass');

result = room.applyEdit('socket-editor', { kind: 'tile', x: 64, y: 64, terrain: 'water' });
assert.strictEqual(result.ok, true);
assert.strictEqual(result.world.tiles.length, 1);
assert.strictEqual(result.world.tiles[0].terrain, 'water');

result = room.applyEdit('socket-editor', { kind: 'object', x: 64, y: 64, type: 'spawn' });
assert.strictEqual(result.ok, true);
assert.strictEqual(result.world.objects.length, 1);
assert.strictEqual(result.world.objects[0].type, 'spawn');

result = room.applyEdit('socket-editor', { kind: 'object', x: 70, y: 68, type: 'spawn' });
assert.strictEqual(result.ok, true);
assert.strictEqual(result.world.objects.length, 1);
assert.strictEqual(result.world.objects[0].x, 70);
assert.strictEqual(result.world.objects[0].y, 68);

result = room.applyEdit('socket-editor', { kind: 'object', x: 66, y: 63, type: 'bus' });
assert.strictEqual(result.ok, true);
assert.strictEqual(result.world.objects.length, 2);
assert.ok(result.world.objects.some((entry) => entry.type === 'bus'));

result = room.applyEdit('socket-editor', { kind: 'object', x: 66, y: 63, remove: true });
assert.strictEqual(result.ok, true);
assert.strictEqual(result.world.objects.length, 1);
assert.ok(result.world.objects.every((entry) => entry.type !== 'bus'));

result = room.applyEdit('socket-editor', {
    kind: 'tile',
    x: 64,
    y: 64,
    remove: true,
    bounds: { w: 8192, h: 8192 },
    camera: { x: 2048, y: 2048, zoom: 1.1 },
    cellSize: 96,
});
assert.strictEqual(result.ok, true);
assert.strictEqual(result.world.tiles.length, 0);
assert.strictEqual(result.world.bounds.w, 8192);
assert.strictEqual(result.world.cellSize, 96);
assert.strictEqual(result.world.camera.x, 2048);
assert.strictEqual(result.world.camera.zoom, 1.1);

room.leave('socket-editor');

console.log('openvibe-games editor room OK');
