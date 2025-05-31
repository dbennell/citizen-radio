/**
 * Overlay Manager Module
 * 
 * Handles the rendering of the live overlay PNG with cover art, track info, rating, and chat comments.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const { STATION_CONFIG } = require('../core/config');
const { getRandomCoverImage } = require('../core/streamer');
const { extractMetadata, fetchLastChatComments } = require('../utils');
const {EMOJI_RATINGS} = require('./ratingsManager');

// Register fonts
const FONTS_DIR = path.join(__dirname, '../../assets/fonts');
registerFont(path.join(FONTS_DIR, 'NotoColorEmoji-Regular.ttf'), { family: 'Noto Color Emoji' });
registerFont(path.join(FONTS_DIR, 'TheConfessionRegular-YBpv.ttf'), { family: 'The Confession' });

// Cache for track-specific comments
let currentTrackComments = [];



/**
 * Render text with emoji support using emoji image mapping
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to render
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} fontSize - Font size in pixels
 */
async function renderTextWithEmojiImages(ctx, text, x, y, fontSize) {
    // Import the emoji map
    const emojiMap = require('../utils/emojiMap');

    // Save current font and style
    const originalFont = ctx.font;
    const originalFillStyle = ctx.fillStyle;

    // First, preprocess the text to handle emojis surrounded by colons
    // This will convert patterns like ":🖖:" to just "🖖" with proper spacing
    text = text.replace(/:([\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]):/gu, " $1 ");

    // Ensure proper spacing by normalizing spaces
    text = text.replace(/\s+/g, " ").trim();

    // Split text into chunks (emoji vs. regular text)
    const chunks = [];
    let currentChunk = '';
    let currentType = 'text'; // 'text' or 'emoji'

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const isEmojiChar = /[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u.test(char);

        if (isEmojiChar && currentType !== 'emoji') {
            // Switching from text to emoji
            if (currentChunk) {
                chunks.push({ type: currentType, text: currentChunk });
                currentChunk = '';
            }
            currentType = 'emoji';
            currentChunk = char;
        } else if (!isEmojiChar && currentType !== 'text') {
            // Switching from emoji to text
            if (currentChunk) {
                chunks.push({ type: currentType, text: currentChunk });
                currentChunk = '';
            }
            currentType = 'text';
            currentChunk = char;
        } else {
            // Continuing current chunk
            currentChunk += char;
        }
    }

    // Add the last chunk
    if (currentChunk) {
        chunks.push({ type: currentType, text: currentChunk });
    }

    // Render each chunk
    let currentX = x;
    for (const chunk of chunks) {
        if (chunk.type === 'emoji') {
            // For each emoji character, check if we have a matching PNG
            for (const emojiChar of chunk.text) {
                if (emojiMap[emojiChar]) {
                    // We have a PNG for this emoji, load and draw it
                    try {
                        const img = await loadImage(emojiMap[emojiChar]);
                        const emojiSize = fontSize * 1.2; // Make emoji slightly larger than text
                        ctx.drawImage(img, currentX, y - emojiSize, emojiSize, emojiSize);
                        currentX += emojiSize;
                    } catch (err) {
                        console.error(`Error loading emoji image for ${emojiChar}:`, err);
                        // Fallback to text rendering if image loading fails
                        ctx.font = originalFont;
                        ctx.fillText(emojiChar, currentX, y);
                        currentX += ctx.measureText(emojiChar).width;
                    }
                } else {
                    // No PNG for this emoji, render as text
                    ctx.font = originalFont;
                    ctx.fillText(emojiChar, currentX, y);
                    currentX += ctx.measureText(emojiChar).width;
                }
            }
            // Add a little extra space after emojis
            currentX += fontSize * 0.2;
        } else {
            // Render regular text with canvas
            ctx.font = originalFont;
            ctx.fillText(chunk.text, currentX, y);

            // Advance position
            currentX += ctx.measureText(chunk.text).width;
        }
    }

    // Restore original styles
    ctx.font = originalFont;
    ctx.fillStyle = originalFillStyle;
}

/**
 * Renders a live overlay PNG with cover art, track info, rating, and chat comments
 * @param {string} trackPath - Path to the track
 * @param {string} videoId - YouTube video ID for fetching comments
 * @param {boolean} clearComments - Whether to clear comments from the overlay
 * @returns {Promise<void>} - Promise that resolves when the overlay is updated
 */
async function updateOverlay(trackPath, videoId, clearComments = false) {
    const meta = extractMetadata(trackPath) || {};
    const { title = 'Unknown Title', artist = 'Unknown Artist', rating = 0, picture } = meta;

    // Pick cover buffer
    const coverBuffer = (picture?.data && picture.data.length)
        ? picture.data
        : fs.readFileSync(getRandomCoverImage());

    // Clear comments cache if requested or if this is a new track
    if (clearComments) {
        currentTrackComments = [];
        //console.log(`🗨️ Cleared comment cache for overlay`);
    }

    // Grab chat comments…
    let comments = [];
    if (!clearComments) {
        try {
            // Fetch new comments
            const newComments = await fetchLastChatComments(videoId, 10);

            // Check if newComments is an array and has entries
            if (Array.isArray(newComments) && newComments.length > 0) {
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
            } else {
                console.log('🗨️ No new comments fetched or no comment data available.');
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
    if (artist != null) {
        // Artist on the second line if there is one
        ctx.font = '28px sans-serif';
        ctx.fillText(artist, 40, H - bandH + 80);
    }

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

            // Set font for comment text on second line - include emoji fonts
            ctx.font = '16px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';

            // Render the comment text with emoji support on second line
            // Remove any invisible characters from the text
            let commentText = comment.text;

            // Log the raw text for debugging
            console.log(`Raw comment text: "${commentText}" (Length: ${commentText.length})`);

            // Remove invisible characters (zero-width spaces, etc.)
            commentText = commentText.replace(/[\u200B-\u200F\uFEFF\u0000-\u001F]/g, '');

            // Log the cleaned text for debugging
            if (commentText !== comment.text) {
                console.log(`Cleaned comment text: "${commentText}" (Length: ${commentText.length})`);
            }

            // Separate emojis from the main message for better visual clarity
            // If the message starts with emojis followed by text, add extra spacing
            const emojiPrefix = commentText.match(/^([\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}](\s*:)?)+/u);
            if (emojiPrefix && emojiPrefix[0].length < commentText.length) {
                // Add extra spacing between emoji prefix and the rest of the message
                const prefix = emojiPrefix[0];
                const rest = commentText.substring(prefix.length).trim();
                commentText = prefix + "   " + rest;
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

                // Use direct file copy instead of symlink for faster image updates
                try {
                    // Copy the file directly instead of using a symlink
                    // This helps reduce the lag between audio and image transitions
                    fs.copyFileSync('/tmp/overlay.png', '/tmp/current_overlay.png');
                    //console.log('🖼️ Updated overlay image with direct file copy for faster transitions');
                } catch (err) {
                    console.error('❌ Error copying overlay image:', err);
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
    updateOverlay
};
