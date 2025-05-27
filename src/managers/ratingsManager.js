
const fs = require('fs');
const path = require('path');
const { readLiveChat, resetChatPagination } = require('../utils');
const { STATION_CONFIG } = require('../core/config'); // Fix the import to use destructuring
//const { getPersistentVideoId } = require('./orchestrator');
const engagementMonitor = require('./engagementMonitor');
const sentimentAnalyzer = require('../utils/sentimentAnalyzer');
const NodeID3 = require('node-id3');

let commentWindow = { start: Date.now(), end: Date.now() };

// Track processed message IDs to avoid duplicate processing
let processedMessageIds = new Set();

// Path to store processed message IDs between restarts
const processedIdsPath = path.join(__dirname, '../../data/processed_message_ids.json');

// Path to the chat log file
const chatLogPath = path.join(__dirname, '../../data/chat.log');

// Path to the feedback log file
const feedbackLogPath = path.join(__dirname, '../../data/feedback.log');

// Path to the ratings log file
const ratingPath = path.join(__dirname, '../../data/ratings.log');

// Initialize log files if they don't exist
function initLogFiles() {
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize chat.log
    if (!fs.existsSync(chatLogPath)) {
        fs.writeFileSync(chatLogPath, JSON.stringify([], null, 2));
        console.log('Chat log initialized');
    }

    // Initialize feedback.log
    if (!fs.existsSync(feedbackLogPath)) {
        fs.writeFileSync(feedbackLogPath, JSON.stringify([], null, 2));
        console.log('Feedback log initialized');
    }

    // Initialize ratings.log
    if (!fs.existsSync(ratingPath)) {
        fs.writeFileSync(ratingPath, JSON.stringify({}, null, 2));
        console.log('Ratings file initialized');
    }
}

