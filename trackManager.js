// ========================
// File: trackManager.js
// ========================
const fs   = require('fs');
const path = require('path');
const { getPlayCount, getLastPlays } = require('./playLogManager');
const { extractMetadata }            = require('./utils');
const { STATION_CONFIG, READY_DIR }  = require('./config');

/**
 * Helper – get the absolute path inside the ready/ tree.
 *   READY_DIR('')           →  .../ready
 *   READY_DIR('music')      →  .../ready/music
 *   READY_DIR('segway/foo') →  .../ready/segway/foo
 */
function readyPath(subPath = '') {
    return READY_DIR(subPath);
}

/**
 * Return the index of a relPath inside a recent‑plays array.
 *  0 === most‑recent |  Infinity === not found
 */
function distanceFromRecent(rel, recent) {
    const idx = recent.findIndex(e => e.relPath === rel);
    return idx === -1 ? Infinity : idx;
}

/**
 * Pick the next file of a given <type> using a stronger de‑duplication strategy.
 */
async function pickNextTrack(type) {
    const dir = readyPath(type);

    if (!fs.existsSync(dir)) return { filepath: null, meta: null };

    // 1) all .mp3 files
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.mp3'))
        .map(f => path.join(dir, f));
    if (files.length === 0) return { filepath: null, meta: null };

    // 2) add play‑count & relPath
    const items = files.map(fp => {
        const rel = path.relative(readyPath(), fp); // « consistent root »
        return { fp, rel, count: getPlayCount(rel) };
    });

    // 3) recent history (all types)
    const historySize = STATION_CONFIG.trackHistory?.historySize ?? 16;
    const recent      = getLastPlays(historySize);

    // 4) exclude recent duplicates (any type)
    let available = items.filter(item =>
        !recent.some(e => e.relPath === item.rel)
    );

    // 5) if everything is recent → least‑recently‑played half of full list
    if (available.length === 0) {
        items.sort((a, b) =>
            distanceFromRecent(b.rel, recent) - distanceFromRecent(a.rel, recent)
        );
        const half = Math.max(1, Math.floor(items.length / 2));
        available  = items.slice(0, half);
    }

    // 6) prefer never‑played
    let candidates = available.filter(i => i.count === 0);

    // 7) else least‑played + least‑recently‑played
    if (candidates.length === 0) {
        available.sort((a, b) => {
            if (a.count !== b.count) return a.count - b.count;
            return distanceFromRecent(b.rel, recent) - distanceFromRecent(a.rel, recent);
        });
        const half = Math.max(1, Math.floor(available.length / 2));
        candidates = available.slice(0, half);
    }

    // 8) random pick
    const choice = candidates[Math.floor(Math.random() * candidates.length)];

    const meta = extractMetadata(choice.fp);
    meta.type  = type;

    return { filepath: choice.fp, meta };
}

/**
 * Delete leftover segway_*.mp3 files in ready/segway/
 */
function cleanupSegways() {
    const segwayDir = readyPath('segway');
    if (!fs.existsSync(segwayDir)) return;

    const files = fs.readdirSync(segwayDir)
        .filter(f => f.startsWith('segway_') && f.endsWith('.mp3'));

    for (const file of files) {
        try {
            fs.unlinkSync(path.join(segwayDir, file));
        } catch (err) {
            console.error(`Error deleting segway file ${file}:`, err);
        }
    }
    if (files.length) {
        console.log(`Cleaned up ${files.length} segway files from ready/segway`);
    }
}

module.exports = {
    pickNextTrack,
    cleanupSegways,
};
