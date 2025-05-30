const fs = require('fs');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const util = require('util');
const path = require('path');
const crypto = require('crypto');

// Use a singleton pattern for the TTS client
let ttsClientInstance = null;
function getTTSClient() {
    if (!ttsClientInstance) {
        ttsClientInstance = new TextToSpeechClient();
    }
    return ttsClientInstance;
}

const writeFileAsync = util.promisify(fs.writeFile);
const readFileAsync = util.promisify(fs.readFile);
const mkdirAsync = util.promisify(fs.mkdir);

// Simple in-memory cache for TTS results
const ttsCache = new Map();
const MAX_CACHE_SIZE = 50; // Limit cache size to prevent memory leaks

// Cache directory for persistent TTS caching
const TTS_CACHE_DIR = path.join(__dirname, '../../data/cache/tts');

/**
 * Generate text-to-speech (TTS) audio content with performance optimizations.
 *
 * @param {string} text - The text to generate speech for.
 * @param {string} outputPath - The path to save the generated audio file.
 * @param {Object} metadata - Additional metadata (e.g., track title, artist, comments).
 * @param {string} type - Type of the TTS content (e.g., "segue", "dj", "ad").
 * @param {Object} STATION_CONFIG
 * @returns {Promise<string>} - The path to the generated audio file
 */
async function generateTTS(text, outputPath, metadata, type, STATION_CONFIG) {
    try {
        // Ensure cache directory exists
        await mkdirAsync(TTS_CACHE_DIR, { recursive: true }).catch(() => {});

        // Create a cache key based on text and voice
        const voice = STATION_CONFIG?.ttsProfiles?.[type] || "en-US-Wavenet-D";
        const cacheKey = crypto.createHash('md5').update(`${text}-${voice}`).digest('hex');
        const cachePath = path.join(TTS_CACHE_DIR, `${cacheKey}.mp3`);

        // Check memory cache first (fastest)
        if (ttsCache.has(cacheKey)) {
            const cachedAudio = ttsCache.get(cacheKey);
            await writeFileAsync(outputPath, cachedAudio, 'binary');
            return outputPath;
        }

        // Check disk cache next
        try {
            if (fs.existsSync(cachePath)) {
                const cachedAudio = await readFileAsync(cachePath);
                // Update memory cache
                ttsCache.set(cacheKey, cachedAudio);
                if (ttsCache.size > MAX_CACHE_SIZE) {
                    // Remove oldest entry if cache is too large
                    const oldestKey = ttsCache.keys().next().value;
                    ttsCache.delete(oldestKey);
                }
                await writeFileAsync(outputPath, cachedAudio, 'binary');
                return outputPath;
            }
        } catch (cacheErr) {
            console.warn(`TTS cache read error (continuing with API): ${cacheErr.message}`);
        }

        // Determine language code from voice name
        let languageCode = "en-US";  // default

        // Extract language code from voice name if possible
        if (voice && voice.includes('-')) {
            const parts = voice.split('-');
            if (parts.length >= 2) {
                const prefix = parts.slice(0, 2).join('-');
                if (prefix.match(/^[a-z]{2}-[A-Z]{2}$/)) {
                    languageCode = prefix;
                }
            }
        }

        const request = {
            input: { text: text + ' ... ' },
            voice: { languageCode: languageCode, name: voice },
            audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 }
        };

        // Get the TTS client
        const ttsClient = getTTSClient();

        // Add timeout for TTS API call
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TTS API timeout')), 10000)
        );

        // Make the API call with timeout
        const [response] = await Promise.race([
            ttsClient.synthesizeSpeech(request),
            timeoutPromise
        ]);

        // Save to cache
        try {
            await writeFileAsync(cachePath, response.audioContent, 'binary');
            ttsCache.set(cacheKey, response.audioContent);
            if (ttsCache.size > MAX_CACHE_SIZE) {
                // Remove oldest entry if cache is too large
                const oldestKey = ttsCache.keys().next().value;
                ttsCache.delete(oldestKey);
            }
        } catch (cacheErr) {
            console.warn(`TTS cache write error: ${cacheErr.message}`);
        }

        // Write to output file
        await writeFileAsync(outputPath, response.audioContent, 'binary');
        return outputPath;
    } catch (err) {
        console.error(`Error synthesizing speech with ${STATION_CONFIG?.ttsProfiles?.[type] || 'default voice'}:`, err.message);

        try {
            // Use fallback voice with a more reliable approach
            const fallbackRequest = {
                input: { text: text + ' ... ' },
                voice: { languageCode: "en-US", name: "en-US-Chirp3-HD-Enceladus" },
                audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 }
            };

            const ttsClient = getTTSClient();
            const [fallbackResponse] = await ttsClient.synthesizeSpeech(fallbackRequest);
            await writeFileAsync(outputPath, fallbackResponse.audioContent, 'binary');
            console.log(`⚠️ TTS audio saved with fallback voice: ${outputPath}`);
            return outputPath;
        } catch (fallbackErr) {
            console.error(`Critical TTS failure (even with fallback):`, fallbackErr.message);
            throw new Error(`Failed to generate TTS: ${err.message}, fallback also failed: ${fallbackErr.message}`);
        }
    }
}

module.exports = {
    generateTTS,
};
