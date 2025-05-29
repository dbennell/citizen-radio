
// ========================
// File: segwayManager.js
// ========================
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { getLastPlays } = require('./playLogManager');
const crypto = require('crypto');

// More robust config loading with better error handling
let configCache = null;
let configLoadAttempted = false;

// Cache for OpenAI API responses to improve performance
const segwayTextCache = new Map();
const MAX_SEGWAY_CACHE_SIZE = 100;

// Cache directory for persistent segway text caching
const SEGWAY_CACHE_DIR = path.join(__dirname, '../../data/cache/segway-text');

// Ensure cache directory exists
try {
    if (!fs.existsSync(SEGWAY_CACHE_DIR)) {
        fs.mkdirSync(SEGWAY_CACHE_DIR, { recursive: true });
    }
} catch (err) {
    console.warn(`SegwayManager: Failed to create cache directory: ${err.message}`);
}

function getConfig() {
    if (!configCache && !configLoadAttempted) {
        configLoadAttempted = true;
        try {
            // Delay the require until absolutely necessary
            const config = require('../core/config');

            if (config && config.STATION_CONFIG) {
                configCache = {
                    STATION_CONFIG: config.STATION_CONFIG,
                    READY_DIR: config.READY_DIR
                };
                //console.log('SegwayManager: Successfully loaded config');
            } else {
                throw new Error('Config loaded but STATION_CONFIG is missing');
            }
        } catch (error) {
            console.error('SegwayManager: Failed to load config, using defaults:', error.message);

            // Provide comprehensive default values
            configCache = {
                STATION_CONFIG: {
                    stationName: 'Default Station',
                    ratingSystem: { enabled: false },
                    segwayFunny: 0.25,
                    aiPrompts: {
                        segway: "Write a smooth segway.",
                        segwayFunny: "Add a touch of humor to the segway."
                    },
                    context: "You are playing the role of a Radio DJ",
                    vibe: "A mainstream popular commercial radio station",
                    djName: "DJ Bob",
                    ttsProfiles: {
                        segway: "en-US-Wavenet-D"
                    }
                },
                READY_DIR: (type) => path.join(__dirname, `../../data/ready/${type}`)
            };
        }
    }

    // Always return the cache, even if it's defaults
    return configCache || {
        STATION_CONFIG: {
            stationName: 'Fallback Station',
            ratingSystem: { enabled: false }
        },
        READY_DIR: (type) => path.join(__dirname, `../../data/ready/${type}`)
    };
}

// Helper function to safely get STATION_CONFIG
function getStationConfig() {
    const config = getConfig();
    return config.STATION_CONFIG;
}

// Helper function to safely get READY_DIR
function getReadyDir() {
    const config = getConfig();
    return config.READY_DIR;
}

const openai = require('openai');

// Lazy load these modules to avoid circular dependencies
let ratingManager;
let engagementMonitor;
let ttsHelper;

const readFileAsync = promisify(fs.readFile);
const unlinkAsync = promisify(fs.unlink);

// Define SEGWAY_DIR as a function to ensure it's evaluated when needed
const getSegwayDir = () => {
    const READY_DIR = getReadyDir();
    return READY_DIR('segway');
};

const PLAY_LOG = path.join(__dirname, '../../data/play.log');

/**
 * Get the track context for segway generation by referencing play.log and the queue.
 * Optimized to read only the last few lines of the play log file.
 */
async function getTrackContext(playbackQueue) {
    try {
        // Check if playbackQueue is valid
        if (!Array.isArray(playbackQueue)) {
            console.error('SegwayManager: Invalid playbackQueue provided');
            return null;
        }

        // Get last tracks from play.log using getLastPlays helper
        // This is more efficient than reading the entire file
        const lastPlays = await getLastPlays(5); // Get last 5 plays for context

        // Filter out segways from play history
        const filteredHistory = lastPlays
            .filter(entry => entry.type !== 'segway')
            .map(entry => ({
                type: entry.type,
                meta: entry.meta,
                relPath: entry.relPath
            }));

        const lastPlayed = filteredHistory.length > 0 ? filteredHistory[0] : null;

        // Get next track from the playback queue
        const nextTrack = playbackQueue.length > 0 ? playbackQueue[0] : null;

        if (lastPlayed && nextTrack) {
            return {
                lastTrack: lastPlayed,
                nextTrack: nextTrack,
                prevTracks: filteredHistory.slice(0, 3), // Get up to 3 previous tracks
                nextTracks: playbackQueue.slice(0, 3)  // Get up to 3 upcoming tracks
            };
        }

        console.warn(`SegwayManager: Missing context. Last Played: ${lastPlayed ? lastPlayed.meta.title : 'none'}, Next Track: ${nextTrack ? nextTrack.meta.title : 'none'}`);
        return null;
    } catch (err) {
        console.error(`SegwayManager: Failed to retrieve track context -> ${err.message}`);
        return null;
    }
}