// Initialize log files on module load
initLogFiles();

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

        // Write to a temporary file first to avoid corruption if the process crashes
        const tempPath = `${processedIdsPath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(idsArray, null, 2));

        // Rename the temporary file to the actual file
        fs.renameSync(tempPath, processedIdsPath);

        console.log(`[Debug] Saved ${idsArray.length} processed message IDs`);
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

    // Reset chat pagination to fetch from the beginning next time
    // This prevents duplicate messages between tracks
    resetChatPagination();

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
    '❤️': 5, '❤': 5, '♥️': 5, '♥': 5, '😍': 5, '🥰': 5, '🤩': 5
};

// Cache for current play information
let currentlyPlaying = null;

// setCurrentlyPlaying function is defined below

/**
 * Load ratings from disk
 * 
 * @returns {Object} - The ratings data
 */
function loadRatings() {
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
 * @param {Object} ratings - The ratings data to save
 * @returns {boolean} - Success status
 */
function saveRatings(ratings) {
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
    let text =
    comment.snippet.displayMessage ||
    comment.snippet.textMessageDetails?.messageText ||
    '';

    // Log the raw text for debugging
    console.log(`Raw rating text: "${text}" (Length: ${text.length})`);

    // Remove invisible characters (zero-width spaces, etc.)
    const originalText = text;
    text = text.replace(/[\u200B-\u200F\uFEFF\u0000-\u001F]/g, '');

    // Log the cleaned text for debugging
    if (text !== originalText) {
        console.log(`Cleaned rating text: "${text}" (Length: ${text.length})`);
    }

    const publishedAt = comment.snippet.publishedAt;
    const authorName = comment.authorDetails?.displayName || 'Unknown';

    // Find the first emoji that matches our rating system
    for (const char of text) {
        // Need to handle different Unicode representations of emojis
        // But be more precise to avoid false positives with invisible characters

        // First, check for exact match which is the most reliable
        if (EMOJI_RATINGS[char] !== undefined) {
            const ratingData = {
                value: EMOJI_RATINGS[char],
                timestamp: publishedAt,
                author: authorName,
                comment: text
            };

            // Log the detected emoji for debugging
            console.log(`Detected emoji: "${char}" (Unicode: ${[...char].map(c => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(' ')})`);

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

// Track the previously played track
let previouslyPlayed = null;
let previousTrackEndTime = null;

/**
 * Match rating to currently playing track or previously played track
 * @param {Object} rating - Rating information
 * @returns {Object|null} - Track with rating or null if no match
 */
function matchRatingToTrack(rating) {
    // Convert comment timestamp to Date
    const commentTime = new Date(rating.timestamp);

    // Get stream delay and post-track feedback window from config
    const streamDelay = STATION_CONFIG.ratingSystem?.streamDelay || 60;
    const postTrackWindow = STATION_CONFIG.ratingSystem?.postTrackWindow || 30; // seconds to consider feedback for previous track

    // Check if we have a currently playing track
    if (currentlyPlaying) {
        // Check if the track is a segway
        const isSegway = currentlyPlaying.rel && currentlyPlaying.rel.toLowerCase().includes('segway');

        // If it's a segway and we have a previously played track, associate feedback with the previous track
        if (isSegway && previouslyPlayed) {
            console.log(`[Rating Debug] Current track is a segway, associating feedback with previous track: ${previouslyPlayed.rel}`);
            return {
                track: previouslyPlayed.rel,
                rating
            };
        }

        // Check if comment was made while track was playing
        const adjustedStartTime = new Date(currentlyPlaying.startTime.getTime() - (streamDelay * 1000));

        if (commentTime >= adjustedStartTime) {
            return {
                track: currentlyPlaying.rel,
                rating
            };
        }
    }

    // If we have a previously played track and the comment is within the post-track window
    if (previouslyPlayed && previousTrackEndTime) {
        const postTrackWindowEnd = new Date(previousTrackEndTime.getTime() + (postTrackWindow * 1000));

        if (commentTime >= previousTrackEndTime && commentTime <= postTrackWindowEnd) {
            console.log(`[Rating Debug] Comment received within post-track window, associating with previous track: ${previouslyPlayed.rel}`);
            return {
                track: previouslyPlayed.rel,
                rating
            };
        }
    }

    return null;
}

/**
 * Set the currently playing track to associate comments with it
 * @param {Object} trackInfo - Information about currently playing track
 */
function setCurrentlyPlaying(trackInfo) {
    // Store the previous track before updating
    if (currentlyPlaying) {
        previouslyPlayed = { ...currentlyPlaying };
        previousTrackEndTime = new Date();
    }

    currentlyPlaying = {
        ...trackInfo,
        rel: trackInfo.trackRel || trackInfo.rel, // Support both trackRel (from orchestrator) and rel
        startTime: new Date()
    };

    // Reset chat pagination to fetch from the beginning for the new track
    // This prevents duplicate messages between tracks
    resetChatPagination();

    // Add debug logging to help diagnose issues
    //console.log(`[Rating Debug] Now playing: ${currentlyPlaying.title} by ${currentlyPlaying.artist || 'Unknown'}`);
    //console.log(`[Rating Debug] Track path: ${currentlyPlaying.rel}`);
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
        // Check for duplicates before adding
        const isDuplicate = ratings[trackPath].ratings.some(r => 
            r.timestamp === ratingData.timestamp && 
            r.author === ratingData.author && 
            r.comment === ratingData.comment
        );

        if (isDuplicate) {
            console.log(`[Rating Debug] Skipping duplicate rating for "${trackPath}" from ${ratingData.author}`);
            return; // Skip this rating
        }

        // Add new rating
        ratings[trackPath].ratings.push(ratingData);

        // Recalculate average
        const sum = ratings[trackPath].ratings.reduce((acc, r) => acc + r.value, 0);
        ratings[trackPath].ratingCount = ratings[trackPath].ratings.length;
        ratings[trackPath].averageRating = sum / ratings[trackPath].ratingCount;
        ratings[trackPath].lastUpdated = new Date().toISOString();
    }

    saveRatings(ratings);

    // Log the rating for debugging
    console.log(`[Rating Debug] Added rating ${ratingData.value}★ for "${trackPath}" (${ratings[trackPath].ratingCount} total ratings)`);

    // Check if we've reached the updateThreshold or maxFeedbackPerTrack threshold
    const updateThreshold = STATION_CONFIG.metadataIntegration?.updateThreshold || 5;
    const maxFeedback = STATION_CONFIG.metadataIntegration?.maxFeedbackPerTrack || 25;

    // Count feedback entries for this track in the feedback log
    const feedbackLog = readFeedbackLog();
    const trackFeedbackCount = feedbackLog.filter(entry => entry.trackPath === trackPath).length;

    if (STATION_CONFIG.metadataIntegration?.enabled && 
        (trackFeedbackCount >= updateThreshold || trackFeedbackCount >= maxFeedback)) {

        if (trackFeedbackCount >= maxFeedback) {
            console.log(`[Rating Debug] Reached maxFeedbackPerTrack (${maxFeedback}) for "${trackPath}". Processing feedback...`);
        } else {
            console.log(`[Rating Debug] Reached updateThreshold (${updateThreshold}) for "${trackPath}". Processing feedback...`);
        }

        // Remove entries from feedback log and get them for processing
        const feedbackEntries = removeFromFeedbackLog(trackPath);

        if (feedbackEntries.length > 0) {
            // Process feedback and update MP3 metadata
            processFeedbackAndUpdateMetadata(trackPath, feedbackEntries);
        }

        // Clear ratings from ratings.log after processing
        clearProcessedRatings(trackPath);
    } else if (STATION_CONFIG.metadataIntegration?.enabled) {
        // If we haven't reached the threshold, still log the feedback for debugging
        console.log(`[Feedback Debug] Adding feedback for "${trackPath}" with rating ${ratingData.value}★ (${trackFeedbackCount}/${updateThreshold})`);
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
 * Read messages from the chat log
 * @returns {Array} - Array of chat messages
 */
function readChatLog() {
    try {
        if (fs.existsSync(chatLogPath)) {
            return JSON.parse(fs.readFileSync(chatLogPath, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Error reading chat log:', error);
        return [];
    }
}

/**
 * Append messages to the chat log
 * @param {Array} messages - Array of chat messages to append
 * @returns {boolean} - Success status
 */
function appendToChatLog(messages) {
    try {
        // Read existing log
        const chatLog = readChatLog();

        // Get existing message IDs for deduplication
        const existingIds = new Set(chatLog.map(msg => msg.id));

        // Filter out messages that are already in the log
        const newMessages = messages.filter(msg => !existingIds.has(msg.id));

        if (newMessages.length === 0) {
            return true; // No new messages to add
        }

        // Append new messages
        const updatedLog = [...chatLog, ...newMessages];

        // Limit the size of the log to prevent it from growing too large
        // Keep only the most recent 1000 messages
        const prunedLog = updatedLog.length > 1000 ? updatedLog.slice(updatedLog.length - 1000) : updatedLog;

        // Write updated log
        fs.writeFileSync(chatLogPath, JSON.stringify(prunedLog, null, 2));

        console.log(`[Chat Log] Added ${newMessages.length} new messages to chat log`);
        return true;
    } catch (error) {
        console.error('Error appending to chat log:', error);
        return false;
    }
}

/**
 * Read entries from the feedback log
 * @returns {Array} - Array of feedback entries
 */
function readFeedbackLog() {
    try {
        if (fs.existsSync(feedbackLogPath)) {
            return JSON.parse(fs.readFileSync(feedbackLogPath, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Error reading feedback log:', error);
        return [];
    }
}

/**
 * Append a feedback entry to the feedback log
 * @param {Object} feedback - Feedback entry to append
 * @returns {boolean} - Success status
 */
function appendToFeedbackLog(feedback) {
    try {
        // Read existing log
        const feedbackLog = readFeedbackLog();

        // Check for duplicates before appending
        const isDuplicate = feedbackLog.some(entry => 
            entry.trackPath === feedback.trackPath && 
            entry.author === feedback.author && 
            entry.comment === feedback.comment && 
            entry.timestamp === feedback.timestamp
        );

        if (isDuplicate) {
            console.log(`[Feedback Debug] Skipping duplicate feedback for "${feedback.trackPath}" from ${feedback.author}`);
            return true; // Return true since we successfully handled the feedback (by skipping it)
        }

        // Append new feedback
        feedbackLog.push(feedback);

        // Write updated log
        fs.writeFileSync(feedbackLogPath, JSON.stringify(feedbackLog, null, 2));

        console.log(`[Feedback Log] Added new feedback for "${feedback.trackPath}"`);
        return true;
    } catch (error) {
        console.error('Error appending to feedback log:', error);
        return false;
    }
}

/**
 * Remove entries from the feedback log for a specific track
 * @param {string} trackPath - Path to the track
 * @param {number} count - Number of entries to remove (default: all)
 * @returns {Array} - Removed entries
 */
function removeFromFeedbackLog(trackPath, count = Infinity) {
    try {
        // Read existing log
        const feedbackLog = readFeedbackLog();

        // Find entries for the specified track
        const trackEntries = feedbackLog.filter(entry => entry.trackPath === trackPath);
        const otherEntries = feedbackLog.filter(entry => entry.trackPath !== trackPath);

        // Determine how many entries to remove
        const removeCount = Math.min(count, trackEntries.length);
        const entriesToRemove = trackEntries.slice(0, removeCount);
        const remainingTrackEntries = trackEntries.slice(removeCount);

        // Update the log
        const updatedLog = [...otherEntries, ...remainingTrackEntries];

        // Write updated log
        fs.writeFileSync(feedbackLogPath, JSON.stringify(updatedLog, null, 2));

        console.log(`[Feedback Log] Removed ${removeCount} entries for "${trackPath}"`);
        return entriesToRemove;
    } catch (error) {
        console.error('Error removing from feedback log:', error);
        return [];
    }
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

    // 2) Append messages to chat log
    appendToChatLog(messages);

    // 3) Process only those inside our window
    let processed = 0;
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

        // 6) Add to feedback log
        const key = match.track;
        const feedbackEntry = {
            trackPath: key,
            rating: rating.value,
            author: rating.author,
            comment: text,
            timestamp: rating.timestamp
        };
        appendToFeedbackLog(feedbackEntry);

        // 7) Update the ratings in the ratings.log file
        updateTrackRating(key, rating);

        // Reload ratings to get the updated values for logging
        const updatedRatings = loadRatings();
        console.log(
            `[Rating Debug] ➤ Updated "${key}" → ` +
            `avg=${updatedRatings[key].averageRating.toFixed(2)} ` +
            `(${updatedRatings[key].ratingCount} ratings)`
        );

        // Mark this message as processed
        processedMessageIds.add(messageId);
        newMessagesProcessed = true;
        processed++;
    }

    // 8) Save processed message IDs if we processed any new messages
    if (newMessagesProcessed) {
        saveProcessedMessageIds();
    }

    // Only clear the window if we're at the end of the track
    // (when closeCommentWindow has been called)
    if (commentWindow.end instanceof Date) {
        // 9) Clear window
        commentWindow.start = commentWindow.end = null;
    }

    return processed;
}


/**
 * Read rating data from MP3 metadata
 * @param {string} trackPath - Path to the track
 * @returns {Object|null} - Rating data or null if not available
 */
function readRatingFromMetadata(trackPath) {
    try {
        // Check if file exists and is an MP3
        const fullPath = path.resolve(trackPath);
        if (!fs.existsSync(fullPath) || !fullPath.toLowerCase().endsWith('.mp3')) {
            return null;
        }

        // Read tags
        const tags = NodeID3.read(fullPath);
        if (!tags || !tags.userDefinedText) {
            return null;
        }

        // Helper function to get a custom frame value
        const getCustomFrame = (description) => {
            const frame = tags.userDefinedText.find(
                frame => frame.description === description
            );
            return frame ? frame.text : null;
        };

        // Get rating information
        const rating = getCustomFrame('RATING');
        const count = getCustomFrame('RATING_COUNT');
        const sentiment = getCustomFrame('SENTIMENT');
        const lastUpdated = getCustomFrame('LAST_UPDATED');

        if (!rating || !count) {
            return null;
        }

        return {
            rating: parseFloat(rating),
            count: parseInt(count, 10),
            sentiment: sentiment || '',
            lastUpdated: lastUpdated || new Date().toISOString()
        };
    } catch (error) {
        console.error(`Error reading metadata for ${trackPath}:`, error);
        return null;
    }
}

/**
 * Get rating for a specific track
 * @param {string} trackPath - Path to the track
 * @returns {number|null} - The average rating or null if not rated
 */
function getRatingForTrack(trackPath) {
    // If metadata integration is enabled, always try to get rating from MP3 metadata first
    if (STATION_CONFIG.metadataIntegration?.enabled) {
        // Try to get rating directly from MP3 metadata
        const metadataRating = readRatingFromMetadata(trackPath);

        if (metadataRating) {
            return metadataRating.rating;
        }

        // If fallbackToFile is enabled and metadata is not available, try ratings.log
        if (STATION_CONFIG.metadataIntegration?.fallbackToFile) {
            const ratings = loadRatings();
            const inMemoryRating = ratings[trackPath]?.averageRating;

            if (inMemoryRating !== undefined) {
                return inMemoryRating;
            }
        }

        return null;
    }

    // If metadata integration is disabled, use ratings.log
    const ratings = loadRatings();
    return ratings[trackPath]?.averageRating || null;
}

/**
 * Process feedback entries and update MP3 metadata
 * @param {string} trackPath - Path to the track
 * @param {Array} feedbackEntries - Feedback entries for the track
 * @returns {boolean} - Success status
 */
function processFeedbackAndUpdateMetadata(trackPath, feedbackEntries) {
    try {
        if (!feedbackEntries || feedbackEntries.length === 0) {
            console.warn(`[Rating Debug] No feedback entries to process for "${trackPath}"`);
            return false;
        }

        // Check if file exists and is an MP3
        const fullPath = path.resolve(trackPath);
        if (!fs.existsSync(fullPath) || !fullPath.toLowerCase().endsWith('.mp3')) {
            console.error(`File not found or not an MP3: ${fullPath}`);
            return false;
        }

        // Read existing tags
        const tags = NodeID3.read(fullPath) || {};

        // Helper function to get a custom frame value
        const getCustomFrame = (description) => {
            if (!tags.userDefinedText) return null;
            const frame = tags.userDefinedText.find(
                frame => frame.description === description
            );
            return frame ? frame.text : null;
        };

        // Get existing rating information
        const existingRating = getCustomFrame('RATING') ? parseFloat(getCustomFrame('RATING')) : null;
        const existingCount = getCustomFrame('RATING_COUNT') ? parseInt(getCustomFrame('RATING_COUNT'), 10) : 0;
        const existingSentiment = getCustomFrame('SENTIMENT') || '';

        // Calculate average rating from feedback entries
        const sum = feedbackEntries.reduce((acc, entry) => acc + entry.rating, 0);
        const newRatingFromFeedback = sum / feedbackEntries.length;
        const newCountFromFeedback = feedbackEntries.length;

        // Calculate new rating by merging with existing
        let newRating, newCount;

        if (existingRating && existingCount > 0) {
            // If we have existing ratings, calculate weighted average
            const existingTotal = existingRating * existingCount;
            const newTotal = newRatingFromFeedback * newCountFromFeedback;
            newCount = existingCount + newCountFromFeedback;
            newRating = (existingTotal + newTotal) / newCount;
            console.log(`[Rating Debug] Merging ratings: existing=${existingRating.toFixed(1)} (${existingCount}), new=${newRatingFromFeedback.toFixed(1)} (${newCountFromFeedback}), result=${newRating.toFixed(1)} (${newCount})`);
        } else {
            // If no existing ratings, use the new ones
            newRating = newRatingFromFeedback;
            newCount = newCountFromFeedback;
            console.log(`[Rating Debug] No existing ratings, using new: ${newRating.toFixed(1)} (${newCount})`);
        }

        // Prepare feedback comments for sentiment analysis
        const feedbackComments = feedbackEntries.map(entry => ({
            author: entry.author,
            comment: entry.comment,
            rating: entry.rating,
            timestamp: entry.timestamp
        }));

        // Perform sentiment analysis on the comments
        const sentimentResult = sentimentAnalyzer.analyzeSentiment(feedbackComments);

        // If there's an existing sentiment, include it in the analysis
        let sentimentSummary = sentimentResult.summary;
        if (existingSentiment && existingSentiment.trim() !== '') {
            // Combine the existing sentiment with the new one
            sentimentSummary = `${sentimentSummary}, building on previous feedback that was ${existingSentiment.toLowerCase()}`;
        }

        // Update custom frames with rating data
        tags.userDefinedText = tags.userDefinedText || [];

        // Helper function to update or add a custom frame
        const updateCustomFrame = (description, text) => {
            const existingIndex = tags.userDefinedText.findIndex(
                frame => frame.description === description
            );

            if (existingIndex >= 0) {
                tags.userDefinedText[existingIndex].text = text;
            } else {
                tags.userDefinedText.push({
                    description: description,
                    text: text
                });
            }
        };

        // Update rating information
        updateCustomFrame('RATING', newRating.toFixed(1));
        updateCustomFrame('RATING_COUNT', newCount.toString());
        updateCustomFrame('SENTIMENT', sentimentSummary);
        updateCustomFrame('LAST_UPDATED', new Date().toISOString());

        // Write tags back to file
        const success = NodeID3.update(tags, fullPath);

        if (success) {
            console.log(`[Rating Debug] Updated metadata for "${trackPath}" with rating ${newRating.toFixed(1)}★ (${newCount} ratings)`);
            console.log(`[Rating Debug] Sentiment summary: "${sentimentSummary}"`);
            return true;
        } else {
            console.error(`[Rating Debug] Failed to update metadata for "${trackPath}"`);
            return false;
        }
    } catch (error) {
        console.error(`[Rating Debug] Error updating metadata for "${trackPath}":`, error);
        return false;
    }
}

/**
 * Process ratings and update MP3 metadata (legacy method, kept for compatibility)
 * @param {string} trackPath - Path to the track
 * @param {Object} ratingsData - Ratings data for the track
 * @returns {boolean} - Success status
 */
function processRatingsAndUpdateMetadata(trackPath, ratingsData) {
    try {
        // Convert ratings data to feedback entries format
        const feedbackEntries = ratingsData.ratings.map(rating => ({
            trackPath: trackPath,
            rating: rating.value,
            author: rating.author,
            comment: rating.comment,
            timestamp: rating.timestamp
        }));

        // Use the new method to process feedback and update metadata
        return processFeedbackAndUpdateMetadata(trackPath, feedbackEntries);
    } catch (error) {
        console.error(`[Rating Debug] Error processing ratings for "${trackPath}":`, error);
        return false;
    }
}

/**
 * Clear processed ratings from ratings.log
 * @param {string} trackPath - Path to the track
 * @returns {boolean} - Success status
 */
function clearProcessedRatings(trackPath) {
    try {
        const ratings = loadRatings();

        if (!ratings[trackPath]) {
            console.warn(`[Rating Debug] No ratings found for "${trackPath}" to clear`);
            return false;
        }

        // Keep only the most recent 5 ratings for display purposes
        const recentRatings = ratings[trackPath].ratings.slice(0, 5);

        // Update the ratings object
        ratings[trackPath] = {
            averageRating: ratings[trackPath].averageRating,
            ratingCount: recentRatings.length,
            lastUpdated: new Date().toISOString(),
            ratings: recentRatings,
            processedAt: new Date().toISOString() // Add a marker to indicate this track has been processed
        };

        // Save the updated ratings
        saveRatings(ratings);

        console.log(`[Rating Debug] Cleared processed ratings for "${trackPath}", keeping ${recentRatings.length} recent ratings`);
        return true;
    } catch (error) {
        console.error(`[Rating Debug] Error clearing processed ratings for "${trackPath}":`, error);
        return false;
    }
}

/**
 * Get the currently playing track information
 * @returns {Object|null} - Information about the currently playing track or null if no track is playing
 */
function getCurrentlyPlaying() {
    return currentlyPlaying;
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
    getCurrentlyPlaying,
    openCommentWindow,
    closeCommentWindow,
    pollForComments,
    saveProcessedMessageIds,
    clearProcessedMessageIds,
    processRatingsAndUpdateMetadata,
    processFeedbackAndUpdateMetadata,
    clearProcessedRatings,
    readRatingFromMetadata,
    readChatLog,
    appendToChatLog,
    readFeedbackLog,
    appendToFeedbackLog,
    removeFromFeedbackLog,
    EMOJI_RATINGS,
};
