// ========================
// File: contentQueueManager.js
// ========================
const fs = require('fs');
const { pickNextTrack } = require('./trackManager');
const segwayManager = require('./segwayManager');
const { getLastPlays } = require('./playLogManager');
const { STATION_CONFIG } = require('../core/config');
const {default: chalk} = require("chalk");

class ContentQueueManager {
  constructor(options = {}) {
    this.contentQueue = [];
    this.isReplenishing = false;
    this.minQueueSize = options.minQueueSize || STATION_CONFIG.contentQueue?.minQueueSize || 2;
    this.maxQueueSize = options.maxQueueSize || STATION_CONFIG.contentQueue?.maxQueueSize || 4;
    this.pattern = options.pattern || STATION_CONFIG.schedule.defaultPattern;
    this.currentPatternIndex = 0;
    this.lastPlayedItem = null;
    this.historySize = STATION_CONFIG.trackHistory?.historySize || 16;
    this.weights = STATION_CONFIG.trackHistory?.weights || {};
  }

  /**
   * Get the current queue length
   */
  get queueLength() {
    return this.contentQueue.length;
  }

  /**
   * Get the next content type from the pattern
   */
  getNextContentType() {
    const type = this.pattern[this.currentPatternIndex];
    this.currentPatternIndex = (this.currentPatternIndex + 1) % this.pattern.length;
    return type;
  }

  /**
   * Get the next item from the queue without removing it
   */
  peekNextItem() {
    return this.contentQueue.length > 0 ? this.contentQueue[0] : null;
  }

  /**
   * Get and remove the next item from the queue
   */
  getNextItem() {
    if (this.contentQueue.length === 0) {
      return null;
    }

    const item = this.contentQueue.shift();
    this.lastPlayedItem = item;

    // Trigger replenishment if queue is below minimum size
    if (this.contentQueue.length < this.minQueueSize) {
      this.replenishQueue();
    }

    return item;
  }

  /**
   * Add an item to the queue
   * Segways don't count towards the queue limit
   */
  addItem(item) {
    // Segways don't count towards the queue limit
    if (item.type === 'segway' || this.contentQueue.length < this.maxQueueSize) {
      this.contentQueue.push(item);
      console.log(`📋 Added ${item.type} "${item.meta.title}" to queue. Queue size: ${this.contentQueue.length}`);
      return true;
    }
    return false;
  }

  /**
   * Start the replenishment process if not already running
   */
  async replenishQueue() {
    if (this.isReplenishing) {
      return;
    }

    this.isReplenishing = true;
    console.log(`📋 Replenishing content queue. Current size: ${this.contentQueue.length}`);

    try {
      // Add maximum retry count to prevent infinite loops
      const maxRetries = 10;
      let retryCount = 0;
      let consecutiveFailures = 0;

      while (this.contentQueue.length < this.maxQueueSize && retryCount < maxRetries) {
        // Add a small delay between attempts to prevent tight loops
        if (retryCount > 0) {
          // Exponential backoff for repeated failures
          const backoffDelay = Math.min(500 * Math.pow(1.5, Math.min(consecutiveFailures, 5)), 5000);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }

        // Track if content was added successfully
        const contentAdded = await this.prepareNextContent();

        if (!contentAdded) {
          // Content wasn't added, increment retry counter and consecutive failures
          retryCount++;
          consecutiveFailures++;
          console.warn(`⚠️ Queue replenishment attempt ${retryCount}/${maxRetries} failed to add new content (${consecutiveFailures} consecutive failures)`);
        } else {
          // Content was added successfully, reset consecutive failures
          consecutiveFailures = 0;
        }
      }

      if (retryCount >= maxRetries) {
        console.error(`🚨 Queue replenishment stopped after ${maxRetries} failed attempts`);
      }
    } catch (error) {
      console.error('Error replenishing queue:', error);
    } finally {
      this.isReplenishing = false;
    }
  }

