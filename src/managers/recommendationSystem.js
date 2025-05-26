/**
 * Recommendation System Module
 * 
 * Converts analytics data into actionable recommendations for content selection
 * and audience engagement.
 */

const fs = require('fs');
const path = require('path');
const { STATION_CONFIG } = require('../core/config');
const analyticsEngine = require('./analyticsEngine');

// Path to recommendations data file
const recommendationsPath = path.join(__dirname, '../../data/recommendations.json');

/**
 * Initialize recommendations data file if it doesn't exist
 */
function initRecommendations() {
    if (!fs.existsSync(recommendationsPath)) {
        const initialData = {
            lastUpdated: new Date().toISOString(),
            actions: []
        };
        fs.writeFileSync(recommendationsPath, JSON.stringify(initialData, null, 2));
        console.log('Recommendations data file initialized');
    }
}

/**
 * Load recommendations data from disk
 * @returns {Object} - The recommendations data
 */
function loadRecommendations() {
    try {
        if (fs.existsSync(recommendationsPath)) {
            return JSON.parse(fs.readFileSync(recommendationsPath, 'utf8'));
        }
        // Initialize if not exists
        initRecommendations();
        return JSON.parse(fs.readFileSync(recommendationsPath, 'utf8'));
    } catch (error) {
        console.error('Error loading recommendations:', error);
        return null;
    }
}

/**
 * Save recommendations data to disk
 * @param {Object} recommendations - The recommendations data to save
 * @returns {boolean} - Success status
 */
