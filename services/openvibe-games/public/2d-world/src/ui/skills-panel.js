export class SkillsPanel {
    constructor(root, skills = []) {
        this.root = root;
        this.skills = skills;
    }

    xpForLevel(level) {
        const lvl = Math.max(1, Math.floor(Number(level) || 1));
        if (lvl <= 1) return 0;
        return Math.round(60 * Math.pow(lvl, 1.6));
    }

    render(self) {
        const progress = self && self.skill_progress || {};
        const levels = self && self.levels || {};
        const skills = this.skills && this.skills.length ? this.skills : Object.keys(progress).length ? Object.keys(progress) : Object.keys(levels);
        const totalLevel = skills.reduce((sum, skill) => sum + Number(levels[skill] || progress[skill] && progress[skill].level || 1), 0);
        this.root.innerHTML = `<div class="panel-header">Skills</div><div class="skill-total">Total level <strong>${totalLevel}</strong></div>${skills.map((skill) => {
            const item = progress[skill] || { level: Number(levels[skill] || 1), xp: 0, xp_to_next: 0 };
            const level = Number(item.level || levels[skill] || 1);
            const xp = Number(item.xp || 0);
            const currentLevelXp = this.xpForLevel(level);
            const nextLevelXp = this.xpForLevel(level + 1);
            const ratio = nextLevelXp <= currentLevelXp ? 1 : Math.max(0, Math.min(1, (xp - currentLevelXp) / Math.max(1, nextLevelXp - currentLevelXp)));
            return `<div class="skill-row">
                <div class="skill-copy">
                    <span>${skill}</span>
                    <small>${item.xp_to_next ? `${item.xp_to_next} xp to next` : 'mastered'}</small>
                    <div class="skill-progress"><div class="fill" style="width:${ratio * 100}%"></div></div>
                </div>
                <strong>${level}</strong>
            </div>`;
        }).join('')}`;
    }
}
