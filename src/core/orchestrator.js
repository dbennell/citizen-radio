const fs = require('fs');
const path = require('path');
const { pickNextTrack } = require('../managers/trackManager');
const { getLastPlays, appendPlayLog } = require('../managers/playLogManager');
const { generateSegway, prepareSegway } = require('../processors/promptProcessor');
const { playFile, streamFile, getRandomCoverImage } = require('./streamer');
const { STATION_CONFIG, READY_DIR } = require('./config');
const chalk = require('chalk').default;
const ratingManager = require('../managers/ratingsManager');
const { EMOJI_RATINGS } = ratingManager; // Import emoji ratings mapping
const { fetchLiveVideoId, extractMetadata, fetchLastChatComments } = require('../utils');
const { createCanvas, loadImage } = require('canvas'); // npm install canvas
const ContentQueueManager = require('../managers/contentQueueManager');

let shouldStop = false;
let stopAfterNextMusic = false;
let persistentVideoId = STATION_CONFIG.youtube?.videoId || null;
let contentQueue = null;

// Cache for emoji images
const emojiImageCache = {};

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
        '🤬': 'angry_cursing.png',
        '🤡': 'clown.png',
        '👎': 'thumbs_down.png',
        '🫳': 'hand_palm_down.png',
        '👍': 'thumbs_up.png',
        '❤️': 'heart.png',
        '😍': 'heart_eyes.png',
        '🥰': 'smiling_hearts.png',
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
        if (Object.keys(EMOJI_RATINGS).includes(char)) {
            // Try to load emoji image
            const emojiImage = await loadEmojiImage(char);

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
            while (j < text.length && !Object.keys(EMOJI_RATINGS).includes(text[j])) {
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
 */
async function updateOverlay(trackPath, videoId) {
    const meta = extractMetadata(trackPath);
    const { title = 'Unknown Title', artist = 'Unknown Artist', rating = 0, picture } = meta;

    // Pick cover buffer
    const coverBuffer = (picture?.data && picture.data.length)
        ? picture.data
        : fs.readFileSync(getRandomCoverImage());

    // Grab chat comments…
    let comments = [];
    try { 
        comments = await fetchLastChatComments(videoId, 10); 
        // console.log(`🗨️ Fetched ${comments.length} comments for overlay`);
        // if (comments.length > 0) {
        //     console.log(`🗨️ First comment: "${comments[0]}"`);
        // }
    } catch (err) {
        console.error('Error fetching comments for overlay:', err);
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
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'right';

    // Load and display a star image instead of text character
    try {
        // Check if the star image exists before trying to load it
        const starImagePath = path.join(__dirname, '../../assets/emojis/star.png');
        if (fs.existsSync(starImagePath)) {
            const starImage = await loadImage(starImagePath);
            const starSize = 36;
            const ratingText = ` ${rating}`;
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
            ctx.fillText(`⭐ ${rating}`, W - 40, H - bandH + 40);
            ctx.font = originalFont;
        }
    } catch (error) {
        // Fallback to text if image loading fails
        console.error('Error loading star image:', error);
        // Use a font that supports colored emojis
        const originalFont = ctx.font;
        ctx.font = `bold 36px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
        ctx.fillText(`⭐ ${rating}`, W - 40, H - bandH + 40);
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
        const boxHeight = padding * 2 + comments.length * lineHeight;
        const boxX = W - boxWidth - padding;
        const boxY = padding;

        // background box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        // draw each message
        ctx.fillStyle = '#FFF';

        // Get the track title for labeling comments
        const shortTitle = title.length > 25 ? title.substring(0, 22) + '...' : title;

        // Use a font family that has good emoji support
        ctx.font = 'bold 20px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';
        ctx.textAlign = 'left';

        // Draw header for comment box
        ctx.fillText(`Comments for: ${shortTitle}`, boxX + padding, boxY + padding);

        // Draw a separator line
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(boxX + padding, boxY + padding + 10, boxWidth - (padding * 2), 1);
        ctx.fillStyle = '#FFF';

        // Use a slightly different font for comments
        ctx.font = '18px sans-serif';

        // Render each comment with emoji images
        comments.forEach(async (msg, i) => {
            const y = boxY + padding + 20 + (i + 1) * lineHeight - (lineHeight / 4);
            await renderTextWithEmojiImages(ctx, msg, boxX + padding, y, 18);
        });

        //console.log('🖼️ Drew comment box with recent chat messages');
    } else if (STATION_CONFIG.enhancedEngagement?.enabled) {
        //console.log('🖼️ No comments to display in overlay');
    }

    // // 4) Draw last 10 comments above the band
    // ctx.font = '20px monospace';
    // comments.forEach((c,i) => {
    //     const y = H - bandH - 20 - (comments.length - 1 - i)*24;
    //     ctx.fillText(`• ${c}`, 40, y);
    // });


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


/**
 * Fetches or returns a cached YouTube Live videoId for chat polling
 */
async function getPersistentVideoId() {
    if (persistentVideoId) return persistentVideoId;
    try {
        console.log('🔍 VideoId not set, fetching dynamically...');
        const fetchedId = await fetchLiveVideoId();
        if (fetchedId) {
            console.log(`✅ Fetched videoId: ${fetchedId}`);
            persistentVideoId = fetchedId;
            return persistentVideoId;
        }
    } catch (err) {
        console.error('🚨 Error fetching videoId:', err.message);
    }
    console.warn('⚠ VideoId missing: live chat disabled');
    return null;
}

/**
 * Main playback loop
 */
async function playbackLoop() {
    const pattern = STATION_CONFIG.schedule.defaultPattern;
    const { historySize = 16, weights = {} } = STATION_CONFIG.trackHistory || {};
    const includePodcasts = !!STATION_CONFIG.djOptions?.includePodcasts;

    const uptimeMs = typeof STATION_CONFIG.uptimeHours === 'number'
        ? STATION_CONFIG.uptimeHours * 3600 * 1000
        : null;
    const startTime = Date.now();

    const vid = await getPersistentVideoId();
    if (vid) console.log('📹 Live commenting enabled:', vid);

    console.log(chalk.yellow(`▶️ Starting playback: ${pattern.join(', ')}`));
    console.log(chalk.magenta(`⏱️ Uptime: ${STATION_CONFIG.uptimeHours || '∞'}h, mode: ${STATION_CONFIG.uptimeMode || 'none'}`));

    // Initialize content queue
    contentQueue = new ContentQueueManager({
        pattern
    });

    await contentQueue.initialize();
    console.log(chalk.blue(`📋 Content queue initialized with ${contentQueue.queueLength} items`));

    // Variable to track the periodic feedback polling interval
    let feedbackPollingInterval = null;

    while (!shouldStop) {
        // Uptime enforcement
        if (uptimeMs !== null) {
            const elapsed = Date.now() - startTime;
            if (STATION_CONFIG.uptimeMode === 'cycle' && elapsed >= uptimeMs) {
                console.log('🛑 Uptime reached: ending cycle');
                break;
            }
            if (STATION_CONFIG.uptimeMode === 'track' && elapsed >= uptimeMs) {
                console.log('🛑 Uptime reached: stopping after next track');
                stopAfterNextMusic = true;
            }
        }

        // Only log "New playback cycle" when we're at the beginning of the pattern
        if (contentQueue.currentPatternIndex === 0) {
            console.log(chalk.green(`🎧 New playback cycle at ${new Date().toLocaleTimeString()}`));
        }

        // Get the next item from the queue
        const queueItem = contentQueue.getNextItem();

        if (!queueItem) {
            console.warn('⚠️ Content queue is empty, waiting for replenishment...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
        }

        try {
            // Play segway if available
            if (queueItem.segway && queueItem.segway.filepath) {
                try {
                    console.log(`🔄 Playing queued segway before ${queueItem.type}: "${queueItem.meta.title}"`);

                    if (STATION_CONFIG.streamMode === 'youtube') {
                        await streamFile(queueItem.segway.filepath);
                    } else {
                        await playFile(queueItem.segway.filepath);
                    }

                    // Delete segway file after playing
                    if (fs.existsSync(queueItem.segway.filepath)) {
                        fs.unlinkSync(queueItem.segway.filepath);
                    }
                } catch (segwayErr) {
                    console.error('Error playing segway:', segwayErr);
                }
            }

            // Play the main content
            try {
                const trackRel = path.relative(READY_DIR(''), queueItem.filepath);

                if (queueItem.type === 'music' && STATION_CONFIG.ratingSystem?.enabled) {
                    ratingManager.setCurrentlyPlaying({ 
                        trackRel, 
                        title: queueItem.meta.title, 
                        artist: queueItem.meta.artist, 
                        type: queueItem.type 
                    });
                    const windowStart = ratingManager.openCommentWindow();
                    console.log(`📊 Rating: tracking "${queueItem.meta.title}" from ${windowStart}`);

                    // Clear any existing polling interval
                    if (feedbackPollingInterval) {
                        clearInterval(feedbackPollingInterval);
                        feedbackPollingInterval = null;
                    }

                    // Set up periodic feedback polling based on configuration
                    if (STATION_CONFIG.enhancedEngagement?.enabled && vid) {
                        // Get the configured interval (in seconds) or default to 5 seconds
                        const checkIntervalSeconds = STATION_CONFIG.ratingSystem?.commentCheckInterval || 5;
                        const checkIntervalMs = checkIntervalSeconds * 1000;

                        feedbackPollingInterval = setInterval(async () => {
                            try {
                                // Poll for new comments
                                const count = await ratingManager.pollForComments(vid);
                                if (count > 0) {
                                    console.log(`📊 Collected ${count} comment${count===1?'':'s'} during playback`);

                                    // Update the overlay with new comments
                                    if (STATION_CONFIG.streamMode === 'youtube') {
                                        await updateOverlay(queueItem.filepath, vid);
                                    }
                                }
                            } catch (error) {
                                console.error('Error polling for comments:', error);
                            }
                        }, checkIntervalMs); // Check based on configured interval
                    }
                }

                if (STATION_CONFIG.streamMode === 'youtube') {
                    await updateOverlay(queueItem.filepath, vid);
                    await streamFile(queueItem.filepath);
                } else {
                    await playFile(queueItem.filepath);
                }

                // Log the play
                appendPlayLog(trackRel, queueItem.type, queueItem.meta);

                if (queueItem.type === 'music' && STATION_CONFIG.ratingSystem?.enabled) {
                    // Clear the polling interval
                    if (feedbackPollingInterval) {
                        clearInterval(feedbackPollingInterval);
                        feedbackPollingInterval = null;
                    }

                    const windowEnd = ratingManager.closeCommentWindow();
                    const count = await ratingManager.pollForComments(vid);
                    console.log(`📊 Collected ${count} comment${count===1?'':'s'} up to ${windowEnd}`);
                }
            } catch (playErr) {
                console.error(`Error streaming ${queueItem.type} "${queueItem.meta.title}":`, playErr);

                // If we're in YouTube mode, try to recover the streaming pipeline
                if (STATION_CONFIG.streamMode === 'youtube') {
                    try {
                        console.log('🔄 Attempting to recover streaming pipeline...');
                        const { recoverStreamingPipeline } = require('./streamer');
                        await recoverStreamingPipeline();
                        console.log('✅ Streaming pipeline recovery complete, continuing playback');
                    } catch (recoverErr) {
                        console.error('❌ Failed to recover streaming pipeline:', recoverErr);
                        // Add a delay before continuing to avoid rapid failure loops
                        console.log('⏱️ Waiting before continuing playback...');
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            }
        } catch (err) {
            console.error(`Error playing queued content:`, err);
        }

        // Check if we should stop after music
        if (stopAfterNextMusic && queueItem.type === 'music') {
            console.log('🛑 Stopping after this music track.');
            shouldStop = true;
            break;
        }
    }
}

// Helper for DJ/podcast mix
async function pickNextTrackWithPodcasts() {
    const djDir = READY_DIR('dj');
    const podDir = READY_DIR('podcast');
    const djFiles = fs.readdirSync(djDir).map(f => path.join(djDir, f));
    const podFiles = fs.readdirSync(podDir).map(f => path.join(podDir, f));
    const all = [...djFiles, ...podFiles].filter(f => /\.(mp3|wav)$/i.test(f));
    if (!all.length) return null;
    const choice = all[Math.floor(Math.random() * all.length)];
    const meta = await extractMetadata(choice);
    return { filepath: choice, meta };
}

function stopPlayback() { 
    shouldStop = true; 

    // Clean up content queue if it exists
    if (contentQueue) {
        contentQueue.cleanup();
    }
}

function requestStop() { 
    stopAfterNextMusic = true; 
}

/**
 * Get the current content queue instance
 * @returns {ContentQueueManager|null} The content queue instance or null if not initialized
 */
function getContentQueue() {
    return contentQueue;
}

module.exports = {
    playbackLoop,
    stopPlayback,
    requestStop,
    getPersistentVideoId,
    getContentQueue
};
