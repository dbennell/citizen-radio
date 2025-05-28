
// ========================
// File: segwayManager.js
// ========================
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { getLastPlays } = require('./playLogManager');

// More robust config loading with better error handling
let configCache = null;
let configLoadAttempted = false;

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
                console.log('SegwayManager: Successfully loaded config');
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
 */
async function getTrackContext(playbackQueue) {
    try {
        // Get last track from play.log
        const logData = await readFileAsync(PLAY_LOG, 'utf-8');
        const playHistory = logData.trim().split('\n');

        // Filter out segways from play history
        const filteredHistory = playHistory
            .map(line => JSON.parse(line))
            .filter(entry => entry.type !== 'segway')
            .map(entry => ({
                type: entry.type,
                meta: entry.meta,
                relPath: entry.relPath
            }));

        const lastPlayed = filteredHistory.length > 0 ? filteredHistory[filteredHistory.length - 1] : null;

        // Get next track from the playback queue
        const nextTrack = playbackQueue.length > 0 ? playbackQueue[0] : null;

        if (lastPlayed && nextTrack) {
            return {
                lastTrack: lastPlayed,
                nextTrack: nextTrack,
                prevTracks: filteredHistory.slice(-3), // Get up to 3 previous tracks
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
 * Generate a segway between two tracks using OpenAI.
 */
async function generateSegway(prevMeta, nextMeta, prevTracks = [], nextTracks = []) {
    try {
        // Load config when needed - use the safer helper
        const STATION_CONFIG = getStationConfig();

        console.log('SegwayManager: Config check - stationName:', STATION_CONFIG?.stationName || 'undefined');

        // Lazy load modules to avoid circular dependencies
        if (!ratingManager) {
            ratingManager = require('./ratingsManager');
        }
        if (!engagementMonitor) {
            engagementMonitor = require('./engagementMonitor');
        }

        // Normalize metadata
        const prevTitle = prevMeta?.title || (prevMeta?.filename ? prevMeta.filename.replace(/\.[^/.]+$/, "") : "previous track");
        const prevType = prevMeta?.type || "unknown";
        const nextTitle = nextMeta?.title || (nextMeta?.filename ? nextMeta.filename.replace(/\.[^/.]+$/, "") : "upcoming content");
        const nextType = nextMeta?.type || "upcoming content";
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

        // For station ID transitions
        if ((prevType === 'id' || nextType === 'intro' || nextType === 'id')) {
            return ""; // No segway for id → music or transitions to intro/id
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

            console.log("Generating music-to-music segway between:", prevTitle, "→", nextTitle);

            const openaiClient = new openai.OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            const response = await openaiClient.chat.completions.create({
                model: "gpt-4.1-mini",
                messages: [
                    { role: "system", content: context },
                    { role: "user", content: userPrompt },
                ],
                max_tokens: 100,
            });

            const segwayText = response.choices[0].message.content.trim();
            console.log("Generated segway text:", segwayText);
            return segwayText;
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

    console.log('SegwayManager: prepareSegway - Config check - stationName:', STATION_CONFIG?.stationName || 'undefined');
    console.log('SegwayManager: prepareSegway - Full config check:', {
        hasConfig: !!STATION_CONFIG,
        stationName: STATION_CONFIG?.stationName,
        hasTtsProfiles: !!STATION_CONFIG?.ttsProfiles
    });

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
        console.log(`SegwayManager: Generating segway audio (type: ${key || 'transition'})...`);

        // Prepare metadata for TTS
        const metadata = {
            title: `${prevMeta.title || "Previous"} -> ${nextMeta.title || "Next"}`,
            artist: STATION_CONFIG?.stationName || 'Unknown Station',
            comment: `Segway from ${prevMeta.type} to ${nextMeta.type}`,
        };

        console.log('SegwayManager: About to call generateTTS with config:', {
            segwayText: segwayText.substring(0, 50) + '...',
            filePath: segwayFilePath,
            metadata,
            type: "segway",
            stationConfig: {
                stationName: STATION_CONFIG.stationName,
                hasTtsProfiles: !!STATION_CONFIG.ttsProfiles
            }
        });

        // Pass the STATION_CONFIG explicitly to avoid circular dependency issues
        await ttsHelper.generateTTS(segwayText, segwayFilePath, metadata, "segway", STATION_CONFIG);

        console.log('SegwayManager: TTS generation completed successfully');
        return segwayFilePath;
    } catch (error) {
        console.error(`SegwayManager: Failed to prepare segway: ${error.message}`);
        console.error('SegwayManager: Error stack:', error.stack);
        return null;
    }
}

/**
 * Remove old segway files that are no longer needed.
 */
async function removeOldSegways(playbackQueue = []) {
    try {
        if (!fs.existsSync(getSegwayDir())) {
            fs.mkdirSync(getSegwayDir(), { recursive: true });
            return;
        }

        const segwayFiles = fs.readdirSync(getSegwayDir())
            .filter(file => file.startsWith('segway_') && file.endsWith('.mp3'));

        if (segwayFiles.length === 0) return;

        console.log(`SegwayManager: Found ${segwayFiles.length} segway files to check`);

        let filesToDelete = [];
        const now = Date.now();
        const MIN_AGE_MS = 60 * 1000; // 60 seconds

        for (const segway of segwayFiles) {
            const segwayPath = path.join(getSegwayDir(), segway);
            const timestampMatch = segway.match(/segway_.*?_(\d+)\.mp3$/);
            const fileTimestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;
            const fileAge = now - fileTimestamp;

            if (fileAge < MIN_AGE_MS) {
                continue;
            }

            if (playbackQueue.length > 0) {
                const isRelevant = playbackQueue.some(item =>
                    item.segway && item.segway.filepath === segwayPath
                );

                if (!isRelevant) {
                    filesToDelete.push(segwayPath);
                }
            } else {
                filesToDelete.push(segwayPath);
            }
        }

        let deletedCount = 0;
        for (const filePath of filesToDelete) {
            try {
                await unlinkAsync(filePath);
                deletedCount++;
            } catch (err) {
                console.error(`Error deleting segway file ${filePath}: ${err.message}`);
            }
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
    removeOldSegways
};