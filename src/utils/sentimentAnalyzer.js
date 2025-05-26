/**
 * Sentiment Analyzer Module
 * 
 * Performs basic sentiment analysis on user comments to generate
 * human-readable sentiment summaries.
 */

const { STATION_CONFIG } = require('../core/config');

// Sentiment keywords
const POSITIVE_KEYWORDS = [
    'love', 'great', 'awesome', 'amazing', 'excellent', 'good', 'best', 
    'fantastic', 'wonderful', 'brilliant', 'superb', 'perfect', 'favorite',
    'enjoy', 'like', 'beautiful', 'outstanding', 'incredible', 'impressive',
    'happy', 'joy', 'excited', 'fun', 'cool', 'nice', 'sweet', 'solid'
];

const NEGATIVE_KEYWORDS = [
    'hate', 'bad', 'terrible', 'awful', 'horrible', 'worst', 'poor', 
    'disappointing', 'dislike', 'boring', 'annoying', 'mediocre', 'weak',
    'waste', 'sucks', 'rubbish', 'trash', 'garbage', 'dreadful', 'pathetic',
    'sad', 'angry', 'frustrating', 'irritating', 'lame', 'meh', 'skip'
];

const NEUTRAL_KEYWORDS = [
    'okay', 'ok', 'average', 'alright', 'fine', 'decent', 'moderate',
    'passable', 'fair', 'middle', 'medium', 'standard', 'usual', 'common',
    'regular', 'normal', 'typical', 'ordinary', 'so-so', 'meh'
];

// Themes for categorizing comments
const THEMES = {
    'beat': ['beat', 'rhythm', 'tempo', 'bass', 'drums', 'groove'],
    'lyrics': ['lyrics', 'words', 'message', 'meaning', 'story', 'verse', 'chorus'],
    'melody': ['melody', 'tune', 'catchy', 'hook', 'harmonies', 'notes'],
    'vocals': ['vocals', 'voice', 'singing', 'singer', 'vocal'],
    'production': ['production', 'mix', 'sound', 'quality', 'mastering', 'audio'],
    'energy': ['energy', 'vibe', 'mood', 'atmosphere', 'feel', 'emotion'],
    'originality': ['original', 'unique', 'creative', 'different', 'fresh', 'innovative']
};

/**
 * Analyze sentiment in a collection of comments
 * @param {Array} comments - Array of comment objects with text content
 * @returns {Object} - Sentiment analysis results
 */
