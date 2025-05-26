const fs = require('fs');
const path = require('path');
const { pickNextTrack } = require('../managers/trackManager');
const { getLastPlays, appendPlayLog } = require('../managers/playLogManager');
const { generateSegway, prepareSegway } = require('../processors/promptProcessor');
const { playFile, streamFile, getRandomCoverImage } = require('./streamer');
const { STATION_CONFIG, READY_DIR } = require('./config');
const chalk = require('chalk').default;
const ratingManager = require('../managers/ratingsManager');
const engagementMonitor = require('../managers/engagementMonitor');
const overlayManager = require('../managers/overlayManager');
const { fetchLiveVideoId, extractMetadata } = require('../utils');
const ContentQueueManager = require('../managers/contentQueueManager');

let shouldStop = false;
let stopAfterNextMusic = false;
let persistentVideoId = STATION_CONFIG.youtube?.videoId || null;
let contentQueue = null;



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
                    // Reset engagement monitor comments when changing tracks
                    if (STATION_CONFIG.enhancedEngagement?.enabled && engagementMonitor) {
                        engagementMonitor.resetComments();
                        console.log(`🗨️ Cleared engagement monitor comments for new track: "${queueItem.meta.title}"`);
                    }

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
                                        await overlayManager.updateOverlay(queueItem.filepath, vid);
                                    }
                                }
                            } catch (error) {
                                console.error('Error polling for comments:', error);
                            }
                        }, checkIntervalMs); // Check based on configured interval
                    }
                }

                if (STATION_CONFIG.streamMode === 'youtube') {
                    // Clear comments when starting a new track
                    await overlayManager.updateOverlay(queueItem.filepath, vid, true);
                    await streamFile(queueItem.filepath);
                } else {
                    await playFile(queueItem.filepath);
                }

                // Log the play
                try {
                    appendPlayLog(trackRel, queueItem.type, queueItem.meta);
                    console.log(`✅ Logged play: ${queueItem.type} "${queueItem.meta.title}" (${trackRel})`);
                } catch (logErr) {
                    console.error(`❌ Error logging play: ${queueItem.type} "${queueItem.meta.title}" (${trackRel}):`, logErr);
                }

                if (queueItem.type === 'music' && STATION_CONFIG.ratingSystem?.enabled) {
                    // Clear the polling interval
                    if (feedbackPollingInterval) {
                        clearInterval(feedbackPollingInterval);
                        feedbackPollingInterval = null;
                    }

                    const windowEnd = ratingManager.closeCommentWindow();
                    const count = await ratingManager.pollForComments(vid);
                    console.log(`📊 Collected ${count} comment${count===1?'':'s'} up to ${windowEnd}`);

                    // Clear comments from overlay and engagement monitor when track ends
                    if (STATION_CONFIG.streamMode === 'youtube') {
                        await overlayManager.updateOverlay(queueItem.filepath, vid, true);
                    }

                    // Reset engagement monitor comments when track ends
                    if (STATION_CONFIG.enhancedEngagement?.enabled && engagementMonitor) {
                        engagementMonitor.resetComments();
                        console.log(`🗨️ Cleared engagement monitor comments after track ended: "${queueItem.meta.title}"`);
                    }
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
