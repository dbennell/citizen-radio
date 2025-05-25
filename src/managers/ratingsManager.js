
const fs = require('fs');
const path = require('path');
const { readLiveChat} = require('../utils');
const { STATION_CONFIG } = require('../core/config'); // Fix the import to use destructuring
//const { getPersistentVideoId } = require('./orchestrator');

let commentWindow = { start: Date.now(), end: Date.now() };

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
 */
function closeCommentWindow() {
    commentWindow.end = new Date();
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
        rel: trackInfo.rel,
        startTime: new Date()
    };
}

/**
 * Load ratings from disk
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
            return {
                value: EMOJI_RATINGS[char],
                timestamp: publishedAt,
                author: authorName,
                comment: text
            };
        }
    }

    return null;
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

    console.log(
        `[Rating Debug] Window → start=${commentWindow.start?.toISOString() || '–'} ` +
        `end=${commentWindow.end?.toISOString() || '–'}`
    );

    // 1) Fetch raw chat
    const messages = await readLiveChat(videoId);
    console.log(`[Rating Debug] Fetched ${messages.length} chat messages`);

    // 2) Dump them all with their timestamps
    messages.forEach((msg, idx) => {
        const text = msg.snippet.displayMessage
            || msg.snippet.textMessageDetails?.messageText
            || '(no text)';
        const ts   = msg.snippet.publishedAt || '(no ts)';
        console.log(`[Rating Debug] #${idx} → text="${text}" @ ${ts}`);
    });

    // 3) Process only those inside our window
    let processed = 0;
    const ratings = loadRatings();

    for (const msg of messages) {
        const publishedAt = msg.snippet.publishedAt;
        if (!publishedAt) continue;

        const commentTime = new Date(publishedAt);
        const inWindow =
            commentWindow.start instanceof Date &&
            commentWindow.end   instanceof Date &&
            commentTime >= commentWindow.start &&
            commentTime <= commentWindow.end;

        const text = msg.snippet.displayMessage
            || msg.snippet.textMessageDetails?.messageText
            || '(no text)';
        //console.log(`[Rating Debug] "${text}" → inWindow=${inWindow}`);
        if (!inWindow) continue;

        // 4) Pull out the emoji
        const rating = parseRatingFromComment(msg);
        if (!rating) {
            //console.log('[Rating Debug] No rating emoji found');
            continue;
        }
        console.log(`[Rating Debug] Detected ${rating.value}★ by ${rating.author} → "${text}"`);

        // 5) Match it to the current track
        const match = matchRatingToTrack(rating);
        if (!match) {
            //console.log('[Rating Debug] Outside actual play time; skipping');
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
        // console.log(
        //     `[Rating Debug] ➤ Updated "${key}" → ` +
        //     `avg=${ratings[key].averageRating.toFixed(2)} ` +
        //     `(${ratings[key].ratingCount} ratings)`
        // );

        processed++;
    }

    // 7) Persist and confirm
    if (saveRatings(ratings)) {
        // console.log(
        //     `[Rating Debug] Wrote ratings.json with ` +
        //     `${Object.keys(ratings).length} entries`
        // );
    } else {
        console.error('💥 Could not save ratings.json');
    }

    // 8) Clear window
    commentWindow.start = commentWindow.end = null;
    return processed;
}


/**
 * Get rating for a specific track
 * @param {string} trackPath - Path to the track
 * @returns {number|null} - The average rating or null if not rated
 */
function getRatingForTrack(trackPath) {
    const ratings = loadRatings();
    return ratings[trackPath]?.averageRating || null;
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
};
