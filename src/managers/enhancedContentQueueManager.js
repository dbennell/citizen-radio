/**
 * Enhanced Content Queue Manager
 * 
 * An enhanced version of ContentQueueManager that implements the sophisticated
 * track selection system described in the next-track-selection documentation.
 * 
 * This manager integrates:
 * - Mood/Energy wave matching
 * - Advanced track scoring
 * - Request handling
 * - Pattern overrides
 */

const fs = require('fs');
const path = require('path');
const { STATION_CONFIG } = require('../core/config');
const { getLastPlays } = require('./playLogManager');
const segwayManager = require('./segwayManager');
const { extractMetadata } = require('../utils');

// Import the new components
const moodEnergyManager = require('./moodEnergyManager');
const trackScoring = require('../utils/trackScoring');
const requestManager = require('./requestManager');

class EnhancedContentQueueManager {
  constructor(options = {}) {
    this.contentQueue = [];
    this.isReplenishing = false;
    this.minQueueSize = options.minQueueSize || STATION_CONFIG.contentQueue?.minQueueSize || 2;
    this.maxQueueSize = options.maxQueueSize || STATION_CONFIG.contentQueue?.maxQueueSize || 4;
    this.pattern = options.pattern || STATION_CONFIG.schedule.defaultPattern;
    this.currentPatternIndex = 0;
    this.lastPlayedItem = null;
    this.historySize = STATION_CONFIG.trackHistory?.historySize || 16;

    // Track selection configuration
    this.trackSelectionConfig = {
      enabled: STATION_CONFIG.trackSelection?.enabled || false,
      moodEnergyEnabled: STATION_CONFIG.trackSelection?.moodEnergyEnabled || false,
      requestsEnabled: STATION_CONFIG.trackSelection?.requestsEnabled || false,
      ...options.trackSelectionConfig
    };

    console.log(`[EnhancedContentQueueManager] Initialized with track selection ${this.trackSelectionConfig.enabled ? 'enabled' : 'disabled'}`);
    if (this.trackSelectionConfig.enabled) {
      console.log(`[EnhancedContentQueueManager] Mood/Energy matching: ${this.trackSelectionConfig.moodEnergyEnabled ? 'enabled' : 'disabled'}`);
      console.log(`[EnhancedContentQueueManager] Request handling: ${this.trackSelectionConfig.requestsEnabled ? 'enabled' : 'disabled'}`);
    }
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
    // Check for priority content that should override the pattern
    if (this.trackSelectionConfig.requestsEnabled) {
      const priorityContent = requestManager.getPriorityContent();
      if (priorityContent) {
        console.log(`[EnhancedContentQueueManager] Using priority content: "${priorityContent.metadata.title}" (${priorityContent.type})`);
        return priorityContent.type || 'music';
      }
    }

    // Use the normal pattern
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

      // Select the next track using the enhanced selection process
      const entry = await this.selectNextTrack(type);

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

          // Add mood/energy information to the segway context if available
          if (this.trackSelectionConfig.moodEnergyEnabled) {
            const moodEnergyDesc = moodEnergyManager.getCurrentStateDescription();
            prevMeta.moodEnergy = moodEnergyDesc;
            nextMeta.moodEnergy = moodEnergyDesc;
          }

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
          const nextTracks = [
            { type, meta: entry.meta, filepath: entry.filepath },
            ...this.contentQueue.filter(item => item.type !== 'segway').slice(0, 2)
          ];

          // Generate segway text
          const segwayText = await segwayManager.generateSegway(prevMeta, nextMeta, prevTracks, nextTracks);

          if (segwayText && segwayText.trim()) {
            // Prepare segway audio
            const segwayFile = await segwayManager.prepareSegway(
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

      // If this was a request, mark it as fulfilled
      if (entry.requestId) {
        await requestManager.fulfillRequest(entry.requestId);
      }

    } catch (error) {
      console.error('Error preparing next content:', error);
      throw error;
    }
  }

  /**
   * Enhanced track selection process
   * @param {string} type - Type of content to select
   * @returns {Promise<Object>} - Selected track information
   */
  async selectNextTrack(type) {
    // Check if we should use the enhanced selection process
    if (!this.trackSelectionConfig.enabled) {
      // Fall back to the original selection process
      return this._legacySelectTrack(type);
    }

    try {
      // Check for priority content first
      if (this.trackSelectionConfig.requestsEnabled) {
        const priorityContent = requestManager.getPriorityContent();
        if (priorityContent && (priorityContent.type === type || type === 'music')) {
          console.log(`[EnhancedContentQueueManager] Using priority content: "${priorityContent.metadata.title}"`);

          // Clear priority content after using it
          requestManager.clearPriorityContent();

          return {
            filepath: priorityContent.trackPath,
            meta: {
              ...priorityContent.metadata,
              type: priorityContent.type || type
            },
            requestId: priorityContent.id
          };
        }
      }

      // Check for regular requests next
      if (this.trackSelectionConfig.requestsEnabled && type === 'music') {
        const nextRequest = requestManager.getNextRequest();
        if (nextRequest) {
          console.log(`[EnhancedContentQueueManager] Using requested track: "${nextRequest.metadata.title}" by ${nextRequest.requester}`);

          return {
            filepath: nextRequest.trackPath,
            meta: {
              ...nextRequest.metadata,
              type,
              isRequested: true
            },
            requestId: nextRequest.id
          };
        }
      }

      // Get all available tracks of the requested type
      const tracks = await this._getAllTracksOfType(type);
      if (!tracks || tracks.length === 0) {
        console.warn(`[EnhancedContentQueueManager] No ${type} tracks available`);
        return null;
      }

      // Get recent play history
      const playLog = getLastPlays(this.historySize);

      // Use the track scoring system to select the next track
      const selectedTrack = trackScoring.selectNextTrack(tracks, playLog, {
        debug: true
      });

      if (!selectedTrack) {
        console.warn(`[EnhancedContentQueueManager] No suitable ${type} track found after scoring`);
        return null;
      }

      // Log selection details
      if (selectedTrack.score !== undefined) {
        console.log(`[EnhancedContentQueueManager] Selected "${selectedTrack.title}" with score ${selectedTrack.score.toFixed(2)}`);

        if (selectedTrack.scoreComponents) {
          const components = selectedTrack.scoreComponents;
          console.log(`[EnhancedContentQueueManager] Score components: rating=${components.ratingScore.toFixed(2)}, frequency=${components.frequencyScore.toFixed(2)}, waveFit=${components.waveFit.toFixed(2)}`);
        }

        if (this.trackSelectionConfig.moodEnergyEnabled) {
          const currentMood = moodEnergyManager.getCurrentMood();
          const currentEnergy = moodEnergyManager.getCurrentEnergy();
          console.log(`[EnhancedContentQueueManager] Current mood/energy: ${currentMood.toFixed(1)}/${currentEnergy.toFixed(1)} (${moodEnergyManager.getCurrentStateDescription()})`);
        }
      }

      // Return the selected track
      return {
        filepath: selectedTrack.filepath,
        meta: {
          ...selectedTrack,
          type
        }
      };
    } catch (error) {
      console.error(`[EnhancedContentQueueManager] Error selecting ${type} track:`, error);
      // Fall back to legacy selection in case of error
      return this._legacySelectTrack(type);
    }
  }

  /**
   * Legacy track selection process (fallback)
   * @param {string} type - Type of content to select
   * @returns {Promise<Object>} - Selected track information
   * @private
   */
  async _legacySelectTrack(type) {
    // Import the original pickNextTrack function
    const { pickNextTrack } = require('./trackManager');
    return pickNextTrack(type);
  }

  /**
   * Get all tracks of a specific type
   * @param {string} type - Type of content to get
   * @returns {Promise<Array<Object>>} - Array of track metadata
   * @private
   */
  async _getAllTracksOfType(type) {
    const dir = path.join(STATION_CONFIG.contentDirectories.ready, type);

    if (!fs.existsSync(dir)) {
      return [];
    }

    // Get all MP3 files in the directory
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.mp3'))
      .map(f => path.join(dir, f));

    if (files.length === 0) {
      return [];
    }

    // Get play history for play count
    const playLog = getLastPlays(100); // Use a larger history for play count

    // Process each file to get metadata and play count
    const tracks = await Promise.all(files.map(async (filepath) => {
      try {
        // Extract metadata
        const meta = await extractMetadata(filepath) || {};

        // Get relative path for play count lookup
        const relPath = path.relative(STATION_CONFIG.contentDirectories.ready, filepath);

        // Count plays in history
        const playCount = playLog.filter(entry => entry.relPath === relPath).length;

        // Get last played time
        const lastPlayEntry = playLog.find(entry => entry.relPath === relPath);
        const lastPlayed = lastPlayEntry ? new Date(lastPlayEntry.timestamp) : null;

        // Return track with metadata
        return {
          filepath,
          relPath,
          title: meta.title || path.basename(filepath),
          artist: meta.artist || 'Unknown',
          mood: meta.mood || 5, // Default mood
          energy: meta.energy || 5, // Default energy
          averageRating: meta.averageRating || 3, // Default rating
          playCount,
          lastPlayed,
          ...(meta || {})
        };
      } catch (error) {
        console.error(`[EnhancedContentQueueManager] Error processing ${filepath}:`, error);
        return null;
      }
    }));

    // Filter out null entries
    return tracks.filter(track => track !== null);
  }

  /**
   * Initialize the queue with initial content
   */
  async initialize() {
    console.log('🚀 Initializing enhanced content queue...');
    await this.replenishQueue();
    console.log(`✅ Enhanced content queue initialized with ${this.contentQueue.length} items`);
    return this.contentQueue.length > 0;
  }

  /**
   * Clean up any resources when shutting down
   */
  async cleanup() {
    // Import segwayManager to clean up segway files
    const segwayManager = require('./segwayManager');

    // Clean up segway files that are not in the current queue
    // This preserves segways that are still needed for playback
    await segwayManager.removeOldSegways(this.contentQueue);

    // Clear the queue
    this.contentQueue = [];
    console.log('🧹 Enhanced content queue cleared and unused segway files cleaned up');
  }
}

module.exports = EnhancedContentQueueManager;
