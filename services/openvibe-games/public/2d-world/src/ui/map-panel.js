export class MapPanel {
    constructor(root, zones = []) {
        this.root = root;
        this.zones = zones;
    }

    render(currentZone, onTravel) {
        this.root.innerHTML = `<div class="panel-header">Travel</div>${this.zones.map((zone) => `<button class="map-row ${zone.zone_id === currentZone ? 'active' : ''}" data-id="${zone.zone_id}"><strong>${zone.zone_id}</strong><small>${zone.description || ''}</small></button>`).join('')}`;
        this.root.querySelectorAll('.map-row').forEach((button) => button.onclick = () => onTravel && onTravel(button.dataset.id));
    }
}
