/**
 * Feedback Manager Module
 * 
 * Manages per-track feedback storage and processing, including
 * comment storage, sentiment analysis, and metadata integration.
 */

const fs = require('fs');
const path = require('path');
const { STATION_CONFIG } = require('../core/config');
const sentimentAnalyzer = require('../utils/sentimentAnalyzer');
const NodeID3 = require('node-id3');

// Base directory for feedback files
const feedbackBaseDir = path.join(__dirname, '../../data/feedback');

/**
 * Initialize feedback directory if it doesn't exist
 */
function initFeedbackDirectory() {
    if (!fs.existsSync(feedbackBaseDir)) {
        fs.mkdirSync(feedbackBaseDir, { recursive: true });
        console.log('Feedback directory initialized');
    }
}

/**
 * Get the path to a track's feedback file
 * @param {string} trackPath - Path to the track
 * @returns {string} - Path to the feedback file
 */
function getFeedbackFilePath(trackPath) {
    // Create a safe filename from the track path
    const safeFilename = trackPath.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const feedbackPath = path.join(feedbackBaseDir, `${safeFilename}.json`);
    // Only log when debug mode is enabled
    if (STATION_CONFIG.debug) {
        console.log(`[Feedback Debug] Feedback file path for "${trackPath}" → "${feedbackPath}"`);
    }
    return feedbackPath;
}

/**
 * Load feedback data for a track
 * @param {string} trackPath - Path to the track
 * @returns {Object} - The feedback data
 */
function loadFeedback(trackPath) {
    const feedbackPath = getFeedbackFilePath(trackPath);

    try {
        if (fs.existsSync(feedbackPath)) {
            return JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
        }

        // Initialize new feedback file
        const initialData = {
            trackPath: trackPath,
            lastUpdated: new Date().toISOString(),
            currentRating: 0,
            sentimentSummary: 'No feedback yet',
            feedbackCount: 0,
            feedback: []
        };

        fs.writeFileSync(feedbackPath, JSON.stringify(initialData, null, 2));
        return initialData;
    } catch (error) {
        console.error(`Error loading feedback for ${trackPath}:`, error);
        return null;
    }
}

/**
 * Save feedback data for a track
 * @param {string} trackPath - Path to the track
 * @param {Object} feedbackData - The feedback data to save
 * @returns {boolean} - Success status
 */
function saveFeedback(trackPath, feedbackData) {
    const feedbackPath = getFeedbackFilePath(trackPath);

    try {
        // Update timestamp
        feedbackData.lastUpdated = new Date().toISOString();

        fs.writeFileSync(feedbackPath, JSON.stringify(feedbackData, null, 2));
        return true;
    } catch (error) {
        console.error(`Error saving feedback for ${trackPath}:`, error);
        return false;
    }
}

/**
 * Add new feedback for a track
 * @param {string} trackPath - Path to the track
 * @param {Object} feedbackItem - The feedback item to add
 * @returns {boolean} - Success status
 */
function addFeedback(trackPath, feedbackItem) {
    // Only log when debug mode is enabled
    if (STATION_CONFIG.debug) {
        console.log(`[Feedback Debug] Adding feedback for "${trackPath}": ${JSON.stringify(feedbackItem)}`);
    }

    // Ensure feedback item has required fields
    if (!feedbackItem.author || !feedbackItem.comment || !feedbackItem.rating) {
        console.error('[Feedback Debug] Feedback item missing required fields:', feedbackItem);
        return false;
    }

    // Add timestamp if not provided
    if (!feedbackItem.timestamp) {
        feedbackItem.timestamp = new Date().toISOString();
    }

    // Load existing feedback
    const feedbackData = loadFeedback(trackPath);
    if (!feedbackData) {
        console.error('[Feedback Debug] Failed to load feedback data for:', trackPath);
        return false;
    }

    // Only log when debug mode is enabled
    if (STATION_CONFIG.debug) {
        console.log(`[Feedback Debug] Loaded existing feedback with ${feedbackData.feedbackCount} items`);
    }

    // Add new feedback to the beginning of the array
    feedbackData.feedback.unshift(feedbackItem);

    // Limit to 128 most recent comments
    if (feedbackData.feedback.length > 128) {
        feedbackData.feedback = feedbackData.feedback.slice(0, 128);
    }

    // Update feedback count
    feedbackData.feedbackCount = feedbackData.feedback.length;

    // Recalculate average rating
    const sum = feedbackData.feedback.reduce((acc, item) => acc + item.rating, 0);
    feedbackData.currentRating = sum / feedbackData.feedbackCount;

    // Update sentiment summary
    const sentimentResult = sentimentAnalyzer.analyzeSentiment(feedbackData.feedback);
    feedbackData.sentimentSummary = sentimentResult.summary;

    // Save updated feedback
    const saveResult = saveFeedback(trackPath, feedbackData);

    if (saveResult) {
        // Only log when debug mode is enabled
        if (STATION_CONFIG.debug) {
            console.log(`[Feedback Debug] Successfully saved feedback for "${trackPath}" with ${feedbackData.feedbackCount} items`);
        }
    } else {
        console.error(`[Feedback Debug] Failed to save feedback for "${trackPath}"`);
    }

    // Check if we should update MP3 metadata
    if (saveResult && shouldUpdateMetadata(feedbackData)) {
        const metadataResult = updateTrackMetadata(trackPath, feedbackData);
        // Only log when debug mode is enabled
        if (STATION_CONFIG.debug) {
            console.log(`[Feedback Debug] Metadata update ${metadataResult ? 'succeeded' : 'failed'} for "${trackPath}"`);
        }
    }

    return saveResult;
}

