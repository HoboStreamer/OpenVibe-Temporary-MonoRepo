'use strict';

const fs = require('fs');
const path = require('path');
const { icon: renderFontAwesomeIcon } = require('@fortawesome/fontawesome-svg-core');
const freeSolidIcons = require('@fortawesome/free-solid-svg-icons');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_PRO_INSTALL_ROOT = path.join(REPO_ROOT, 'compat', 'fontawesome-pro-local');
const LOCAL_PRO_INSTALL_METADATA_PATH = path.join(LOCAL_PRO_INSTALL_ROOT, 'install.json');
const PRO_STYLE_PACKAGE_NAMES = Object.freeze({
    solid: '@fortawesome/pro-solid-svg-icons',
});

function readJsonIfExists(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function normalizeProStyle(value) {
    const normalized = String(value || 'solid').trim().toLowerCase();
    if (!normalized || normalized === 'pro-solid') return 'solid';
    return normalized;
}

function packageSegments(packageName) {
    return String(packageName || '')
        .split('/')
        .filter(Boolean);
}

function buildLocalModuleCandidates(style) {
    const packageName = PRO_STYLE_PACKAGE_NAMES[style];
    if (!packageName) return [];

    const envPath = String(process.env.FONTAWESOME_PRO_LOCAL_PATH || '').trim();
    const packagePath = packageSegments(packageName);
    const candidates = [];

    if (envPath) {
        const resolved = path.resolve(envPath);
        candidates.push(resolved);
        candidates.push(path.join(resolved, 'node_modules', ...packagePath));
        candidates.push(path.join(resolved, ...packagePath));
    }

    candidates.push(path.join(LOCAL_PRO_INSTALL_ROOT, 'node_modules', ...packagePath));
    return [...new Set(candidates)];
}

function resolveOptionalModule(style) {
    const packageName = PRO_STYLE_PACKAGE_NAMES[style];
    const candidatePaths = buildLocalModuleCandidates(style);

    if (packageName) {
        try {
            return {
                module: require(packageName),
                source: packageName,
                resolution: 'package',
                candidatePaths,
            };
        } catch {
            // fall through to local candidate paths
        }
    }

    for (const candidate of candidatePaths) {
        try {
            return {
                module: require(candidate),
                source: candidate,
                resolution: 'local-path',
                candidatePaths,
            };
        } catch {
            const indexPath = path.join(candidate, 'index.js');
            if (!fs.existsSync(indexPath)) continue;
            try {
                return {
                    module: require(indexPath),
                    source: indexPath,
                    resolution: 'local-path',
                    candidatePaths,
                };
            } catch {
                // keep trying
            }
        }
    }

    return {
        module: null,
        source: null,
        resolution: packageName ? 'unresolved' : 'unsupported-style',
        candidatePaths,
    };
}

const requestedProStyle = normalizeProStyle(process.env.FONTAWESOME_PRO_STYLE || 'solid');
const proSolidRuntime = resolveOptionalModule(requestedProStyle);
const proSolidIcons = requestedProStyle === 'solid' ? proSolidRuntime.module : null;

const CATALOG = Object.freeze({
    network: { label: 'Network', pro: ['faGlobe'], free: ['faGlobe', 'faEarthAmericas'] },
    'openvibe-network': { label: 'OpenVibe Network', aliasFor: 'network' },
    tools: { label: 'Tools', pro: ['faToolbox'], free: ['faToolbox', 'faScrewdriverWrench'] },
    'openvibe-tools': { label: 'OpenVibe Tools', aliasFor: 'tools' },
    admin: { label: 'Admin', pro: ['faShieldHalved'], free: ['faShieldHalved', 'faGaugeHigh'] },
    'openvibe-admin': { label: 'Admin', aliasFor: 'admin' },
    my: { label: 'My account', pro: ['faIdCard'], free: ['faIdCard', 'faUser'] },
    account: { label: 'Account', aliasFor: 'my' },
    'openvibe-my': { label: 'My account', aliasFor: 'my' },
    themes: { label: 'Themes', pro: ['faPalette'], free: ['faPalette', 'faSwatchbook'] },
    'openvibe-themes': { label: 'Themes', aliasFor: 'themes' },
    live: { label: 'Live', pro: ['faTowerBroadcast'], free: ['faTowerBroadcast', 'faSatelliteDish'] },
    'openvibe-live': { label: 'OpenVibe Live', aliasFor: 'live' },
    restream: { label: 'Restream', pro: ['faSatelliteDish'], free: ['faSatelliteDish', 'faArrowRightArrowLeft'] },
    'openre-stream': { label: 'OpenRe.Stream', aliasFor: 'restream' },
    chat: { label: 'Chat', pro: ['faComments'], free: ['faComments', 'faCommentDots'] },
    'openvibe-chat': { label: 'OpenVibe Chat', aliasFor: 'chat' },
    community: { label: 'Community', pro: ['faUsers'], free: ['faUsers', 'faUserGroup'] },
    'openvibe-community': { label: 'OpenVibe Community', aliasFor: 'community' },
    media: { label: 'Media', pro: ['faPhotoFilm'], free: ['faPhotoFilm', 'faImages'] },
    storage: { label: 'Storage', pro: ['faHardDrive'], free: ['faHardDrive', 'faBoxesStacked'] },
    'openvibe-media': { label: 'OpenVibe Media', aliasFor: 'media' },
    billing: { label: 'Billing', pro: ['faCoins'], free: ['faCoins', 'faWallet'] },
    economy: { label: 'Economy', aliasFor: 'billing' },
    'openvibe-billing': { label: 'OpenVibe Billing', aliasFor: 'billing' },
    ai: { label: 'AI', pro: ['faBrain'], free: ['faBrain', 'faWandSparkles'] },
    'openvibe-ai': { label: 'OpenVibe AI', aliasFor: 'ai' },
    games: { label: 'Games', pro: ['faGamepad'], free: ['faGamepad', 'faDiceD20'] },
    'openvibe-games': { label: 'OpenVibe Games', aliasFor: 'games' },
    content: { label: 'Content', pro: ['faFileLines'], free: ['faFileLines', 'faBookOpen'] },
    'openvibe-content': { label: 'OpenVibe Content', aliasFor: 'content' },
    codes: { label: 'Codes', pro: ['faFileLines'], free: ['faFileLines', 'faCode'] },
    blog: { label: 'Blog', pro: ['faPenNib'], free: ['faPenNib', 'faFeatherPointed'] },
    wiki: { label: 'Wiki', pro: ['faBook'], free: ['faBook', 'faBookOpen'] },
    news: { label: 'News', pro: ['faNewspaper'], free: ['faNewspaper', 'faBullhorn'] },
    reviews: { label: 'Reviews', pro: ['faMagnifyingGlass'], free: ['faMagnifyingGlass', 'faStar'] },
    deals: { label: 'Deals', pro: ['faTags'], free: ['faTags', 'faTag'] },
    coupons: { label: 'Coupons', pro: ['faTicket'], free: ['faTicket', 'faReceipt'] },
    trade: { label: 'Trade', pro: ['faArrowTrendUp'], free: ['faArrowTrendUp', 'faChartLine'] },
    queue: { label: 'Queue', pro: ['faBoxesStacked'], free: ['faBoxesStacked', 'faLayerGroup'] },
    worker: { label: 'Worker', pro: ['faServer'], free: ['faServer', 'faMicrochip'] },
    workers: { label: 'Workers', aliasFor: 'worker' },
    'openvibe-workers': { label: 'OpenVibe Workers', aliasFor: 'worker' },
    realtime: { label: 'Realtime', pro: ['faWaveSquare'], free: ['faWaveSquare', 'faCircleNodes'] },
    'openvibe-realtime': { label: 'OpenVibe Realtime', aliasFor: 'realtime' },
    events: { label: 'Events', pro: ['faBell'], free: ['faBell', 'faCircleNodes'] },
    'openvibe-events': { label: 'OpenVibe Events', aliasFor: 'events' },
    runtime: { label: 'Runtime', pro: ['faGaugeHigh'], free: ['faGaugeHigh', 'faChartSimple'] },
    database: { label: 'Database', pro: ['faDatabase'], free: ['faDatabase'] },
    search: { label: 'Search', pro: ['faMagnifyingGlass'], free: ['faMagnifyingGlass'] },
    refresh: { label: 'Refresh', pro: ['faRotateRight'], free: ['faRotateRight', 'faArrowsRotate'] },
    clock: { label: 'Clock', pro: ['faClock'], free: ['faClock'] },
    warning: { label: 'Warning', pro: ['faTriangleExclamation'], free: ['faTriangleExclamation'] },
    alert: { label: 'Alert', aliasFor: 'warning' },
    success: { label: 'Success', pro: ['faCircleCheck'], free: ['faCircleCheck'] },
    health: { label: 'Health', aliasFor: 'success' },
    info: { label: 'Info', pro: ['faCircleInfo'], free: ['faCircleInfo'] },
    docs: { label: 'Docs', pro: ['faBookOpen'], free: ['faBookOpen', 'faBook'] },
    launch: { label: 'Launch', pro: ['faRocket'], free: ['faRocket'] },
    signin: { label: 'Sign in', pro: ['faRightToBracket'], free: ['faRightToBracket'] },
    signout: { label: 'Sign out', pro: ['faRightFromBracket'], free: ['faRightFromBracket'] },
    notifications: { label: 'Notifications', pro: ['faBell'], free: ['faBell'] },
});

function resolveEntry(name) {
    const key = String(name || '').trim();
    if (!key) return null;
    const direct = CATALOG[key];
    if (!direct) return null;
    if (direct.aliasFor) {
        const target = CATALOG[direct.aliasFor];
        return Object.assign({}, target || {}, { label: direct.label || (target && target.label) || key });
    }
    return direct;
}

function definitionFromSources(candidates, sources) {
    for (const source of sources) {
        if (!source) continue;
        for (const candidate of candidates) {
            if (candidate && source[candidate]) return source[candidate];
        }
    }
    return null;
}

function fallbackGlyph(label) {
    const value = String(label || 'OV').trim();
    if (!value) return '•';
    return value.slice(0, 1).toUpperCase();
}

function resolveIconDefinition(name) {
    const entry = resolveEntry(name);
    if (!entry) return null;
    const candidates = [];
    if (Array.isArray(entry.pro)) candidates.push(...entry.pro);
    if (Array.isArray(entry.free)) candidates.push(...entry.free);
    return definitionFromSources(candidates, [proSolidIcons, freeSolidIcons]);
}

function iconSvg(name, options) {
    const entry = resolveEntry(name);
    const definition = resolveIconDefinition(name);
    const title = options && options.title ? String(options.title) : (entry && entry.label) || String(name || 'icon');
    if (!definition) {
        return `<span class="ov-icon-fallback">${fallbackGlyph(title)}</span>`;
    }
    const rendered = renderFontAwesomeIcon(definition, title ? { title } : undefined);
    return rendered && rendered.html ? rendered.html.join('') : `<span class="ov-icon-fallback">${fallbackGlyph(title)}</span>`;
}

function escapeAttribute(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderIcon(name, options) {
    const opts = options || {};
    const className = String(opts.className || 'ov-icon').trim();
    const decorative = opts.decorative !== false;
    const label = opts.label || (resolveEntry(name) && resolveEntry(name).label) || String(name || 'icon');
    const titleAttr = opts.title ? ` title="${escapeAttribute(opts.title)}"` : '';
    const ariaAttrs = decorative
        ? ' aria-hidden="true"'
        : ` role="img" aria-label="${escapeAttribute(label)}"`;
    const styleAttr = opts.style ? ` style="${escapeAttribute(opts.style)}"` : '';
    return `<span class="${escapeAttribute(className)}"${ariaAttrs}${titleAttr}${styleAttr}>${iconSvg(name, { title: decorative ? null : label })}</span>`;
}

function buildManifest() {
    const manifest = {};
    for (const key of Object.keys(CATALOG)) {
        const entry = resolveEntry(key);
        manifest[key] = {
            label: entry && entry.label ? entry.label : key,
            svg: iconSvg(key, { title: entry && entry.label ? entry.label : key }),
        };
    }
    return manifest;
}

function buildStyleSheet() {
    return [
        '.ov-icon{display:inline-flex;align-items:center;justify-content:center;width:1.05em;height:1.05em;line-height:0;vertical-align:middle;color:inherit;flex:0 0 auto;}',
        '.ov-icon svg{display:block;width:1em;height:1em;fill:currentColor;}',
        '.ov-icon-fallback{display:inline-flex;align-items:center;justify-content:center;width:1em;height:1em;border-radius:999px;background:currentColor;color:#050814;font-size:.68em;font-weight:800;line-height:1;}',
        '.ov-icon-label{display:inline-flex;align-items:center;gap:.55rem;min-width:0;}',
        '.ov-icon-label .ov-icon{font-size:1em;}',
    ].join('\n');
}

function buildBrowserBundle() {
    const manifest = buildManifest();
    const stylesheet = buildStyleSheet();
    return `(function(global){\n'use strict';\nvar manifest=${JSON.stringify(manifest)};\nvar stylesheet=${JSON.stringify(stylesheet)};\nfunction ensureStyle(){if(!global.document||global.document.getElementById('openvibe-icons-style'))return;var style=global.document.createElement('style');style.id='openvibe-icons-style';style.textContent=stylesheet;global.document.head.appendChild(style);}\nfunction attrs(text){return String(text==null?'':text).replace(/&/g,'&amp;').replace(/\"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}\nfunction icon(name, options){ensureStyle();var opts=options||{};var entry=manifest[name]||manifest[String(name||'').trim()]||{label:String(name||'icon'),svg:'<span class=\\"ov-icon-fallback\\">•</span>'};var decorative=opts.decorative!==false;var label=opts.label||entry.label||String(name||'icon');var className=opts.className||'ov-icon';var title=opts.title?(' title="'+attrs(opts.title)+'"'):'';var aria=decorative?' aria-hidden="true"':' role="img" aria-label="'+attrs(label)+'"';var style=opts.style?(' style="'+attrs(opts.style)+'"'):'';return '<span class="'+attrs(className)+'"'+aria+title+style+'>'+entry.svg+'</span>'; }\nfunction label(name){var entry=manifest[name]||manifest[String(name||'').trim()];return entry&&entry.label?entry.label:String(name||'icon');}\nfunction svg(name){var entry=manifest[name]||manifest[String(name||'').trim()];return entry&&entry.svg?entry.svg:'';}\nglobal.OpenVibeIcons={manifest:manifest,icon:icon,label:label,svg:svg,list:function(){return Object.keys(manifest).sort();},ensureStyle:ensureStyle};\nensureStyle();\n}(window));\n`;
}

function describeIconRuntime() {
    const installMetadata = readJsonIfExists(LOCAL_PRO_INSTALL_METADATA_PATH);
    const style = normalizeProStyle(process.env.FONTAWESOME_PRO_STYLE || installMetadata && installMetadata.style || 'solid');
    const packageName = PRO_STYLE_PACKAGE_NAMES[style] || null;
    const runtime = resolveOptionalModule(style);

    return {
        free: {
            enabled: true,
            source: '@fortawesome/free-solid-svg-icons',
        },
        pro: {
            enabled: !!runtime.module,
            style,
            style_supported: !!packageName,
            package_name: packageName,
            source: runtime.source,
            resolution: runtime.resolution,
            candidate_paths: runtime.candidatePaths,
            local_install_path: String(process.env.FONTAWESOME_PRO_LOCAL_PATH || '').trim() || null,
            zip_path: String(process.env.FONTAWESOME_PRO_ZIP || '').trim() || null,
            version_hint: String(process.env.FONTAWESOME_PRO_VERSION_HINT || installMetadata && installMetadata.version_hint || '').trim() || null,
            install_metadata: installMetadata,
        },
    };
}

module.exports = {
    CATALOG,
    buildBrowserBundle,
    buildManifest,
    buildStyleSheet,
    describeIconRuntime,
    iconSvg,
    normalizeProStyle,
    renderIcon,
    resolveIconDefinition,
};
