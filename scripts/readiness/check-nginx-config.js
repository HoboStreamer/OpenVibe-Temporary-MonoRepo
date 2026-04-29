#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { ensureDir, parseArgs, writeJson } = require('../migrate-hobo/lib/common');

const ROOT = path.resolve(__dirname, '..', '..');
const NGINX_ROOT = path.join(ROOT, 'deploy', 'nginx');
const DEFAULT_OUT = path.join(ROOT, 'data', 'readiness', 'nginx-config-report.json');

function buildCheck(name, status, details, message) {
    return { name, status, details: details || null, message: message || null };
}

function summarize(checks) {
    return checks.reduce((acc, check) => {
        acc[check.status] = (acc[check.status] || 0) + 1;
        return acc;
    }, { green: 0, yellow: 0, red: 0 });
}

function read(relPath) {
    return fs.readFileSync(path.join(NGINX_ROOT, relPath), 'utf8');
}

async function checkNginxConfig(_options = {}) {
    const requiredFiles = [
        'nginx.conf',
        'mime.types',
        'README.md',
        'conf.d/openvibe.conf',
        'conf.d/rate-limits.conf',
        'conf.d/security-headers.conf',
        'conf.d/proxy-cache.conf',
        'conf.d/cloudflare-real-ip.conf.example',
    ];
    const checks = [];

    const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(NGINX_ROOT, file)));
    checks.push(buildCheck(
        'required_files_present',
        missingFiles.length ? 'red' : 'green',
        { missing_files: missingFiles },
        missingFiles.length ? 'One or more NGINX config artifacts are missing.' : null,
    ));

    const nginxConf = fs.existsSync(path.join(NGINX_ROOT, 'nginx.conf')) ? read('nginx.conf') : '';
    const openvibeConf = fs.existsSync(path.join(NGINX_ROOT, 'conf.d/openvibe.conf')) ? read('conf.d/openvibe.conf') : '';
    const securityHeaders = fs.existsSync(path.join(NGINX_ROOT, 'conf.d/security-headers.conf')) ? read('conf.d/security-headers.conf') : '';

    checks.push(buildCheck(
        'relative_include_layout',
        nginxConf.includes('include conf.d/') ? 'green' : 'yellow',
        { uses_relative_includes: nginxConf.includes('include conf.d/') },
        nginxConf.includes('include conf.d/') ? null : 'NGINX config does not use repo-relative includes, which makes local syntax validation harder.',
    ));
    checks.push(buildCheck(
        'socketio_proxy_rule',
        openvibeConf.includes('/socket.io/') ? 'green' : 'red',
        { has_socketio_rule: openvibeConf.includes('/socket.io/') },
        openvibeConf.includes('/socket.io/') ? null : 'Expected /socket.io/ proxy rule is missing.',
    ));
    checks.push(buildCheck(
        'content_hosts_routed',
        /openvibe\.codes\.localhost|openvibe\.blog\.localhost|openvibe\.wiki\.localhost/.test(openvibeConf) ? 'green' : 'red',
        { has_content_hosts: /openvibe\.codes\.localhost|openvibe\.blog\.localhost|openvibe\.wiki\.localhost/.test(openvibeConf) },
        /openvibe\.codes\.localhost|openvibe\.blog\.localhost|openvibe\.wiki\.localhost/.test(openvibeConf) ? null : 'Content hosts are not routed through the checked-in NGINX config.',
    ));
    checks.push(buildCheck(
        'request_id_forwarding',
        openvibeConf.includes('X-Request-Id') ? 'green' : 'red',
        { has_request_id: openvibeConf.includes('X-Request-Id') },
        openvibeConf.includes('X-Request-Id') ? null : 'Proxy layer is not forwarding X-Request-Id.',
    ));
    checks.push(buildCheck(
        'cf_ray_forwarding',
        openvibeConf.includes('CF-Ray') ? 'green' : 'yellow',
        { has_cf_ray: openvibeConf.includes('CF-Ray') },
        openvibeConf.includes('CF-Ray') ? null : 'CF-Ray is not forwarded yet; origin tracing will be weaker behind Cloudflare.',
    ));
    checks.push(buildCheck(
        'security_headers_guidance',
        securityHeaders.includes('Strict-Transport-Security') && securityHeaders.includes('Content-Security-Policy') ? 'green' : 'yellow',
        {
            has_hsts: securityHeaders.includes('Strict-Transport-Security'),
            has_csp: securityHeaders.includes('Content-Security-Policy'),
        },
        'Security headers guidance should include HSTS and CSP notes.',
    ));

    let syntaxValidation = null;
    try {
        const result = spawnSync('nginx', ['-t', '-p', NGINX_ROOT, '-c', path.join(NGINX_ROOT, 'nginx.conf')], { encoding: 'utf8' });
        syntaxValidation = {
            status: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
        };
        checks.push(buildCheck(
            'nginx_binary_validation',
            result.status === 0 ? 'green' : 'yellow',
            syntaxValidation,
            result.status === 0 ? null : 'nginx -t did not pass in the current environment; see stderr for details.',
        ));
    } catch (error) {
        checks.push(buildCheck(
            'nginx_binary_validation',
            'yellow',
            { error: error.message },
            'nginx binary is not available for a live syntax validation run in this environment.',
        ));
    }

    const summary = summarize(checks);
    const gate = summary.red > 0 ? 'red' : summary.yellow > 0 ? 'yellow' : 'green';
    return {
        generated_at: new Date().toISOString(),
        gate,
        summary,
        checks,
        syntax_validation: syntaxValidation,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await checkNginxConfig({ offline: !!args.offline, dryRun: !!args.dryRun, skipExternal: !!args.skipExternal });
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
    checkNginxConfig,
};
