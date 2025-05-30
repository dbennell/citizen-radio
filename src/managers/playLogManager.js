// ========================
// File: playLogManager.js
// ========================
const fs = require('fs');
const path = require('path');

const PLAY_LOG = path.join(__dirname, '../../data/play.log');
const CACHE_LIMIT = 256; // How many of the newest rows we keep in memory
let recentCache = []; // Chronological ring buffer (oldest → newest)

/* ────────────────────────── Bootstrap recentCache ────────────────────────── */

// Initialize recentCache with data from play.log or a placeholder if empty
function initializeCache() {
    try {
        if (fs.existsSync(PLAY_LOG)) {
            const raw = fs.readFileSync(PLAY_LOG, 'utf-8').trim();
            if (raw) {
                recentCache = raw
                    .split('\n')
                    .slice(-CACHE_LIMIT) // Keep only the newest CACHE_LIMIT entries
                    .map((line) => JSON.parse(line));
            }
        }

        // If recentCache is still empty, add a placeholder entry
        if (recentCache.length === 0) {
            console.warn('💾 play.log is empty. Initializing recentCache with a placeholder.');
            recentCache.push({
                timestamp: Date.now(),
                relPath: 'placeholder.mp3',
                type: 'placeholder',
                meta: {
                    title: 'Placeholder Track',
                    artist: 'Unknown Artist',
                },
            });
        }
        console.log(`💾 recentCache initialized with ${recentCache.length} entries.`);
    } catch (err) {
        console.error('💾 Failed to seed recentCache:', err);
        // Ensure recentCache is never undefined
        recentCache = [
            {
                timestamp: Date.now(),
                relPath: 'error-placeholder.mp3',
                type: 'error',
                meta: {
                    title: 'Error Placeholder',
                    artist: 'Unknown Artist',
                },
            },
        ];
    }
}

// Safeguard initialization for module loading
initializeCache();

/* ───────────────────────── Public API ───────────────────────── */

/** 
 * Append a play entry to both disk and memory (write-through cache).
 * 
 * Note: We strip unnecessary fields from the meta object to save space in the play log file.
 * We only keep the title, artist, and genre fields, as these are the only ones needed for
 * logging and display purposes. This helps reduce the size of the play log file, especially
 * by removing large data like cover art image data.
 */
function appendPlayLog(relPath, type, meta) {
    // Strip unneeded fields from meta to save space
    const strippedMeta = {
        title: meta.title || 'Unknown Title',
        artist: meta.artist || 'Unknown Artist',
        genre: meta.genre || ''
    };

    const entry = { timestamp: Date.now(), relPath, type, meta: strippedMeta };

    try {
        // Log the operation
        //console.log(`🪵 Logging play: ${meta.title} (${meta.artist || 'unknown artist'})`);

        // Write to disk
        fs.appendFileSync(PLAY_LOG, JSON.stringify(entry) + '\n');

        // Update in-memory cache
        recentCache.push(entry);
        if (recentCache.length > CACHE_LIMIT) recentCache.shift(); // Drop oldest
    } catch (err) {
        console.error('💾 Failed to append play log:', err);
    }
}

/** Read all plays (from the file). */
function readPlays() {
    try {
        if (!fs.existsSync(PLAY_LOG)) return [];
        const raw = fs.readFileSync(PLAY_LOG, 'utf-8').trim();
        if (!raw) return [];
        return raw
            .split('\n')
            .filter(Boolean)
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    } catch (err) {
        console.error('💾 Failed to read play log:', err);
        return [];
    }
}

/** Get total play count for a specific track. */
function getPlayCount(relPath) {
    return readPlays().reduce((count, entry) => count + (entry.relPath === relPath ? 1 : 0), 0);
}

/** Get play history, optionally filtered by type. */
function getHistory(type = null) {
    const allPlays = readPlays();
    return type ? allPlays.filter((entry) => entry.type === type) : allPlays;
}

/** Get the last `n` plays from the in-memory cache. */
function getLastPlays(n = 5) {
    return recentCache
        .slice(-n) // Fetch the latest plays
        .filter((entry) => entry.meta && entry.meta.title); // Only valid entries
}

/* ─────────────────────────────────────────────────────────────────────── */

module.exports = {
    appendPlayLog,
    getPlayCount,
    getHistory,
    getLastPlays,
    recentCache,
};
