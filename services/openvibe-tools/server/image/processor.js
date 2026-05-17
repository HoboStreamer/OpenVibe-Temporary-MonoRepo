'use strict';

// ═══════════════════════════════════════════════════════════════
// OpenVibe Tools — Image Processing
// Sharp-based image conversion, resize, compress, crop, ICO.
// ═══════════════════════════════════════════════════════════════

const sharp = require('sharp');
const toIco = require('to-ico');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

if (!fs.existsSync(config.tmpDir)) fs.mkdirSync(config.tmpDir, { recursive: true });

function tmpFile(ext) {
    return path.join(config.tmpDir, `${crypto.randomBytes(16).toString('hex')}.${ext}`);
}

const IMAGE_FORMATS = {
    png:  { method: 'png',  mime: 'image/png',     ext: 'png' },
    jpg:  { method: 'jpeg', mime: 'image/jpeg',    ext: 'jpg' },
    jpeg: { method: 'jpeg', mime: 'image/jpeg',    ext: 'jpg' },
    webp: { method: 'webp', mime: 'image/webp',    ext: 'webp' },
    avif: { method: 'avif', mime: 'image/avif',    ext: 'avif' },
    tiff: { method: 'tiff', mime: 'image/tiff',    ext: 'tiff' },
    gif:  { method: 'gif',  mime: 'image/gif',     ext: 'gif' },
    ico:  { method: null,   mime: 'image/x-icon',  ext: 'ico' },
};

/**
 * Convert image buffer to target format.
 */
async function convert(inputBuffer, options = {}) {
    const fmt = String(options.format || 'png').toLowerCase();
    const cfg = IMAGE_FORMATS[fmt];
    if (!cfg) throw new Error(`Unsupported format: ${fmt}`);
    const quality = Math.max(1, Math.min(100, parseInt(options.quality, 10) || 80));

    if (fmt === 'ico') {
        const sizes = [16, 32, 48, 64, 128, 256];
        const pngs = await Promise.all(
            sizes.map(s => sharp(inputBuffer).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer())
        );
        const buf = await toIco(pngs);
        return { buffer: Buffer.from(buf), mime: cfg.mime, ext: cfg.ext };
    }

    const img = sharp(inputBuffer);
    let out;
    if (fmt === 'png') {
        out = await img.png({ quality }).toBuffer();
    } else if (fmt === 'jpeg' || fmt === 'jpg') {
        out = await img.jpeg({ quality }).toBuffer();
    } else if (fmt === 'webp') {
        out = await img.webp({ quality }).toBuffer();
    } else if (fmt === 'avif') {
        out = await img.avif({ quality }).toBuffer();
    } else if (fmt === 'tiff') {
        out = await img.tiff({ quality }).toBuffer();
    } else if (fmt === 'gif') {
        out = await img.gif().toBuffer();
    } else {
        out = await img.toFormat(cfg.method).toBuffer();
    }

    return { buffer: out, mime: cfg.mime, ext: cfg.ext };
}

/**
 * Resize image.
 */
async function resize(inputBuffer, options = {}) {
    const width  = parseInt(options.width,  10) || null;
    const height = parseInt(options.height, 10) || null;
    const fit = ['cover', 'contain', 'fill', 'inside', 'outside'].includes(options.fit) ? options.fit : 'inside';
    const fmt = String(options.format || 'png').toLowerCase();
    const cfg = IMAGE_FORMATS[fmt] || IMAGE_FORMATS.png;
    const quality = Math.max(1, Math.min(100, parseInt(options.quality, 10) || 85));

    if (!width && !height) throw new Error('At least one of width or height is required');

    const img = sharp(inputBuffer).resize({ width, height, fit, withoutEnlargement: options.noUpscale !== false });
    const out = await img.toFormat(cfg.method, { quality }).toBuffer();
    return { buffer: out, mime: cfg.mime, ext: cfg.ext };
}

/**
 * Compress image (reduce file size while preserving format).
 */
async function compress(inputBuffer, options = {}) {
    const quality = Math.max(1, Math.min(100, parseInt(options.quality, 10) || 70));
    // Auto-detect format from buffer
    const meta = await sharp(inputBuffer).metadata();
    const fmt = String(options.format || meta.format || 'jpeg').toLowerCase();
    const cfg = IMAGE_FORMATS[fmt] || IMAGE_FORMATS.jpg;

    const img = sharp(inputBuffer);
    const out = await img.toFormat(cfg.method, { quality }).toBuffer();
    return { buffer: out, mime: cfg.mime, ext: cfg.ext };
}

/**
 * Crop image to a rectangular region.
 */
async function crop(inputBuffer, options = {}) {
    const left   = parseInt(options.left,   10) || 0;
    const top    = parseInt(options.top,    10) || 0;
    const width  = parseInt(options.width,  10) || null;
    const height = parseInt(options.height, 10) || null;
    const fmt = String(options.format || 'png').toLowerCase();
    const cfg = IMAGE_FORMATS[fmt] || IMAGE_FORMATS.png;
    const quality = Math.max(1, Math.min(100, parseInt(options.quality, 10) || 85));

    if (!width || !height) throw new Error('Width and height are required for crop');

    const img = sharp(inputBuffer).extract({ left, top, width, height });
    const out = await img.toFormat(cfg.method, { quality }).toBuffer();
    return { buffer: out, mime: cfg.mime, ext: cfg.ext };
}

/**
 * Get image metadata.
 */
async function imageMetadata(inputBuffer) {
    const meta = await sharp(inputBuffer).metadata();
    return {
        width: meta.width,
        height: meta.height,
        format: meta.format,
        channels: meta.channels,
        space: meta.space,
        hasAlpha: meta.hasAlpha,
        size: inputBuffer.length,
        density: meta.density || null,
        isAnimated: meta.pages > 1,
        pages: meta.pages || 1,
    };
}

function cleanTmp(filePath) {
    if (!filePath) return;
    const fs2 = require('fs');
    fs2.unlink(filePath, () => {});
}

module.exports = { convert, resize, compress, crop, imageMetadata, cleanTmp, IMAGE_FORMATS };
