# Content Pre-Queuing System: Implementation Plan

This document outlines the specific code changes needed to implement the Content Pre-Queuing System as defined in the feature document.

## 1. Create ContentQueue Class

Create a new file: `/home/david/Projects/CitizenRadio/src/managers/contentQueueManager.js`

```javascript
// ========================
// File: contentQueueManager.js
// ========================
const { pickNextTrack } = require('./trackManager');
const { generateSegway, prepareSegway } = require('../processors/promptProcessor');
const { getLastPlays } = require('./playLogManager');
const { STATION_CONFIG } = require('../core/config');

class ContentQueueManager {
  constructor(options = {}) {
    this.contentQueue = [];
    this.isReplenishing = false;
    this.minQueueSize = options.minQueueSize || 2;
    this.maxQueueSize = options.maxQueueSize || 5;
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
}

module.exports = ContentQueueManager;
```

## 2. Modify Orchestrator.js

Update the playbackLoop function in `/home/david/Projects/CitizenRadio/src/core/orchestrator.js`:

```javascript
const ContentQueueManager = require('../managers/contentQueueManager');

// Add at the top of the file with other variables
let contentQueue = null;

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
        pattern,
        minQueueSize: 2,
        maxQueueSize: 5
    });
    
    await contentQueue.initialize();

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

        console.log(chalk.green(`🎧 New cycle at ${new Date().toLocaleTimeString()}`));

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
                if (queueItem.type === 'music' && STATION_CONFIG.ratingSystem?.enabled) {
                    const trackRel = path.relative(READY_DIR(''), queueItem.filepath);
                    ratingManager.setCurrentlyPlaying({ 
                        trackRel, 
                        title: queueItem.meta.title, 
                        artist: queueItem.meta.artist, 
                        type: queueItem.type 
                    });
                    const windowStart = ratingManager.openCommentWindow();
                    console.log(`📊 Rating: tracking "${queueItem.meta.title}" from ${windowStart}`);
                }

                if (STATION_CONFIG.streamMode === 'youtube') {
                    await updateOverlay(queueItem.filepath, vid);
                    await streamFile(queueItem.filepath);
                } else {
                    await playFile(queueItem.filepath);
                }

                // Log the play
                const trackRel = path.relative(READY_DIR(''), queueItem.filepath);
                appendPlayLog(trackRel, queueItem.type, queueItem.meta);

                if (queueItem.type === 'music' && STATION_CONFIG.ratingSystem?.enabled) {
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
            console.log('⏹️ Stopping after this music track.');
            shouldStop = true;
            break;
        }
    }
}
```

## 3. Update Module Exports

Update the module exports in orchestrator.js to include the content queue:

```javascript
module.exports = {
    playbackLoop,
    stopPlayback,
    requestStop,
    getPersistentVideoId,
    getContentQueue: () => contentQueue
};
```

## 4. Add Cleanup for Segways

Add a cleanup function to the ContentQueueManager class:

```javascript
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
```

## 5. Update Shutdown Process

Modify the stopPlayback function in orchestrator.js to clean up the content queue:

```javascript
function stopPlayback() { 
  shouldStop = true; 
  
  // Clean up content queue if it exists
  if (contentQueue) {
    contentQueue.cleanup();
  }
}
```

## 6. Testing Plan

1. **Unit Tests**:
   - Create tests for ContentQueueManager class
   - Test queue operations (add, get, peek)
   - Test replenishment logic
   - Test segway generation

2. **Integration Tests**:
   - Test the modified playbackLoop with the content queue
   - Verify that content is pre-queued correctly
   - Verify that segways are generated in advance

3. **Performance Tests**:
   - Measure memory usage with the queue
   - Measure CPU usage during replenishment
   - Verify that there are no pauses between tracks

4. **Edge Cases**:
   - Test recovery when segway generation fails
   - Test recovery when the queue is empty
   - Test with different pattern configurations

## 7. Deployment Steps

1. Create the new contentQueueManager.js file
2. Update orchestrator.js with the modified playbackLoop
3. Run tests to verify functionality
4. Deploy to staging environment for testing
5. Monitor for any issues
6. Deploy to production