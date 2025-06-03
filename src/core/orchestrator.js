const fs = require('fs');
const path = require('path');
const { pickNextTrack } = require('../managers/trackManager');
const { getLastPlays, appendPlayLog } = require('../managers/playLogManager');
const segueManager = require('../managers/segueManager');
const { playFile, streamFile, getRandomCoverImage } = require('./streamer');
const { STATION_CONFIG, READY_DIR } = require('./config');
const chalk = require('chalk');
const ratingManager = require('../managers/ratingsManager');
const engagementMonitor = require('../managers/engagementMonitor');
const overlayManager = require('../managers/overlayManager');
const { fetchLiveVideoId, extractMetadata, getRecommendedPollingInterval } = require('../utils');
const ContentQueueManager = require('../managers/contentQueueManager');
const IntervalManager = require('../utils/intervalManager');

let shouldStop = false;
let stopAfterNextMusic = false;
let persistentVideoId = STATION_CONFIG.youtube?.videoId || null;
let contentQueue = null;

// Create interval manager for feedback polling
const intervalManager = new IntervalManager({
    initialInterval: (STATION_CONFIG.ratingSystem?.commentCheckInterval || 5) * 1000,
    maxInterval: 60000, // 1 minute max
    backoffFactor: 2,
    resetAfter: 300000 // 5 minutes
});



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

    let vid = null
    if (STATION_CONFIG.streamMode !== 'local') {
        vid = await getPersistentVideoId();
    }

    console.log(chalk.green(`▶️ Starting playback: ${pattern.join(', ')}`));
    console.log(chalk.magenta(`⏱️ Uptime: ${STATION_CONFIG.uptimeHours || '∞'}h, mode: ${STATION_CONFIG.uptimeMode || 'none'}`));

    // Initialize content queue
    contentQueue = new ContentQueueManager({
        pattern,
        includePodcasts
    });

    await contentQueue.initialize();
    //console.log(chalk.blue(`📋 Content queue initialized with ${contentQueue.queueLength} items`));

    // Variable to track the periodic feedback polling interval
    let feedbackPollingInterval = null;

    while (!shouldStop) {
        // Uptime enforcement
        if (uptimeMs !== null) {
            const elapsed = Date.now() - startTime;
            if (STATION_CONFIG.uptimeMode === 'cycle' && elapsed >= uptimeMs) {
                console.log('⏹️ Uptime reached: ending cycle');
                break;
            }
            if (STATION_CONFIG.uptimeMode === 'track' && elapsed >= uptimeMs) {
                console.log('⏹️ Uptime reached: stopping after next track');
                stopAfterNextMusic = true;
            }
        }

        // Check if we have queued content first
        // Only log "New playback cycle" when we're at the beginning of the pattern AND there's no queued content
        if (!contentQueue.isEmpty()) {
            // We have queued content - continue with it instead of starting new cycle
            console.log(`📋 Processing queued content. Queue size: ${contentQueue.queueLength}`);
        } else if (contentQueue.currentPatternIndex === 0) {
            // Only log new cycle when we're actually starting fresh (empty queue + start of pattern)
            console.log(chalk.green(`🎧 New playback cycle at ${new Date().toLocaleTimeString()}`));
        }

        // Get the next item from the queue
        const queueItem = contentQueue.getNextItem();

        if (!queueItem) {
            // Track consecutive empty queue occurrences to prevent infinite loops
            if (typeof emptyQueueCount === 'undefined') {
                var emptyQueueCount = 1;
            } else {
                emptyQueueCount++;
            }

            // Exponential backoff for repeated empty queue situations
            const backoffDelay = Math.min(1000 * Math.pow(1.5, Math.min(emptyQueueCount - 1, 10)), 30000);

            console.warn(`⚠️ Content queue is empty (attempt ${emptyQueueCount}), waiting ${backoffDelay}ms for replenishment...`);

            // If we've had too many consecutive empty queues, log a more severe warning
            if (emptyQueueCount >= 10) {
                console.error(`🚨 Queue has been empty for ${emptyQueueCount} consecutive attempts. Check content availability.`);
            }

            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            continue;
        }

        // Reset empty queue counter when we successfully get an item
        emptyQueueCount = 0;

        try {
            // Play pre-generated segue if available
            if (queueItem.segue && queueItem.segue.filepath) {
                try {
                    const segueFile = queueItem.segue.filepath;
                    console.log(`🔄 Playing generated segue before ${queueItem.type}: "${queueItem.meta.title}"`);

                    // Play the segue first, and protect it during playback
                    if (STATION_CONFIG.streamMode === 'youtube') {
                        await streamFile(segueFile);
                    } else {
                        await playFile(segueFile);
                    }

                    // Only clean up OTHER segues, not the one we just played
                    await segueManager.removeOldSegues(contentQueue.getItems(), segueFile);

                    //console.log(`🔄 Played segue file: ${path.basename(segueFile)}`);
                } catch (segueErr) {
                    console.error('Error playing segue:', segueErr);
                }
            }

            // Play the main content
            try {
                const trackRel = path.relative(READY_DIR(''), queueItem.filepath);

                if (queueItem.type === 'music' && STATION_CONFIG.ratingSystem?.enabled) {
                    // Reset engagement monitor comments when changing tracks
                    if (STATION_CONFIG.enhancedEngagement?.enabled && engagementMonitor) {
                        engagementMonitor.resetComments();
                        //console.log(`🗨️ Cleared engagement monitor comments for new track: "${queueItem.meta.title}"`);
                    }

                    ratingManager.setCurrentlyPlaying({ 
                        trackRel, 
                        title: queueItem.meta.title, 
                        artist: queueItem.meta.artist, 
                        type: queueItem.type 
                    });
                    const windowStart = ratingManager.openCommentWindow();
                    console.log(`📊 Rating: tracking open for "${queueItem.meta.title}" from ${windowStart}`);

                    // Clear any existing polling interval
                    if (feedbackPollingInterval) {
                        clearInterval(feedbackPollingInterval);
                        feedbackPollingInterval = null;
                    }

                    // Set up periodic feedback polling based on configuration
                    if (STATION_CONFIG.enhancedEngagement?.enabled && vid) {
                        // Create a unique ID for this polling interval based on the track
                        const pollingId = `feedback-polling-${queueItem.filepath}`;

                        // Stop any existing polling interval with this ID
                        intervalManager.stop(pollingId);

                        // Start a new polling interval
                        intervalManager.start(pollingId, async () => {
                            // Poll for new comments
                            const count = await ratingManager.pollForComments(vid);
                            if (count > 0) {
                                //console.log(`📊 Collected ${count} comment${count===1?'':'s'} during playback`);

                                // Update the overlay with new comments, but only if we have comments to show
                                // This avoids making an unnecessary API call when there are no new comments
                                if (STATION_CONFIG.streamMode === 'youtube' && count > 0) {
                                    await overlayManager.updateOverlay(queueItem.filepath, vid);
                                }
                            }

                            // Return true to indicate success
                            return true;
                        }, getRecommendedPollingInterval());
                    }
                }

                if (STATION_CONFIG.streamMode === 'youtube') {
                    // Start streaming the file first
                    const streamPromise = streamFile(queueItem.filepath);

                    // Add a small delay to ensure the new track has started playing
                    // before updating the overlay image
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Clear comments when starting a new track and update the overlay
                    // after the track has started playing
                    await overlayManager.updateOverlay(queueItem.filepath, vid, true);

                    // Wait for the streaming to complete
                    await streamPromise;
                } else {
                    await playFile(queueItem.filepath);
                }

                // After successful playback
                contentQueue.markAsPlayed(queueItem);
                // Log the play (skip segues)
                try {
                    // Don't log segues to play.log as they're never reused
                    if (queueItem.type !== 'segue') {
                        appendPlayLog(trackRel, queueItem.type, queueItem.meta);
                        console.log(`✏️ Logged play: ${queueItem.type} "${queueItem.meta.title}" (${trackRel})`);
                    }
                } catch (logErr) {
                    console.error(`❌ Error logging play: ${queueItem.type} "${queueItem.meta.title}" (${trackRel}):`, logErr);
                }

                if (queueItem.type === 'music' && STATION_CONFIG.ratingSystem?.enabled) {
                    // Stop all polling intervals for this track
                    const pollingId = `feedback-polling-${queueItem.filepath}`;
                    intervalManager.stop(pollingId);

                    const windowEnd = ratingManager.closeCommentWindow();
                    const count = await ratingManager.pollForComments(vid);
                    //console.log(`📊 Collected ${count} comment${count===1?'':'s'} up to ${windowEnd}`);

                    // Update overlay without clearing comments when track ends
                    if (STATION_CONFIG.streamMode === 'youtube') {
                        await overlayManager.updateOverlay(queueItem.filepath, vid, false);
                    }

                    // Reset engagement monitor comments when track ends
                    if (STATION_CONFIG.enhancedEngagement?.enabled && engagementMonitor) {
                        engagementMonitor.resetComments();
                        //console.log(`🗨️ Cleared engagement monitor comments after track ended: "${queueItem.meta.title}"`);
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
            console.log('⏹️ Stopping after this music track.');
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
    const meta = await extractMetadata(choice) || {};
    return { filepath: choice, meta };
}

async function stopPlayback() { 
    shouldStop = true; 

    // Clean up content queue if it exists
    if (contentQueue) {
        contentQueue.cleanup();
    }

    // Stop all polling intervals
    intervalManager.stopAll();
    console.log(`⏹️ Stopped ${intervalManager.count()} polling intervals`);

    // Flush all buffered writes to disk
    try {
        const ratingManager = require('../managers/ratingsManager');
        await ratingManager.flushAllBuffers();
    } catch (error) {
        console.error('Error flushing buffers during shutdown:', error);
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

/**
 * Get information about active polling intervals
 * @returns {Object} - Information about active polling intervals
 */
function getPollingInfo() {
    return {
        activeIntervals: intervalManager.getRunningIntervals(),
        count: intervalManager.count()
    };
}

module.exports = {
    playbackLoop,
    stopPlayback,
    requestStop,
    getPersistentVideoId,
    getContentQueue,
    getPollingInfo,
    pickNextTrackWithPodcasts
};
