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
    this.lastPlayedItem = null; // Track what was actually played
  }

  /**
   * Get the current queue length
   */
  get queueLength() {
    return this.contentQueue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty() {
    return this.contentQueue.length === 0;
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
   * Get all items in the queue without removing them
   * @returns {Array} - A copy of the content queue
   */
  getItems() {
    return [...this.contentQueue];
  }

  /**
   * Mark an item as played (call this from orchestrator after playback)
   */
  markAsPlayed(item) {
    this.lastPlayedItem = item;
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

    // Check if we need to generate segways for items that have moved up in the queue
    // Only check positions 1 and 2 (index 0 and 1) as they're now closer to being played
    this.checkAndGenerateSegwaysForQueueItems();

    // Trigger replenishment if queue is below minimum size
    if (this.contentQueue.length < this.minQueueSize) {
      this.replenishQueue();
    }

    return item;
  }

  /**
   * Check and generate segways for items at a specific position in the queue
   * This ensures we always have a consistent number of tracks on either side for context
   * @param {boolean} [forceGeneration=false] - Whether to force segway generation even if one already exists
   */
  async generateSegwaysForQueuePosition(forceGeneration = false) {
    // Only process if we have items in the queue and a last played item
    if (this.contentQueue.length === 0 || !this.lastPlayedItem) {
      return;
    }

    // Always generate segways for position 2 (index 1) if it exists
    // This ensures we have 2 tracks on either side for context (1 previous, 2 upcoming)
    const targetPosition = 1; // Position 2 (index 1)

    if (this.contentQueue.length <= targetPosition) {
      // Not enough items in queue to reach target position
      return;
    }

    const queueItem = this.contentQueue[targetPosition];

    // Skip if item already has a segway or is a segway itself, unless force generation is requested
    if (!forceGeneration && (queueItem.segway || queueItem.type === 'segway')) {
      return;
    }

    // Create a unique key for this transition to prevent duplicates
    const transitionKey = `${this.lastPlayedItem.type}:${this.lastPlayedItem.meta.title || 'unknown'}->${queueItem.type}:${queueItem.meta.title || 'unknown'}`;

    // Check if we've recently generated a segway for this exact transition
    if (!this.recentSegways) {
      this.recentSegways = new Map();
    }

    const now = Date.now();
    const recentThreshold = 30000; // 30 seconds

    // Clean up old entries
    for (const [key, timestamp] of this.recentSegways.entries()) {
      if (now - timestamp > recentThreshold) {
        this.recentSegways.delete(key);
      }
    }

    // Check if we've recently generated this transition, unless force generation is requested
    if (!forceGeneration && this.recentSegways.has(transitionKey)) {
      console.log(`🔄 Skipping duplicate segway generation for transition: ${transitionKey}`);
      return;
    }

    try {
      // If we have a last played item, use its metadata; otherwise, create a "start" type
      const prevMeta = this.lastPlayedItem
        ? { ...this.lastPlayedItem.meta, type: this.lastPlayedItem.type }
        : { title: '', type: 'start' };
      const nextMeta = { ...queueItem.meta, type: queueItem.type };

      // Get previous tracks from play history (up to 2 tracks, excluding ads)
      const prevTracks = getLastPlays(this.historySize)
        .filter(entry => entry.type !== 'ad' && entry.type !== 'segway')
        .slice(0, 2)
        .map(entry => ({
          type: entry.type,
          meta: entry.meta,
          relPath: entry.relPath
        }));

      // Get next tracks from the queue (up to 2 tracks, excluding segways)
      // Start from the target item being checked
      const nextTracks = [
        { type: queueItem.type, meta: queueItem.meta, filepath: queueItem.filepath },
        ...this.contentQueue.slice(targetPosition + 1).filter(item => item.type !== 'segway').slice(0, 2)
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
          // Mark this transition as recently generated
          this.recentSegways.set(transitionKey, now);

          // Attach the segway to the content item
          queueItem.segway = {
            filepath: segwayFile,
            text: segwayText,
            generated: Date.now() // Add timestamp to track when this segway was generated
          };
          console.log(`🔄 Generated segway for ${queueItem.type} "${queueItem.meta.title}" at position ${targetPosition+1} in queue`);
        }
      }
    } catch (error) {
      console.error(`Error generating segway for queue item at position ${targetPosition+1}:`, error);
      // Continue without a segway if generation fails
    }

    // We'll skip cleaning up segways here to prevent premature deletion
    // Segway cleanup will be handled by the orchestrator which knows the currently playing file
  }

  /**
   * Check and generate segways for items that have moved up in the queue
   * This is a legacy method that now calls the consolidated generateSegwaysForQueuePosition method
   */
  async checkAndGenerateSegwaysForQueueItems() {
    await this.generateSegwaysForQueuePosition();
  }

  /**
   * Add an item to the queue
   * Segways don't count towards the queue limit
   */
  addItem(item) {
    // Segways don't count towards the queue limit
    if (item.type === 'segway' || this.contentQueue.length < this.maxQueueSize) {
      this.contentQueue.push(item);
      console.log(`❇️ Added ${item.type} "${item.meta.title}" to queue. Queue size: ${this.contentQueue.length}`);
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

      // Add the item to the queue
      const added = this.addItem(queueItem);

      // If a segway was explicitly requested in the pattern, create a separate segway item
      if (segwayRequested && added && this.lastPlayedItem) {
        try {
          const prevMeta = { ...this.lastPlayedItem.meta, type: this.lastPlayedItem.type };
          const nextMeta = { ...entry.meta, type };

          // Create a unique key for this transition
          const transitionKey = `${prevMeta.type}:${prevMeta.title || 'unknown'}->${type}:${entry.meta.title || 'unknown'}`;

          // Check if we've recently generated a segway for this exact transition
          if (!this.recentSegways) {
            this.recentSegways = new Map();
          }

          const now = Date.now();
          const recentThreshold = 30000; // 30 seconds

          // Clean up old entries
          for (const [key, timestamp] of this.recentSegways.entries()) {
            if (now - timestamp > recentThreshold) {
              this.recentSegways.delete(key);
            }
          }

          // Check if we've recently generated this transition
          if (this.recentSegways.has(transitionKey)) {
            console.log(`🔄 Skipping duplicate segway generation for transition: ${transitionKey}`);
          } else {
            // Generate segway text using the segwayManager
            const prevTracks = getLastPlays(this.historySize)
              .filter(entry => entry.type !== 'ad' && entry.type !== 'segway')
              .slice(0, 2)
              .map(entry => ({
                type: entry.type,
                meta: entry.meta,
                relPath: entry.relPath
              }));

            const nextTracks = [
              { type, meta: entry.meta, filepath: entry.filepath },
              ...this.contentQueue.filter(item => item.type !== 'segway').slice(0, 2)
            ];

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
                // Mark this transition as recently generated
                this.recentSegways.set(transitionKey, now);

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
              }
            }
          }
        } catch (error) {
          console.error('Error generating explicit segway:', error);
          // Continue without a segway if generation fails
        }
      }

      // After adding the item, check if we need to generate segways for position 2
      if (added && this.contentQueue.length >= 2) {
        await this.generateSegwaysForQueuePosition();
      }

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
    // We'll skip cleaning up segways here to prevent accidental deletion
    // Segway cleanup should be handled by the orchestrator which knows the currently playing file

    // Clear the queue
    this.contentQueue = [];
    console.log('🧹 Content queue cleared');
  }
}

module.exports = ContentQueueManager;
