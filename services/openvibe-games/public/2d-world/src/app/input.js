export class InputController {
    constructor(root = window) {
        this.root = root;
        this.keys = { up: false, down: false, left: false, right: false, sprint: false };
        this.mouse = { x: 0, y: 0, down: false };
        this.pendingActions = [];
        this.quickSlot = 1;
        this._bind();
    }

    _bind() {
        this.root.addEventListener('keydown', (event) => {
            if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
            switch (event.key.toLowerCase()) {
            case 'w': this.keys.up = true; break;
            case 's': this.keys.down = true; break;
            case 'a': this.keys.left = true; break;
            case 'd': this.keys.right = true; break;
            case 'shift': this.keys.sprint = true; break;
            case ' ': this.queueAction('attack'); break;
            case 'e': this.queueAction('interact'); break;
            default:
                if (/^[1-9]$/.test(event.key)) this.quickSlot = Number(event.key);
                break;
            }
        });
        this.root.addEventListener('keyup', (event) => {
            switch (event.key.toLowerCase()) {
            case 'w': this.keys.up = false; break;
            case 's': this.keys.down = false; break;
            case 'a': this.keys.left = false; break;
            case 'd': this.keys.right = false; break;
            case 'shift': this.keys.sprint = false; break;
            default: break;
            }
        });
        this.root.addEventListener('pointermove', (event) => {
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
        });
        this.root.addEventListener('pointerdown', (event) => {
            if (event.target && event.target.closest('button, input, textarea, select, a, label, .panel, .hero-card')) return;
            this.mouse.down = true;
            this.queueAction('attack');
        });
        this.root.addEventListener('pointerup', () => {
            this.mouse.down = false;
        });
        this.root.addEventListener('wheel', (event) => {
            if (event.target && event.target.closest('input, textarea, select, .panel, .window-panel, .sourcevibe-menu__panel')) return;
            const direction = Math.sign(event.deltaY || 0);
            if (!direction) return;
            event.preventDefault();
            const next = this.quickSlot + direction;
            this.quickSlot = next < 1 ? 9 : next > 9 ? 1 : next;
        }, { passive: false });
    }

    queueAction(action, extra = {}) {
        this.pendingActions.push(Object.assign({ action }, extra));
    }

    nextAction() {
        return this.pendingActions.shift() || null;
    }

    reset() {
        this.keys = { up: false, down: false, left: false, right: false, sprint: false };
        this.mouse.down = false;
        this.pendingActions = [];
    }
}
