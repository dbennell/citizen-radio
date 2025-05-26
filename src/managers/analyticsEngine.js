/**
 * Analytics Engine Module
 * 
 * Processes user ratings and engagement data to generate actionable insights
 * for content selection and audience engagement.
 */

const fs = require('fs');
const path = require('path');
const { STATION_CONFIG } = require('../core/config');
const ratingsManager = require('./ratingsManager');

// Path to analytics data file
const analyticsPath = path.join(__dirname, '../../data/analytics.json');

/**
 * Initialize analytics data file if it doesn't exist
 */
function initAnalytics() {
    if (!fs.existsSync(analyticsPath)) {
        const initialData = {
            lastUpdated: new Date().toISOString(),
            topRated: {
                music: [],
                dj: [],
                ad: []
            },
            bottomRated: {
                music: [],
                dj: [],
                ad: []
            },
            outliers: {
                positive: [],
                negative: []
            },
            trends: {
                daily: {},
                weekly: {}
            }
        };
        fs.writeFileSync(analyticsPath, JSON.stringify(initialData, null, 2));
        console.log('Analytics data file initialized');
    }
}

/**
 * Load analytics data from disk
 * @returns {Object} - The analytics data
 */
function loadAnalytics() {
    try {
        if (fs.existsSync(analyticsPath)) {
            return JSON.parse(fs.readFileSync(analyticsPath, 'utf8'));
        }
        // Initialize if not exists
        initAnalytics();
        return JSON.parse(fs.readFileSync(analyticsPath, 'utf8'));
    } catch (error) {
        console.error('Error loading analytics:', error);
        return null;
    }
}

/**
 * Save analytics data to disk
 * @param {Object} analytics - The analytics data to save
 * @returns {boolean} - Success status
 */
