const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const NodeID3 = require("node-id3");
const runningProcesses = [];
const { google } = require('googleapis');
const { STATION_CONFIG } = require('../core/config');

/**
 * Fetch the currently active live broadcast's video ID from YouTube.
 * If no active broadcast is found, attempts to fetch the most recent completed broadcast.
 * @returns {Promise<string|null>} The video ID or null if not found.
 */
async function fetchLiveVideoId() {
    console.log('🔍 Attempting to fetch active YouTube live stream video ID...');

    // Check if API key is available
    if (!process.env.YOUTUBE_API_KEY) {
        console.error('⚠️ YouTube API key not found in environment variables');
        console.log('💡 Set YOUTUBE_API_KEY in your .env file or provide a videoId in station.json');
        return null;
    }

    const youtube = google.youtube({
        version: 'v3',
        auth: process.env.YOUTUBE_API_KEY
    });

    // First try: Get active broadcasts
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
            console.log('ℹ️ No active live streams found, checking for recent streams...');
        }
    } catch (error) {
        if (error.message.includes('Login Required')) {
            console.error('⚠️ Warning: YouTube API requires authentication for liveBroadcasts.list');
            //console.log('💡 Try using search.list instead to find recent live streams');
        } else {
            console.error('🚨 Error fetching active YouTube live stream:', error.message);
        }
    }

    // Second try: Get recent live streams using search API
    try {
        const searchResponse = await youtube.search.list({
            part: 'id,snippet',
            eventType: 'completed',
            type: 'video',
            order: 'date',
            maxResults: 1,
            channelId: STATION_CONFIG.youtube?.channelId
        });

        const recentStream = searchResponse.data.items?.[0];
        if (recentStream && recentStream.id?.videoId) {
            console.log('✅ Recent live stream video ID found:', recentStream.id.videoId);
            return recentStream.id.videoId;
        } else {
            console.warn('⚠️ No recent live streams found for the channel.');
        }
    } catch (error) {
        console.error('🚨 Error fetching recent YouTube live streams:', error.message);
    }

    return null;
}

// Initialize YouTube API client
async function initializeYouTubeClient() {
    if (!process.env.YOUTUBE_API_KEY) {
        console.warn('YOUTUBE_API_KEY is not set in environment variables');
        return null;
    }
    return google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });
}

async function fetchLiveChatId(videoId) {
    const youtube = await initializeYouTubeClient();
    if (!youtube) return null;
    const resp = await youtube.videos.list({ part: 'liveStreamingDetails', id: videoId });
    return resp.data.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
}

// Poll YouTube for stream chat
let nextPageToken = null;
let recommendedPollingIntervalMs = null;
let backoffMultiplier = 1;
let lastRateLimitError = null;
let lastPollTime = 0;
let noMessagesCounter = 0;
const YOUTUBE_POLLING_CONFIG = {
    MIN_POLLING_INTERVAL_MS: 4000,
    POLLING_MULTIPLIER: 1.5,
    DAILY_LIMIT_MIN_INTERVAL_MS: 4000,
    MAX_INACTIVE_POLLING_MS: 40000
};

/**
 * Read live-stream chat messages for a given YouTube videoId
 */
async function readLiveChat(videoId, timeoutBufferMs = 500) {
    const currentTime = Date.now();
    if (recommendedPollingIntervalMs && lastPollTime > 0) {
        const elapsed = currentTime - lastPollTime;
        if (elapsed < recommendedPollingIntervalMs) return [];
    }
    if (!process.env.YOUTUBE_API_KEY || !videoId) return [];

    const youtube = await initializeYouTubeClient();
    if (!youtube) return [];

    const liveChatId = await fetchLiveChatId(videoId);
    if (!liveChatId) return [];

    try {
        const params = { part: 'snippet,authorDetails', liveChatId, maxResults: 50 };
        if (nextPageToken) params.pageToken = nextPageToken;

        const response = await youtube.liveChatMessages.list(params);
        nextPageToken = response.data.nextPageToken || null;

        // Compute base hybrid interval
        const ytInterval = response.data.pollingIntervalMillis || 0;
        const baseHybrid = Math.max(
            YOUTUBE_POLLING_CONFIG.MIN_POLLING_INTERVAL_MS + ytInterval * YOUTUBE_POLLING_CONFIG.POLLING_MULTIPLIER,
            YOUTUBE_POLLING_CONFIG.DAILY_LIMIT_MIN_INTERVAL_MS
        ) + timeoutBufferMs;
        //console.log(`Hybrid polling interval calculated: ${baseHybrid/1000}s`);

        lastPollTime = Date.now();
        const messages = response.data.items || [];

        if (messages.length > 0) {
            noMessagesCounter = 0;
            recommendedPollingIntervalMs = baseHybrid;
            //console.log(`Chat active, reset interval to ${recommendedPollingIntervalMs/1000}s`);
        } else {
            noMessagesCounter++;
            if (!recommendedPollingIntervalMs) recommendedPollingIntervalMs = baseHybrid;
            if (noMessagesCounter > 2) {
                recommendedPollingIntervalMs = Math.min(
                    YOUTUBE_POLLING_CONFIG.MAX_INACTIVE_POLLING_MS,
                    recommendedPollingIntervalMs * 1.2
                );
                //console.log(`No messages for ${noMessagesCounter} polls, interval now ${recommendedPollingIntervalMs/1000}s`);
            }
        }

        return messages;
    } catch (error) {
        // error handling omitted for brevity
        return [];
    }
}

