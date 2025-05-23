// ========================
// File: orchestrator.js (sequential planning with weighted segway reference)
// ========================
const fs                 = require('fs');
const path               = require('path');
const { pickNextTrack }  = require('./trackManager');
const { getLastPlays, appendPlayLog } = require('./playLogManager');
const { generateSegway, prepareSegway } = require('./promptProcessor');
const { playFile, streamFile } = require('./streamer');
const { STATION_CONFIG, READY_DIR } = require('./config');
const chalk              = require('chalk').default;

let shouldStop = false;
let stopAfterNextMusic = false;

/**
 * Sequential playback loop
 * ─────────────────────────
 * ▸ Picks *at most one* track ahead so we can create segways while a track is playing.
 * ▸ Uses weighted history to pick a reference track for segways.
 */
async function playbackLoop() {
    const pattern         = STATION_CONFIG.schedule.defaultPattern;
    const { historySize = 16, weights = {} } = STATION_CONFIG.trackHistory || {};
    const includePodcasts = !!STATION_CONFIG.djOptions?.includePodcasts;

    // Convert hours → ms, or null if indefinite
    const uptimeMs = typeof STATION_CONFIG.uptimeHours === 'number'
        ? STATION_CONFIG.uptimeHours * 3600 * 1000
        : null;
    const startTime = Date.now();

    // One-track lookahead cache
    let nextEntry = null;

    console.log(chalk.yellow(`▶️ Starting station stream playback with pattern: ${pattern.join(', ')}`));
    console.log(chalk.magenta(`⏱️ Uptime: ${STATION_CONFIG.uptimeHours || '∞'}h, mode: ${STATION_CONFIG.uptimeMode || 'none'}`));

    while (!shouldStop) {
        // enforce uptime cutoffs
        if (uptimeMs !== null) {
            const elapsed = Date.now() - startTime;
            if (STATION_CONFIG.uptimeMode === 'cycle' && elapsed >= uptimeMs) {
                console.log(`🛑 Uptime (${STATION_CONFIG.uptimeHours}h) reached; ending after this cycle.`);
                break;
            }
            if (STATION_CONFIG.uptimeMode === 'track' && elapsed >= uptimeMs) {
                console.log(`🛑 Uptime (${STATION_CONFIG.uptimeHours}h) reached; will stop after next music track.`);
                stopAfterNextMusic = true;
            }
        }

        console.log(chalk.green(`🎧 Starting new cycle at ${new Date().toLocaleTimeString()}`));

        for (let i = 0; i < pattern.length && !shouldStop; i++) {
            const type = pattern[i];

            // ──────────────── SEGWAY ────────────────
            if (type === 'segway') {
                const nextType = pattern[i + 1];
                // look-ahead pick
                if (nextType && nextType !== 'segway' && !nextEntry) {
                    nextEntry = await pickNextTrack(nextType);
                }

                if (!nextEntry?.meta?.title) {
                    console.warn('[Segway Debug] No valid nextEntry; skipping segway.');
                    continue;
                }
                console.log(`🔄 Segway step: next is "${nextEntry.meta.title}"`);

                // build reference history
                const recent = getLastPlays(historySize);
                console.log(`[Segway Debug] history length: ${recent.length}`);

                // find last weighted 'music' entry
                let ref = null;
                for (let j = recent.length - 1; j >= 0; j--) {
                    const e = recent[j];
                    if (e.type === 'music' && (weights[e.type] || 0) > 0 && e.meta.title !== 'Placeholder Track') {
                        ref = e;
                        break;
                    }
                }
                if (!ref) {
                    ref = recent.find(e => (weights[e.type] || 0) > 0 && e.meta.title !== 'Placeholder Track') || null;
                }
                if (ref) {
                    console.log(`[Segway Debug] ref track: "${ref.meta.title}" (${ref.type})`);
                } else {
                    console.warn('[Segway Debug] no ref track; will use intro logic');
                }

                // prepare segway metadata
                const prevSegMeta = ref
                    ? { ...ref.meta, type: ref.type }
                    : { type: 'start', title: '' };
                const nextSegMeta = { ...nextEntry.meta, type: nextType };

                // delegate all messaging logic to promptProcessor
                try {
                    const text = await generateSegway(prevSegMeta, nextSegMeta);
                    if (!text.trim()) {
                        console.log(`[Segway] empty text for ${prevSegMeta.type}→${nextSegMeta.type}; skipping`);
                        continue;
                    }

                    const segFile = await prepareSegway(
                        text,
                        prevSegMeta,
                        nextSegMeta,
                        `${prevSegMeta.type}_to_${nextSegMeta.type}`
                    );
                    if (!segFile) continue;

                    if (STATION_CONFIG.streamMode === 'youtube') {
                        await streamFile(segFile);
                    } else {
                        await playFile(segFile);
                    }
                    fs.unlinkSync(segFile);
                } catch (err) {
                    console.error('Segway error:', err);
                }

                continue; // next pattern step
            }

            // ──────────────── TRACK ────────────────
            let entry;
            if (type === 'dj' && includePodcasts) {
                entry = await pickNextTrackWithPodcasts();
            } else if (nextEntry) {
                entry = nextEntry;
                nextEntry = null;
            } else {
                entry = await pickNextTrack(type);
            }

            if (!entry) {
                console.warn(`No track for "${type}"; skipping.`);
                continue;
            }

            try {
                if (STATION_CONFIG.streamMode === 'youtube') {
                    await streamFile(entry.filepath);
                } else {
                    await playFile(entry.filepath);
                }
                // log play so segways see it
                const rel = path.relative(READY_DIR(''), entry.filepath);
                appendPlayLog(rel, type, entry.meta);
            } catch (err) {
                console.error(`Error playing ${type}:`, err);
            }

            if (stopAfterNextMusic && type === 'music') {
                console.log('🛑 Stopping after this music track.');
                shouldStop = true;
                break;
            }
        }
    }
}

// ─────────── Podcast + DJ mix helper ───────────
async function pickNextTrackWithPodcasts() {
    const djDir      = READY_DIR('dj');
    const podDir     = READY_DIR('podcast');
    const djFiles    = fs.readdirSync(djDir).map(f => path.join(djDir, f));
    const podFiles   = fs.readdirSync(podDir).map(f => path.join(podDir, f));
    const all        = [...djFiles, ...podFiles].filter(f => /\.(mp3|wav)$/i.test(f));
    if (!all.length) {
        console.warn('No DJ/podcast files.');
        return null;
    }
    const choice = all[Math.floor(Math.random() * all.length)];
    const meta   = await require('./utils').extractMetadata(choice);
    return { filepath: choice, meta };
}

function stopPlayback() {
    shouldStop = true;
}

function requestStop() {
    stopAfterNextMusic = true;
}

module.exports = {
    playbackLoop,
    stopPlayback,
    requestStop,
};