/**
 * Get feedback for a specific track
 * @param {string} trackPath - Path to the track
 * @returns {Object} - The feedback data
 */
function getFeedback(trackPath) {
    return loadFeedback(trackPath);
}

/**
 * Determine if track metadata should be updated
 * @param {Object} feedbackData - The feedback data
 * @returns {boolean} - Whether metadata should be updated
 */
function shouldUpdateMetadata(feedbackData) {
    // Check if metadata integration is enabled
    if (!STATION_CONFIG.metadataIntegration?.enabled) {
        return false;
    }

    // Check if we have enough feedback to update metadata
    const threshold = STATION_CONFIG.metadataIntegration?.updateThreshold || 5;
    return feedbackData.feedbackCount >= threshold;
}

/**
 * Update MP3 metadata with rating and sentiment data
 * @param {string} trackPath - Path to the track
 * @param {Object} feedbackData - The feedback data
 * @returns {boolean} - Success status
 */
function updateTrackMetadata(trackPath, feedbackData) {
    try {
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

        // Calculate new rating by merging with existing
        let newRating, newCount;

        if (existingRating && existingCount > 0) {
            // If we have existing ratings, calculate weighted average
            const existingTotal = existingRating * existingCount;
            const newTotal = feedbackData.currentRating * feedbackData.feedbackCount;
            newCount = existingCount + feedbackData.feedbackCount;
            newRating = (existingTotal + newTotal) / newCount;

            if (STATION_CONFIG.debug) {
                console.log(`[Feedback Debug] Merging ratings: existing=${existingRating.toFixed(1)} (${existingCount}), new=${feedbackData.currentRating.toFixed(1)} (${feedbackData.feedbackCount}), result=${newRating.toFixed(1)} (${newCount})`);
            }
        } else {
            // If no existing ratings, use the new ones
            newRating = feedbackData.currentRating;
            newCount = feedbackData.feedbackCount;

            if (STATION_CONFIG.debug) {
                console.log(`[Feedback Debug] No existing ratings, using new: ${newRating.toFixed(1)} (${newCount})`);
            }
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

        // Update rating information with merged values
        updateCustomFrame('RATING', newRating.toFixed(1));
        updateCustomFrame('RATING_COUNT', newCount.toString());
        updateCustomFrame('SENTIMENT', feedbackData.sentimentSummary);
        updateCustomFrame('LAST_UPDATED', feedbackData.lastUpdated);

        // Write tags back to file
        const success = NodeID3.update(tags, fullPath);

        if (success) {
            // Only log when debug mode is enabled
            if (STATION_CONFIG.debug) {
                console.log(`Updated metadata for ${trackPath}`);
            }
            return true;
        } else {
            console.error(`Failed to update metadata for ${trackPath}`);
            return false;
        }
    } catch (error) {
        console.error(`Error updating metadata for ${trackPath}:`, error);
        return false;
    }
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
 * Get rating with fallback to feedback.json if metadata is unavailable and fallbackToFile is enabled
 * @param {string} trackPath - Path to the track
 * @returns {Object|null} - Rating data or null if not available
 */
function getRatingWithFallback(trackPath) {
    // Try to get rating from metadata first
    const metadataRating = readRatingFromMetadata(trackPath);
    if (metadataRating) {
        return metadataRating;
    }

    // Only fall back to feedback.json if fallbackToFile is enabled
    if (STATION_CONFIG.metadataIntegration?.fallbackToFile) {
        // Only log when debug mode is enabled
        if (STATION_CONFIG.debug) {
            console.log(`[Feedback Debug] Metadata not available for "${trackPath}", falling back to feedback.json`);
        }

        // Fall back to feedback.json
        const feedbackData = loadFeedback(trackPath);
        if (feedbackData && feedbackData.feedbackCount > 0) {
            return {
                rating: feedbackData.currentRating,
                count: feedbackData.feedbackCount,
                sentiment: feedbackData.sentimentSummary,
                lastUpdated: feedbackData.lastUpdated
            };
        }
    } else if (STATION_CONFIG.debug) {
        console.log(`[Feedback Debug] Metadata not available for "${trackPath}" and fallbackToFile is disabled`);
    }

    return null;
}

/**
 * Process feedback when threshold is reached
 * @param {string} trackPath - Path to the track
 * @returns {boolean} - Success status
 */
function processFeedbackThreshold(trackPath) {
    const feedbackData = loadFeedback(trackPath);
    if (!feedbackData) return false;

    // Update sentiment summary
    const sentimentResult = sentimentAnalyzer.analyzeSentiment(feedbackData.feedback);
    feedbackData.sentimentSummary = sentimentResult.summary;

    // Save updated feedback
    const saveResult = saveFeedback(trackPath, feedbackData);

    // Update MP3 metadata
    if (saveResult) {
        return updateTrackMetadata(trackPath, feedbackData);
    }

    return false;
}

// Initialize feedback directory on module load
initFeedbackDirectory();

module.exports = {
    addFeedback,
    getFeedback,
    readRatingFromMetadata,
    getRatingWithFallback,
    processFeedbackThreshold,
    updateTrackMetadata
};
