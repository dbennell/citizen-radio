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
        console.error('🚨 YouTube API key not found in environment variables');
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
        // Handle specific error cases
        if (error.message.includes('Login Required')) {
            console.error('🚨 Error: YouTube API requires authentication for liveBroadcasts.list');
            console.log('💡 Try using search.list instead to find recent live streams');
        } else {
            console.error('🚨 Error fetching active YouTube live stream:', error.message);
        }
    }

    // Second try: Get recent live streams using search API (doesn't require OAuth)
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
// Store the nextPageToken between calls to avoid fetching duplicate messages
let nextPageToken = null;
// Store the recommended polling interval from YouTube
let recommendedPollingIntervalMs = null;
// Track backoff state for rate limiting
let backoffMultiplier = 1;
let lastRateLimitError = null;

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
        // Build request parameters
        const params = {
            part: 'snippet,authorDetails',
            liveChatId,
            maxResults: 200
        };

        // Add pageToken if we have one from a previous call
        if (nextPageToken) {
            params.pageToken = nextPageToken;
            //console.log(`Using pageToken to fetch only new messages since last poll`);
        } else {
            console.log(`First poll or reset: fetching latest messages`);
        }

        const response = await youtube.liveChatMessages.list(params);

        // Store the nextPageToken for the next call
        nextPageToken = response.data.nextPageToken || null;

        // Store and log polling information
        if (response.data.pollingIntervalMillis) {
            recommendedPollingIntervalMs = response.data.pollingIntervalMillis;
            //console.log(`YouTube recommends polling again in ${recommendedPollingIntervalMs/1000} seconds`);
        }

        return response.data.items || [];
    } catch (error) {
        //console.error('YouTube liveChatMessages API error:', error);

        // Check if this is a rate limit error
        if (error.errors && 
            error.errors.some(e => e.reason === 'rateLimitExceeded')) {

            // Record the time of this rate limit error
            lastRateLimitError = new Date();

            // Increase backoff multiplier (quadruple it each time, up to a higher limit)
            // Using a more aggressive backoff to ensure we don't hit rate limits repeatedly
            backoffMultiplier = Math.min(backoffMultiplier * 4, 32);

            console.log(`⚠ YouTube rate limit exceeded. Increasing polling interval by ${backoffMultiplier}x`);

            // Don't reset the pageToken for rate limit errors
            // This way we'll continue from where we left off
            return [];
        } else {
            // For other errors, reset backoff if it's been more than 5 minutes since last rate limit error
            if (lastRateLimitError && 
                (new Date() - lastRateLimitError > 5 * 60 * 1000)) {
                backoffMultiplier = 1;
                lastRateLimitError = null;
                console.log('✅ Resetting YouTube API backoff after 5 minutes without rate limit errors');
            }

            // Reset the pageToken on other errors to avoid getting stuck
            nextPageToken = null;
            return [];
        }
    }
}

/**
 * Get the recommended polling interval from YouTube, adjusted for backoff if rate limiting occurred
 * @returns {number|null} - The recommended polling interval in milliseconds, or null if not available
 */
function getRecommendedPollingInterval() {
    if (!recommendedPollingIntervalMs) return null;

    // Apply backoff multiplier to the recommended polling interval
    const adjustedInterval = recommendedPollingIntervalMs * backoffMultiplier;

    // If we're in backoff mode, log the adjusted interval
    if (backoffMultiplier > 1) {
        console.log(`ℹ Using adjusted polling interval: ${adjustedInterval}ms (${backoffMultiplier}x backoff)`);
    }

    return adjustedInterval;
}

/**
 * Reset the backoff state for YouTube API rate limiting
 */
function resetYouTubeBackoff() {
    if (backoffMultiplier > 1) {
        console.log('Resetting YouTube API backoff multiplier');
        backoffMultiplier = 1;
        lastRateLimitError = null;
    }
}

