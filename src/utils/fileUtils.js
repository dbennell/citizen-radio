/**
 * File Utilities Module
 * 
 * Provides utilities for optimized file I/O operations, including:
 * - Buffered write streams for log files
 * - File rotation and archiving
 * - Atomic file operations
 */

const fs = require('fs');
const fsp = require('fs').promises; // Add this line
const path = require('path');
const { promisify } = require('util');
const { STATION_CONFIG } = require('../core/config');

// Promisify fs functions for async/await usage
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const rename = promisify(fs.rename);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

// In-memory buffers for log files
const writeBuffers = new Map();
const writeStreams = new Map();

// Default configuration
const DEFAULT_CONFIG = {
    bufferSize: 64 * 1024, // 64KB buffer size
    flushInterval: 5000, // Flush every 5 seconds
    rotationSize: 10 * 1024 * 1024, // 10MB max file size before rotation
    maxArchives: 10, // Maximum number of archive files to keep
    archiveDir: 'archives', // Directory for archived files
};

/**
 * Get configuration for file operations
 * @param {string} fileType - Type of file (chat, feedback, ratings)
 * @returns {Object} - Configuration object
 */
function getConfig(fileType) {
    const config = { ...DEFAULT_CONFIG };

    // Override with values from STATION_CONFIG if available
    if (STATION_CONFIG.fileIO?.[fileType]) {
        Object.assign(config, STATION_CONFIG.fileIO[fileType]);
    }

    return config;
}

/**
 * Initialize a buffered write stream for a file
 * @param {string} filePath - Path to the file
 * @param {string} fileType - Type of file (chat, feedback, ratings)
 * @returns {Object} - Write stream interface
 */
function initBufferedWriteStream(filePath, fileType) {
    if (writeStreams.has(filePath)) {
        return writeStreams.get(filePath);
    }

    const config = getConfig(fileType);
    const buffer = [];
    let flushTimer = null;
    let totalBufferedBytes = 0;

    // Create the directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Function to flush the buffer to disk
    const flush = async (force = false) => {
        if (buffer.length === 0) return;

        // If not forced, check if buffer is large enough to flush
        if (!force && totalBufferedBytes < config.bufferSize) return;

        const dataToWrite = buffer.slice();
        buffer.length = 0;
        totalBufferedBytes = 0;

        try {
            // For JSON files, we need to read the existing content, merge, and write back
            if (filePath.endsWith('.json')) {
                await writeJsonFile(filePath, dataToWrite);
            } else {
                // For log files, we can append directly
                await appendToFile(filePath, dataToWrite.join(''));
            }

            // Check if file needs rotation
            await checkRotation(filePath, fileType);
        } catch (error) {
            console.error(`Error flushing buffer for ${filePath}:`, error);
            // Put the data back in the buffer to try again later
            buffer.unshift(...dataToWrite);
            totalBufferedBytes = dataToWrite.reduce((total, item) => 
                total + (typeof item === 'string' ? Buffer.byteLength(item) : JSON.stringify(item).length), 0);
        }
    };

    // Start the flush timer
    const startFlushTimer = () => {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(async () => {
            await flush(true);
            startFlushTimer();
        }, config.flushInterval);
        flushTimer.unref(); // Don't keep the process alive just for this timer
    };

    startFlushTimer();

    // Create the stream interface
    const stream = {
        write: (data) => {
            const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
            buffer.push(dataStr);
            totalBufferedBytes += Buffer.byteLength(dataStr);

            // Flush if buffer exceeds size threshold
            if (totalBufferedBytes >= config.bufferSize) {
                flush();
            }

            return true;
        },
        writeJSON: async (data) => {
            try {
                // Ensure data is fully resolved if it's a Promise
                const resolvedData = await Promise.resolve(data);

                buffer.push(resolvedData); // Store the resolved object for JSON files
                totalBufferedBytes += Buffer.byteLength(JSON.stringify(resolvedData));

                // Flush if buffer exceeds size threshold
                if (totalBufferedBytes >= config.bufferSize) {
                    flush();
                }

                return true;
            } catch (error) {
                console.error(`Error resolving data for writeJSON in ${filePath}:`, error);
                return false;
            }
        },
        flush: async () => {
            await flush(true);
        },
        close: async () => {
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            await flush(true);
            writeStreams.delete(filePath);
        }
    };

    writeStreams.set(filePath, stream);
    return stream;
}

