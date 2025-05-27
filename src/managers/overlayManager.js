/**
 * Overlay Manager Module
 * 
 * Handles the rendering of the live overlay PNG with cover art, track info, rating, and chat comments.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { STATION_CONFIG } = require('../core/config');
const { getRandomCoverImage } = require('../core/streamer');
const { extractMetadata, fetchLastChatComments } = require('../utils');
const emojiMap             = require('../utils/emojiMap');
const emojiImageCache      = {};
const {EMOJI_RATINGS} = require('./ratingsManager');
const EMOJI_DIR = path.join(__dirname, '../../assets/emojis');

// Cache for track-specific comments
let currentTrackComments = [];


/**
 * Given an emoji character, return a loaded Image (or null).
 */
async function loadEmojiImage(emojiChar) {
    // fast cache‐hit
    if (emojiImageCache[emojiChar]) return emojiImageCache[emojiChar];

    console.log(`Debug: Looking up emoji character: "${emojiChar}" (Unicode: ${[...emojiChar].map(c => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(' ')})`);

    // Check for exact match first
    let fullPath = emojiMap[emojiChar];

    // If no exact match, try to find a close match
    if (!fullPath) {
        console.log(`No exact match for emoji "${emojiChar}" in emojiMap (${Object.keys(emojiMap).length} keys)`);

        // Try to find a close match by comparing code points
        const emojiCodePoints = [...emojiChar].map(c => c.codePointAt(0));
        let bestMatch = null;
        let bestMatchScore = 0;

        for (const key of Object.keys(emojiMap)) {
            const keyCodePoints = [...key].map(c => c.codePointAt(0));
            // Check if any code points match
            const matchingPoints = emojiCodePoints.filter(cp => keyCodePoints.includes(cp)).length;
            if (matchingPoints > bestMatchScore) {
                bestMatchScore = matchingPoints;
                bestMatch = key;
            }
        }

        if (bestMatch && bestMatchScore > 0) {
            console.log(`Found potential match: "${bestMatch}" with score ${bestMatchScore}`);
            fullPath = emojiMap[bestMatch];

            // Cache this mapping for future lookups
            emojiMap[emojiChar] = fullPath;
            console.log(`Added mapping for "${emojiChar}" -> "${bestMatch}" (${fullPath})`);
        } else {
            // As a last resort, try to find a file with a name that might match
            // Look for common emoji names based on the character
            const commonNames = {
                '👍': ['thumbs_up', '+1'],
                '👎': ['thumbs_down', '-1'],
                '❤️': ['heart', 'red_heart'],
                '❤': ['heart', 'red_heart'],
                '♥️': ['heart', 'red_heart'],
                '♥': ['heart', 'red_heart'],
                '😍': ['heart_eyes'],
                '🥰': ['smiling_hearts', 'smiling_face_with_hearts'],
                '🤩': ['star_struck', 'star_eyes'],
                '🔇': ['mute', 'muted_speaker'],
                '😡': ['angry', 'pouting_face'],
                '🤬': ['angry_cursing', 'face_with_symbols_on_mouth'],
                '🤡': ['clown', 'clown_face'],
                '🫳': ['hand_palm_down', 'palm_down_hand']
            };

            const possibleNames = commonNames[emojiChar] || [];
            if (possibleNames.length > 0) {
                console.log(`Trying common names for "${emojiChar}": ${possibleNames.join(', ')}`);

                // Check if any of these names exist in the assets directory
                for (const name of possibleNames) {
                    const possiblePath = path.join(EMOJI_DIR, `${name}.png`);
                    if (fs.existsSync(possiblePath)) {
                        fullPath = possiblePath;
                        console.log(`Found file for common name "${name}": ${fullPath}`);

                        // Cache this mapping for future lookups
                        emojiMap[emojiChar] = fullPath;
                        break;
                    }
                }
            }

            if (!fullPath) {
                console.warn(`No PNG asset found for emoji "${emojiChar}" after all attempts`);

                // Fallback to a default emoji or a similar one that exists
                const fallbackEmojis = {
                    '🔇': '😶', // No mouth emoji as fallback for mute
                    '👍': '+1.png',
                    '👎': '-1.png'
                };

                const fallbackPath = fallbackEmojis[emojiChar];
                if (fallbackPath) {
                    if (fallbackPath.endsWith('.png')) {
                        // Direct path to a PNG file
                        fullPath = path.join(EMOJI_DIR, fallbackPath);
                        console.log(`Using fallback PNG file for "${emojiChar}": ${fullPath}`);
                    } else {
                        // Another emoji character, recursively try to load it
                        console.log(`Using fallback emoji character for "${emojiChar}": "${fallbackPath}"`);
                        return await loadEmojiImage(fallbackPath);
                    }
                } else {
                    // If no specific fallback, try to use a generic emoji
                    const genericPath = path.join(EMOJI_DIR, 'slightly_smiling_face.png');
                    if (fs.existsSync(genericPath)) {
                        fullPath = genericPath;
                        console.log(`Using generic emoji for "${emojiChar}": ${fullPath}`);
                    } else {
                        return null;
                    }
                }
            }
        }
    }

    console.log(`Using path for emoji "${emojiChar}": ${fullPath}`);

    try {
        const img = await loadImage(fullPath);
        emojiImageCache[emojiChar] = img;
        return img;
    } catch (err) {
        console.error(`Failed loading ${fullPath}:`, err);

        // Try to use a generic emoji as a last resort
        try {
            const genericPath = path.join(EMOJI_DIR, 'slightly_smiling_face.png');
            if (fs.existsSync(genericPath)) {
                console.log(`Using generic emoji after load failure for "${emojiChar}": ${genericPath}`);
                const img = await loadImage(genericPath);
                emojiImageCache[emojiChar] = img;
                return img;
            }
        } catch (fallbackErr) {
            console.error(`Failed loading fallback emoji:`, fallbackErr);
        }

        return null;
    }
}