/**
 * Check if a segway should be generated for this transition based on config probabilities
 */
function shouldGenerateSegway(prevType, nextType) {
    const STATION_CONFIG = getStationConfig();

    // Check if auto segways are enabled
    if (!STATION_CONFIG?.schedule?.autoSegways?.enabled) {
        return false;
    }

    const transitionKey = `${prevType}->${nextType}`;
    const chances = STATION_CONFIG.schedule.autoSegways.transitionChances || {};
    const chance = chances[transitionKey];

    // If no specific chance is defined, default to 0% (no segway)
    if (chance === undefined) {
        //console.log(`SegwayManager: No transition chance defined for ${transitionKey}, skipping segway`);
        return false;
    }

    // If chance is 0, never generate segway
    if (chance === 0) {
        //console.log(`SegwayManager: Transition ${transitionKey} has 0% chance, skipping segway`);
        return false;
    }

    const random = Math.random();
    const shouldGenerate = random < chance;

    //console.log(`SegwayManager: Transition ${transitionKey} chance: ${(chance * 100).toFixed(1)}%, rolled: ${(random * 100).toFixed(1)}%, generate: ${shouldGenerate}`);

    return shouldGenerate;
}


/**
 * Generate a segway between two tracks using OpenAI.
 */
async function generateSegway(prevMeta, nextMeta, prevTracks = [], nextTracks = []) {
    try {
        // Load config when needed - use the safer helper
        const STATION_CONFIG = getStationConfig();

        ///console.log('SegwayManager: Config check - stationName:', STATION_CONFIG?.stationName || 'undefined');

        // Normalize metadata
        const prevTitle = prevMeta?.title || (prevMeta?.filename ? prevMeta.filename.replace(/\.[^/.]+$/, "") : "previous track");
        const prevType = prevMeta?.type || "unknown";
        const nextTitle = nextMeta?.title || (nextMeta?.filename ? nextMeta.filename.replace(/\.[^/.]+$/, "") : "upcoming content");
        const nextType = nextMeta?.type || "upcoming content";

        // First check if we should generate a segway for this transition
        if (!shouldGenerateSegway(prevType, nextType)) {
            //console.log(`SegwayManager: Skipping segway for ${prevType} -> ${nextType} transition`);
            return null; // Return null to indicate no segway should be generated
        }

        console.log(`🌀 Generating segway to play before ${nextType} (${nextTitle}) after ${prevType} (${prevTitle})`);

        // Lazy load modules to avoid circular dependencies
        if (!ratingManager) {
            ratingManager = require('./ratingsManager');
        }
        if (!engagementMonitor) {
            engagementMonitor = require('./engagementMonitor');
        }

        const includeFunny = Math.random() < (STATION_CONFIG?.segwayFunny ?? 0);

        // Process previous tracks array
        let prevTracksInfo = [];
        if (prevTracks.length > 0) {
            prevTracksInfo = prevTracks
                .filter(track => track.type !== 'ad')
                .slice(0, 2)
                .map(track => {
                    const trackInfo = {
                        title: track.meta?.title || (track.meta?.filename ? track.meta.filename.replace(/\.[^/.]+$/, "") : "unknown track"),
                        artist: track.meta?.artist || "unknown artist",
                        type: track.type || "unknown",
                        rating: null,
                        ratingInfo: ""
                    };

                    // Add rating info if available
                    if (STATION_CONFIG?.ratingSystem?.enabled && track.type === 'music' && track.meta?.relPath) {
                        const rating = ratingManager.getRatingForTrack(track.meta.relPath);
                        if (rating) {
                            trackInfo.rating = rating;
                            trackInfo.ratingInfo = `This track has a listener rating of ${typeof rating === 'number' ? rating.toFixed(1) : rating}/5.`;
                        }
                    }

                    return trackInfo;
                });
        }

        // Process next tracks array
        let nextTracksInfo = [];
        if (nextTracks.length > 0) {
            nextTracksInfo = nextTracks
                .filter(track => track.type !== 'ad')
                .slice(0, 2)
                .map(track => {
                    const trackInfo = {
                        title: track.meta?.title || (track.meta?.filename ? track.meta.filename.replace(/\.[^/.]+$/, "") : "upcoming track"),
                        artist: track.meta?.artist || "unknown artist",
                        type: track.type || "unknown",
                        rating: null,
                        ratingInfo: ""
                    };

                    // Add rating info if available
                    if (STATION_CONFIG?.ratingSystem?.enabled && track.type === 'music' && track.meta?.relPath) {
                        const rating = ratingManager.getRatingForTrack(track.meta.relPath);
                        if (rating) {
                            trackInfo.rating = rating;
                            trackInfo.ratingInfo = `This track has a listener rating of ${typeof rating === 'number' ? rating.toFixed(1) : rating}/5.`;

                            // For highly rated tracks, add special note
                            if (typeof rating === 'number' && rating >= 4.5) {
                                trackInfo.ratingInfo += " It's a fan favorite!";
                            }
                        }
                    }

                    return trackInfo;
                });
        }

        // For backward compatibility, still process the direct prevMeta and nextMeta
        let prevRatingInfo = "";
        let nextRatingInfo = "";

        if (STATION_CONFIG?.ratingSystem?.enabled) {
            if (prevMeta.type === 'music' && prevMeta.relPath) {
                const rating = ratingManager.getRatingForTrack(prevMeta.relPath);
                if (rating) {
                    prevRatingInfo = `This track has a listener rating of ${typeof rating === 'number' ? rating.toFixed(1) : rating}/5.`;
                }
            }

            if (nextMeta.type === 'music' && nextMeta.relPath) {
                const rating = ratingManager.getRatingForTrack(nextMeta.relPath);
                if (rating) {
                    nextRatingInfo = `The upcoming track has a listener rating of ${typeof rating === 'number' ? rating.toFixed(1) : rating}/5.`;

                    // For highly rated tracks, suggest special introduction
                    if (typeof rating === 'number' && rating >= 4.5) {
                        nextRatingInfo += " It's a fan favorite, so consider giving it a special introduction!";
                    }
                }
            }
        }

        // 1) No previous track at all?  →  simple intro
        if (prevType === 'start' || prevTitle === '') {
            return `Up next, ${nextTitle}${ nextMeta.artist ? ` by ${nextMeta.artist}` : '' }.`;
        }

        // For transitions to advertisements
        if (nextType === 'ad') {
            const adTransitions = [
                `And now a word from our sponsors.`,
                `We'll be right back after these messages.`,
                `Let's take a quick break to hear from our partners.`,
                `Stay tuned for more after this brief message.`,
                `A moment of your time for our sponsors, please.`
            ];
            return adTransitions[Math.floor(Math.random() * adTransitions.length)];
        }

        // For transitions from advertisements
        if (prevType === 'ad') {
            const fromAdTransitions = [
                `And we're back with more great music on ${STATION_CONFIG?.stationName || 'our station'}.`,
                `Thanks for your patience. Now back to the hits.`,
                `And now, back to our regularly scheduled programming.`,
                `Let's get back to what you came for - more great tunes.`,
                `That's enough talk. Back to the music!`
            ];
            return fromAdTransitions[Math.floor(Math.random() * fromAdTransitions.length)];
        }

        // For intro → music transitions, announce the upcoming track
        if (prevType === 'intro' && nextType === 'music') {
            return `Up next on ${STATION_CONFIG?.stationName || 'our station'}, ${nextTitle}${nextMeta.artist ? ` by ${nextMeta.artist}` : ''}.`;
        }

        // For transitions from DJ talk to music
        if (prevType === 'dj' && nextType === 'music') {
            const djToMusicTransitions = [
                `Here's ${nextTitle}.`,
                `Let's kick things up with ${nextTitle}.`,
                `Time for some music. This is ${nextTitle}.`,
                `You're listening to ${STATION_CONFIG?.stationName || 'our station'}, and this is ${nextTitle}.`,
                `Let's get back to the music with ${nextTitle}.`
            ];
            return djToMusicTransitions[Math.floor(Math.random() * djToMusicTransitions.length)];
        }

        // For music to music transitions (use AI for better variety)
        if (prevType === 'music' && nextType === 'music') {
            // Create a cache key for segway text caching
            const cacheKeyData = `${prevTitle}-${prevMeta?.artist || ''}-${nextTitle}-${nextMeta?.artist || ''}-${includeFunny ? 'funny' : 'normal'}`;
            const cacheKey = crypto.createHash('md5').update(cacheKeyData).digest('hex');
            const cachePath = path.join(SEGWAY_CACHE_DIR, `${cacheKey}.txt`);

            // Check memory cache first (fastest)
            if (segwayTextCache.has(cacheKey)) {
                const cachedText = segwayTextCache.get(cacheKey);
                console.log(`SegwayManager: Using cached segway text (memory cache)`);
                return cachedText;
            }

            // Check disk cache next
            try {
                if (fs.existsSync(cachePath)) {
                    const cachedText = fs.readFileSync(cachePath, 'utf-8');
                    // Update memory cache
                    segwayTextCache.set(cacheKey, cachedText);
                    if (segwayTextCache.size > MAX_SEGWAY_CACHE_SIZE) {
                        // Remove oldest entry if cache is too large
                        const oldestKey = segwayTextCache.keys().next().value;
                        segwayTextCache.delete(oldestKey);
                    }
                    console.log(`SegwayManager: Using cached segway text (disk cache)`);
                    return cachedText;
                }
            } catch (cacheErr) {
                console.warn(`SegwayManager: Cache read error (continuing with API): ${cacheErr.message}`);
            }

            const context = `${STATION_CONFIG?.context || "You are playing the role of a Radio DJ"}. The station, '${STATION_CONFIG?.stationName || "Unknown Station"}', has the vibe of "${STATION_CONFIG?.vibe || "A mainstream popular commercial radio station"}". DJ Name: '${STATION_CONFIG?.djName || "DJ Bob"}'.`;

            const basePrompt = STATION_CONFIG?.aiPrompts?.segway || "Write a smooth segway.";
            const funnySuffix = includeFunny ? `\n\n${STATION_CONFIG?.aiPrompts?.segwayFunny || "Add a touch of humor to the segway."}` : "";
            const prompt = `${basePrompt}${funnySuffix}`;

            const userPrompt = `
                You are a lively and enthusiastic DJ on a galactic space station.

                Previous song: "${prevTitle}" ${prevMeta?.artist ? `by ${prevMeta.artist}` : ''}
                Next song: "${nextTitle}" ${nextMeta?.artist ? `by ${nextMeta.artist}` : ''}

                Task: Create a short, natural DJ-style transition from the previous track to the next.
                ${prompt}

                Respond only with the DJ's spoken words. Limit to 1–2 sentences. Be natural and entertaining.
                `;

            try {
                // Create OpenAI client with timeout
                const openaiClient = new openai.OpenAI({
                    apiKey: process.env.OPENAI_API_KEY,
                    timeout: 5000 // 5 second timeout for better responsiveness
                });

                // Set up the API call with a timeout
                const responsePromise = openaiClient.chat.completions.create({
                    model: "gpt-4.1-mini", // Consider using a faster model like gpt-3.5-turbo for better performance
                    messages: [
                        { role: "system", content: context },
                        { role: "user", content: userPrompt },
                    ],
                    max_tokens: 100,
                    temperature: 0.7, // Add temperature for more varied responses
                });

                // Add a timeout promise
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('OpenAI API timeout')), 8000)
                );

                // Race the promises
                const response = await Promise.race([responsePromise, timeoutPromise]);

                const segwayText = response.choices[0].message.content.trim();

                // Save to cache
                try {
                    fs.writeFileSync(cachePath, segwayText, 'utf-8');
                    segwayTextCache.set(cacheKey, segwayText);
                    if (segwayTextCache.size > MAX_SEGWAY_CACHE_SIZE) {
                        // Remove oldest entry if cache is too large
                        const oldestKey = segwayTextCache.keys().next().value;
                        segwayTextCache.delete(oldestKey);
                    }
                } catch (cacheErr) {
                    console.warn(`SegwayManager: Cache write error: ${cacheErr.message}`);
                }

                return segwayText;
            } catch (error) {
                console.error(`SegwayManager: OpenAI API error: ${error.message}`);

                // Fallback to template-based segway if API fails
                const templates = [
                    `That was ${prevTitle}${prevMeta?.artist ? ` by ${prevMeta.artist}` : ''}. Now, here's ${nextTitle}${nextMeta?.artist ? ` by ${nextMeta.artist}` : ''}.`,
                    `You just heard ${prevTitle}. Up next, ${nextTitle}.`,
                    `Let's keep the music going with ${nextTitle} after that great track by ${prevMeta?.artist || 'our previous artist'}.`,
                    `From ${prevMeta?.artist || 'one artist'} to ${nextMeta?.artist || 'another'}, here's ${nextTitle}.`,
                    `That was ${prevTitle}. Now switching gears with ${nextTitle}.`
                ];

                const fallbackText = templates[Math.floor(Math.random() * templates.length)];

                // Even fallback text should be cached to avoid repeated API failures
                try {
                    fs.writeFileSync(cachePath, fallbackText, 'utf-8');
                    segwayTextCache.set(cacheKey, fallbackText);
                } catch (cacheErr) {
                    // Just log, don't throw
                    console.warn(`SegwayManager: Fallback cache write error: ${cacheErr.message}`);
                }

                return fallbackText;
            }
        }

        // Default fallback
        return `And that was ${prevTitle}. Coming up next on ${STATION_CONFIG?.stationName || 'our station'}, ${nextTitle}!`;

    } catch (error) {
        console.error(`SegwayManager: Error generating segway: ${error.message}`);
        // Fallback text if API fails
        const STATION_CONFIG = getStationConfig();
        return `And that was ${prevMeta?.title || 'our last track'}. Coming up next on ${STATION_CONFIG?.stationName || 'our station'}!`;
    }
}


