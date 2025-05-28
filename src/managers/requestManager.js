/**
 * Request Manager
 * 
 * Manages track requests and priority content for the track selection system.
 * Provides an interface for requesting tracks and handling priority content
 * that should override the normal scheduling pattern.
 */

const fs = require('fs');
const path = require('path');
const { STATION_CONFIG } = require('../core/config');
const { extractMetadata } = require('../utils');

class RequestManager {
  /**
   * Create a new request manager
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.config = {
      enabled: STATION_CONFIG.trackSelection?.requestsEnabled || false,
      maxQueueSize: STATION_CONFIG.requests?.maxQueueSize || 10,
      requestTimeout: STATION_CONFIG.requests?.timeout || 30 * 60 * 1000, // 30 minutes
      persistencePath: path.join(__dirname, '../../data/requests.json'),
      ...(STATION_CONFIG.requestManager || {}),
      ...options
    };

    // Queue of requested tracks
    this.requestQueue = [];

    // Priority content that should override the normal pattern
    this.priorityContent = null;

    // Load persisted requests if available
    if (this.config.enabled) {
      this._loadRequests();
      console.log(`[RequestManager] Initialized with ${this.requestQueue.length} pending requests`);
    } else {
      console.log('[RequestManager] Initialized in disabled mode');
    }

    // Set up periodic cleanup of expired requests
    if (this.config.enabled) {
      this._setupCleanupInterval();
    }
  }

  /**
   * Request a track to be played
   * @param {Object} request - Request information
   * @param {string} request.trackPath - Path to the requested track
   * @param {string} request.requester - Name of the person making the request
   * @param {number} request.priority - Priority level (higher = more important)
   * @param {boolean} request.immediate - Whether to play immediately (override pattern)
   * @returns {Promise<Object>} - Request status
   */
  async requestTrack(request) {
    if (!this.config.enabled) {
      return { success: false, message: 'Request system is disabled' };
    }

    // Validate request
    if (!request.trackPath) {
      return { success: false, message: 'Track path is required' };
    }

    // Check if file exists
    if (!fs.existsSync(request.trackPath)) {
      return { success: false, message: 'Track not found' };
    }

    // Check if queue is full
    if (this.requestQueue.length >= this.config.maxQueueSize) {
      return { success: false, message: 'Request queue is full' };
    }

    try {
      // Extract metadata from the track
      const metadata = await extractMetadata(request.trackPath) || {};

      // Create request object
      const newRequest = {
        id: `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        trackPath: request.trackPath,
        requester: request.requester || 'Anonymous',
        priority: request.priority || 1,
        immediate: !!request.immediate,
        timestamp: Date.now(),
        expires: Date.now() + this.config.requestTimeout,
        metadata: {
          title: metadata.title || path.basename(request.trackPath),
          artist: metadata.artist || 'Unknown',
          ...(metadata || {})
        }
      };

      // Add request to queue
      this.requestQueue.push(newRequest);

      // Sort queue by priority and timestamp
      this._sortQueue();

      // If immediate, set as priority content
      if (newRequest.immediate) {
        this.priorityContent = newRequest;
        console.log(`[RequestManager] Immediate request set as priority: "${newRequest.metadata.title}"`);
      }

      // Save requests
      await this._saveRequests();

      console.log(`[RequestManager] Added request for "${newRequest.metadata.title}" by ${newRequest.requester}`);

      return { 
        success: true, 
        message: 'Request added successfully',
        request: newRequest
      };
    } catch (error) {
      console.error('[RequestManager] Error adding request:', error);
      return { success: false, message: `Error adding request: ${error.message}` };
    }
  }

  /**
   * Get the next requested track
   * @returns {Object|null} - Next requested track or null if none available
   */
  getNextRequest() {
    if (!this.config.enabled || this.requestQueue.length === 0) {
      return null;
    }

    // Check for expired requests
    this._cleanupExpiredRequests();

    // Return the highest priority request
    return this.requestQueue.length > 0 ? this.requestQueue[0] : null;
  }

  /**
   * Get the current priority content
   * @returns {Object|null} - Priority content or null if none available
   */
  getPriorityContent() {
    if (!this.config.enabled || !this.priorityContent) {
      return null;
    }

    // Check if priority content has expired
    if (this.priorityContent.expires < Date.now()) {
      console.log(`[RequestManager] Priority content expired: "${this.priorityContent.metadata.title}"`);
      this.priorityContent = null;
      return null;
    }

    return this.priorityContent;
  }

  /**
   * Mark a request as fulfilled
   * @param {string} requestId - ID of the request to mark as fulfilled
   * @returns {Promise<boolean>} - Success status
   */
  async fulfillRequest(requestId) {
    if (!this.config.enabled) {
      return false;
    }

    // Find request in queue
    const index = this.requestQueue.findIndex(req => req.id === requestId);
    if (index === -1) {
      return false;
    }

    // Remove request from queue
    const request = this.requestQueue.splice(index, 1)[0];

    // If this was the priority content, clear it
    if (this.priorityContent && this.priorityContent.id === requestId) {
      this.priorityContent = null;
    }

    // Save updated queue
    await this._saveRequests();

    console.log(`[RequestManager] Fulfilled request for "${request.metadata.title}" by ${request.requester}`);

    return true;
  }

  /**
   * Get all pending requests
   * @returns {Array<Object>} - Array of pending requests
   */
  getAllRequests() {
    return [...this.requestQueue];
  }

  /**
   * Clear all requests
   * @returns {Promise<boolean>} - Success status
   */
  async clearAllRequests() {
    this.requestQueue = [];
    this.priorityContent = null;

    await this._saveRequests();

    console.log('[RequestManager] Cleared all requests');

    return true;
  }

  /**
   * Set priority content that should override the normal pattern
   * @param {Object} content - Priority content
   * @param {string} content.trackPath - Path to the content
   * @param {string} content.type - Type of content (e.g., 'news', 'announcement')
   * @param {number} content.duration - Duration in milliseconds
   * @returns {Promise<boolean>} - Success status
   */
  async setPriorityContent(content) {
    if (!this.config.enabled) {
      return false;
    }

    try {
      // Extract metadata from the content
      const metadata = await extractMetadata(content.trackPath) || {};

      // Create priority content object
      this.priorityContent = {
        id: `priority_${Date.now()}`,
        trackPath: content.trackPath,
        type: content.type || 'priority',
        timestamp: Date.now(),
        expires: Date.now() + (content.duration || this.config.requestTimeout),
        metadata: {
          title: metadata.title || path.basename(content.trackPath),
          artist: metadata.artist || 'System',
          ...(metadata || {})
        }
      };

      console.log(`[RequestManager] Set priority content: "${this.priorityContent.metadata.title}" (${this.priorityContent.type})`);

      return true;
    } catch (error) {
      console.error('[RequestManager] Error setting priority content:', error);
      return false;
    }
  }

  /**
   * Clear priority content
   * @returns {boolean} - Success status
   */
  clearPriorityContent() {
    if (this.priorityContent) {
      console.log(`[RequestManager] Cleared priority content: "${this.priorityContent.metadata.title}"`);
      this.priorityContent = null;
      return true;
    }
    return false;
  }

  /**
   * Sort the request queue by priority and timestamp
   * @private
   */
  _sortQueue() {
    this.requestQueue.sort((a, b) => {
      // Sort by priority (higher first)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Then by timestamp (older first)
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Clean up expired requests
   * @private
   */
  _cleanupExpiredRequests() {
    const now = Date.now();
    const initialCount = this.requestQueue.length;

    this.requestQueue = this.requestQueue.filter(req => req.expires > now);

    if (initialCount !== this.requestQueue.length) {
      console.log(`[RequestManager] Removed ${initialCount - this.requestQueue.length} expired requests`);
      this._saveRequests().catch(err => {
        console.error('[RequestManager] Error saving after cleanup:', err);
      });
    }
  }

  /**
   * Set up interval to clean up expired requests
   * @private
   */
  _setupCleanupInterval() {
    setInterval(() => {
      this._cleanupExpiredRequests();
    }, 5 * 60 * 1000); // Clean up every 5 minutes
  }

  /**
   * Save requests to disk
   * @returns {Promise<boolean>} - Success status
   * @private
   */
  async _saveRequests() {
    if (!this.config.enabled) {
      return false;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.persistencePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save requests
      const data = {
        requests: this.requestQueue,
        priorityContent: this.priorityContent,
        savedAt: Date.now()
      };

      fs.writeFileSync(
        this.config.persistencePath,
        JSON.stringify(data, null, 2),
        'utf8'
      );

      return true;
    } catch (error) {
      console.error('[RequestManager] Error saving requests:', error);
      return false;
    }
  }

  /**
   * Load requests from disk
   * @private
   */
  _loadRequests() {
    try {
      if (!fs.existsSync(this.config.persistencePath)) {
        return;
      }

      const data = JSON.parse(fs.readFileSync(this.config.persistencePath, 'utf8'));

      if (data.requests && Array.isArray(data.requests)) {
        this.requestQueue = data.requests;

        // Clean up expired requests
        this._cleanupExpiredRequests();
      }

      if (data.priorityContent) {
        this.priorityContent = data.priorityContent;

        // Check if priority content has expired
        if (this.priorityContent.expires < Date.now()) {
          console.log(`[RequestManager] Loaded priority content has expired: "${this.priorityContent.metadata.title}"`);
          this.priorityContent = null;
        } else {
          console.log(`[RequestManager] Loaded priority content: "${this.priorityContent.metadata.title}"`);
        }
      }

      console.log(`[RequestManager] Loaded ${this.requestQueue.length} requests from ${new Date(data.savedAt).toISOString()}`);
    } catch (error) {
      console.error('[RequestManager] Error loading requests:', error);
    }
  }
}

// Create singleton instance
const instance = new RequestManager();

module.exports = instance;
