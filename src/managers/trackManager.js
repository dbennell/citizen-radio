// ========================
// File: trackManager.js
// ========================
const fs   = require('fs');
const path = require('path');
const { getPlayCount, getLastPlays } = require('./playLogManager');
const { extractMetadata }            = require('../utils');
const { STATION_CONFIG, READY_DIR }  = require('../core/config');
const ratingManager = require('./ratingsManager');
const { generateTTS } = require('../utils/ttsHelper');


/**
 * Helper – get the absolute path inside the ready/ tree.
 *   READY_DIR('')           →  .../ready
 *   READY_DIR('music')      →  .../ready/music
 *   READY_DIR('segue/foo') →  .../ready/segue/foo
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

    // 5) exclude already queued duplicates (any type)
    try {
        const orchestrator = require('../core/orchestrator');
        const contentQueueManager = orchestrator.getContentQueue();

        if (contentQueueManager && contentQueueManager.contentQueue) {
            const queuedTracks = contentQueueManager.contentQueue;

            // Filter out tracks that are already in the queue
            available = available.filter(item =>
                !queuedTracks.some(queueItem => {
                    // Get the relative path of the queued item for comparison
                    const queuedRelPath = queueItem.meta && queueItem.meta.relPath;
                    return queuedRelPath === item.rel;
                })
            );
        }
    } catch (err) {
        console.log('Unable to filter out queued tracks:', err.message);
    }

    // 6) prefer never‑played
    let candidates = available.filter(i => i.count === 0);
    // If no never-played tracks are available, use all available tracks
    if (candidates.length === 0) {
        ///console.log(`No never-played ${type} tracks found, using all available tracks`);
        candidates = available;
    }

    let choice = await performWeightedSelection(candidates);

    // 7) Check if we have a valid choice
    if (!choice || !choice.fp) {
        console.warn(`No valid ${type} track found to play`);
        return { filepath: null, meta: null };
    }

    // 8)
    const meta = extractMetadata(choice.fp);
    if (!meta) {
        console.warn(`Failed to extract metadata for ${choice.fp}`);
        return { filepath: choice.fp, meta: { title: path.basename(choice.fp), filename: path.basename(choice.fp) } };
    }

    meta.type = type;
    meta.relPath = choice.rel; // Add relPath to metadata for rating lookup

    return { filepath: choice.fp, meta };
}

/**
 * Delete leftover segue_*.mp3 files in ready/segue/
 * @param {Array} activeQueue - Optional array of currently queued items to preserve their segues
 */
async function cleanupSegues(activeQueue = null) {
    // Use the segueManager to clean up segue files
    const segueManager = require('./segueManager');

    // If an active queue is provided, use it to preserve needed segues
    // Otherwise, only delete segues that aren't referenced anywhere
    try {
        // Try to get the content queue from the orchestrator if not provided
        if (!activeQueue) {
            try {
                const orchestrator = require('../core/orchestrator');
                const contentQueue = orchestrator.getContentQueue();
                if (contentQueue && contentQueue.contentQueue) {
                    activeQueue = contentQueue.contentQueue;
                    console.log(`Using active content queue with ${activeQueue.length} items for segue cleanup`);
                }
            } catch (err) {
                console.log('No active content queue found, preserving all segues');
                activeQueue = [];
            }
        }

        // Pass the active queue to removeOldSegues to preserve needed segues
        // Pass null as the currently playing file since trackManager doesn't know which file is playing
        await segueManager.removeOldSegues(activeQueue || [], null);
    } catch (err) {
        console.error(`Error during segue cleanup: ${err.message}`);
    }
}

/**
 * Performs weighted selection from a list of candidate tracks
 * @param {Array} candidates - List of candidate tracks
 * @returns {Promise<Object>} - Selected track
 */
async function performWeightedSelection(candidates) {
    // Check if candidates array is empty
    if (!candidates || candidates.length === 0) {
        console.warn('No candidates provided for weighted selection');
        return null;
    }

    // if (!STATION_CONFIG.ratingSystem?.enabled) {
    //     // Fall back to random selection if rating system is disabled
    //     return candidates[Math.floor(Math.random() * candidates.length)];
    // }

    // Map candidates with their ratings and ticket counts
    const candidatesWithRatings = [];
    for (const candidate of candidates) {
        // Get rating asynchronously
        const rating = await ratingManager.getRatingForTrack(candidate.rel) ||
            STATION_CONFIG.ratingSystem.defaultRating;
        // Ensure each track gets at least 1 ticket, even with low ratings
        const tickets = Math.max(1, ratingManager.getTicketsForTrack(rating));
        candidatesWithRatings.push({
            ...candidate,
            rating,
            tickets
        });
    }

    // Log warning only if we truly have no candidates with ratings
    if (!candidatesWithRatings || candidatesWithRatings.length === 0) {
        console.warn('No candidates provided with ratings for weighted selection!');
    }

    // Build the raffle pool
    const rafflePool = [];
    for (const candidate of candidatesWithRatings) {
        for (let i = 0; i < candidate.tickets; i++) {
            rafflePool.push(candidate);
        }
    }

    // If raffle pool is empty (shouldn't happen), fall back to random
    if (rafflePool.length === 0) {
        console.warn('Raffle pool is empty, falling back to random selection');
        return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    }

    // Draw a random ticket from the pool
    return rafflePool[Math.floor(Math.random() * rafflePool.length)];
}


module.exports = {
    pickNextTrack,
    cleanupSegues,
    performWeightedSelection
};