/**
 * Append data to a file
 * @param {string} filePath - Path to the file
 * @param {string} data - Data to append
 * @returns {Promise<void>}
 */
async function appendToFile(filePath, data) {
    return new Promise((resolve, reject) => {
        fs.appendFile(filePath, data, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

/**
 * Write JSON data to a file atomically
 * @param {string} filePath - Path to the file
 * @param {Array|Object} newData - New data to write (array of objects or single object)
 * @returns {Promise<void>}
 */
async function writeJsonFile(filePath, newData) {
    // Create a file lock to prevent concurrent writes
    const lockFile = `${filePath}.lock`;
    let lockAcquired = false;

    try {
        // Ensure newData is fully resolved if it's a Promise
        newData = await Promise.resolve(newData);
        // Try to acquire the lock
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                // Create the lock file if it doesn't exist
                await fs.promises.writeFile(lockFile, String(process.pid), { flag: 'wx' });
                lockAcquired = true;
                break;
            } catch (lockError) {
                if (lockError.code === 'EEXIST') {
                    // Lock file exists, wait and retry
                    await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));

                    // Check if the lock is stale (older than 30 seconds)
                    try {
                        const lockStats = await fs.promises.stat(lockFile);
                        const lockAge = Date.now() - lockStats.mtime.getTime();
                        if (lockAge > 30000) {
                            // Lock is stale, remove it and try again
                            await fs.promises.unlink(lockFile);
                        }
                    } catch (statError) {
                        // Lock file might have been removed, continue
                    }
                } else {
                    // Other error, rethrow
                    throw lockError;
                }
            }
        }

        if (!lockAcquired) {
            throw new Error(`Could not acquire lock for ${filePath} after multiple attempts`);
        }

        let existingData;

        // Read existing data if file exists
        try {
            const fileContent = await readFile(filePath, 'utf8');
            existingData = JSON.parse(fileContent);
        } catch (error) {
            // File doesn't exist or is invalid JSON
            existingData = filePath.endsWith('ratings.json') ? {} : [];
        }

        // Merge data based on file type
        let mergedData;
        if (Array.isArray(existingData)) {
            // For array-based JSON files (like chat.log)
            mergedData = [...existingData];

            // Add new items, handling both arrays of items and single items
            if (Array.isArray(newData)) {
                mergedData.push(...newData);
            } else {
                mergedData.push(newData);
            }
        } else {
            // For object-based JSON files (like ratings.json)
            mergedData = { ...existingData };

            // Merge in new data
            if (Array.isArray(newData)) {
                newData.forEach(item => {
                    if (item && typeof item === 'object') {
                        Object.assign(mergedData, item);
                    }
                });
            } else if (newData && typeof newData === 'object') {
                Object.assign(mergedData, newData);
            }
        }

        // Create a unique temporary file to avoid collisions
        const uniqueId = Date.now() + '-' + Math.floor(Math.random() * 10000);
        const tempPath = `${filePath}.${uniqueId}.tmp`;

        // Check for Promise objects in the data before writing
        const safeData = JSON.parse(JSON.stringify(mergedData, (key, value) => {
            if (value !== null && typeof value === 'object' && typeof value.then === 'function') {
                console.warn(`Found Promise object in JSON data for key "${key}" in ${filePath}, replacing with null`);
                return null;
            }
            return value;
        }));

        // Write to the temporary file
        await writeFile(tempPath, JSON.stringify(safeData, null, 2));

        // Rename to the actual file (atomic operation)
        await rename(tempPath, filePath);
    } catch (error) {
        console.error(`Error writing JSON file ${filePath}:`, error);
        throw error;
    } finally {
        // Release the lock if we acquired it
        if (lockAcquired) {
            try {
                await fs.promises.unlink(lockFile);
            } catch (unlinkError) {
                // Ignore errors when removing the lock file
            }
        }
    }
}

/**
 * Check if a file needs rotation and rotate if necessary
 * @param {string} filePath - Path to the file
 * @param {string} fileType - Type of file (chat, feedback, ratings)
 * @returns {Promise<boolean>} - Whether rotation was performed
 */
