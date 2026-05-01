export class MapPanel {
    constructor(root, zones = [], travel = []) {
        this.root = root;
        this.zones = zones;
        this.travel = travel;
    }

    canTravel(fromZone, toZone) {
        if (!fromZone || !toZone) return false;
        if (fromZone === toZone) return true;
        return this.travel.some((link) => link && link.from === fromZone && link.to === toZone);
    }

    render(currentZone, onTravel) {
        this.root.innerHTML = `<div class="panel-header">Travel</div>${this.zones.map((zone) => {
            const zoneId = zone.zone_id;
            const reachable = this.canTravel(currentZone, zoneId);
            const description = zoneId === currentZone
                ? (zone.description || 'Current zone')
                : (reachable ? (zone.description || '') : 'Travel route unavailable from your current zone.');
            return `<button class="map-row ${zoneId === currentZone ? 'active' : ''}" data-id="${zoneId}" ${reachable ? '' : 'disabled'}><strong>${zone.label || zone.name || zoneId}</strong><small>${description}</small></button>`;
        }).join('')}`;
        this.root.querySelectorAll('.map-row:not([disabled])').forEach((button) => button.onclick = () => onTravel && onTravel(button.dataset.id));
    }
}
