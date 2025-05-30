/**
 * Engagement Monitor Module
 * 
 * Monitors live chat for noteworthy comments and ratings, stores them in memory,
 * and enables DJs to reference this feedback during segues.
 */

const { STATION_CONFIG } = require('../core/config');

// In-memory storage for noteworthy comments
let noteworthyComments = [];

// Default configuration values
const DEFAULT_MAX_STORED_COMMENTS = 3;
const DEFAULT_COMMENT_EXPIRATION_MINUTES = 30;
const DEFAULT_MIN_SIGNIFICANCE_THRESHOLD = 0.6;
const DEFAULT_RATING_WEIGHT = 0.5;
const DEFAULT_SEGWAY_REFERENCE_CHANCE = 0.7;

// Default keyword weights if not specified in config
const DEFAULT_KEYWORD_WEIGHTS = {
    'love': 0.8,
    'amazing': 0.7,
    'awesome': 0.7,
    'favorite': 0.9,
    'terrible': 0.8,
    'worst': 0.8
};

/**
 * Get configuration value with fallback to default
 * @param {string} key - Configuration key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} - Configuration value
 */
function getConfig(key, defaultValue) {
    return STATION_CONFIG.enhancedEngagement?.[key] !== undefined
        ? STATION_CONFIG.enhancedEngagement[key]
        : defaultValue;
}

/**
 * Process a comment to determine if it's noteworthy
 * @param {Object} comment - Comment data
 * @returns {boolean} - Whether the comment was added to noteworthy comments
 */
function processComment(comment) {
    // Check if enhanced engagement is enabled
    if (!getConfig('enabled', false)) {
        return false;
    }
    
    // Ensure comment has required fields
    if (!comment || !comment.author || !comment.comment) {
        return false;
    }
    
    // Calculate significance score
    const significance = calculateSignificance(comment);
    
    // Check if comment meets significance threshold
    const threshold = getConfig('minSignificanceThreshold', DEFAULT_MIN_SIGNIFICANCE_THRESHOLD);
    if (significance < threshold) {
        return false;
    }
    
    // Create noteworthy comment object
    const noteworthyComment = {
        author: comment.author,
        comment: comment.comment,
        rating: comment.rating || 0,
        timestamp: comment.timestamp || new Date().toISOString(),
        significance: significance,
        referenced: false
    };
    
    // Add to noteworthy comments
    addNoteworthyComment(noteworthyComment);
    
    return true;
}

/**
 * Add a comment to the noteworthy comments list
 * @param {Object} comment - Noteworthy comment
 */
function addNoteworthyComment(comment) {
    // Add new comment
    noteworthyComments.push(comment);
    
    // Sort by significance (highest first)
    noteworthyComments.sort((a, b) => b.significance - a.significance);
    
    // Limit to max stored comments
    const maxComments = getConfig('maxStoredComments', DEFAULT_MAX_STORED_COMMENTS);
    if (noteworthyComments.length > maxComments) {
        noteworthyComments = noteworthyComments.slice(0, maxComments);
    }
    
    // Remove expired comments
    removeExpiredComments();
}

/**
 * Remove comments that have expired
 */
function removeExpiredComments() {
    const expirationMinutes = getConfig('commentExpirationMinutes', DEFAULT_COMMENT_EXPIRATION_MINUTES);
    const now = new Date();
    
    noteworthyComments = noteworthyComments.filter(comment => {
        const commentTime = new Date(comment.timestamp);
        const ageMinutes = (now - commentTime) / (1000 * 60);
        return ageMinutes < expirationMinutes;
    });
}

/**
 * Calculate significance score for a comment
 * @param {Object} comment - Comment data
 * @returns {number} - Significance score (0-1)
 */
function calculateSignificance(comment) {
    let score = 0;
    const text = comment.comment.toLowerCase();
    
    // Get keyword weights from config or use defaults
    const keywordWeights = getConfig('keywordWeights', DEFAULT_KEYWORD_WEIGHTS);
    
    // Check for keywords
    Object.entries(keywordWeights).forEach(([keyword, weight]) => {
        if (text.includes(keyword.toLowerCase())) {
            score += weight;
        }
    });
    
    // Factor in rating if available
    if (comment.rating) {
        const ratingWeight = getConfig('ratingWeight', DEFAULT_RATING_WEIGHT);
        const normalizedRating = (comment.rating - 3) / 2; // Convert 1-5 to -1 to 1
        score += normalizedRating * ratingWeight;
    }
    
    // Normalize score to 0-1 range
    // Assuming max possible score is sum of top 3 keyword weights + max rating contribution
    const topWeights = Object.values(keywordWeights)
        .sort((a, b) => b - a)
        .slice(0, 3);
    
    const maxPossibleScore = topWeights.reduce((sum, weight) => sum + weight, 0) + 
        getConfig('ratingWeight', DEFAULT_RATING_WEIGHT);
    
    return Math.min(1, Math.max(0, score / maxPossibleScore));
}

/**
 * Get current noteworthy comments
 * @returns {Array} - Array of noteworthy comments
 */
function getNoteworthyComments() {
    removeExpiredComments();
    return [...noteworthyComments];
}

/**
 * Mark a comment as referenced in a segue
 * @param {number} index - Index of the comment
 * @returns {boolean} - Success status
 */
function markCommentReferenced(index) {
    if (index >= 0 && index < noteworthyComments.length) {
        noteworthyComments[index].referenced = true;
        return true;
    }
    return false;
}

/**
 * Determine if a comment should be referenced in a segue
 * @returns {boolean} - Whether to reference a comment
 */
function shouldReferenceComment() {
    // Check if enhanced engagement is enabled
    if (!getConfig('enabled', false)) {
        return false;
    }
    
    // Check if there are any noteworthy comments
    removeExpiredComments();
    if (noteworthyComments.length === 0) {
        return false;
    }
    
    // Check reference chance
    const referenceChance = getConfig('segwayReferenceChance', DEFAULT_SEGWAY_REFERENCE_CHANCE);
    return Math.random() < referenceChance;
}

/**
 * Get a comment to reference in a segue
 * @returns {Object|null} - Comment to reference or null if none available
 */
function getCommentForSegway() {
    // Check if we should reference a comment
    if (!shouldReferenceComment()) {
        return null;
    }
    
    // Prefer unreferenced comments
    const unreferencedComments = noteworthyComments.filter(comment => !comment.referenced);
    
    if (unreferencedComments.length > 0) {
        // Get highest significance unreferenced comment
        return unreferencedComments[0];
    } else if (noteworthyComments.length > 0) {
        // If all comments have been referenced, use the highest significance one
        return noteworthyComments[0];
    }
    
    return null;
}

/**
 * Reset all comments (for testing or manual reset)
 */
function resetComments() {
    noteworthyComments = [];
}

module.exports = {
    processComment,
    getNoteworthyComments,
    markCommentReferenced,
    calculateSignificance,
    getCommentForSegway,
    resetComments
};