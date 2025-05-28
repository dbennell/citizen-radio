/**
 * Interval Manager Module
 * 
 * Provides utilities for managing intervals with proper cleanup,
 * error handling, and backoff strategy.
 */

/**
 * Interval Manager class
 * @class IntervalManager
 */
class IntervalManager {
    /**
     * Create a new Interval Manager
     * @param {Object} options - Configuration options
     * @param {number} options.initialInterval - Initial interval in milliseconds
     * @param {number} options.maxInterval - Maximum interval in milliseconds
     * @param {number} options.backoffFactor - Factor to multiply interval by on error
     * @param {number} options.resetAfter - Time in milliseconds after which to reset to initial interval
     */
    constructor(options = {}) {
        this.options = {
            initialInterval: options.initialInterval || 5000,
            maxInterval: options.maxInterval || 60000,
            backoffFactor: options.backoffFactor || 2,
            resetAfter: options.resetAfter || 300000 // 5 minutes
        };
        
        this.intervals = new Map();
        this.errorCounts = new Map();
        this.lastErrorTimes = new Map();
        this.currentIntervals = new Map();
    }
    
    /**
     * Start a new interval
     * @param {string} id - Unique identifier for the interval
     * @param {Function} callback - Function to call on each interval
     * @param {number} interval - Interval in milliseconds (optional, uses initialInterval if not provided)
     * @returns {string} - The interval ID
     */
    start(id, callback, interval) {
        // Clean up any existing interval with this ID
        this.stop(id);
        
        // Use provided interval or default
        const initialInterval = interval || this.options.initialInterval;
        this.currentIntervals.set(id, initialInterval);
        
        // Reset error count and time
        this.errorCounts.set(id, 0);
        this.lastErrorTimes.set(id, 0);
        
        // Create a wrapper function that handles errors and rescheduling
        const wrappedCallback = async () => {
            try {
                // Call the original callback and wait for it to complete
                await Promise.resolve(callback());
                
                // If successful and we've backed off, gradually return to normal interval
                if (this.errorCounts.get(id) > 0) {
                    const timeSinceLastError = Date.now() - this.lastErrorTimes.get(id);
                    if (timeSinceLastError > this.options.resetAfter) {
                        // Reset to initial interval
                        this.errorCounts.set(id, 0);
                        this.currentIntervals.set(id, initialInterval);
                    }
                }
                
                // Schedule the next execution
                this.scheduleNext(id, wrappedCallback);
            } catch (error) {
                console.error(`Error in interval ${id}:`, error);
                
                // Increment error count
                const errorCount = this.errorCounts.get(id) + 1;
                this.errorCounts.set(id, errorCount);
                this.lastErrorTimes.set(id, Date.now());
                
                // Apply backoff strategy
                let newInterval = this.currentIntervals.get(id) * this.options.backoffFactor;
                if (newInterval > this.options.maxInterval) {
                    newInterval = this.options.maxInterval;
                }
                this.currentIntervals.set(id, newInterval);
                
                console.log(`Backing off interval ${id} to ${newInterval}ms after ${errorCount} errors`);
                
                // Schedule the next execution with the new interval
                this.scheduleNext(id, wrappedCallback);
            }
        };
        
        // Schedule the first execution
        this.scheduleNext(id, wrappedCallback);
        
        return id;
    }
    
    /**
     * Schedule the next execution of an interval
     * @param {string} id - Interval ID
     * @param {Function} callback - Function to call
     * @private
     */
    scheduleNext(id, callback) {
        const interval = this.currentIntervals.get(id);
        const timeoutId = setTimeout(callback, interval);
        
        // Store the timeout ID for cleanup
        this.intervals.set(id, timeoutId);
        
        // Don't keep the process alive just for this timer
        if (timeoutId.unref) {
            timeoutId.unref();
        }
    }
    
    /**
     * Stop an interval
     * @param {string} id - Interval ID
     * @returns {boolean} - Whether the interval was stopped
     */
    stop(id) {
        if (this.intervals.has(id)) {
            clearTimeout(this.intervals.get(id));
            this.intervals.delete(id);
            this.errorCounts.delete(id);
            this.lastErrorTimes.delete(id);
            this.currentIntervals.delete(id);
            return true;
        }
        return false;
    }
    
    /**
     * Check if an interval is running
     * @param {string} id - Interval ID
     * @returns {boolean} - Whether the interval is running
     */
    isRunning(id) {
        return this.intervals.has(id);
    }
    
    /**
     * Get the current interval for an ID
     * @param {string} id - Interval ID
     * @returns {number|null} - Current interval in milliseconds or null if not found
     */
    getCurrentInterval(id) {
        return this.currentIntervals.get(id) || null;
    }
    
    /**
     * Get the error count for an ID
     * @param {string} id - Interval ID
     * @returns {number} - Error count
     */
    getErrorCount(id) {
        return this.errorCounts.get(id) || 0;
    }
    
    /**
     * Stop all intervals
     */
    stopAll() {
        for (const id of this.intervals.keys()) {
            this.stop(id);
        }
    }
    
    /**
     * Get all running interval IDs
     * @returns {Array<string>} - Array of interval IDs
     */
    getRunningIntervals() {
        return Array.from(this.intervals.keys());
    }
    
    /**
     * Get the number of running intervals
     * @returns {number} - Number of running intervals
     */
    count() {
        return this.intervals.size;
    }
}

module.exports = IntervalManager;