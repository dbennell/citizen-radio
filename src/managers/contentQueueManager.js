// ========================
// File: contentQueueManager.js
// ========================
const fs = require('fs');
const { pickNextTrack } = require('./trackManager');
const { generateSegway, prepareSegway } = require('../processors/promptProcessor');
const { getLastPlays } = require('./playLogManager');
const { STATION_CONFIG } = require('../core/config');

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
   */
  addItem(item) {
    if (this.contentQueue.length < this.maxQueueSize) {
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
      while (this.contentQueue.length < this.maxQueueSize) {
        await this.prepareNextContent();
      }
    } catch (error) {
      console.error('Error replenishing queue:', error);
    } finally {
      this.isReplenishing = false;
    }
  }

  /**
   * Prepare the next content item and add it to the queue
   */
  async prepareNextContent() {
    try {
      // Get the next content type from the pattern
      let type = this.getNextContentType();

      // Skip segway for now, we'll generate it when we know the next track
      if (type === 'segway') {
        type = this.getNextContentType();
      }

      // Select the next track
      const entry = await pickNextTrack(type);
      if (!entry || !entry.filepath) {
        console.warn(`⚠️ No ${type} content available to queue`);
        return;
      }

      // Create a queue item
      const queueItem = {
        type,
        filepath: entry.filepath,
        meta: entry.meta,
        segway: null
      };

      // If we have a last played item, generate a segway
      if (this.lastPlayedItem) {
        try {
          const prevMeta = { ...this.lastPlayedItem.meta, type: this.lastPlayedItem.type };
          const nextMeta = { ...entry.meta, type };

          // Generate segway text
          const segwayText = await generateSegway(prevMeta, nextMeta);

          if (segwayText && segwayText.trim()) {
            // Prepare segway audio
            const segwayFile = await prepareSegway(
              segwayText, 
              prevMeta, 
              nextMeta, 
              `${prevMeta.type}_to_${nextMeta.type}`
            );

            if (segwayFile) {
              queueItem.segway = {
                filepath: segwayFile,
                text: segwayText
              };
            }
          }
        } catch (error) {
          console.error('Error generating segway:', error);
          // Continue without a segway if generation fails
        }
      }

      // Add the item to the queue
      this.addItem(queueItem);

    } catch (error) {
      console.error('Error preparing next content:', error);
      throw error;
    }
  }

  /**
   * Initialize the queue with initial content
   */
  async initialize() {
    console.log('🚀 Initializing content queue...');
    await this.replenishQueue();
    console.log(`✅ Content queue initialized with ${this.contentQueue.length} items`);
    return this.contentQueue.length > 0;
  }

  /**
   * Clean up any resources when shutting down
   */
  cleanup() {
    // Clean up any segway files in the queue
    this.contentQueue.forEach(item => {
      if (item.segway && item.segway.filepath && fs.existsSync(item.segway.filepath)) {
        try {
          fs.unlinkSync(item.segway.filepath);
          console.log(`🧹 Cleaned up queued segway file: ${item.segway.filepath}`);
        } catch (err) {
          console.error(`Error deleting segway file ${item.segway.filepath}:`, err);
        }
      }
    });

    // Clear the queue
    this.contentQueue = [];
  }
}

module.exports = ContentQueueManager;