/**
 * Generate and save a segway audio file.
 */
async function prepareSegway(segwayText, prevMeta, nextMeta, key = '') {
    const STATION_CONFIG = getStationConfig();

    //console.log('SegwayManager: prepareSegway - Config check - stationName:', STATION_CONFIG?.stationName || 'undefined');
    //console.log('SegwayManager: prepareSegway - Full config check:', {
    //     hasConfig: !!STATION_CONFIG,
    //     stationName: STATION_CONFIG?.stationName,
    //     hasTtsProfiles: !!STATION_CONFIG?.ttsProfiles
    // });

    if (!STATION_CONFIG) {
        console.error('SegwayManager: STATION_CONFIG could not be loaded in prepareSegway');
        return null;
    }

    // Lazy load TTS helper
    if (!ttsHelper) {
        ttsHelper = require('../utils/ttsHelper');
    }

    const timestamp = Date.now();
    const segwayFileName = `segway_${key || 'transition'}_${timestamp}.mp3`;
    const segwayFilePath = path.join(getSegwayDir(), segwayFileName);

    try {
        //console.log(`SegwayManager: Generating segway audio (type: ${key || 'transition'})...`);

        // Prepare metadata for TTS
        const metadata = {
            title: `Before ${nextMeta.title || "Next"} after ${prevMeta.title || "Previous"}`,
            artist: STATION_CONFIG?.stationName || 'Unknown Station',
            comment: `Segway to play before ${nextMeta.type} after ${prevMeta.type}`,
        };

        // console.log('SegwayManager: About to call generateTTS with config:', {
        //     segwayText: segwayText.substring(0, 50) + '...',
        //     filePath: segwayFilePath,
        //     metadata,
        //     type: "segway",
        //     stationConfig: {
        //         stationName: STATION_CONFIG.stationName,
        //         hasTtsProfiles: !!STATION_CONFIG.ttsProfiles
        //     }
        // });

        // Pass the STATION_CONFIG explicitly to avoid circular dependency issues
        await ttsHelper.generateTTS(segwayText, segwayFilePath, metadata, "segway", STATION_CONFIG);

        //console.log('SegwayManager: TTS generation completed successfully');
        return segwayFilePath;
    } catch (error) {
        console.error(`SegwayManager: Failed to prepare segway: ${error.message}`);
        console.error('SegwayManager: Error stack:', error.stack);
        return null;
    }
}

