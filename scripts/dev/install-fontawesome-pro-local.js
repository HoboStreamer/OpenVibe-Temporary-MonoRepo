#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_INSTALL_ROOT = path.join(ROOT, 'compat', 'fontawesome-pro-local');
const DEFAULT_TARGET_ROOT = path.join(LOCAL_INSTALL_ROOT, 'node_modules');
const INSTALL_METADATA_PATH = path.join(LOCAL_INSTALL_ROOT, 'install.json');
const STYLE_PACKAGE_MAP = Object.freeze({
    solid: '@fortawesome/pro-solid-svg-icons',
});

function readArg(flag) {
    const index = process.argv.indexOf(flag);
    if (index === -1) return null;
    return process.argv[index + 1] || null;
}

function readJsonIfExists(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function normalizeStyle(value) {
    const style = String(value || 'solid').trim().toLowerCase();
    if (!STYLE_PACKAGE_MAP[style]) {
        throw new Error(`unsupported Font Awesome Pro style: ${style}`);
    }
    return style;
}

function packageSegments(packageName) {
    return String(packageName || '').split('/').filter(Boolean);
}

function packageInstallPath(rootDir, packageName) {
    return path.join(rootDir, ...packageSegments(packageName));
}

function isPackageDirectory(dirPath, packageName) {
    const packageJson = readJsonIfExists(path.join(dirPath, 'package.json'));
    return !!(packageJson && packageJson.name === packageName);
}

function findPackageDir(startDir, packageName, depth = 0, maxDepth = 6) {
    const resolved = path.resolve(startDir);
    if (!fs.existsSync(resolved)) return null;
    if (isPackageDirectory(resolved, packageName)) return resolved;
    if (depth >= maxDepth) return null;

    for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        const child = findPackageDir(path.join(resolved, entry.name), packageName, depth + 1, maxDepth);
        if (child) return child;
    }
    return null;
}

function copyDirectory(sourceDir, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectory(sourcePath, targetPath);
            continue;
        }
        if (entry.isSymbolicLink()) {
            const linkTarget = fs.readlinkSync(sourcePath);
            fs.symlinkSync(linkTarget, targetPath);
            continue;
        }
        fs.copyFileSync(sourcePath, targetPath);
    }
}

function extractZip(zipPath, targetDir, pythonBin) {
    const script = [
        'import pathlib',
        'import sys',
        'import zipfile',
        'archive_path = pathlib.Path(sys.argv[1])',
        'target_dir = pathlib.Path(sys.argv[2])',
        'target_dir.mkdir(parents=True, exist_ok=True)',
        'with zipfile.ZipFile(archive_path, "r") as archive:',
        '    archive.extractall(target_dir)',
    ].join('\n');
    const result = spawnSync(pythonBin, ['-c', script, zipPath, targetDir], {
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(result.stderr && result.stderr.trim() || `failed to extract ${zipPath} with ${pythonBin}`);
    }
}

function resolveInstallPlan(options = {}) {
    const style = normalizeStyle(options.style || process.env.FONTAWESOME_PRO_STYLE || 'solid');
    const packageName = STYLE_PACKAGE_MAP[style];
    const sourcePath = options.sourcePath || process.env.FONTAWESOME_PRO_LOCAL_PATH || '';
    const zipPath = options.zipPath || process.env.FONTAWESOME_PRO_ZIP || '';

    if (!sourcePath && !zipPath) {
        throw new Error('set FONTAWESOME_PRO_LOCAL_PATH or FONTAWESOME_PRO_ZIP before running the local installer');
    }

    if (sourcePath) {
        const packageDir = findPackageDir(sourcePath, packageName);
        if (!packageDir) {
            throw new Error(`could not find ${packageName} under ${sourcePath}`);
        }
        return {
            style,
            packageName,
            sourceType: 'directory',
            sourcePath: path.resolve(sourcePath),
            packageDir,
            extractedRoot: null,
        };
    }

    const resolvedZipPath = path.resolve(zipPath);
    if (!fs.existsSync(resolvedZipPath)) {
        throw new Error(`zip file not found: ${resolvedZipPath}`);
    }

    const extractedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-fontawesome-pro-'));
    extractZip(resolvedZipPath, extractedRoot, options.pythonBin || process.env.PYTHON || 'python3');
    const packageDir = findPackageDir(extractedRoot, packageName);
    if (!packageDir) {
        throw new Error(`could not find ${packageName} inside ${resolvedZipPath}`);
    }

    return {
        style,
        packageName,
        sourceType: 'zip',
        sourcePath: resolvedZipPath,
        packageDir,
        extractedRoot,
    };
}

function installFromPlan(plan, options = {}) {
    const targetRoot = path.resolve(options.targetRoot || DEFAULT_TARGET_ROOT);
    const metadataPath = path.resolve(options.metadataPath || INSTALL_METADATA_PATH);
    const targetDir = packageInstallPath(targetRoot, plan.packageName);

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    copyDirectory(plan.packageDir, targetDir);

    const packageJson = readJsonIfExists(path.join(targetDir, 'package.json'));
    const metadata = {
        installed_at: new Date().toISOString(),
        style: plan.style,
        package_name: plan.packageName,
        package_version: packageJson && packageJson.version || null,
        version_hint: options.versionHint || process.env.FONTAWESOME_PRO_VERSION_HINT || null,
        source_type: plan.sourceType,
        source_path: plan.sourcePath,
        package_dir: plan.packageDir,
        target_path: targetDir,
    };
    fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

    if (plan.extractedRoot) {
        fs.rmSync(plan.extractedRoot, { recursive: true, force: true });
    }

    return metadata;
}

function main() {
    const plan = resolveInstallPlan({
        sourcePath: readArg('--source'),
        zipPath: readArg('--zip'),
        style: readArg('--style'),
        pythonBin: readArg('--python'),
    });
    const metadata = installFromPlan(plan, {
        targetRoot: readArg('--target-root'),
        metadataPath: readArg('--metadata-path'),
        versionHint: readArg('--version-hint'),
    });

    process.stdout.write([
        '[fontawesome-pro-local] installed local package',
        `  style: ${metadata.style}`,
        `  package: ${metadata.package_name}`,
        `  source: ${metadata.source_path}`,
        `  target: ${metadata.target_path}`,
    ].join('\n'));
    process.stdout.write('\n');
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(`[fontawesome-pro-local] ${error.message}`);
        process.exit(1);
    }
}

module.exports = {
    DEFAULT_TARGET_ROOT,
    INSTALL_METADATA_PATH,
    STYLE_PACKAGE_MAP,
    findPackageDir,
    installFromPlan,
    normalizeStyle,
    packageInstallPath,
    resolveInstallPlan,
};