function analyzeSentiment(comments) {
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
        return {
            overall: 'neutral',
            score: 0,
            summary: 'No comments to analyze',
            themes: {}
        };
    }
    
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    let totalScore = 0;
    
    // Theme tracking
    const themeOccurrences = {};
    Object.keys(THEMES).forEach(theme => {
        themeOccurrences[theme] = {
            positive: 0,
            negative: 0,
            neutral: 0,
            total: 0
        };
    });
    
    // Process each comment
    comments.forEach(comment => {
        const text = (comment.comment || comment.text || '').toLowerCase();
        if (!text) return;
        
        // Calculate sentiment score for this comment
        let commentScore = 0;
        let foundPositive = false;
        let foundNegative = false;
        
        // Check for positive keywords
        POSITIVE_KEYWORDS.forEach(keyword => {
            if (text.includes(keyword)) {
                commentScore += 1;
                foundPositive = true;
            }
        });
        
        // Check for negative keywords
        NEGATIVE_KEYWORDS.forEach(keyword => {
            if (text.includes(keyword)) {
                commentScore -= 1;
                foundNegative = true;
            }
        });
        
        // Check for neutral keywords if no strong sentiment detected
        if (!foundPositive && !foundNegative) {
            NEUTRAL_KEYWORDS.forEach(keyword => {
                if (text.includes(keyword)) {
                    commentScore = 0;
                }
            });
        }
        
        // Categorize comment sentiment
        if (commentScore > 0) {
            positiveCount++;
        } else if (commentScore < 0) {
            negativeCount++;
        } else {
            neutralCount++;
        }
        
        // Add to total score
        totalScore += commentScore;
        
        // Identify themes in the comment
        Object.entries(THEMES).forEach(([theme, keywords]) => {
            let themeFound = false;
            
            keywords.forEach(keyword => {
                if (text.includes(keyword)) {
                    themeFound = true;
                }
            });
            
            if (themeFound) {
                themeOccurrences[theme].total++;
                
                if (commentScore > 0) {
                    themeOccurrences[theme].positive++;
                } else if (commentScore < 0) {
                    themeOccurrences[theme].negative++;
                } else {
                    themeOccurrences[theme].neutral++;
                }
            }
        });
    });
    
    // Calculate overall sentiment
    const totalComments = positiveCount + negativeCount + neutralCount;
    const normalizedScore = totalComments > 0 ? totalScore / totalComments : 0;
    
    let overallSentiment;
    if (normalizedScore >= 0.5) {
        overallSentiment = 'very positive';
    } else if (normalizedScore > 0) {
        overallSentiment = 'somewhat positive';
    } else if (normalizedScore === 0) {
        overallSentiment = 'neutral';
    } else if (normalizedScore > -0.5) {
        overallSentiment = 'somewhat negative';
    } else {
        overallSentiment = 'very negative';
    }
    
    // Generate summary text
    let summary = generateSummary(positiveCount, negativeCount, neutralCount, themeOccurrences);
    
    // Prepare theme analysis
    const themeAnalysis = {};
    Object.entries(themeOccurrences).forEach(([theme, counts]) => {
        if (counts.total > 0) {
            themeAnalysis[theme] = {
                sentiment: counts.positive > counts.negative ? 'positive' : 
                           counts.negative > counts.positive ? 'negative' : 'neutral',
                mentions: counts.total,
                distribution: {
                    positive: counts.positive,
                    negative: counts.negative,
                    neutral: counts.neutral
                }
            };
        }
    });
    
    return {
        overall: overallSentiment,
        score: normalizedScore,
        summary: summary,
        themes: themeAnalysis,
        distribution: {
            positive: positiveCount,
            negative: negativeCount,
            neutral: neutralCount
        }
    };
}

/**
 * Generate a human-readable summary of sentiment analysis
 * @param {number} positive - Count of positive comments
 * @param {number} negative - Count of negative comments
 * @param {number} neutral - Count of neutral comments
 * @param {Object} themes - Theme occurrences data
 * @returns {string} - Human-readable summary
 */
function generateSummary(positive, negative, neutral, themes) {
    const total = positive + negative + neutral;
    if (total === 0) return 'No comments to analyze';
    
    let summary = '';
    
    // Overall sentiment distribution
    const positivePercent = Math.round((positive / total) * 100);
    const negativePercent = Math.round((negative / total) * 100);
    
    if (positivePercent >= 75) {
        summary = 'Overwhelmingly positive feedback';
    } else if (positivePercent >= 60) {
        summary = 'Mostly positive feedback';
    } else if (positivePercent >= 40 && negativePercent >= 40) {
        summary = 'Mixed feedback with both positive and negative comments';
    } else if (negativePercent >= 60) {
        summary = 'Mostly negative feedback';
    } else if (negativePercent >= 75) {
        summary = 'Overwhelmingly negative feedback';
    } else {
        summary = 'Balanced feedback with no strong sentiment trend';
    }
    
    // Add theme insights
    const significantThemes = [];
    Object.entries(themes).forEach(([theme, counts]) => {
        // Only include themes with significant mentions
        if (counts.total >= Math.max(2, Math.floor(total * 0.1))) {
            const themePositivePercent = Math.round((counts.positive / counts.total) * 100);
            const themeNegativePercent = Math.round((counts.negative / counts.total) * 100);
            
            if (themePositivePercent >= 70) {
                significantThemes.push(`praise for the ${theme}`);
            } else if (themeNegativePercent >= 70) {
                significantThemes.push(`criticism of the ${theme}`);
            }
        }
    });
    
    // Add theme insights to summary
    if (significantThemes.length > 0) {
        if (significantThemes.length === 1) {
            summary += ` with ${significantThemes[0]}`;
        } else if (significantThemes.length === 2) {
            summary += ` with ${significantThemes[0]} and ${significantThemes[1]}`;
        } else {
            const lastTheme = significantThemes.pop();
            summary += ` with ${significantThemes.join(', ')}, and ${lastTheme}`;
        }
    }
    
    return summary;
}

module.exports = {
    analyzeSentiment
};