/**
 * Reset the nextPageToken to fetch from the beginning next time
 * This should be called when starting a new track or closing a comment window
 * @param {boolean} resetBackoff - Whether to also reset the backoff state (default: true)
 */
function resetChatPagination(resetBackoff = true) {
    if (nextPageToken) {
        console.log('Resetting chat pagination token');
        nextPageToken = null;
    }

    if (resetBackoff) {
        resetYouTubeBackoff();
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
 * Also extracts rating information from custom frames if available.
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

        // Extract rating information from custom frames if available
        if (tags.userDefinedText) {
            // Helper function to get a custom frame value
            const getCustomFrame = (description) => {
                const frame = tags.userDefinedText.find(
                    frame => frame.description === description
                );
                return frame ? frame.text : null;
            };

            const ratingText = getCustomFrame('RATING');
            if (ratingText) {
                meta.rating = parseFloat(ratingText);
                meta.ratingCount = parseInt(getCustomFrame('RATING_COUNT') || '0', 10);
                meta.sentiment = getCustomFrame('SENTIMENT') || '';
                meta.lastRatingUpdate = getCustomFrame('LAST_UPDATED') || '';
            }
        }

        return meta;
    } catch (err) {
        console.error(`Error extracting metadata from ${filePath}:`, err);
        return buildFallbackMetadata(filePath);
    }
}

/**
 * Kill all tracked processes with a graceful shutdown approach
 * @returns {Promise} A promise that resolves when all processes have been terminated
 */
function killAllTrackedProcesses() {
    return new Promise((resolve) => {
        // Make a copy of the array to avoid modification during iteration
        const processes = [...runningProcesses];

        if (processes.length === 0) {
            console.log('No processes to kill. Cleanup complete.');
            return resolve();
        }

        console.log(`Attempting to terminate ${processes.length} running processes...`);

        // First attempt: SIGTERM (graceful shutdown)
        processes.forEach(proc => {
            if (!proc.killed) {
                console.log(`🛑 Killing process: PID ${proc.pid}`);
                try {
                    proc.kill("SIGTERM");
                } catch (err) {
                    console.error(`Failed to kill PID ${proc.pid} with SIGTERM:`, err);
                }
            }
        });

        // Give processes a chance to terminate gracefully
        setTimeout(() => {
            let remainingProcesses = 0;

            // Second attempt: SIGKILL (force kill) for any remaining processes
            processes.forEach(proc => {
                if (!proc.killed && runningProcesses.includes(proc)) {
                    remainingProcesses++;
                    console.log(`⚠️ Process ${proc.pid} did not terminate gracefully, using SIGKILL`);
                    try {
                        proc.kill("SIGKILL");
                    } catch (err) {
                        console.error(`Failed to kill PID ${proc.pid} with SIGKILL:`, err);
                    }
                }
            });

            // Clear the runningProcesses array
            runningProcesses.length = 0;

            if (remainingProcesses > 0) {
                console.log(`Forcefully terminated ${remainingProcesses} remaining processes.`);
            } else {
                console.log('All processes terminated gracefully.');
            }

            console.log('✅ Process cleanup complete.');
            resolve();
        }, 1000); // Wait 1 second before force killing
    });
}

/**
 * Fetch the last N chat comments for display in the overlay
 * Only returns messages that contain rating emojis and were received since the start of the current track
 * @param {string} videoId - The YouTube video ID
 * @param {number} maxComments - Maximum number of comments to fetch
 * @returns {Promise<Object[]>} - Array of comment objects with text and author
 */