async function checkRotation(filePath, fileType) {
    try {
        const config = getConfig(fileType);

        // Skip rotation for non-log files or if rotation is disabled
        if (!filePath.endsWith('.log') || config.rotationSize <= 0) {
            return false;
        }

        // Check file size
        const stats = await stat(filePath);
        if (stats.size < config.rotationSize) {
            return false;
        }

        // Perform rotation
        await rotateFile(filePath, fileType);
        return true;
    } catch (error) {
        console.error(`Error checking rotation for ${filePath}:`, error);
        return false;
    }
}

/**
 * Rotate a log file
 * @param {string} filePath - Path to the file
 * @param {string} fileType - Type of file (chat, feedback, ratings)
 * @returns {Promise<void>}
 */
async function rotateFile(filePath, fileType) {
    try {
        const config = getConfig(fileType);
        const baseDir = path.dirname(filePath);
        const baseName = path.basename(filePath);
        const archiveDir = path.join(baseDir, config.archiveDir);

        // Create archive directory if it doesn't exist
        if (!fs.existsSync(archiveDir)) {
            await mkdir(archiveDir, { recursive: true });
        }

        // Generate archive filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = path.join(archiveDir, `${baseName}.${timestamp}`);

        // Copy current file to archive
        await fs.promises.copyFile(filePath, archivePath);

        // Clear the current file (create empty file)
        if (filePath.endsWith('.json')) {
            // For JSON files, write an empty array or object
            const emptyContent = filePath.includes('ratings') ? '{}' : '[]';
            await writeFile(filePath, emptyContent);
        } else {
            // For other log files, truncate to empty
            await writeFile(filePath, '');
        }

        console.log(`Rotated ${filePath} to ${archivePath}`);

        // Clean up old archives if we have too many
        await cleanupOldArchives(archiveDir, baseName, config.maxArchives);
    } catch (error) {
        console.error(`Error rotating file ${filePath}:`, error);
        throw error;
    }
}

/**
 * Clean up old archive files
 * @param {string} archiveDir - Directory containing archives
 * @param {string} baseName - Base name of the log file
 * @param {number} maxArchives - Maximum number of archives to keep
 * @returns {Promise<void>}
 */
