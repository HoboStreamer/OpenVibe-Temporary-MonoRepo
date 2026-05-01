import { PixiWorldRenderer } from '../engine/renderer.js';

export class WorldScene {
    constructor(mount) {
        this.renderer = new PixiWorldRenderer(mount);
    }

    async init() {
        await this.renderer.init();
        return this;
    }

    render(snapshot) {
        this.renderer.render(snapshot);
    }

    setCatalog(catalog) {
        this.renderer.setCatalog(catalog);
    }

    setBuildPreview(preview) {
        this.renderer.setBuildPreview(preview);
    }

    screenToWorld(x, y) {
        return this.renderer.screenToWorld(x, y);
    }
}
