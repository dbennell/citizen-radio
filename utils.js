const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const NodeID3 = require("node-id3");
const runningProcesses = [];
const { google } = require('googleapis');
const { STATION_CONFIG } = require('./config');


/**
 * Fetch the currently active live broadcast's video ID from YouTube.
 * @returns {Promise<string|null>} The active video's ID or null if not found.
 */
async function fetchLiveVideoId() {
    console.log('🔍 Attempting to fetch active YouTube live stream video ID...');
    const youtube = google.youtube({
        version: 'v3',
        auth: process.env.YOUTUBE_API_KEY
    });

    try {
        const response = await youtube.liveBroadcasts.list({
            part: 'id,snippet',
            broadcastStatus: 'active',
            broadcastType: 'all'
        });

        const activeBroadcast = response.data.items?.[0];
        if (activeBroadcast) {
            console.log('✅ Active live video ID found:', activeBroadcast.id);
            return activeBroadcast.id;
        } else {
            console.warn('⚠️ No active live streams found for the channel.');
            return null;
        }
    } catch (error) {
        console.error('🚨 Error fetching active YouTube live stream:', error.message);
        return null;
    }
}


// Initialize YouTube API client
async function initializeYouTubeClient() {
    // Ensure we have the API key from .env
    if (!process.env.YOUTUBE_API_KEY) {
        console.warn('YOUTUBE_API_KEY is not set in environment variables');
        return null;
    }

    return google.youtube({
        version: 'v3',
        auth: process.env.YOUTUBE_API_KEY
    });
}


async function fetchLiveChatId(videoId) {
    const youtube = await initializeYouTubeClient();
    if (!youtube) return null;

    // Get the active broadcast’s liveStreamingDetails
    const resp = await youtube.videos.list({
        part: 'liveStreamingDetails',
        id: videoId
    });

    const details = resp.data.items?.[0]?.liveStreamingDetails;
    return details?.activeLiveChatId || null;
}


// Poll YouTube for stream chat
/**
 * Read live-stream chat messages for a given YouTube videoId
 * @param {string} videoId – The YouTube live video ID
 * @returns {Promise<Array>} – Array of liveChatMessage resources
 */
async function readLiveChat(videoId) {
    // 1) Sanity checks
    if (!process.env.YOUTUBE_API_KEY) {
        console.warn('No YouTube API key configured for chat polling');
        return [];
    }
    if (!videoId) {
        console.warn('⚠ No videoId provided for chat polling.');
        return [];
    }

    // 2) Initialize the YouTube client
    const youtube = await initializeYouTubeClient();
    if (!youtube) return [];

    // 3) Lookup liveChatId for the broadcast
    const liveChatId = await fetchLiveChatId(videoId);
    if (!liveChatId) {
        console.warn(`⚠️ No liveChatId for video ${videoId}, skipping chat poll.`);
        return [];
    }

    // 4) Pull the actual live-chat messages
    try {
        const response = await youtube.liveChatMessages.list({
            part: 'snippet,authorDetails',
            liveChatId,
            maxResults: 200
        });
        return response.data.items || [];
    } catch (error) {
        console.error('YouTube liveChatMessages API error:', error);
        return [];
    }
}


function spawnTrackedProcess(command, args, options = {}) {
    const proc = spawn(command, args, options);
    runningProcesses.push(proc);

    proc.on("close", () => {
        const idx = runningProcesses.indexOf(proc);
        if (idx !== -1) runningProcesses.splice(idx, 1);
    });

    proc.on("error", (err) => {
        console.error(`Process error [${command}]:`, err);
    });

    return proc;
}

function moveFileToPlayed(filePath, type) {
    const readyDir = path.join(__dirname, "ready", type);

    /* ------------------------------------------------------------------
     * SEGWAY FILES
     * ------------------------------------------------------------------
     * Segways are one-off transitions that never need to be replayed.
     * Instead of archiving them, we simply delete the file once it has
     * been broadcast.
     * ------------------------------------------------------------------ */
    if (type === "segway" && path.dirname(filePath) === readyDir) {
        try {
            fs.unlinkSync(filePath);
            console.log(`Removed segway file: ${filePath}`);
        } catch (err) {
            console.error(`Failed to remove segway file ${filePath}:`, err);
        }
        return;   // No further processing required
    }

    // TODO: Check if and how we can remove this as we should not be using the played folder anymore
    // Default behaviour for all other types
    const playedDir = path.join(__dirname, "played", type);

    if (path.dirname(filePath) === readyDir) {
        fs.mkdirSync(playedDir, { recursive: true });
        const target = path.join(playedDir, path.basename(filePath));
        fs.renameSync(filePath, target);
        console.log(`Moved ${type} file to: ${target}`);
    }
}


// Build fallback metadata using the filename as title and include filename
function buildFallbackMetadata(filePath) {
    return {
        title: path.parse(filePath).name,
        filename: path.basename(filePath)
    };
}

/**
 * Extracts metadata from an MP3 file using ID3 tags.
 * Falls back to using the filename as the title if tags are missing.
 * @param {string} filePath
 * @returns {Object}
 */
function extractMetadata(filePath) {
    try {
        if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
            console.warn(`File not found or empty: ${filePath}`);
            return buildFallbackMetadata(filePath);
        }

        const tags = NodeID3.read(filePath);
        if (!tags) {
            console.warn(`No ID3 tags found for: ${filePath}`);
            return buildFallbackMetadata(filePath);
        }

        const fallback = buildFallbackMetadata(filePath);
        const meta = {
            title: tags.title || fallback.title,
            artist: tags.artist || null,
            album: tags.album || null,
            genre: tags.genre || null,
            comment: tags.comment || null,
            filename: fallback.filename
        };
        // If an embedded picture (APIC) exists, expose it as `picture`
        if (tags.image) {
            // NodeID3.read often returns tags.image.imageBuffer
            const imgBuf = tags.image.imageBuffer || tags.image;
            meta.picture = {
                data: imgBuf,
                mime: tags.image.mime || 'image/jpeg'
            };
        }
        return meta;
    } catch (err) {
        console.error(`Error extracting metadata from ${filePath}:`, err);
        return buildFallbackMetadata(filePath);
    }
}

function killAllTrackedProcesses() {
    runningProcesses.forEach(proc => {
        if (!proc.killed) {
            console.log(`Killing PID ${proc.pid}`);
            try {
                proc.kill("SIGTERM");
            } catch (err) {
                console.error(`Failed to kill PID ${proc.pid}:`, err);
            }
        }
    });
}

module.exports = {
    spawnTrackedProcess,
    extractMetadata,
    moveFileToPlayed,
    killAllTrackedProcesses,
    runningProcesses,
    fetchLiveVideoId,
    readLiveChat
};
