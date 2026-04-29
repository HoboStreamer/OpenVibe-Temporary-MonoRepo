#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { ensureDir, parseArgs, writeJson } = require('../migrate-hobo/lib/common');

const ROOT = path.resolve(__dirname, '..', '..');
const CLOUDFLARE_ROOT = path.join(ROOT, 'deploy', 'cloudflare');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'cloudflare-assumptions-report.json');

function buildCheck(name, status, details, message) {
    return { name, status, details: details || null, message: message || null };
}

function summarize(checks) {
    return checks.reduce((acc, check) => {
        acc[check.status] = (acc[check.status] || 0) + 1;
        return acc;
    }, { green: 0, yellow: 0, red: 0 });
}

async function checkCloudflareAssumptions(_options = {}) {
    const requiredDocs = ['cloudflare-rules.md', 'cache-rules.md', 'waf-rules.md', 'dns.md'];
    const checks = [];
    const missingDocs = requiredDocs.filter((file) => !fs.existsSync(path.join(CLOUDFLARE_ROOT, file)));
    checks.push(buildCheck(
        'cloudflare_docs_present',
        missingDocs.length ? 'red' : 'green',
        { missing_docs: missingDocs },
        missingDocs.length ? 'Cloudflare deployment docs are missing.' : null,
    ));

    const realIpExamplePath = path.join(ROOT, 'deploy', 'nginx', 'conf.d', 'cloudflare-real-ip.conf.example');
    const realIpExample = fs.existsSync(realIpExamplePath) ? fs.readFileSync(realIpExamplePath, 'utf8') : '';
    checks.push(buildCheck(
        'real_ip_example_present',
        realIpExample ? 'green' : 'red',
        { path: realIpExamplePath },
        realIpExample ? null : 'Cloudflare real IP example config is missing.',
    ));
    checks.push(buildCheck(
        'real_ip_ranges_are_placeholders',
        realIpExample.includes('replace with the current published Cloudflare ranges') ? 'yellow' : 'green',
        { placeholder_ranges: realIpExample.includes('replace with the current published Cloudflare ranges') },
        'The checked-in real IP ranges are examples only and must be refreshed from Cloudflare before production use.',
    ));

    const nginxConfPath = path.join(ROOT, 'deploy', 'nginx', 'conf.d', 'openvibe.conf');
    const nginxConf = fs.existsSync(nginxConfPath) ? fs.readFileSync(nginxConfPath, 'utf8') : '';
    checks.push(buildCheck(
        'cf_ray_forwarding',
        nginxConf.includes('CF-Ray') ? 'green' : 'yellow',
        { has_cf_ray_forwarding: nginxConf.includes('CF-Ray') },
        nginxConf.includes('CF-Ray') ? null : 'CF-Ray forwarding is missing from the proxy layer.',
    ));

    const summary = summarize(checks);
    const gate = summary.red > 0 ? 'red' : summary.yellow > 0 ? 'yellow' : 'green';
    return {
        generated_at: new Date().toISOString(),
        gate,
        summary,
        checks,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await checkCloudflareAssumptions({ offline: !!args.offline, dryRun: !!args.dryRun, skipExternal: !!args.skipExternal });
    const outFile = path.resolve(args.out || DEFAULT_OUT);
    ensureDir(path.dirname(outFile));
    writeJson(outFile, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.gate === 'red' ? 1 : 0);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    checkCloudflareAssumptions,
};