function saveAnalytics(analytics) {
    try {
        fs.writeFileSync(analyticsPath, JSON.stringify(analytics, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving analytics:', error);
        return false;
    }
}

/**
 * Generate analytics from ratings data
 * @returns {Object} - The generated analytics
 */
function generateAnalytics() {
    const ratings = ratingsManager.loadRatings();
    const analytics = loadAnalytics();
    
    if (!ratings || !analytics) {
        console.error('Failed to load ratings or analytics data');
        return null;
    }
    
    // Update timestamp
    analytics.lastUpdated = new Date().toISOString();
    
    // Process ratings by content type
    const tracksByType = {
        music: [],
        dj: [],
        ad: []
    };
    
    // Group tracks by type
    Object.entries(ratings).forEach(([trackPath, trackData]) => {
        // Determine content type from path
        let contentType = 'music'; // Default
        if (trackPath.includes('/dj/')) contentType = 'dj';
        if (trackPath.includes('/ad/')) contentType = 'ad';
        
        // Only include tracks with sufficient ratings
        if (trackData.ratingCount >= 3) {
            tracksByType[contentType].push({
                path: trackPath,
                rating: trackData.averageRating,
                count: trackData.ratingCount
            });
        }
    });
    
    // Generate top and bottom rated for each content type
    Object.keys(tracksByType).forEach(contentType => {
        // Sort by rating (descending for top, ascending for bottom)
        const sortedTracks = [...tracksByType[contentType]].sort((a, b) => b.rating - a.rating);
        
        // Get top 10 (or fewer if not enough)
        analytics.topRated[contentType] = sortedTracks.slice(0, 10);
        
        // Get bottom 10 (or fewer if not enough)
        analytics.bottomRated[contentType] = [...sortedTracks].reverse().slice(0, 10);
    });
    
    // Identify statistical outliers
    identifyOutliers(ratings, analytics);
    
    // Generate trends
    generateTrends(ratings, analytics);
    
    // Save updated analytics
    saveAnalytics(analytics);
    
    return analytics;
}

/**
 * Identify statistical outliers in ratings
 * @param {Object} ratings - The ratings data
 * @param {Object} analytics - The analytics data to update
 */
function identifyOutliers(ratings, analytics) {
    // Calculate overall average rating
    let totalRating = 0;
    let totalCount = 0;
    
    Object.values(ratings).forEach(trackData => {
        totalRating += trackData.averageRating * trackData.ratingCount;
        totalCount += trackData.ratingCount;
    });
    
    const overallAverage = totalRating / totalCount;
    
    // Calculate standard deviation
    let sumSquaredDiff = 0;
    Object.values(ratings).forEach(trackData => {
        const diff = trackData.averageRating - overallAverage;
        sumSquaredDiff += diff * diff * trackData.ratingCount;
    });
    
    const standardDeviation = Math.sqrt(sumSquaredDiff / totalCount);
    
    // Identify outliers (tracks with ratings more than 2 standard deviations from the mean)
    analytics.outliers.positive = [];
    analytics.outliers.negative = [];
    
    Object.entries(ratings).forEach(([trackPath, trackData]) => {
        // Only consider tracks with sufficient ratings
        if (trackData.ratingCount >= 5) {
            const zScore = (trackData.averageRating - overallAverage) / standardDeviation;
            
            if (zScore > 2) {
                analytics.outliers.positive.push({
                    path: trackPath,
                    rating: trackData.averageRating,
                    count: trackData.ratingCount,
                    zScore: zScore
                });
            } else if (zScore < -2) {
                analytics.outliers.negative.push({
                    path: trackPath,
                    rating: trackData.averageRating,
                    count: trackData.ratingCount,
                    zScore: zScore
                });
            }
        }
    });
    
    // Sort outliers by absolute z-score (most extreme first)
    analytics.outliers.positive.sort((a, b) => b.zScore - a.zScore);
    analytics.outliers.negative.sort((a, b) => a.zScore - b.zScore);
}

/**
 * Generate rating trends over time
 * @param {Object} ratings - The ratings data
 * @param {Object} analytics - The analytics data to update
 */
function generateTrends(ratings, analytics) {
    // Initialize trend data
    analytics.trends.daily = {};
    analytics.trends.weekly = {};
    
    // Get current date
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Process each track's ratings
    Object.entries(ratings).forEach(([trackPath, trackData]) => {
        if (!trackData.ratings || trackData.ratings.length === 0) return;
        
        // Group ratings by day
        const ratingsByDay = {};
        
        trackData.ratings.forEach(rating => {
            const ratingDate = new Date(rating.timestamp);
            const dateKey = ratingDate.toISOString().split('T')[0];
            
            if (!ratingsByDay[dateKey]) {
                ratingsByDay[dateKey] = {
                    sum: 0,
                    count: 0
                };
            }
            
            ratingsByDay[dateKey].sum += rating.value;
            ratingsByDay[dateKey].count++;
        });
        
        // Calculate daily averages
        const dailyAverages = {};
        Object.entries(ratingsByDay).forEach(([date, data]) => {
            dailyAverages[date] = data.sum / data.count;
        });
        
        // Store in trends
        analytics.trends.daily[trackPath] = dailyAverages;
        
        // Calculate weekly averages (last 7 days)
        const last7Days = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            last7Days.push(date.toISOString().split('T')[0]);
        }
        
        let weeklySum = 0;
        let weeklyCount = 0;
        
        last7Days.forEach(date => {
            if (ratingsByDay[date]) {
                weeklySum += ratingsByDay[date].sum;
                weeklyCount += ratingsByDay[date].count;
            }
        });
        
        if (weeklyCount > 0) {
            analytics.trends.weekly[trackPath] = weeklySum / weeklyCount;
        }
    });
}

/**
 * Get top rated tracks for a content type
 * @param {string} contentType - The content type (music, dj, ad)
 * @param {number} limit - Maximum number of tracks to return
 * @returns {Array} - Array of top rated tracks
 */
function getTopRated(contentType = 'music', limit = 10) {
    const analytics = loadAnalytics();
    if (!analytics || !analytics.topRated[contentType]) return [];
    
    return analytics.topRated[contentType].slice(0, limit);
}

/**
 * Get bottom rated tracks for a content type
 * @param {string} contentType - The content type (music, dj, ad)
 * @param {number} limit - Maximum number of tracks to return
 * @returns {Array} - Array of bottom rated tracks
 */
function getBottomRated(contentType = 'music', limit = 10) {
    const analytics = loadAnalytics();
    if (!analytics || !analytics.bottomRated[contentType]) return [];
    
    return analytics.bottomRated[contentType].slice(0, limit);
}

/**
 * Get outlier tracks (significantly above/below average)
 * @param {number} threshold - Z-score threshold (default: 2)
 * @returns {Object} - Object with positive and negative outliers
 */
function getOutliers(threshold = 2) {
    const analytics = loadAnalytics();
    if (!analytics || !analytics.outliers) return { positive: [], negative: [] };
    
    // Filter by threshold if different from default
    if (threshold !== 2) {
        return {
            positive: analytics.outliers.positive.filter(track => track.zScore >= threshold),
            negative: analytics.outliers.negative.filter(track => track.zScore <= -threshold)
        };
    }
    
    return analytics.outliers;
}

/**
 * Get rating trends over a specified timeframe
 * @param {string} timeframe - The timeframe (daily, weekly)
 * @returns {Object} - Trend data for the specified timeframe
 */
function getTrends(timeframe = 'weekly') {
    const analytics = loadAnalytics();
    if (!analytics || !analytics.trends || !analytics.trends[timeframe]) {
        return {};
    }
    
    return analytics.trends[timeframe];
}

// Initialize analytics on module load
initAnalytics();

module.exports = {
    generateAnalytics,
    getTopRated,
    getBottomRated,
    getOutliers,
    getTrends,
    loadAnalytics,
    saveAnalytics
};