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

// Cache for emoji images
const emojiImageCache = {};

// Cache for track-specific comments
let currentTrackComments = [];

// Emoji ratings mapping - imported from ratingsManager
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

/**
 * Load an emoji image from the assets directory
 * @param {string} emoji - The emoji character
 * @returns {Promise<Image>} - The loaded image
 */
async function loadEmojiImage(emoji) {
    // If we already have this emoji in cache, return it
    if (emojiImageCache[emoji]) {
        return emojiImageCache[emoji];
    }

    // Map emoji to filename (you'll need to create these image files)
    const emojiFilenames = {
        '🔇': 'mute.png',
        '😡': 'angry.png',
        '🤬': 'face_with_symbols_on_mouth.png',
        '🤡': 'clown_face.png',
        '👎': 'thumbs_down.png',
        '🫳': 'hand_palm_down.png',
        '👍': 'thumbs_up.png',
        '❤️': 'heart.png',
        '😍': 'heart_eyes.png',
        '🥰': 'heart_eyes.png',
        '🤩': 'star_struck.png'
    };

    const filename = emojiFilenames[emoji];
    if (!filename) {
        return null; // No image for this emoji
    }

    try {
        // Assuming emoji images are stored in an 'assets/emojis' directory
        const imagePath = path.join(__dirname, '../../assets/emojis', filename);
        if (!fs.existsSync(imagePath)) {
            console.warn(`Emoji image not found: ${imagePath}`);
            return null;
        }

        const image = await loadImage(imagePath);
        emojiImageCache[emoji] = image;
        return image;
    } catch (error) {
        console.error(`Error loading emoji image for ${emoji}:`, error);
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
        const isEmoji = Object.keys(EMOJI_RATINGS).some(emoji => 
            emoji === char || 
            (emoji.includes(char) && char.trim() !== '') || 
            (char.includes(emoji) && emoji.trim() !== '')
        );

        if (isEmoji) {
            // Find the matching emoji from our known list
            const matchingEmoji = Object.keys(EMOJI_RATINGS).find(emoji => 
                emoji === char || 
                (emoji.includes(char) && char.trim() !== '') || 
                (char.includes(emoji) && emoji.trim() !== '')
            );

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
                // Check if this character is an emoji using the same flexible comparison
                const isNextCharEmoji = Object.keys(EMOJI_RATINGS).some(emoji => 
                    emoji === text[j] || 
                    (emoji.includes(text[j]) && text[j].trim() !== '') || 
                    (text[j].includes(emoji) && emoji.trim() !== '')
                );

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

            // console.log(`🗨️ Fetched ${newComments.length} comments, cache now has ${comments.length} comments`);
            // if (comments.length > 0) {
            //     console.log(`🗨️ First comment: "${comments[0].text}"`);
            // }
        } catch (err) {
            console.error('Error fetching comments for overlay:', err);
        }
    }

    // Only show the comment box if enhanced engagement is enabled and we have comments
    const showCommentBox = STATION_CONFIG.enhancedEngagement?.enabled && comments.length > 0;

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

    // Rating on first line with track title but right-aligned
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'right';

    // Load and display a star image instead of text character
    try {
        // Check if the star image exists before trying to load it
        const starImagePath = path.join(__dirname, '../../assets/emojis/star.png');
        if (fs.existsSync(starImagePath)) {
            const starImage = await loadImage(starImagePath);
            const starSize = 36;
            const ratingText = ` ${rating.toPrecision(1)}`;
            const ratingWidth = ctx.measureText(ratingText).width;

            // Draw star image
            ctx.drawImage(
                starImage,
                W - 40 - ratingWidth - starSize,
                H - bandH + 40 - starSize + 8, // Align with text baseline
                starSize,
                starSize
            );

            // Draw rating number
            ctx.fillText(ratingText, W - 40, H - bandH + 40);
        } else {
            // Fallback to text if image doesn't exist
            // Use a font that supports colored emojis
            const originalFont = ctx.font;
            ctx.font = `bold 36px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
            ctx.fillText(`⭐ ${rating.toPrecision(1)}`, W - 40, H - bandH + 40);
            ctx.font = originalFont;
        }
    } catch (error) {
        // Fallback to text if image loading fails
        console.error('Error loading star image:', error);
        // Use a font that supports colored emojis
        const originalFont = ctx.font;
        ctx.font = `bold 36px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
        ctx.fillText(`⭐ ${rating.toPrecision(1)}`, W - 40, H - bandH + 40);
        ctx.font = originalFont;
    }

    ctx.textAlign = 'left';

    // Artist on the second line
    ctx.font = '28px sans-serif';
    ctx.fillText(artist, 40, H - bandH + 80);

    // Only draw the comment box if we should show it
    if (showCommentBox) {
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

        comments.forEach(async (comment, i) => {
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
            const authorText = `(${authorName})`;

            // Draw author on first line
            ctx.fillStyle = '#FFF';
            ctx.fillText(authorText, boxX + padding, y1);

            // Set font for comment text on second line
            ctx.font = '16px sans-serif';

            // Render the comment text with emoji images on second line
            // Remove any mute emoji from the text
            let commentText = comment.text;

            // Draw the comment text on the second line
            await renderTextWithEmojiImages(ctx, commentText, boxX + padding, y2, 16);
        });

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
    EMOJI_RATINGS
};
