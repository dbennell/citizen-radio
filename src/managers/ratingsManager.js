
const fs = require('fs');
const path = require('path');
const { readLiveChat} = require('../utils');
const { STATION_CONFIG } = require('../core/config'); // Fix the import to use destructuring
//const { getPersistentVideoId } = require('./orchestrator');
const feedbackManager = require('./feedbackManager');
const engagementMonitor = require('./engagementMonitor');

let commentWindow = { start: Date.now(), end: Date.now() };

// Track processed message IDs to avoid duplicate processing
let processedMessageIds = new Set();

// Path to store processed message IDs between restarts
const processedIdsPath = path.join(__dirname, '../../data/processed_message_ids.json');

// Load processed message IDs from disk if available
try {
    if (fs.existsSync(processedIdsPath)) {
        const data = JSON.parse(fs.readFileSync(processedIdsPath, 'utf8'));
        processedMessageIds = new Set(data);
        //console.log(`[Rating Debug] Loaded ${processedMessageIds.size} processed message IDs`);
    }
} catch (error) {
    console.error('Error loading processed message IDs:', error);
}

// Save processed message IDs to disk
function saveProcessedMessageIds() {
    try {
        // Limit the size of the set to prevent it from growing too large
        // Keep only the most recent 10000 IDs
        let idsArray = Array.from(processedMessageIds);
        if (idsArray.length > 10000) {
            idsArray = idsArray.slice(idsArray.length - 10000);
            processedMessageIds = new Set(idsArray);
        }

        fs.writeFileSync(processedIdsPath, JSON.stringify(idsArray, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving processed message IDs:', error);
        return false;
    }
}

/**
 * Clear all processed message IDs
 * This is useful when the stream ends or when the application restarts
 */
function clearProcessedMessageIds() {
    processedMessageIds.clear();
    try {
        fs.writeFileSync(processedIdsPath, JSON.stringify([], null, 2));
        //console.log('[Rating Debug] Cleared processed message IDs');
        return true;
    } catch (error) {
        console.error('Error clearing processed message IDs:', error);
        return false;
    }
}

// right after your imports, before any functions:
const ratingPath = path.join(__dirname, '../../data/ratings.json');
if (!fs.existsSync(ratingPath)) {
    fs.writeFileSync(ratingPath, JSON.stringify({}, null, 2));
}

/**
 * Marks the beginning of the comment‐collection window,
 * offset back by the streamDelay (in seconds) so we catch
 * delayed chat messages.
 */
function openCommentWindow() {
    const delaySec = STATION_CONFIG.ratingSystem?.streamDelay || 60;
    commentWindow.start = new Date(Date.now() - delaySec * 1000);
    commentWindow.end = null;
    return commentWindow.start.toISOString();
}

/**
 * Marks the end of the comment‐collection window.
 * Also clears the processed message IDs to prevent the set from growing too large.
 */
function closeCommentWindow() {
    commentWindow.end = new Date();

    // Clear processed message IDs when the window is closed
    // This prevents the set from growing too large over time
    // We don't need to keep track of processed messages from previous tracks
    clearProcessedMessageIds();

    return commentWindow.end.toISOString();
}

// Emoji to rating mapping
const EMOJI_RATINGS = {
    // 1-star emojis (strong negative)
    '🔇': 1, '😡': 1, '🤬': 1, '🤡': 1,
    // 2-star emoji (dislike)
    '👎': 2,
    // 3-star emoji (neutral)
    '🫳': 3,
    // 4-star emoji (like)
    '👍': 4,
    // 5-star emojis (strong positive)
    '❤️': 5, '😍': 5, '🥰': 5, '🤩': 5
};

// Cache for current play information
let currentlyPlaying = null;

/**
 * Set the currently playing track to associate comments with it
 * @param {Object} trackInfo - Information about currently playing track
 */
function setCurrentlyPlaying(trackInfo) {
    currentlyPlaying = {
        ...trackInfo,
        rel: trackInfo.trackRel || trackInfo.rel, // Support both trackRel (from orchestrator) and rel
        startTime: new Date()
    };

    // Add debug logging to help diagnose issues
    //console.log(`[Rating Debug] Now playing: ${currentlyPlaying.title} by ${currentlyPlaying.artist || 'Unknown'}`);
    //console.log(`[Rating Debug] Track path: ${currentlyPlaying.rel}`);
}

/**
 * Load ratings from disk
 * 
 * Note: This function uses the legacy ratings.json file which is maintained for backward compatibility.
 * The preferred method for storing ratings is now the per-track feedback files in /data/feedback/
 * managed by the feedbackManager. This function is still used as a fallback and for compatibility
 * with existing code.
 * 
 * @returns {Object} - The ratings data
 */
function loadRatings() {
    const ratingPath = path.join(__dirname, '../../data/ratings.json');
    try {
        if (fs.existsSync(ratingPath)) {
            return JSON.parse(fs.readFileSync(ratingPath, 'utf8'));
        }
        return {};
    } catch (error) {
        console.error('Error loading ratings:', error);
        return {};
    }
}

/**
 * Save ratings to disk
 * 
 * Note: This function saves to the legacy ratings.json file which is maintained for backward compatibility.
 * The preferred method for storing ratings is now the per-track feedback files in /data/feedback/
 * managed by the feedbackManager. This function is still used for compatibility with existing code.
 * 
 * @param {Object} ratings - The ratings data to save
 * @returns {boolean} - Success status
 */
function saveRatings(ratings) {
    const ratingPath = path.join(__dirname, '../../data/ratings.json');
    try {
        fs.writeFileSync(ratingPath, JSON.stringify(ratings, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving ratings:', error);
        return false;
    }
}

/**
 * Parse rating from a YouTube comment
 * @param {Object} comment - Comment data from YouTube API
 * @returns {Object|null} - Rating information or null if no rating found
 */
function parseRatingFromComment(comment) {

    if (!comment?.snippet?.publishedAt) return null;
    // get the raw text
    const text =
    comment.snippet.displayMessage ||
    comment.snippet.textMessageDetails?.messageText ||
    '';

    const publishedAt = comment.snippet.publishedAt;
    const authorName = comment.authorDetails?.displayName || 'Unknown';

    // Find the first emoji that matches our rating system
    for (const char of text) {
        if (EMOJI_RATINGS[char]) {
            const ratingData = {
                value: EMOJI_RATINGS[char],
                timestamp: publishedAt,
                author: authorName,
                comment: text
            };

            // Process for noteworthy comments if enhanced engagement is enabled
            if (STATION_CONFIG.enhancedEngagement?.enabled) {
                processCommentForEngagement(ratingData);
            }

            return ratingData;
        }
    }

    return null;
}

/**
 * Process a comment for the engagement monitor
 * @param {Object} ratingData - Rating data with comment
 */
function processCommentForEngagement(ratingData) {
    // Only process if we have the engagement monitor
    if (!engagementMonitor) return;

    // Format comment for engagement monitor
    const commentData = {
        author: ratingData.author,
        comment: ratingData.comment,
        rating: ratingData.value,
        timestamp: ratingData.timestamp
    };

    // Process comment to check if it's noteworthy
    engagementMonitor.processComment(commentData);
}

/**
 * Match rating to currently playing track
 * @param {Object} rating - Rating information
 * @returns {Object|null} - Track with rating or null if no match
 */
function matchRatingToTrack(rating) {
    if (!currentlyPlaying) {
        return null;
    }

    // Convert comment timestamp to Date
    const commentTime = new Date(rating.timestamp);

    // Check if comment was made while track was playing
    // Allow for stream delay (default 60 seconds)
    const streamDelay = STATION_CONFIG.ratingSystem?.streamDelay || 60;
    const adjustedStartTime = new Date(currentlyPlaying.startTime.getTime() - (streamDelay * 1000));

    if (commentTime >= adjustedStartTime) {
        return {
            track: currentlyPlaying.rel,
            rating
        };
    }

    return null;
}

/**
 * Update track rating in the database
 * @param {string} trackPath - Path to the track
 * @param {Object} ratingData - Rating information
 */
function updateTrackRating(trackPath, ratingData) {
    const ratings = loadRatings();

    if (!ratings[trackPath]) {
        ratings[trackPath] = {
            averageRating: ratingData.value,
            ratingCount: 1,
            lastUpdated: new Date().toISOString(),
            ratings: [ratingData]
        };
    } else {
        // Add new rating
        ratings[trackPath].ratings.push(ratingData);

        // Recalculate average
        const sum = ratings[trackPath].ratings.reduce((acc, r) => acc + r.value, 0);
        ratings[trackPath].ratingCount = ratings[trackPath].ratings.length;
        ratings[trackPath].averageRating = sum / ratings[trackPath].ratingCount;
        ratings[trackPath].lastUpdated = new Date().toISOString();
    }

    saveRatings(ratings);

    // If metadata integration is enabled, also update feedback.json and MP3 metadata
    if (STATION_CONFIG.metadataIntegration?.enabled) {
        // Convert rating data to feedback format
        const feedbackItem = {
            author: ratingData.author || 'Anonymous',
            comment: ratingData.comment || '',
            rating: ratingData.value,
            timestamp: ratingData.timestamp || new Date().toISOString()
        };

        // Add to feedback manager - ensure we're using the correct path format
        // The trackPath might be a relative path like "music/Whiteout Sunrise.mp3"
        // which is what we want for the feedback system
        feedbackManager.addFeedback(trackPath, feedbackItem);

        // Log feedback addition for debugging
        console.log(`[Feedback Debug] Adding feedback for "${trackPath}" with rating ${ratingData.value}★`);
    }
}

/**
 * Calculate number of raffle tickets for a track based on its rating
 * @param {number} rating - Track rating (1-5)
 * @returns {number} - Number of tickets for raffle
 */
function getTicketsForTrack(rating) {
    if (!rating) {
        return STATION_CONFIG.ratingSystem?.defaultRating || 3;
    }

    // Use the rating value directly (clamped to min/max)
    const min = STATION_CONFIG.ratingSystem?.minTickets || 1;
    const max = STATION_CONFIG.ratingSystem?.maxTickets || 5;
    return Math.max(min, Math.min(max, Math.round(rating)));
}

/**
 * Fetch comments in the open window, update ratings,
 * and return how many we processed.
 */
async function pollForComments(videoId) {
    if (!STATION_CONFIG.ratingSystem?.enabled) return 0;
    if (!videoId) {
        console.warn('⚠️ No videoId; skipping polls.');
        return 0;
    }

    // console.log(
    //     `[Rating Debug] Window → start=${commentWindow.start?.toISOString() || '–'} ` +
    //     `end=${commentWindow.end?.toISOString() || '–'}`
    // );

    // 1) Fetch raw chat
    const messages = await readLiveChat(videoId);
    //console.log(`[Rating Debug] Fetched ${messages.length} chat messages`);

    // 2) Dump them all with their timestamps
    messages.forEach((msg, idx) => {
        const text = msg.snippet.displayMessage
            || msg.snippet.textMessageDetails?.messageText
            || '(no text)';
        const ts   = msg.snippet.publishedAt || '(no ts)';
        //console.log(`[Rating Debug] #${idx} → text="${text}" @ ${ts}`);
    });

    // 3) Process only those inside our window
    let processed = 0;
    const ratings = loadRatings();
    let newMessagesProcessed = false;

    for (const msg of messages) {
        // Skip if we've already processed this message
        const messageId = msg.id;
        if (!messageId || processedMessageIds.has(messageId)) {
            continue;
        }

        const publishedAt = msg.snippet.publishedAt;
        if (!publishedAt) continue;

        const commentTime = new Date(publishedAt);

        // For periodic polling during playback, we might not have an end time yet
        const inWindow = commentWindow.start instanceof Date && 
            (
                // If we have an end time, check if the comment is within the window
                (commentWindow.end instanceof Date && 
                 commentTime >= commentWindow.start && 
                 commentTime <= commentWindow.end) ||
                // If we don't have an end time (during playback), just check if it's after the start
                (!(commentWindow.end instanceof Date) && 
                 commentTime >= commentWindow.start)
            );

        const text = msg.snippet.displayMessage
            || msg.snippet.textMessageDetails?.messageText
            || '(no text)';
        //console.log(`[Rating Debug] "${text}" → inWindow=${inWindow}`);
        if (!inWindow) continue;

        // 4) Pull out the emoji
        const rating = parseRatingFromComment(msg);
        if (!rating) {
            //console.log('[Rating Debug] No rating emoji found');
            // Still mark this message as processed even if it doesn't contain a rating
            processedMessageIds.add(messageId);
            continue;
        }
        console.log(`[Rating Debug] Detected ${rating.value}★ by ${rating.author} → "${text}"`);

        // 5) Match it to the current track
        const match = matchRatingToTrack(rating);
        if (!match) {
            //console.log('[Rating Debug] Outside actual play time; skipping');
            // Still mark this message as processed
            processedMessageIds.add(messageId);
            continue;
        }

        // 6) Update in-memory ratings
        const key = match.track;
        if (!ratings[key]) {
            ratings[key] = {
                averageRating: rating.value,
                ratingCount: 1,
                lastUpdated: rating.timestamp,
                ratings: [rating]
            };
        } else {
            ratings[key].ratings.push(rating);
            const sum = ratings[key].ratings.reduce((a, r) => a + r.value, 0);
            ratings[key].ratingCount   = ratings[key].ratings.length;
            ratings[key].averageRating = sum / ratings[key].ratingCount;
            ratings[key].lastUpdated   = rating.timestamp;
        }

        // 6.5) Also update the feedback.json file directly
        updateTrackRating(key, rating);

        console.log(
            `[Rating Debug] ➤ Updated "${key}" → ` +
            `avg=${ratings[key].averageRating.toFixed(2)} ` +
            `(${ratings[key].ratingCount} ratings)`
        );

        // Mark this message as processed
        processedMessageIds.add(messageId);
        newMessagesProcessed = true;
        processed++;
    }

    // 7) Persist and confirm - only if we processed new messages
    if (newMessagesProcessed) {
        if (saveRatings(ratings)) {
            console.log(
                `[Rating Debug] Wrote ratings.json with ` +
                `${Object.keys(ratings).length} entries`
            );
        } else {
            console.error('💥 Could not save ratings.json');
        }
    }

    // Save processed message IDs if we processed any new messages
    if (newMessagesProcessed) {
        saveProcessedMessageIds();
    }

    // Only clear the window if we're at the end of the track
    // (when closeCommentWindow has been called)
    if (commentWindow.end instanceof Date) {
        // 8) Clear window
        commentWindow.start = commentWindow.end = null;
    }

    return processed;
}


/**
 * Get rating for a specific track
 * @param {string} trackPath - Path to the track
 * @returns {number|null} - The average rating or null if not rated
 */
function getRatingForTrack(trackPath) {
    // First check in-memory ratings
    const ratings = loadRatings();
    const inMemoryRating = ratings[trackPath]?.averageRating;

    // If metadata integration is enabled and no in-memory rating, try metadata
    if (inMemoryRating === undefined && STATION_CONFIG.metadataIntegration?.enabled) {
        const metadataRating = feedbackManager.getRatingWithFallback(trackPath);
        return metadataRating?.rating || null;
    }

    return inMemoryRating || null;
}

module.exports = {
    loadRatings,
    saveRatings,
    parseRatingFromComment,
    matchRatingToTrack,
    updateTrackRating,
    getRatingForTrack,
    getTicketsForTrack,
    setCurrentlyPlaying,
    openCommentWindow,
    closeCommentWindow,
    pollForComments,
    saveProcessedMessageIds,
    clearProcessedMessageIds,
    EMOJI_RATINGS,
};