async function cleanupOldArchives(archiveDir, baseName, maxArchives) {
    try {
        // Get all archive files for this log
        const files = await readdir(archiveDir);
        const archives = files
            .filter(file => file.startsWith(baseName))
            .map(file => ({
                name: file,
                path: path.join(archiveDir, file),
                time: fs.statSync(path.join(archiveDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time); // Sort by time, newest first

        // Delete oldest archives if we have too many
        if (archives.length > maxArchives) {
            const toDelete = archives.slice(maxArchives);
            for (const file of toDelete) {
                await fs.promises.unlink(file.path);
                console.log(`Deleted old archive: ${file.path}`);
            }
        }
    } catch (error) {
        console.error(`Error cleaning up old archives in ${archiveDir}:`, error);
    }
}

/**
 * Get a buffered write stream for a file
 * @param {string} filePath - Path to the file
 * @param {string} fileType - Type of file (chat, feedback, ratings)
 * @returns {Object} - Write stream interface
 */
function getBufferedWriteStream(filePath, fileType) {
    return initBufferedWriteStream(filePath, fileType);
}

/**
 * Append to a JSON log file using buffered writes
 * @param {string} filePath - Path to the file
 * @param {string} fileType - Type of file (chat, feedback, ratings)
 * @param {Object|Array} data - Data to append
 * @returns {Promise<boolean>} - Success status
 */
// async function appendToJsonLog(filePath, fileType, data) {
//     try {
//         // Acquire the stream with a small retry mechanism to handle potential race conditions
//         let stream = null;
//         let retries = 3;
//
//         while (retries > 0 && !stream) {
//             try {
//                 stream = getBufferedWriteStream(filePath, fileType);
//             } catch (err) {
//                 console.warn(`Failed to get write stream for ${filePath}, retrying... (${retries} attempts left)`);
//                 retries--;
//                 // Wait a short time before retrying
//                 await new Promise(resolve => setTimeout(resolve, 100));
//             }
//         }
//
//         if (!stream) {
//             throw new Error(`Failed to get write stream for ${filePath} after multiple attempts`);
//         }
//
//         stream.writeJSON(data);
//         return true;
//     } catch (error) {
//         console.error(`Error appending to JSON log ${filePath}:`, error);
//         return false;
//     }
// }
async function appendToJsonLog(filePath, key, entry) {
    try {
        // Ensure entry is fully resolved if it's a Promise
        entry = await Promise.resolve(entry);

        return await retryOperation(async () => {
            const tempFilePath = `${filePath}.tmp`;

            // Read the existing data (fallback to an array if the file is empty or missing)
            const data = await safeReadJsonFile(filePath, []);

            // Append the new entry
            data.push(entry);

            // Write to a temporary file
            await fs.promises.writeFile(tempFilePath, JSON.stringify(data, null, 2), 'utf8');

            // Rename to the final file
            await fs.promises.rename(tempFilePath, filePath);

            console.log(`[FileUtils] Successfully appended entry to: ${filePath}`);
            return true;
        });
    } catch (error) {
        console.error(`[FileUtils] Error appending to JSON log: ${filePath}`, error);
        return false;
    }
}


/**
 * Read a JSON file
 * @param {string} filePath - Path to the file
 * @param {*} defaultValue - Default value if file doesn't exist
 * @returns {Promise<Object|Array>} - Parsed JSON data
 */
async function readJsonFile(filePath, defaultValue = {}) {
    return safeReadJsonFile(filePath, defaultValue);
}

/**
 * Safely read a JSON file with enhanced corruption recovery
 * @param {string} filePath - Path to the file
 * @param {*} fallback - Default value if file doesn't exist or is corrupted
 * @returns {Promise<Object|Array>} - Parsed JSON data
 */
async function safeReadJsonFile(filePath, fallback = []) {
    try {
        if (!fs.existsSync(filePath)) {
            return fallback;
        }

        // Read the file content
        const data = await fsp.readFile(filePath, 'utf8');

        // Trim and sanitize the data
        let cleanData = data.trim();

        // Check for empty file
        if (!cleanData) {
            console.warn(`[FileUtils] Empty file ${filePath}, using fallback.`);
            return fallback;
        }

        // Try to parse the data directly first
        try {
            return JSON.parse(cleanData);
        } catch (parseError) {
            console.error(`[FileUtils] Failed to parse JSON file (${filePath}), attempting to fix...`);
            console.error(`[FileUtils] Parse error: ${parseError.message}`);

            let fixedData = cleanData;

            // Step 1: Remove any [object Promise] strings that might have been appended
            if (fixedData.includes('[object Promise]')) {
                console.warn(`[FileUtils] Found [object Promise] in ${filePath}, removing it.`);
                fixedData = fixedData.replace(/\[object Promise\]/g, '');
            }

            // Step 2: Remove non-printable characters and control characters
            const originalLength = fixedData.length;
            fixedData = fixedData.replace(/[^\x20-\x7E\r\n\t]+/g, '');
            if (fixedData.length !== originalLength) {
                console.warn(`[FileUtils] Removed ${originalLength - fixedData.length} non-printable characters from ${filePath}`);
            }

            // Step 3: Try to fix common JSON syntax issues
            // 3.1. Remove trailing commas
            fixedData = fixedData.replace(/,\s*([\]}])/g, '$1');

            // 3.2. Fix missing quotes around property names
            fixedData = fixedData.replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3');

            // 3.3. Fix unquoted string values
            fixedData = fixedData.replace(/:(\s*)([a-zA-Z0-9_$]+)([,}])/g, ':"$2"$3');

            // 3.4. Try to fix unclosed arrays or objects
            const openBraces = (fixedData.match(/\{/g) || []).length;
            const closeBraces = (fixedData.match(/\}/g) || []).length;
            const openBrackets = (fixedData.match(/\[/g) || []).length;
            const closeBrackets = (fixedData.match(/\]/g) || []).length;

            // Add missing closing braces/brackets
            if (openBraces > closeBraces) {
                console.warn(`[FileUtils] Adding ${openBraces - closeBraces} missing closing braces to ${filePath}`);
                fixedData += '}'.repeat(openBraces - closeBraces);
            }
            if (openBrackets > closeBrackets) {
                console.warn(`[FileUtils] Adding ${openBrackets - closeBrackets} missing closing brackets to ${filePath}`);
                fixedData += ']'.repeat(openBrackets - closeBrackets);
            }

            // Step 4: Try to parse the fixed data
            try {
                const parsedData = JSON.parse(fixedData);
                console.log(`[FileUtils] Successfully fixed and parsed JSON in ${filePath}`);

                // Write the fixed data back to the file to prevent future issues
                try {
                    await fsp.writeFile(filePath, JSON.stringify(parsedData, null, 2), 'utf8');
                    console.log(`[FileUtils] Saved fixed JSON back to ${filePath}`);
                } catch (writeError) {
                    console.error(`[FileUtils] Failed to save fixed JSON to ${filePath}:`, writeError);
                }

                return parsedData;
            } catch (fixError) {
                console.error(`[FileUtils] Failed to parse fixed JSON, trying more aggressive recovery:`, fixError.message);

                // Step 5: More aggressive recovery - try to extract valid JSON objects
                try {
                    // Look for the largest valid JSON object in the file
                    const objectMatch = fixedData.match(/(\{.*\})/s);
                    const arrayMatch = fixedData.match(/(\[.*\])/s);

                    let extractedJson = null;

                    // Determine which match is larger (likely more complete)
                    if (objectMatch && arrayMatch) {
                        extractedJson = objectMatch[0].length > arrayMatch[0].length ? objectMatch[0] : arrayMatch[0];
                    } else if (objectMatch) {
                        extractedJson = objectMatch[0];
                    } else if (arrayMatch) {
                        extractedJson = arrayMatch[0];
                    }

                    if (extractedJson) {
                        try {
                            const parsedData = JSON.parse(extractedJson);
                            console.log(`[FileUtils] Successfully extracted valid JSON from ${filePath}`);

                            // Write the extracted data back to the file
                            await fsp.writeFile(filePath, JSON.stringify(parsedData, null, 2), 'utf8');
                            console.log(`[FileUtils] Saved extracted JSON back to ${filePath}`);

                            return parsedData;
                        } catch (extractParseError) {
                            console.error(`[FileUtils] Extracted JSON is still invalid:`, extractParseError.message);
                        }
                    }
                } catch (extractError) {
                    console.error(`[FileUtils] Failed to extract valid JSON:`, extractError.message);
                }

                // Step 6: Last resort - if the file is supposed to be an object but is corrupted beyond repair
                if (parseError.message.includes("position 2") || 
                    parseError.message.includes("Unexpected token") || 
                    parseError.message.includes("Unexpected end")) {
                    console.warn(`[FileUtils] JSON appears to be severely corrupted, resetting to default value`);

                    // Determine if the fallback should be an object or array
                    const isObject = fixedData.trim().startsWith('{');
                    const defaultValue = isObject ? {} : [];

                    // Write the default value back to the file
                    try {
                        await fsp.writeFile(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
                        console.log(`[FileUtils] Reset ${filePath} to ${isObject ? 'empty object' : 'empty array'}`);
                    } catch (writeError) {
                        console.error(`[FileUtils] Failed to reset ${filePath}:`, writeError);
                    }

                    return defaultValue;
                }

                // If all attempts fail, log and return fallback
                console.error(`[FileUtils] All recovery attempts failed for ${filePath}, using fallback.`);
                return fallback;
            }
        }
    } catch (err) {
        console.error(`[FileUtils] Failed to read JSON file (${filePath}), using fallback. Error:`, err);
        return fallback;
    }
}

/**
 * Retry an operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {number} retries - Maximum number of retries
 * @param {number} delay - Initial delay in milliseconds
 * @returns {Promise<any>} - Result of the operation
 */
async function retryOperation(operation, retries = 3, delay = 100) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            console.warn(`[FileUtils] Retry attempt ${attempt} failed:`, error);
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, delay * attempt)); // Exponential backoff
            } else {
                throw error;
            }
        }
    }
}