/**
 * Remove old segway files that are no longer needed.
 * IMPORTANT: Never delete files that are currently being played or about to be played
 * Optimized for better performance and stability
 */
async function removeOldSegways(playbackQueue = [], currentlyPlayingFile = null) {
    try {
        // Validate inputs
        if (!Array.isArray(playbackQueue)) {
            console.error('SegwayManager: Invalid playbackQueue provided to removeOldSegways');
            return;
        }

        const segwayDir = getSegwayDir();

        // Create directory if it doesn't exist
        if (!fs.existsSync(segwayDir)) {
            fs.mkdirSync(segwayDir, { recursive: true });
            return;
        }

        // Get all segway files
        const segwayFiles = await fs.promises.readdir(segwayDir)
            .then(files => files.filter(file => file.startsWith('segway_') && file.endsWith('.mp3')))
            .catch(err => {
                console.error(`SegwayManager: Error reading segway directory: ${err.message}`);
                return [];
            });

        if (segwayFiles.length === 0) return;

        // Create a Set of protected files for faster lookups
        const protectedFiles = new Set();

        // Add currently playing file to protected set
        if (currentlyPlayingFile) {
            protectedFiles.add(currentlyPlayingFile);
        }

        // Add all files referenced in the queue to protected set
        if (playbackQueue.length > 0) {
            // Extract all segway filepaths from the queue
            playbackQueue.forEach(item => {
                if (item.segway && item.segway.filepath) {
                    protectedFiles.add(item.segway.filepath);
                }
            });

            // Also protect files that might be referenced by timestamp
            const now = Date.now();
            playbackQueue.forEach(item => {
                if (item.segway && item.segway.generated) {
                    const itemTimestamp = item.segway.generated;
                    segwayFiles.forEach(file => {
                        const timestampMatch = file.match(/segway_.*?_(\d+)\.mp3$/);
                        if (timestampMatch) {
                            const fileTimestamp = parseInt(timestampMatch[1]);
                            // If timestamps are close (within 10 seconds), consider it relevant
                            if (Math.abs(itemTimestamp - fileTimestamp) < 10000) {
                                protectedFiles.add(path.join(segwayDir, file));
                            }
                        }
                    });
                }
            });
        }

        // Process files in batches to avoid overwhelming the file system
        const BATCH_SIZE = 10;
        const now = Date.now();
        const MIN_AGE_MS = 2 * 60 * 1000; // 2 minutes for safety

        let filesToDelete = [];

        // Identify files to delete
        for (const file of segwayFiles) {
            const filePath = path.join(segwayDir, file);

            // Skip protected files
            if (protectedFiles.has(filePath)) {
                continue;
            }

            // Check file age
            const timestampMatch = file.match(/segway_.*?_(\d+)\.mp3$/);
            const fileTimestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;
            const fileAge = now - fileTimestamp;

            // Only delete files older than MIN_AGE_MS
            if (fileAge >= MIN_AGE_MS) {
                filesToDelete.push(filePath);
            }
        }

        // Delete files in batches
        let deletedCount = 0;
        for (let i = 0; i < filesToDelete.length; i += BATCH_SIZE) {
            const batch = filesToDelete.slice(i, i + BATCH_SIZE);

            // Use Promise.allSettled to handle errors gracefully
            const results = await Promise.allSettled(
                batch.map(filePath => unlinkAsync(filePath))
            );

            // Count successful deletions
            deletedCount += results.filter(r => r.status === 'fulfilled').length;

            // Log errors but continue
            results
                .filter(r => r.status === 'rejected')
                .forEach((result, index) => {
                    console.error(`Error deleting segway file ${batch[index]}: ${result.reason.message}`);
                });
        }

        if (deletedCount > 0) {
            console.log(`SegwayManager: 🧹 Deleted ${deletedCount} old segway files`);
        }
    } catch (err) {
        console.error(`SegwayManager: Failed to remove old segways -> ${err.message}`);
    }
}

module.exports = {
    getTrackContext,
    generateSegway,
    prepareSegway,
    removeOldSegways,
    shouldGenerateSegway  // Export this too
};
