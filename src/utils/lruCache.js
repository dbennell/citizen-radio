/**
 * LRU Cache Module
 * 
 * Provides a Least Recently Used (LRU) cache implementation
 * for efficient memory management of frequently accessed items.
 */

/**
 * LRU Cache implementation
 * @class LRUCache
 */
class LRUCache {
    /**
     * Create a new LRU Cache
     * @param {number} capacity - Maximum number of items to store in the cache
     */
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    /**
     * Get an item from the cache
     * @param {string} key - Key to look up
     * @returns {*} - The cached value or undefined if not found
     */
    get(key) {
        if (!this.cache.has(key)) {
            this.stats.misses++;
            return undefined;
        }
        
        // Move the accessed item to the end of the Map (most recently used)
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        
        this.stats.hits++;
        return value;
    }

    /**
     * Set an item in the cache
     * @param {string} key - Key to store
     * @param {*} value - Value to store
     */
    set(key, value) {
        // If the key already exists, delete it first
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        // If the cache is at capacity, evict the least recently used item
        else if (this.cache.size >= this.capacity) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            this.stats.evictions++;
        }
        
        // Add the new item
        this.cache.set(key, value);
    }

    /**
     * Check if an item exists in the cache
     * @param {string} key - Key to check
     * @returns {boolean} - Whether the key exists in the cache
     */
    has(key) {
        return this.cache.has(key);
    }

    /**
     * Remove an item from the cache
     * @param {string} key - Key to remove
     * @returns {boolean} - Whether the item was removed
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * Clear the cache
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Get the number of items in the cache
     * @returns {number} - Number of items in the cache
     */
    size() {
        return this.cache.size;
    }

    /**
     * Get the cache statistics
     * @returns {Object} - Cache statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset the cache statistics
     */
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    /**
     * Get all keys in the cache
     * @returns {Array} - Array of keys
     */
    keys() {
        return Array.from(this.cache.keys());
    }

    /**
     * Get all values in the cache
     * @returns {Array} - Array of values
     */
    values() {
        return Array.from(this.cache.values());
    }

    /**
     * Get all entries in the cache
     * @returns {Array} - Array of [key, value] pairs
     */
    entries() {
        return Array.from(this.cache.entries());
    }
}

module.exports = LRUCache;