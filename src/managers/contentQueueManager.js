// ========================
// File: contentQueueManager.js
// ========================
const fs = require('fs');
const { pickNextTrack } = require('./trackManager');
const segueManager = require('./segueManager');
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
    this.recentSegues = new Map(); // Initialize the Map once to avoid recreating it
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

    // Check if we need to generate segues for items that have moved up in the queue
    // Only check positions 1 and 2 (index 0 and 1) as they're now closer to being played
    this.checkAndGenerateSeguesForQueueItems();

    // Trigger replenishment if queue is below minimum size
    if (this.contentQueue.length < this.minQueueSize) {
      this.replenishQueue();
    }

    return item;
  }

  /**
   * Check and generate segues for items at a specific position in the queue
   * This ensures we always have a consistent number of tracks on either side for context
   * @param {boolean} [forceGeneration=false] - Whether to force segue generation even if one already exists
   */
  async generateSeguesForQueuePosition(forceGeneration = false) {
    // Only process if we have items in the queue and a last played item
    if (this.contentQueue.length === 0 || !this.lastPlayedItem) {
      return;
    }

    // Always generate segues for position 2 (index 1) if it exists
    // This ensures we have 2 tracks on either side for context (1 previous, 2 upcoming)
    const targetPosition = 1; // Position 2 (index 1)

    if (this.contentQueue.length <= targetPosition) {
      // Not enough items in queue to reach target position
      return;
    }

    const queueItem = this.contentQueue[targetPosition];

    // Skip if item already has a segue or is a segue itself, unless force generation is requested
    if (!forceGeneration && (queueItem.segue || queueItem.type === 'segue')) {
      return;
    }

    // Create a unique key for this transition to prevent duplicates
    const transitionKey = `${this.lastPlayedItem.type}:${this.lastPlayedItem.meta.title || 'unknown'}->${queueItem.type}:${queueItem.meta.title || 'unknown'}`;

    // The recentSegues Map is already initialized in the constructor

    const now = Date.now();
    const recentThreshold = 30000; // 30 seconds

    // Clean up old entries
    for (const [key, timestamp] of this.recentSegues.entries()) {
      if (now - timestamp > recentThreshold) {
        this.recentSegues.delete(key);
      }
    }

    // Check if we've recently generated this transition, unless force generation is requested
    if (!forceGeneration && this.recentSegues.has(transitionKey)) {
      console.log(`🔄 Skipping duplicate segue generation for transition: ${transitionKey}`);
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
        .filter(entry => entry.type !== 'ad' && entry.type !== 'segue')
        .slice(0, 2)
        .map(entry => ({
          type: entry.type,
          meta: entry.meta,
          relPath: entry.relPath
        }));

      // Get next tracks from the queue (up to 2 tracks, excluding segues)
      // Start from the target item being checked
      const nextTracks = [
        { type: queueItem.type, meta: queueItem.meta, filepath: queueItem.filepath },
        ...this.contentQueue.slice(targetPosition + 1).filter(item => item.type !== 'segue').slice(0, 2)
      ];

      // Generate segue text using the segueManager
      const segueText = await segueManager.generateSegue(prevMeta, nextMeta, prevTracks, nextTracks);

      if (segueText && segueText.trim()) {
        // Prepare segue audio using the segueManager
        const segueFile = await segueManager.prepareSegue(
          segueText,
          prevMeta,
          nextMeta,
          `before_${nextMeta.type}_after_${prevMeta.type}`
        );

        if (segueFile) {
          // Mark this transition as recently generated
          this.recentSegues.set(transitionKey, now);

          // Attach the segue to the content item
          queueItem.segue = {
            filepath: segueFile,
            text: segueText,
            generated: Date.now() // Add timestamp to track when this segue was generated
          };
          console.log(`🔄 Generated segue for ${queueItem.type} "${queueItem.meta.title}" at position ${targetPosition+1} in queue`);
        }
      }
    } catch (error) {
      console.error(`Error generating segue for queue item at position ${targetPosition+1}:`, error);
      // Continue without a segue if generation fails
    }

    // We'll skip cleaning up segues here to prevent premature deletion
    // Segue cleanup will be handled by the orchestrator which knows the currently playing file
  }

  /**
   * Check and generate segues for items that have moved up in the queue
   * This is a legacy method that now calls the consolidated generateSeguesForQueuePosition method
   */
  async checkAndGenerateSeguesForQueueItems() {
    await this.generateSeguesForQueuePosition();
  }

  /**
   * Add an item to the queue
   * Segues don't count towards the queue limit
   */
  addItem(item) {
    // Segues don't count towards the queue limit
    if (item.type === 'segue' || this.contentQueue.length < this.maxQueueSize) {
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
      let segueRequested = false;

      // Check if we need to generate a segue before this content
      if (type === 'segue') {
        segueRequested = true;
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
        segue: null
      };

      // Add the item to the queue
      const added = this.addItem(queueItem);

      // If a segue was explicitly requested in the pattern, create a separate segue item
      if (segueRequested && added && this.lastPlayedItem) {
        try {
          const prevMeta = { ...this.lastPlayedItem.meta, type: this.lastPlayedItem.type };
          const nextMeta = { ...entry.meta, type };

          // Create a unique key for this transition
          const transitionKey = `${prevMeta.type}:${prevMeta.title || 'unknown'}->${type}:${entry.meta.title || 'unknown'}`;

          // The recentSegues Map is already initialized in the constructor

          const now = Date.now();
          const recentThreshold = 30000; // 30 seconds

          // Clean up old entries
          for (const [key, timestamp] of this.recentSegues.entries()) {
            if (now - timestamp > recentThreshold) {
              this.recentSegues.delete(key);
            }
          }

          // Check if we've recently generated this transition
          if (this.recentSegues.has(transitionKey)) {
            console.log(`🔄 Skipping duplicate segue generation for transition: ${transitionKey}`);
          } else {
            // Generate segue text using the segueManager
            const prevTracks = getLastPlays(this.historySize)
              .filter(entry => entry.type !== 'ad' && entry.type !== 'segue')
              .slice(0, 2)
              .map(entry => ({
                type: entry.type,
                meta: entry.meta,
                relPath: entry.relPath
              }));

            const nextTracks = [
              { type, meta: entry.meta, filepath: entry.filepath },
              ...this.contentQueue.filter(item => item.type !== 'segue').slice(0, 2)
            ];

            const segueText = await segueManager.generateSegue(prevMeta, nextMeta, prevTracks, nextTracks);

            if (segueText && segueText.trim()) {
              // Prepare segue audio using the segueManager
              const segueFile = await segueManager.prepareSegue(
                segueText,
                prevMeta,
                nextMeta,
                `before_${nextMeta.type}_after_${prevMeta.type}`
              );

              if (segueFile) {
                // Mark this transition as recently generated
                this.recentSegues.set(transitionKey, now);

                const segueItem = {
                  type: 'segue',
                  filepath: segueFile,
                  meta: {
                    title: `Segue: Before ${nextMeta.title || "Next"} after ${prevMeta.title || "Previous"}`,
                    artist: STATION_CONFIG.stationName,
                    comment: `Segue to play before ${nextMeta.type} after ${prevMeta.type}`
                  },
                  segue: null
                };

                // Add the segue as a separate item before the main content
                this.addItem(segueItem);
                console.log(`🔄 Added separate segue to queue before ${type}`);
              }
            }
          }
        } catch (error) {
          console.error('Error generating explicit segue:', error);
          // Continue without a segue if generation fails
        }
      }

      // After adding the item, check if we need to generate segues for position 2
      if (added && this.contentQueue.length >= 2) {
        await this.generateSeguesForQueuePosition();
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
    // We'll skip cleaning up segues here to prevent accidental deletion
    // Segue cleanup should be handled by the orchestrator which knows the currently playing file

    // Clear the queue
    this.contentQueue = [];

    // Clear the recentSegues Map to prevent memory leaks
    if (this.recentSegues) {
      this.recentSegues.clear();
    }

    console.log('🧹 Content queue and segue cache cleared');
  }
}

module.exports = ContentQueueManager;