  /**
   * Prepare the next content item and add it to the queue
   * @returns {Promise<boolean>} - True if content was added, false otherwise
   */
  async prepareNextContent() {
    try {
      // Get the next content type from the pattern
      let type = this.getNextContentType();
      let segwayRequested = false;

      // Check if we need to generate a segway before this content
      if (type === 'segway') {
        segwayRequested = true;
        type = this.getNextContentType();
      }

      // Select the next track
      const entry = await pickNextTrack(type);
      if (!entry || !entry.filepath) {
        console.warn(`⚠️ No ${type} content available to queue`);
        // Return false to indicate no content was added
        return false;
      }

      // Create a queue item
      const queueItem = {
        type,
        filepath: entry.filepath,
        meta: entry.meta,
        segway: null
      };

      // Generate segways if requested in the pattern or if we have a last played item
      // This allows segways to be generated at the start of playback
      if (segwayRequested || this.lastPlayedItem) {
        try {
          // If we have a last played item, use its metadata; otherwise, create a "start" type
          const prevMeta = this.lastPlayedItem 
            ? { ...this.lastPlayedItem.meta, type: this.lastPlayedItem.type }
            : { title: '', type: 'start' };
          const nextMeta = { ...entry.meta, type };

          // Get previous tracks from play history (up to 2 tracks, excluding ads)
          // Only try to get previous tracks if we have a last played item
          const prevTracks = this.lastPlayedItem 
            ? getLastPlays(this.historySize)
                .filter(entry => entry.type !== 'ad' && entry.type !== 'segway')
                .slice(0, 2)
                .map(entry => ({
                  type: entry.type,
                  meta: entry.meta,
                  relPath: entry.relPath
                }))
            : [];

          // Get next tracks from the queue (up to 2 tracks, excluding segways)
          // Include the current track being added and up to 2 tracks from the existing queue
          const nextTracks = [
            { type, meta: entry.meta, filepath: entry.filepath },
            ...this.contentQueue.filter(item => item.type !== 'segway').slice(0, 2)
          ];

          // Generate segway text using the segwayManager
          const segwayText = await segwayManager.generateSegway(prevMeta, nextMeta, prevTracks, nextTracks);

          if (segwayText && segwayText.trim()) {
            // Prepare segway audio using the segwayManager
            const segwayFile = await segwayManager.prepareSegway(
              segwayText, 
              prevMeta, 
              nextMeta, 
              `${prevMeta.type}_to_${nextMeta.type}`
            );

            if (segwayFile) {
              // If a segway was explicitly requested in the pattern, create a separate segway item
              if (segwayRequested) {
                const segwayItem = {
                  type: 'segway',
                  filepath: segwayFile,
                  meta: {
                    title: `Segway: ${prevMeta.title || "Previous"} -> ${nextMeta.title || "Next"}`,
                    artist: STATION_CONFIG.stationName,
                    comment: `Segway from ${prevMeta.type} to ${nextMeta.type}`
                  },
                  segway: null
                };

                // Add the segway as a separate item before the main content
                this.addItem(segwayItem);
                console.log(`🔄 Added separate segway to queue before ${type}`);
              } else {
                // Otherwise, attach the segway to the content item as before
                queueItem.segway = {
                  filepath: segwayFile,
                  text: segwayText
                };
              }
            }
          }

          // Clean up old segway files that are no longer needed
          await segwayManager.removeOldSegways([...this.contentQueue, queueItem]);
        } catch (error) {
          console.error('Error generating segway:', error);
          // Continue without a segway if generation fails
        }
      }

      // Add the item to the queue
      const added = this.addItem(queueItem);

      // Return true if the item was added successfully
      return added;

    } catch (error) {
      console.error('Error preparing next content:', error);
      throw error;
    }
  }

  /**
   * Initialize the queue with initial content
   */
  async initialize() {
    console.log(chalk.blue('🚀 Initializing content queue...'));
    await this.replenishQueue();
    console.log(chalk.blue(`✅ Content queue initialized with ${this.contentQueue.length} items`));
    return this.contentQueue.length > 0;
  }

  /**
   * Clean up any resources when shutting down
   */
  async cleanup() {
    // Clean up segway files that are not in the current queue
    // This preserves segways that are still needed for playback
    await segwayManager.removeOldSegways(this.contentQueue);

    // Clear the queue
    this.contentQueue = [];
    console.log('🧹 Content queue cleared and unused segway files cleaned up');
  }
}

module.exports = ContentQueueManager;