/**
 * Render text with emoji images
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to render
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} fontSize - Font size in pixels
 */
async function renderTextWithEmojiImages(ctx, text, x, y, fontSize) {
    let currentX = x;
    const emojiSize = fontSize * 1.2; // Make emojis slightly larger than text

    // Save current font
    const originalFont = ctx.font;

    // Process each character in the text
    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        // Check if this character is an emoji we know about
        // Need to handle different Unicode representations of emojis
        // But be more precise to avoid false positives with invisible characters

        // First, check for exact match which is the most reliable
        const isEmoji = Object.keys(EMOJI_RATINGS).includes(char);

        if (isEmoji) {
            // Use the exact matching emoji
            const matchingEmoji = char;

            // Log the detected emoji for debugging
            console.log(`Rendering emoji: "${char}" (Unicode: ${[...char].map(c => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(' ')})`);

            // Try to load emoji image
            const emojiImage = await loadEmojiImage(matchingEmoji);

            if (emojiImage) {
                // Draw emoji image
                ctx.drawImage(
                    emojiImage,
                    currentX,
                    y - emojiSize + (fontSize / 4), // Align with text baseline
                    emojiSize,
                    emojiSize
                );
                currentX += emojiSize;
            } else {
                // Fallback to text if image not available
                // Use a font that supports colored emojis
                ctx.font = `${fontSize}px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
                ctx.fillText(char, currentX, y);
                // Estimate width of emoji character (this is approximate)
                currentX += ctx.measureText(char).width;
                // Restore font for next characters
                ctx.font = originalFont;
            }
        } else {
            // For regular text, measure a chunk until the next emoji or end
            let textChunk = char;
            let j = i + 1;
            while (j < text.length) {
                // Check if this character is an emoji using the same strict comparison as above
                const isNextCharEmoji = Object.keys(EMOJI_RATINGS).includes(text[j]);

                if (isNextCharEmoji) {
                    break;
                }

                textChunk += text[j];
                j++;
            }

            // Draw the text chunk
            ctx.fillText(textChunk, currentX, y);
            currentX += ctx.measureText(textChunk).width;

            // Skip ahead since we've processed these characters
            i = j - 1;
        }
    }

    // Restore original font
    ctx.font = originalFont;
}

/**
 * Renders a live overlay PNG with cover art, track info, rating, and chat comments
 * @param {string} trackPath - Path to the track
 * @param {string} videoId - YouTube video ID for fetching comments
 * @param {boolean} clearComments - Whether to clear comments from the overlay
 * @returns {Promise<void>} - Promise that resolves when the overlay is updated
 */
async function updateOverlay(trackPath, videoId, clearComments = false) {
    const meta = extractMetadata(trackPath);
    const { title = 'Unknown Title', artist = 'Unknown Artist', rating = 0, picture } = meta;

    // Pick cover buffer
    const coverBuffer = (picture?.data && picture.data.length)
        ? picture.data
        : fs.readFileSync(getRandomCoverImage());

    // Clear comments cache if requested or if this is a new track
    if (clearComments) {
        currentTrackComments = [];
        console.log(`🗨️ Cleared comment cache for overlay`);
    }

    // Grab chat comments…
    let comments = [];
    if (!clearComments) {
        try { 
            // Fetch new comments
            const newComments = await fetchLastChatComments(videoId, 10);

            // Add new comments to our track-specific cache if they're not already there
            for (const comment of newComments) {
                // Check if this comment is already in our cache (by text and author)
                const isDuplicate = currentTrackComments.some(
                    c => c.text === comment.text && c.author === comment.author
                );

                if (!isDuplicate) {
                    currentTrackComments.push(comment);
                }
            }

            // Limit the cache to the most recent 10 comments
            if (currentTrackComments.length > 10) {
                currentTrackComments = currentTrackComments.slice(currentTrackComments.length - 10);
            }

            comments = [...currentTrackComments];

            console.log(`🗨️ Fetched ${newComments.length} comments, cache now has ${comments.length} comments`);
            if (comments.length > 0) {
                console.log(`🗨️ First comment: "${comments[0].text}" by ${comments[0].author}`);
            } else {
                console.log(`🗨️ No comments to display in overlay`);
            }
        } catch (err) {
            console.error('Error fetching comments for overlay:', err);
        }
    }

    // Always show the comment box if we have comments, regardless of enhanced engagement setting
    // This ensures comments are displayed even if the enhancedEngagement feature is not explicitly enabled
    const showCommentBox = comments.length > 0;

    // Canvas setup
    const W = 1280, H = 720;
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // 1) Draw cover art full-screen, cropped but keeping ratio
    const img = await loadImage(coverBuffer);
    const iw = img.width, ih = img.height;
    // scale so it *covers* the entire canvas
    const scale = Math.max(W/iw, H/ih);
    const nw = iw * scale, nh = ih * scale;
    const dx = (W - nw) / 2, dy = (H - nh) / 2;
    ctx.drawImage(img, dx, dy, nw, nh);

    // 2) Darken bottom band for text (reduced height)
    const bandH = 100; // Reduced from 140px
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, H - bandH, W, bandH);

    // 3) Draw track info
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(title, 40, H - bandH + 40);

    /**
     * Display the rating with a star image dynamically.
     * Aligns with text baseline and adjusts for compact and consistent rendering.
     * @param {CanvasRenderingContext2D} ctx - The canvas drawing context.
     * @param {number} rating - The numeric rating to display.
     * @param {number} x - X coordinate for drawing the rating.
     * @param {number} y - Y coordinate for drawing the rating.
     */
    async function renderRatingWithStar(ctx, rating, x, y) {
        if (!rating || rating <= 0) {
            return; // No rating to display
        }

        const starSize = 32; // Define the star image size (32x32 for compact display)
        const starImagePath = path.join(__dirname, '../../assets/emojis/star.png');

        try {
            // Load the star image
            const starImage = await loadImage(starImagePath);

            // Format the rating text
            const ratingText = `${rating.toPrecision(1)}`;
            const textWidth = ctx.measureText(ratingText).width;

            // Draw the star image
            const starX = x - textWidth - starSize - 8; // Position star to the left of the text
            const starY = y - starSize / 2; // Align vertically with the text baseline
            ctx.drawImage(starImage, starX, starY, starSize, starSize);

            // Draw the rating text, right-aligned
            ctx.textAlign = 'right';
            ctx.fillText(ratingText, x, y);
        } catch (error) {
            console.error('Error rendering star image for rating:', error);
        }
    }

    ctx.textAlign = 'left';

    // Artist on the second line
    ctx.font = '28px sans-serif';
    ctx.fillText(artist, 40, H - bandH + 80);

    // Only draw the comment box if we should show it
    if (showCommentBox) {
        console.log(`🗨️ Drawing comment box with ${comments.length} comments`);

        const padding = 20;
        const lineHeight = 28; // Increased line height for better emoji rendering
        const boxWidth = 400;
        // Use double line height to accommodate two lines per comment
        const doubleLineHeight = lineHeight * 2;
        // Calculate box height for two lines per comment
        const boxHeight = padding * 2 + comments.length * doubleLineHeight;
        const boxX = W - boxWidth - padding;
        const boxY = padding;

        // background box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        // draw each message
        ctx.fillStyle = '#FFF';

        // Get the track title for the current track
        const shortTitle = title.length > 25 ? title.substring(0, 22) + '...' : title;

        // Draw author + comment lines, one at a time, awaiting each
        for (let i = 0; i < comments.length; i++) {
            const comment = comments[i];
            // Calculate y positions for the two lines
            const y1 = boxY + padding + i * doubleLineHeight + (lineHeight / 2); // First line
            const y2 = y1 + lineHeight; // Second line

            // Set font for track title and author line
            ctx.font = 'bold 14px sans-serif';

            // Format the first line with just the author
            // "(Author)" - remove any text in brackets from the author name
            let authorName = comment.author;
            // Remove text in brackets from author name
            authorName = authorName.replace(/\s*\([^)]*\)\s*/g, '');
            const authorText = `${authorName}`;

            // Draw author on first line
            ctx.fillStyle = '#FFF';
            ctx.fillText(authorText, boxX + padding, y1);

            // Set font for comment text on second line
            ctx.font = '16px sans-serif';

            // Render the comment text with emoji images on second line
            // Remove any invisible characters and mute emoji from the text
            let commentText = comment.text;

            // Log the raw text for debugging
            console.log(`Raw comment text: "${commentText}" (Length: ${commentText.length})`);

            // Remove invisible characters (zero-width spaces, etc.)
            commentText = commentText.replace(/[\u200B-\u200F\uFEFF\u0000-\u001F]/g, '');

            // Log the cleaned text for debugging
            if (commentText !== comment.text) {
                console.log(`Cleaned comment text: "${commentText}" (Length: ${commentText.length})`);
            }

            // Draw the comment text on the second line
            await renderTextWithEmojiImages(ctx, commentText, boxX + padding, y2, 16);
        }

        //console.log('🖼️ Drew comment box with recent chat messages');
    } else if (STATION_CONFIG.enhancedEngagement?.enabled) {
        //console.log('🖼️ No comments to display in overlay');
    }


    // 5) Write out the PNG
    return new Promise((resolve, reject) => {
        // Write to a temporary file first
        const tempFile = '/tmp/overlay_temp.png';
        const out = fs.createWriteStream(tempFile);

        canvas.createPNGStream().pipe(out);

        out.once('finish', () => {
            try {
                // Atomically replace the overlay file
                fs.renameSync(tempFile, '/tmp/overlay.png');

                // Update the symbolic link if it exists
                if (fs.existsSync('/tmp/current_overlay.png')) {
                    // The symbolic link should already be pointing to /tmp/overlay.png
                    // No need to update it, just ensure the target file is updated
                    //console.log('🖼️ Updated overlay image');
                } else {
                    // If the symlink doesn't exist for some reason, create it
                    fs.symlinkSync('/tmp/overlay.png', '/tmp/current_overlay.png');
                    //console.log('🖼️ Created new symbolic link to overlay image');
                }

                resolve();
            } catch (err) {
                console.error('❌ Error updating overlay:', err);
                reject(err);
            }
        });

        out.once('error', (err) => {
            console.error('❌ Error writing overlay:', err);
            reject(err);
        });
    });
}

module.exports = {
    updateOverlay,
};
