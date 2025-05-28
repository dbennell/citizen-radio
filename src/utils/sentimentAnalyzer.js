/**
 * Sentiment Analyzer Module
 * 
 * Performs sentiment analysis on user comments to generate
 * human-readable sentiment summaries.
 * 
 * Uses OpenAI's LLM for advanced sentiment analysis, particularly
 * effective with emoji-heavy, slang, and meme-filled comments.
 */

const { STATION_CONFIG } = require('../core/config');
const { OpenAI } = require('openai');

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

/**
 * Analyze sentiment using OpenAI's LLM
 * @param {Array} comments - Array of comment objects with text content
 * @returns {Promise<Object>} - Sentiment analysis results from LLM
 */
async function analyzeSentimentWithLLM(comments) {
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
        return {
            overall: 'neutral',
            score: 0,
            summary: 'No comments to analyze',
            themes: {}
        };
    }

    try {
        // Initialize OpenAI client
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Format the comments for the prompt
        const formattedComments = comments.map(comment => {
            return {
                trackPath: comment.trackPath || 'Unknown Track',
                rating: comment.rating || 0,
                author: comment.author || 'Anonymous',
                comment: comment.comment || comment.text || '',
                timestamp: comment.timestamp || new Date().toISOString()
            };
        });

        // Create a prompt for the LLM
        const prompt = `
Below is feedback data for a track played on a radio stream.
Can you provide a sentiment analysis summary for this track based on the ratings and associated comments?

${JSON.stringify(formattedComments, null, 2)}

Please provide:
1. An overall sentiment assessment (positive, negative, or neutral)
2. A human-readable summary of the sentiment that captures the essence of the feedback
3. Any notable themes or patterns in the comments
`;

        // Call the OpenAI API
        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are a sentiment analysis expert specializing in analyzing music feedback. You're particularly good at understanding emoji, slang, and memes in comments. Provide concise, insightful summaries."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        // Extract the sentiment summary from the response
        const sentimentSummary = response.choices[0].message.content.trim();

        // Parse the overall sentiment from the summary
        let overallSentiment = 'neutral';
        if (sentimentSummary.toLowerCase().includes('positive')) {
            overallSentiment = sentimentSummary.toLowerCase().includes('very positive') ? 'very positive' : 'somewhat positive';
        } else if (sentimentSummary.toLowerCase().includes('negative')) {
            overallSentiment = sentimentSummary.toLowerCase().includes('very negative') ? 'very negative' : 'somewhat negative';
        }

        // Calculate an approximate score based on the overall sentiment
        let score = 0;
        if (overallSentiment === 'very positive') score = 0.8;
        else if (overallSentiment === 'somewhat positive') score = 0.4;
        else if (overallSentiment === 'somewhat negative') score = -0.4;
        else if (overallSentiment === 'very negative') score = -0.8;

        // Return the results in the same format as the original analyzeSentiment function
        return {
            overall: overallSentiment,
            score: score,
            summary: sentimentSummary,
            themes: {}, // LLM analysis doesn't categorize themes in the same way
            distribution: {
                positive: 0, // We don't have exact counts from the LLM
                negative: 0,
                neutral: 0
            },
            llmGenerated: true // Flag to indicate this was generated by an LLM
        };
    } catch (error) {
        console.error('Error analyzing sentiment with LLM:', error);

        // Fall back to the keyword-based approach if LLM fails
        console.log('Falling back to keyword-based sentiment analysis');
        return analyzeSentiment(comments);
    }
}

/**
 * Main sentiment analysis function that decides whether to use LLM or keyword-based approach
 * @param {Array} comments - Array of comment objects with text content
 * @returns {Promise<Object>|Object} - Sentiment analysis results
 */
async function analyzeSentimentMain(comments) {
    // Check if LLM-based sentiment analysis is enabled in the config
    const useLLM = STATION_CONFIG.enhancedEngagement?.useLLMSentimentAnalysis === true;

    if (useLLM) {
        try {
            return await analyzeSentimentWithLLM(comments);
        } catch (error) {
            console.error('LLM sentiment analysis failed, falling back to keyword-based:', error);
            return analyzeSentiment(comments);
        }
    } else {
        // Use the original keyword-based approach
        return analyzeSentiment(comments);
    }
}

// For backward compatibility, we keep the original function name but make it async
// This allows existing code to continue working without changes
const originalAnalyzeSentiment = analyzeSentiment;
analyzeSentiment = async function(comments) {
    return await analyzeSentimentMain(comments);
};

module.exports = {
    analyzeSentiment
};