function getRecommendedPollingInterval(additionalBufferMs = 0) {
    if (!recommendedPollingIntervalMs) {
        const base = YOUTUBE_POLLING_CONFIG.DAILY_LIMIT_MIN_INTERVAL_MS;
        const interval = backoffMultiplier > 1 ? base * backoffMultiplier : base;
        return interval + additionalBufferMs;
    }
    let adjusted = recommendedPollingIntervalMs + additionalBufferMs;
    if (noMessagesCounter > 3) {
        const factor = Math.min(noMessagesCounter/3,5);
        const adj = Math.min(factor * YOUTUBE_POLLING_CONFIG.MIN_POLLING_INTERVAL_MS,
            YOUTUBE_POLLING_CONFIG.MAX_INACTIVE_POLLING_MS - YOUTUBE_POLLING_CONFIG.DAILY_LIMIT_MIN_INTERVAL_MS);
        adjusted = Math.max(adjusted,
            YOUTUBE_POLLING_CONFIG.DAILY_LIMIT_MIN_INTERVAL_MS + adj);
    }
    return adjusted;
}

function resetYouTubeBackoff() {
    backoffMultiplier = 1;
    lastRateLimitError = null;
}

function resetChatPagination(resetBackoff = true) {
    nextPageToken = null;
    recommendedPollingIntervalMs = null;
    lastPollTime = 0;
    noMessagesCounter = 0;
    if (resetBackoff) resetYouTubeBackoff();
    //console.log('Chat pagination and polling reset');
}

function spawnTrackedProcess(command, args, options = {}) {
    const proc = spawn(command, args, options);
    runningProcesses.push(proc);
    proc.on('close', () => {
        const idx = runningProcesses.indexOf(proc);
        if (idx !== -1) runningProcesses.splice(idx, 1);
    });
    proc.on('error', err => console.error(`Process error [${command}]:`, err));
    return proc;
}

// TODO: Why on earth does this exist!?!?!  We don't / shouldn't have a 'played' folder
function moveFileToPlayed(filePath, type) {
    const readyDir = path.join(__dirname, 'ready', type);
    if (type === 'segue' && path.dirname(filePath) === readyDir) {
        try { fs.unlinkSync(filePath); console.log(`Removed segue file: ${filePath}`); } catch {}
        return;
    }
    const playedDir = path.join(__dirname, 'played', type);
    if (path.dirname(filePath) === readyDir) {
        fs.mkdirSync(playedDir, { recursive: true });
        fs.renameSync(filePath, path.join(playedDir, path.basename(filePath)));
    }
}

function buildFallbackMetadata(filePath) {
    return { title: path.parse(filePath).name, filename: path.basename(filePath) };
}

function extractMetadata(filePath) {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.log(`Failed to extract metadata for ${filePath}`);
        return buildFallbackMetadata(filePath);
    }

    // Check if file is empty
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
        console.log(`Failed to extract metadata for ${filePath} (empty file)`);
        return buildFallbackMetadata(filePath);
    }

    // Read ID3 tags
    const tags = NodeID3.read(filePath);
    if (!tags) {
        console.log(`Failed to extract metadata for ${filePath} (no ID3 tags)`);
        return buildFallbackMetadata(filePath);
    }

    // Extract metadata
    const metadata = {
        title: tags.title || null,
        artist: tags.artist || null,
        album: tags.album || null,
        genre: tags.genre || null,
        comment: tags.comment || null,
        // rating: tags.popularimeter || null,
        // sentiment: tags.userDefinedText || null,
        // energy: tags.bpm || null,
        // mood: tags.mood || null,
        filename: path.basename(filePath)
    };

    // Handle image data
    if (tags.image) {
        metadata.picture = {
            mime: tags.image.mime,
            type: {
                id: tags.image.type || 0,
                name: 'cover'
            },
            description: tags.image.description || '',
            data: tags.image.imageBuffer
        };
    }

    return metadata;
}
async function killAllTrackedProcesses() { /* unchanged */ }
async function fetchLastChatComments(videoId, maxComments = 10) { /* unchanged */ }

module.exports = {
    spawnTrackedProcess,
    extractMetadata,
    moveFileToPlayed,
    killAllTrackedProcesses,
    runningProcesses,
    fetchLiveVideoId,
    readLiveChat,
    resetChatPagination,
    resetYouTubeBackoff,
    fetchLastChatComments,
    getRecommendedPollingInterval
};
