// /**
//  * Enhanced Content Queue Manager
//  *
//  * An enhanced version of ContentQueueManager that implements the sophisticated
//  * track selection system described in the next-track-selection documentation.
//  *
//  * This manager integrates:
//  * - Mood/Energy wave matching
//  * - Advanced track scoring
//  * - Request handling
//  * - Pattern overrides
//  */
//
// const fs = require('fs');
// const path = require('path');
// const { STATION_CONFIG } = require('../core/config');
// const { getLastPlays } = require('./playLogManager');
// const segwayManager = require('./segwayManager');
// const { extractMetadata } = require('../utils');
//
// // Import the new components
// const moodEnergyManager = require('./moodEnergyManager');
// const trackScoring = require('../utils/trackScoring');
// const requestManager = require('./requestManager');
//
// class EnhancedContentQueueManager {
//   constructor(options = {}) {
//     this.contentQueue = [];
//     this.isReplenishing = false;
//     this.minQueueSize = options.minQueueSize || STATION_CONFIG.contentQueue?.minQueueSize || 2;
//     this.maxQueueSize = options.maxQueueSize || STATION_CONFIG.contentQueue?.maxQueueSize || 4;
//     this.pattern = options.pattern || STATION_CONFIG.schedule.defaultPattern;
//     this.currentPatternIndex = 0;
//     this.lastPlayedItem = null;
//     this.historySize = STATION_CONFIG.trackHistory?.historySize || 16;
//
//     // Track selection configuration
//     this.trackSelectionConfig = {
//       enabled: STATION_CONFIG.trackSelection?.enabled || false,
//       moodEnergyEnabled: STATION_CONFIG.trackSelection?.moodEnergyEnabled || false,
//       requestsEnabled: STATION_CONFIG.trackSelection?.requestsEnabled || false,
//       ...options.trackSelectionConfig
//     };
//
//     console.log(`[EnhancedContentQueueManager] Initialized with track selection ${this.trackSelectionConfig.enabled ? 'enabled' : 'disabled'}`);
//     if (this.trackSelectionConfig.enabled) {
//       console.log(`[EnhancedContentQueueManager] Mood/Energy matching: ${this.trackSelectionConfig.moodEnergyEnabled ? 'enabled' : 'disabled'}`);
//       console.log(`[EnhancedContentQueueManager] Request handling: ${this.trackSelectionConfig.requestsEnabled ? 'enabled' : 'disabled'}`);
//     }
//   }
//
//   /**
//    * Get the current queue length
//    */
//   get queueLength() {
//     return this.contentQueue.length;
//   }
//
//   /**
//    * Check if queue is empty
//    */
//   isEmpty() {
//     return this.contentQueue.length === 0;
//   }
//
//   /**
//    * Get the next content type from the pattern
//    */
//   getNextContentType() {
//     // Check for priority content that should override the pattern
//     if (this.trackSelectionConfig.requestsEnabled) {
//       const priorityContent = requestManager.getPriorityContent();
//       if (priorityContent) {
//         console.log(`[EnhancedContentQueueManager] Using priority content: "${priorityContent.metadata.title}" (${priorityContent.type})`);
//         return priorityContent.type || 'music';
//       }
//     }
//
//     // Use the normal pattern
//     const type = this.pattern[this.currentPatternIndex];
//     this.currentPatternIndex = (this.currentPatternIndex + 1) % this.pattern.length;
//     return type;
//   }
//
//   /**
//    * Get the next item from the queue without removing it
//    */
//   peekNextItem() {
//     return this.contentQueue.length > 0 ? this.contentQueue[0] : null;
//   }
//
//   /**
//    * Get and remove the next item from the queue
//    */
//   getNextItem() {
//     if (this.contentQueue.length === 0) {
//       return null;
//     }
//
//     const item = this.contentQueue.shift();
//     this.lastPlayedItem = item;
//
//     // Trigger replenishment if queue is below minimum size
//     if (this.contentQueue.length < this.minQueueSize) {
//       this.replenishQueue();
//     }
//
//     return item;
//   }
//
//   /**
//    * Add an item to the queue
//    */
//   addItem(item) {
//     if (this.contentQueue.length < this.maxQueueSize) {
//       this.contentQueue.push(item);
//       console.log(`📋 Added ${item.type} "${item.meta.title}" to queue. Queue size: ${this.contentQueue.length}`);
//       return true;
//     }
//     return false;
//   }
//
//   /**
//    * Start the replenishment process if not already running
//    */
//   async replenishQueue() {
//     if (this.isReplenishing) {
//       return;
//     }
//
//     this.isReplenishing = true;
//     console.log(`📋 Replenishing content queue. Current size: ${this.contentQueue.length}`);
//
//     try {
//       while (this.contentQueue.length < this.maxQueueSize) {
//         await this.prepareNextContent();
//       }
//     } catch (error) {
//       console.error('Error replenishing queue:', error);
//     } finally {
//       this.isReplenishing = false;
//     }
//   }
//
//
//   /**
//    * Prepare the next content item and add it to the queue
//    */
//   async prepareNextContent() {
//     try {
//       // Get the next content type from the pattern
//       const type = this.getNextContentType();
//
//       // Select the next track
//       const entry = await pickNextTrack(type);
//       if (!entry || !entry.filepath) {
//         console.warn(`⚠️ No ${type} content available to queue`);
//         return false;
//       }
//
//       // Create the basic queue item
//       const queueItem = {
//         type,
//         filepath: entry.filepath,
//         meta: entry.meta,
//         segway: null
//       };
//
//       // Generate segway from the CURRENTLY PLAYING track to this new track
//       // Only generate if this will be the NEXT item to play after current
//       if (this.contentQueue.length === 0) {
//         // This will be the next item to play after whatever is currently playing
//         const segwayFile = await this.generateSegwayFromCurrentlyPlaying(queueItem);
//
//         if (segwayFile) {
//           queueItem.segway = {
//             filepath: segwayFile,
//             generated: Date.now()
//           };
//         }
//       }
//
//       // Add the item to the queue
//       const added = this.addItem(queueItem);
//       return added;
//
//     } catch (error) {
//       console.error('Error preparing next content:', error);
//       throw error;
//     }
//   }
//
//   /**
//    * Get the last item that was added to the queue
//    */
//   getLastQueuedItem() {
//     // This method was causing confusion - it should return the item
//     // that will play IMMEDIATELY BEFORE the next item we're adding
//
//     // If queue is empty, the next item will play after whatever is currently playing
//     if (this.contentQueue.length === 0) {
//       return null; // We'll use currently playing from play log instead
//     }
//
//     // If queue has items, the last item in queue will play before our new item
//     return this.contentQueue[this.contentQueue.length - 1];
//   }
//
//   /**
//    * Generate segway from currently playing track to the next track
//    */
//   async generateSegwayFromCurrentlyPlaying(nextItem) {
//     // Get the currently playing track from play log
//     const { getLastPlays } = require('./playLogManager');
//     const recentPlays = getLastPlays(1);
//
//     // If no recent plays, use a default "start" type for the first cycle
//     const currentlyPlaying = recentPlays.length > 0
//       ? recentPlays[0]
//       : { meta: { title: 'Start' }, type: 'start' };
//
//     // Import segwayManager here to avoid circular dependencies
//     const segwayManager = require('./segwayManager');
//
//     const prevMeta = { ...currentlyPlaying.meta, type: currentlyPlaying.type };
//     const nextMeta = { ...nextItem.meta, type: nextItem.type };
//
//     // Check if we should generate a segway for this transition
//     if (!segwayManager.shouldGenerateSegway(currentlyPlaying.type, nextItem.type)) {
//       return null;
//     }
//
//     try {
//       console.log(`🔄 Pre-generating segway: ${currentlyPlaying.meta.title} → ${nextItem.meta.title}`);
//
//       // Get additional context
//       const prevTracks = getLastPlays(3).filter(entry => entry.type !== 'ad' && entry.type !== 'segway');
//       const nextTracks = this.contentQueue.slice(0, 2).filter(item => item.type !== 'segway');
//
//       // Generate segway text
//       const segwayText = await segwayManager.generateSegway(prevMeta, nextMeta, prevTracks, nextTracks);
//
//       if (segwayText && segwayText.trim()) {
//         // Generate segway audio file
//         const segwayFile = await segwayManager.prepareSegway(
//             segwayText,
//             prevMeta,
//             nextMeta,
//             `${currentlyPlaying.type}_to_${nextItem.type}`
//         );
//
//         if (segwayFile) {
//           console.log(`✅ Segway pre-generated: ${path.basename(segwayFile)}`);
//           return segwayFile;
//         }
//       }
//     } catch (error) {
//       console.error('Error generating segway from currently playing:', error);
//     }
//
//     return null;
//   }
//
//   /**
//    * Generate segway for a specific transition
//    */
//   async generateSegwayForTransition(prevItem, nextItem) {
//     if (!prevItem || !nextItem) return null;
//
//     // Import segwayManager here to avoid circular dependencies
//     const segwayManager = require('./segwayManager');
//
//     const prevMeta = { ...prevItem.meta, type: prevItem.type };
//     const nextMeta = { ...nextItem.meta, type: nextItem.type };
//
//     // Check if we should generate a segway for this transition
//     if (!segwayManager.shouldGenerateSegway(prevItem.type, nextItem.type)) {
//       return null;
//     }
//
//     try {
//       console.log(`🔄 Pre-generating segway: ${prevItem.meta.title} → ${nextItem.meta.title}`);
//
//       // Get additional context (previous tracks from play log, upcoming tracks from queue)
//       const { getLastPlays } = require('./playLogManager');
//       const prevTracks = getLastPlays(3).filter(entry => entry.type !== 'ad' && entry.type !== 'segway');
//       const nextTracks = this.contentQueue.slice(0, 2).filter(item => item.type !== 'segway');
//
//       // Generate segway text
//       const segwayText = await segwayManager.generateSegway(prevMeta, nextMeta, prevTracks, nextTracks);
//
//       if (segwayText && segwayText.trim()) {
//         // Generate segway audio file
//         const segwayFile = await segwayManager.prepareSegway(
//             segwayText,
//             prevMeta,
//             nextMeta,
//             `${prevItem.type}_to_${nextItem.type}`
//         );
//
//         if (segwayFile) {
//           console.log(`✅ Segway pre-generated: ${path.basename(segwayFile)}`);
//           return segwayFile;
//         }
//       }
//     } catch (error) {
//       console.error('Error generating segway for transition:', error);
//     }
//
//     return null;
//   }
//
//   /**
//    * Enhanced track selection process
//    * @param {string} type - Type of content to select
//    * @returns {Promise<Object>} - Selected track information
//    */
//   async selectNextTrack(type) {
//     // Check if we should use the enhanced selection process
//     if (!this.trackSelectionConfig.enabled) {
//       // Fall back to the original selection process
//       return this._legacySelectTrack(type);
//     }
//
//     try {
//       // Check for priority content first
//       if (this.trackSelectionConfig.requestsEnabled) {
//         const priorityContent = requestManager.getPriorityContent();
//         if (priorityContent && (priorityContent.type === type || type === 'music')) {
//           console.log(`[EnhancedContentQueueManager] Using priority content: "${priorityContent.metadata.title}"`);
//
//           // Clear priority content after using it
//           requestManager.clearPriorityContent();
//
//           return {
//             filepath: priorityContent.trackPath,
//             meta: {
//               ...priorityContent.metadata,
//               type: priorityContent.type || type
//             },
//             requestId: priorityContent.id
//           };
//         }
//       }
//
//       // Check for regular requests next
//       if (this.trackSelectionConfig.requestsEnabled && type === 'music') {
//         const nextRequest = requestManager.getNextRequest();
//         if (nextRequest) {
//           console.log(`[EnhancedContentQueueManager] Using requested track: "${nextRequest.metadata.title}" by ${nextRequest.requester}`);
//
//           return {
//             filepath: nextRequest.trackPath,
//             meta: {
//               ...nextRequest.metadata,
//               type,
//               isRequested: true
//             },
//             requestId: nextRequest.id
//           };
//         }
//       }
//
//       // Get all available tracks of the requested type
//       const tracks = await this._getAllTracksOfType(type);
//       if (!tracks || tracks.length === 0) {
//         console.warn(`[EnhancedContentQueueManager] No ${type} tracks available`);
//         return null;
//       }
//
//       // Get recent play history
//       const playLog = getLastPlays(this.historySize);
//
//       // Use the track scoring system to select the next track
//       const selectedTrack = trackScoring.selectNextTrack(tracks, playLog, {
//         debug: true
//       });
//
//       if (!selectedTrack) {
//         console.warn(`[EnhancedContentQueueManager] No suitable ${type} track found after scoring`);
//         return null;
//       }
//
//       // Log selection details
//       if (selectedTrack.score !== undefined) {
//         console.log(`[EnhancedContentQueueManager] Selected "${selectedTrack.title}" with score ${selectedTrack.score.toFixed(2)}`);
//
//         if (selectedTrack.scoreComponents) {
//           const components = selectedTrack.scoreComponents;
//           console.log(`[EnhancedContentQueueManager] Score components: rating=${components.ratingScore.toFixed(2)}, frequency=${components.frequencyScore.toFixed(2)}, waveFit=${components.waveFit.toFixed(2)}`);
//         }
//
//         if (this.trackSelectionConfig.moodEnergyEnabled) {
//           const currentMood = moodEnergyManager.getCurrentMood();
//           const currentEnergy = moodEnergyManager.getCurrentEnergy();
//           console.log(`[EnhancedContentQueueManager] Current mood/energy: ${currentMood.toFixed(1)}/${currentEnergy.toFixed(1)} (${moodEnergyManager.getCurrentStateDescription()})`);
//         }
//       }
//
//       // Return the selected track
//       return {
//         filepath: selectedTrack.filepath,
//         meta: {
//           ...selectedTrack,
//           type
//         }
//       };
//     } catch (error) {
//       console.error(`[EnhancedContentQueueManager] Error selecting ${type} track:`, error);
//       // Fall back to legacy selection in case of error
//       return this._legacySelectTrack(type);
//     }
//   }
//
//   /**
//    * Legacy track selection process (fallback)
//    * @param {string} type - Type of content to select
//    * @returns {Promise<Object>} - Selected track information
//    * @private
//    */
//   async _legacySelectTrack(type) {
//     // Import the original pickNextTrack function
//     const { pickNextTrack } = require('./trackManager');
//     return pickNextTrack(type);
//   }
//
//   /**
//    * Get all tracks of a specific type
//    * @param {string} type - Type of content to get
//    * @returns {Promise<Array<Object>>} - Array of track metadata
//    * @private
//    */
//   async _getAllTracksOfType(type) {
//     const dir = path.join(STATION_CONFIG.contentDirectories.ready, type);
//
//     if (!fs.existsSync(dir)) {
//       return [];
//     }
//
//     // Get all MP3 files in the directory
//     const files = fs.readdirSync(dir)
//       .filter(f => f.endsWith('.mp3'))
//       .map(f => path.join(dir, f));
//
//     if (files.length === 0) {
//       return [];
//     }
//
//     // Get play history for play count
//     const playLog = getLastPlays(100); // Use a larger history for play count
//
//     // Process each file to get metadata and play count
//     const tracks = await Promise.all(files.map(async (filepath) => {
//       try {
//         // Extract metadata
//         const meta = await extractMetadata(filepath) || {};
//
//         // Get relative path for play count lookup
//         const relPath = path.relative(STATION_CONFIG.contentDirectories.ready, filepath);
//
//         // Count plays in history
//         const playCount = playLog.filter(entry => entry.relPath === relPath).length;
//
//         // Get last played time
//         const lastPlayEntry = playLog.find(entry => entry.relPath === relPath);
//         const lastPlayed = lastPlayEntry ? new Date(lastPlayEntry.timestamp) : null;
//
//         // Return track with metadata
//         return {
//           filepath,
//           relPath,
//           title: meta.title || path.basename(filepath),
//           artist: meta.artist || 'Unknown',
//           mood: meta.mood || 5, // Default mood
//           energy: meta.energy || 5, // Default energy
//           averageRating: meta.averageRating || 3, // Default rating
//           playCount,
//           lastPlayed,
//           ...(meta || {})
//         };
//       } catch (error) {
//         console.error(`[EnhancedContentQueueManager] Error processing ${filepath}:`, error);
//         return null;
//       }
//     }));
//
//     // Filter out null entries
//     return tracks.filter(track => track !== null);
//   }
//
//   /**
//    * Initialize the queue with initial content
//    */
//   async initialize() {
//     console.log('🚀 Initializing enhanced content queue...');
//     await this.replenishQueue();
//     console.log(`✅ Enhanced content queue initialized with ${this.contentQueue.length} items`);
//     return this.contentQueue.length > 0;
//   }
//
//   /**
//    * Clean up any resources when shutting down
//    */
//   async cleanup() {
//     // Import segwayManager to clean up segway files
//     const segwayManager = require('./segwayManager');
//
//     // Clean up segway files that are not in the current queue
//     // This preserves segways that are still needed for playback
//     // Pass null as the currently playing file since EnhancedContentQueueManager doesn't know which file is playing
//     await segwayManager.removeOldSegways(this.contentQueue, null);
//
//     // Clear the queue
//     this.contentQueue = [];
//     console.log('🧹 Enhanced content queue cleared and unused segway files cleaned up');
//   }
// }
//
// module.exports = EnhancedContentQueueManager;
