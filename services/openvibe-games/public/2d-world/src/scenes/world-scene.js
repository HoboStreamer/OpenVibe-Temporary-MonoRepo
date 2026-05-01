import { TwoDWorldRenderer } from '../gamemodes/2dworld/renderer.js';

export class WorldScene {
    constructor(mount) {
        this.renderer = new TwoDWorldRenderer(mount);
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