function saveRecommendations(recommendations) {
    try {
        fs.writeFileSync(recommendationsPath, JSON.stringify(recommendations, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving recommendations:', error);
        return false;
    }
}

/**
 * Generate recommendations based on analytics data
 * @returns {Object} - The generated recommendations
 */
function generateRecommendations() {
    // Ensure analytics are up-to-date
    analyticsEngine.generateAnalytics();
    
    const recommendations = loadRecommendations();
    if (!recommendations) {
        console.error('Failed to load recommendations data');
        return null;
    }
    
    // Update timestamp
    recommendations.lastUpdated = new Date().toISOString();
    
    // Clear previous recommendations
    recommendations.actions = [];
    
    // Get analytics data
    const topRatedMusic = analyticsEngine.getTopRated('music', 5);
    const bottomRatedMusic = analyticsEngine.getBottomRated('music', 5);
    const outliers = analyticsEngine.getOutliers();
    const trends = analyticsEngine.getTrends('weekly');
    
    // Generate promotion recommendations for top rated tracks
    topRatedMusic.forEach(track => {
        if (track.rating >= 4.5 && track.count >= 5) {
            recommendations.actions.push({
                type: 'promote',
                track: track.path,
                reason: 'Top rated track with exceptional feedback',
                confidence: calculateConfidence(track.rating, track.count, 0.95)
            });
        } else if (track.rating >= 4.0 && track.count >= 3) {
            recommendations.actions.push({
                type: 'promote',
                track: track.path,
                reason: 'Highly rated track with good feedback',
                confidence: calculateConfidence(track.rating, track.count, 0.85)
            });
        }
    });
    
    // Generate review recommendations for bottom rated tracks
    bottomRatedMusic.forEach(track => {
        if (track.rating <= 2.0 && track.count >= 5) {
            recommendations.actions.push({
                type: 'review',
                track: track.path,
                reason: 'Consistently low-rated track',
                confidence: calculateConfidence(track.rating, track.count, 0.9)
            });
        } else if (track.rating <= 2.5 && track.count >= 3) {
            recommendations.actions.push({
                type: 'review',
                track: track.path,
                reason: 'Below average ratings',
                confidence: calculateConfidence(track.rating, track.count, 0.8)
            });
        }
    });
    
    // Generate recommendations for positive outliers
    outliers.positive.forEach(track => {
        if (track.zScore >= 3) {
            recommendations.actions.push({
                type: 'feature',
                track: track.path,
                reason: 'Statistical standout with exceptionally high ratings',
                confidence: calculateConfidence(track.rating, track.count, 0.95)
            });
        }
    });
    
    // Generate recommendations for negative outliers
    outliers.negative.forEach(track => {
        if (track.zScore <= -3) {
            recommendations.actions.push({
                type: 'remove',
                track: track.path,
                reason: 'Statistical standout with exceptionally low ratings',
                confidence: calculateConfidence(track.rating, track.count, 0.95)
            });
        }
    });
    
    // Generate trend-based recommendations
    const risingTracks = findRisingTracks(trends);
    risingTracks.forEach(track => {
        recommendations.actions.push({
            type: 'increase',
            track: track.path,
            reason: 'Trending upward in listener ratings',
            confidence: track.confidence
        });
    });
    
    // Sort recommendations by confidence (highest first)
    recommendations.actions.sort((a, b) => b.confidence - a.confidence);
    
    // Save updated recommendations
    saveRecommendations(recommendations);
    
    return recommendations;
}

/**
 * Calculate confidence score for a recommendation
 * @param {number} rating - The track rating
 * @param {number} count - Number of ratings
 * @param {number} baseConfidence - Base confidence level
 * @returns {number} - Confidence score (0-1)
 */
function calculateConfidence(rating, count, baseConfidence) {
    // Adjust confidence based on number of ratings
    let countFactor = Math.min(1, count / 10); // Max out at 10 ratings
    
    // Adjust confidence based on rating extremity
    let ratingFactor = 1;
    if (rating > 3) {
        ratingFactor = 0.8 + ((rating - 3) / 10); // 0.8 - 1.0 for ratings 3-5
    } else {
        ratingFactor = 0.8 + ((3 - rating) / 10); // 0.8 - 1.0 for ratings 1-3
    }
    
    // Calculate final confidence
    let confidence = baseConfidence * countFactor * ratingFactor;
    
    // Ensure confidence is between 0 and 1
    return Math.max(0, Math.min(1, confidence));
}

/**
 * Find tracks with rising ratings trends
 * @param {Object} trends - Weekly trends data
 * @returns {Array} - Array of tracks with rising trends
 */
function findRisingTracks(trends) {
    const risingTracks = [];
    const analytics = analyticsEngine.loadAnalytics();
    
    // Get daily trends for more detailed analysis
    const dailyTrends = analyticsEngine.getTrends('daily');
    
    Object.entries(dailyTrends).forEach(([trackPath, dailyRatings]) => {
        // Need at least 2 days of data to detect a trend
        const days = Object.keys(dailyRatings);
        if (days.length < 2) return;
        
        // Sort days chronologically
        days.sort();
        
        // Check if ratings are trending upward
        let isRising = true;
        let previousRating = null;
        let ratingSum = 0;
        let ratingCount = 0;
        
        // Check last 3 days (or fewer if not enough data)
        const recentDays = days.slice(-Math.min(3, days.length));
        
        recentDays.forEach(day => {
            const rating = dailyRatings[day];
            ratingSum += rating;
            ratingCount++;
            
            if (previousRating !== null && rating <= previousRating) {
                isRising = false;
            }
            
            previousRating = rating;
        });
        
        // If trending upward and average rating is good
        if (isRising && ratingCount > 0) {
            const averageRating = ratingSum / ratingCount;
            if (averageRating >= 3.5) {
                risingTracks.push({
                    path: trackPath,
                    trend: 'rising',
                    averageRating: averageRating,
                    confidence: 0.7 + ((averageRating - 3.5) / 5) // 0.7 - 0.9 based on rating
                });
            }
        }
    });
    
    // Sort by confidence
    risingTracks.sort((a, b) => b.confidence - a.confidence);
    
    return risingTracks.slice(0, 5); // Return top 5 rising tracks
}

/**
 * Get recommended actions for content management
 * @returns {Array} - Array of recommended actions
 */
function getRecommendedActions() {
    const recommendations = loadRecommendations();
    if (!recommendations) return [];
    
    return recommendations.actions;
}

// Initialize recommendations on module load
initRecommendations();

module.exports = {
    generateRecommendations,
    getRecommendedActions,
    loadRecommendations,
    saveRecommendations
};