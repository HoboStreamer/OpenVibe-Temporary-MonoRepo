'use strict';

// openvibe-workers — native migration.bundle-verify backend.
// Extracted from processors.js so the catalog has a first-class native module
// just like the other native backends. Pure artifact inspection: no Postgres
// or Redis dependency. Available whenever the canonical validation summary
// path exists on disk; otherwise the dependency reports missing-artifact.

const fs = require('fs');
const path = require('path');

function describeDependency(bundleDir) {
    const validationSummaryPath = path.join(bundleDir, 'audit', 'validation-summary.json');
    const exists = fs.existsSync(validationSummaryPath);
    return {
        type: 'native-artifact-inspection',
        backend: 'migration-bundle-verifier',
        bundle_dir: bundleDir,
        validation_summary_path: validationSummaryPath,
        configured: exists,
        status: exists ? 'configured' : 'missing-artifact',
        message: exists ? null : 'validation-summary.json is required for bundle verification',
        available: exists,
        mode: 'direct-module',
    };
}

function readJsonIfExists(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function summarizeValidationSummary(report) {
    if (!report) return null;
    return {
        ok: report.ok !== false,
        check_count: Array.isArray(report.checks) ? report.checks.length : 0,
        mismatch_count: Array.isArray(report.mismatches) ? report.mismatches.length : 0,
        duplicate_count: Array.isArray(report.duplicates) ? report.duplicates.length : 0,
        missing_ref_count: Array.isArray(report.missing_refs) ? report.missing_refs.length : 0,
    };
}

function summarizeReadinessReport(report) {
    if (!report) return null;
    return {
        summary: report.summary || null,
        manual_action_count: Array.isArray(report.manual_actions) ? report.manual_actions.length : 0,
    };
}

function summarizeCutoverReport(report) {
    if (!report) return null;
    return {
        gate: report.gate || null,
        summary: report.summary || null,
        artifact_count: report.artifacts ? Object.keys(report.artifacts).length : 0,
    };
}

function deriveBundleGate(result) {
    if (!result.artifacts.validation_summary.exists) return 'red';
    if (result.validation && !result.validation.ok) return 'red';
    if (result.validation && (result.validation.mismatch_count > 0 || result.validation.duplicate_count > 0 || result.validation.missing_ref_count > 0)) {
        return 'red';
    }
    if (result.cutover && result.cutover.gate === 'red') return 'red';
    if (result.readiness && result.readiness.summary && Number(result.readiness.summary.red || 0) > 0) return 'red';
    if (!result.artifacts.readiness_report.exists || !result.artifacts.cutover_report.exists) return 'yellow';
    if (result.cutover && result.cutover.gate === 'yellow') return 'yellow';
    if (result.readiness && result.readiness.summary && Number(result.readiness.summary.yellow || 0) > 0) return 'yellow';
    return 'green';
}

function verifyMigrationBundle(defaults, payload) {
    const input = payload || {};
    const bundleDir = path.resolve(input.bundle_dir || defaults.bundleDir);
    const validationSummaryPath = path.resolve(input.validation_summary_path || path.join(bundleDir, 'audit', 'validation-summary.json'));
    const readinessReportPath = path.resolve(input.readiness_report_path || path.join(bundleDir, 'audit', 'readiness-report.json'));
    const cutoverReportPath = path.resolve(input.cutover_report_path || defaults.cutoverReportPath);
    const validationSummary = readJsonIfExists(validationSummaryPath);
    const readinessReport = readJsonIfExists(readinessReportPath);
    const cutoverReport = readJsonIfExists(cutoverReportPath);

    const result = {
        ok: true,
        mode: 'artifact-inspection',
        backend: 'migration-bundle-verifier',
        bundle_dir: bundleDir,
        artifacts: {
            validation_summary: { path: validationSummaryPath, exists: !!validationSummary },
            readiness_report: { path: readinessReportPath, exists: !!readinessReport },
            cutover_report: { path: cutoverReportPath, exists: !!cutoverReport },
        },
        validation: summarizeValidationSummary(validationSummary),
        readiness: summarizeReadinessReport(readinessReport),
        cutover: summarizeCutoverReport(cutoverReport),
    };
    result.gate = deriveBundleGate(result);
    result.ok = result.gate !== 'red';
    return result;
}

module.exports = {
    describeDependency,
    verifyMigrationBundle,
};