/**
 * Update a JSON file atomically
 * @param {string} filePath - Path to the file
 * @param {Object|Array} data - New data to write
 * @returns {Promise<boolean>} - Success status
 */
async function updateJsonFile(filePath, data) {
    try {
        // Ensure data is fully resolved if it's a Promise
        data = await Promise.resolve(data);

        return await retryOperation(async () => {
            // Create a unique temporary file to avoid collisions
            const uniqueId = Date.now() + '-' + Math.floor(Math.random() * 10000);
            const tempPath = `${filePath}.${uniqueId}.tmp`;

            // Ensure the directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }

            // Write to the temporary file
            await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');

            // Rename to the actual file (atomic operation)
            await fs.promises.rename(tempPath, filePath);

            //console.log(`[FileUtils] Successfully updated JSON file: ${filePath}`);
            return true;
        });
    } catch (error) {
        console.error(`[FileUtils] Error updating JSON file ${filePath}:`, error);
        return false;
    }
}

/**
 * Flush all buffered writes to disk
 * @returns {Promise<void>}
 */
async function flushAllBuffers() {
    const streams = Array.from(writeStreams.values());
    await Promise.all(streams.map(stream => stream.flush()));
}

/**
 * Close all write streams
 * @returns {Promise<void>}
 */
async function closeAllStreams() {
    const streams = Array.from(writeStreams.values());
    await Promise.all(streams.map(stream => stream.close()));
}