async function fetchLastChatComments(videoId, maxComments = 10) {
    if (!videoId) {
        console.warn('⚠️ No videoId provided for fetching chat comments');
        return [];
    }

    try {
        // Import the emoji ratings and current track info from ratingsManager
        const ratingManager = require('../managers/ratingsManager');
        const { EMOJI_RATINGS } = ratingManager;

        // Get the current track information
        // This is set by ratingsManager.setCurrentlyPlaying when a new track starts
        const currentTrack = ratingManager.getCurrentlyPlaying ? ratingManager.getCurrentlyPlaying() : null;
        const currentTrackStartTime = currentTrack?.startTime || null;
        const currentTrackPath = currentTrack?.rel || null;

        // If we don't have a current track or start time, just filter by emoji
        const shouldFilterByTime = currentTrackStartTime instanceof Date;

        if (shouldFilterByTime) {
            console.log(`🗨️ Filtering chat messages since track start: ${currentTrackStartTime.toISOString()}`);
        } else {
            console.log(`🗨️ No current track start time available, not filtering by time`);
        }

        // Fetch messages from YouTube API
        const messages = await readLiveChat(videoId);

        // If we got messages from YouTube, process them normally
        if (messages && messages.length > 0) {
            // Filter messages containing rating emojis, extract text and author, and limit to maxComments
            const filteredMessages = messages
                .filter(msg => {
                    const text = msg.snippet.displayMessage || 
                               msg.snippet.textMessageDetails?.messageText || '';
                    const publishedAt = msg.snippet.publishedAt;

                    // Only keep messages that contain at least one rating emoji
                    if (text.trim() === '') return false;

                    // Check if the message contains a rating emoji
                    let hasRatingEmoji = false;

                    // First, try the exact match approach from parseRatingFromComment
                    for (const char of text) {
                        if (EMOJI_RATINGS[char] !== undefined) {
                            hasRatingEmoji = true;
                            break;
                        }
                    }

                    // If no exact match, try a more lenient approach
                    if (!hasRatingEmoji) {
                        // Check for any emoji-like character in the text
                        const emojiPattern = /[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;
                        hasRatingEmoji = emojiPattern.test(text);

                        if (hasRatingEmoji) {
                            console.log(`Found emoji-like character in: "${text}"`);
                        }
                    }

                    // For debugging
                    if (hasRatingEmoji) {
                        console.log(`Comment with emoji accepted: "${text}"`);
                    }

                    if (!hasRatingEmoji) return false;

                    // If we should filter by time, check if the message was published after the track started
                    if (shouldFilterByTime && publishedAt) {
                        const commentTime = new Date(publishedAt);
                        return commentTime >= currentTrackStartTime;
                    }

                    // If we're not filtering by time or the message doesn't have a timestamp, just check for emoji
                    return true;
                })
                .map(msg => {
                    let text = msg.snippet.displayMessage || 
                              msg.snippet.textMessageDetails?.messageText || '';

                    // Remove all instances of the mute emoji (🔇) from the text
                    // Using a more comprehensive approach to catch variations and invisible characters
                    const muteEmojiPattern = new RegExp('\\s*[\\u{1F507}]\\s*', 'gu'); // Unicode for 🔇 with optional whitespace
                    text = text.replace(muteEmojiPattern, '').trim();

                    return {
                        text: text,
                        author: msg.authorDetails?.displayName || 'Anonymous'
                    };
                })
                .slice(0, maxComments);

            console.log(`🗨️ Processed ${filteredMessages.length} comments from YouTube API`);
            return filteredMessages;
        } 
        // If we didn't get any messages from YouTube (possibly due to rate limiting),
        // try to use the feedback log as a fallback
        else if (currentTrackPath) {
            console.log(`🗨️ No messages from YouTube API, using feedback log as fallback`);

            // Read from the feedback log
            const feedbackLog = ratingManager.readFeedbackLog();

            // Filter feedback entries for the current track
            const trackFeedback = feedbackLog
                .filter(entry => entry.trackPath === currentTrackPath)
                // Sort by timestamp (newest first)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                // Map to the format expected by the overlay
                .map(entry => ({
                    text: entry.comment,
                    author: entry.author
                }))
                .slice(0, maxComments);

            console.log(`🗨️ Found ${trackFeedback.length} comments in feedback log for current track`);
            return trackFeedback;
        }

        return [];
    } catch (error) {
        console.error('Error fetching chat comments:', error);
        return [];
    }
}

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