/**
 * Get a rotated filename with date stamp
 * @param {string} basePath - Base path of the file
 * @returns {string} - New filename with date stamp
 */
function getRotatedFilename(basePath) {
    const timestamp = new Date().toISOString().split('T')[0]; // e.g., "2025-05-27"
    return `${basePath}.${timestamp}.log`;
}

/**
 * Rotate a log file with date stamp
 * @param {string} filePath - Path to the file
 * @returns {Promise<void>}
 */
async function rotateLogFile(filePath) {
    try {
        const newPath = getRotatedFilename(filePath);
        await fs.promises.rename(filePath, newPath);
        console.log(`[FileUtils] Rotated log file: ${filePath} → ${newPath}`);
    } catch (error) {
        console.error(`[FileUtils] Error rotating log file ${filePath}:`, error);
        throw error;
    }
}

/**
 * Safely append JSON to a file with validation
 * @param {string} filePath - Path to the file
 * @param {Object} data - Data to append
 * @returns {Promise<boolean>} - Success status
 */
async function safeAppendJsonToFile(filePath, data) {
    try {
        // Ensure data is fully resolved if it's a Promise
        data = await Promise.resolve(data);

        return await retryOperation(async () => {
            const fileExists = await fsp.access(filePath).then(() => true).catch(() => false);
            const currentData = fileExists ? await fsp.readFile(filePath, 'utf8') : '';

            // Validate current JSON data
            let jsonData = {};
            if (currentData.trim()) {
                try {
                    jsonData = JSON.parse(currentData); // Parse the existing JSON
                } catch (err) {
                    console.warn(`[FileUtils] Existing data in ${filePath} is invalid JSON and will be ignored.`);
                }
            }

            // Merge or append new data
            const updatedData = { ...jsonData, ...data };

            // Create a unique temporary file to avoid collisions
            const uniqueId = Date.now() + '-' + Math.floor(Math.random() * 10000);
            const tempPath = `${filePath}.${uniqueId}.tmp`;

            // Save back to the file as valid JSON
            await fsp.writeFile(tempPath, JSON.stringify(updatedData, null, 2), 'utf8');

            // Rename to the actual file (atomic operation)
            await fsp.rename(tempPath, filePath);

            console.log(`[FileUtils] Successfully updated ${filePath}`);
            return true;
        });
    } catch (err) {
        console.error(`[FileUtils] Failed to append JSON to ${filePath}:`, err);
        return false;
    }
}

module.exports = {
    getBufferedWriteStream,
    appendToJsonLog,
    readJsonFile,
    safeReadJsonFile,
    updateJsonFile,
    flushAllBuffers,
    closeAllStreams,
    rotateFile,
    checkRotation,
    retryOperation,
    getRotatedFilename,
    rotateLogFile,
    safeAppendJsonToFile
};
