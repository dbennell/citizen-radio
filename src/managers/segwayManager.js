// ========================
// File: segwayManager.js
// ========================
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { getLastPlays } = require('./playLogManager');
const { STATION_CONFIG, READY_DIR } = require('../core/config');
const ratingManager = require('./ratingsManager');
const engagementMonitor = require('./engagementMonitor');
const openai = require('openai');
const { generateTTS } = require('../utils/ttsHelper');


const readFileAsync = promisify(fs.readFile);
const unlinkAsync = promisify(fs.unlink);
const SEGWAY_DIR = READY_DIR('segway');
const PLAY_LOG = path.join(__dirname, '../../data/play.log');

/**
 * Get the track context for segway generation by referencing play.log and the queue.
 *
 * @param {Array} playbackQueue - Current playback queue.
 * @returns {Object} - Context with lastTrack and nextTrack, or null for errors.
 */
async function getTrackContext(playbackQueue) {
    try {
        // Get last track from play.log
        const logData = await readFileAsync(PLAY_LOG, 'utf-8');
        const playHistory = logData.trim().split('\n');

        // Filter out segways from play history
        const filteredHistory = playHistory
            .map(line => JSON.parse(line))
            .filter(entry => entry.type !== 'segway')
            .map(entry => ({
                type: entry.type,
                meta: entry.meta,
                relPath: entry.relPath
            }));

        const lastPlayed = filteredHistory.length > 0 ? filteredHistory[filteredHistory.length - 1] : null;

        // Get next track from the playback queue
        const nextTrack = playbackQueue.length > 0 ? playbackQueue[0] : null;

        if (lastPlayed && nextTrack) {
            return {
                lastTrack: lastPlayed,
                nextTrack: nextTrack,
                prevTracks: filteredHistory.slice(-3), // Get up to 3 previous tracks
                nextTracks: playbackQueue.slice(0, 3)  // Get up to 3 upcoming tracks
            };
        }

        console.warn(`SegwayManager: Missing context. Last Played: ${lastPlayed ? lastPlayed.meta.title : 'none'}, Next Track: ${nextTrack ? nextTrack.meta.title : 'none'}`);
        return null;
    } catch (err) {
        console.error(`SegwayManager: Failed to retrieve track context -> ${err.message}`);
        return null;
    }
}

/**
 * Generate a segway between two tracks using OpenAI.
 *
 * @param {Object} prevMeta - Metadata for the previous track.
 * @param {Object} nextMeta - Metadata for the next track.
 * @param {Array} prevTracks - Optional array of previous tracks (0-3 tracks)
 * @param {Array} nextTracks - Optional array of upcoming tracks (0-3 tracks)
 * @returns {Promise<string>} - The generated segway text.
 */
async function generateSegway(prevMeta, nextMeta, prevTracks = [], nextTracks = []) {
    try {
        // Normalize metadata
        const prevTitle = prevMeta?.title || (prevMeta?.filename ? prevMeta.filename.replace(/\.[^/.]+$/, "") : "previous track");
        const prevType = prevMeta?.type || "unknown";
        const nextTitle = nextMeta?.title || (nextMeta?.filename ? nextMeta.filename.replace(/\.[^/.]+$/, "") : "upcoming content");
        const nextType = nextMeta?.type || "upcoming content";
        const includeFunny = Math.random() < (STATION_CONFIG?.segwayFunny ?? 0);

        // Process previous tracks array
        let prevTracksInfo = [];
        if (prevTracks.length > 0) {
            // Filter out ads and process only the most relevant tracks (up to 2)
            prevTracksInfo = prevTracks
                .filter(track => track.type !== 'ad')
                .slice(0, 2)
                .map(track => {
                    const trackInfo = {
                        title: track.meta?.title || (track.meta?.filename ? track.meta.filename.replace(/\.[^/.]+$/, "") : "unknown track"),
                        artist: track.meta?.artist || "unknown artist",
                        type: track.type || "unknown",
                        rating: null,
                        ratingInfo: ""
                    };

                    // Add rating info if available
                    if (STATION_CONFIG.ratingSystem?.enabled && track.type === 'music' && track.meta?.relPath) {
                        const rating = ratingManager.getRatingForTrack(track.meta.relPath);
                        if (rating) {
                            trackInfo.rating = rating;
                            trackInfo.ratingInfo = `This track has a listener rating of ${typeof rating === 'number' ? rating.toFixed(1) : rating}/5.`;
                        }
                    }

                    return trackInfo;
                });
        }

        // Process next tracks array
        let nextTracksInfo = [];
        if (nextTracks.length > 0) {
            // Filter out ads and process only the most relevant tracks (up to 2)
            nextTracksInfo = nextTracks
                .filter(track => track.type !== 'ad')
                .slice(0, 2)
                .map(track => {
                    const trackInfo = {
                        title: track.meta?.title || (track.meta?.filename ? track.meta.filename.replace(/\.[^/.]+$/, "") : "upcoming track"),
                        artist: track.meta?.artist || "unknown artist",
                        type: track.type || "unknown",
                        rating: null,
                        ratingInfo: ""
                    };

                    // Add rating info if available
                    if (STATION_CONFIG.ratingSystem?.enabled && track.type === 'music' && track.meta?.relPath) {
                        const rating = ratingManager.getRatingForTrack(track.meta.relPath);
                        if (rating) {
                            trackInfo.rating = rating;
                            trackInfo.ratingInfo = `This track has a listener rating of ${typeof rating === 'number' ? rating.toFixed(1) : rating}/5.`;

                            // For highly rated tracks, add special note
                            if (typeof rating === 'number' && rating >= 4.5) {
                                trackInfo.ratingInfo += " It's a fan favorite!";
                            }
                        }
                    }

                    return trackInfo;
                });
        }

        // For backward compatibility, still process the direct prevMeta and nextMeta
        let prevRatingInfo = "";
        let nextRatingInfo = "";

        if (STATION_CONFIG.ratingSystem?.enabled) {
            if (prevMeta.type === 'music' && prevMeta.relPath) {
                const rating = ratingManager.getRatingForTrack(prevMeta.relPath);
                if (rating) {
                    prevRatingInfo = `This track has a listener rating of ${typeof rating === 'number' ? rating.toFixed(1) : rating}/5.`;
                }
            }

            if (nextMeta.type === 'music' && nextMeta.relPath) {
                const rating = ratingManager.getRatingForTrack(nextMeta.relPath);
                if (rating) {
                    nextRatingInfo = `The upcoming track has a listener rating of ${typeof rating === 'number' ? rating.toFixed(1) : rating}/5.`;

                    // For highly rated tracks, suggest special introduction
                    if (typeof rating === 'number' && rating >= 4.5) {
                        nextRatingInfo += " It's a fan favorite, so consider giving it a special introduction!";
                    }
                }
            }
        }

        // 1) No previous track at all?  →  simple intro
        if (prevType === 'start' || prevTitle === '') {
            return `Up next, ${nextTitle}${ nextMeta.artist ? ` by ${nextMeta.artist}` : '' }.`;
        }

        // 2) Usual templated/AI logic follows...
        // Check for special transition types that can use predefined templates
        // rather than always calling the AI

        // For transitions to advertisements
        if (nextType === 'ad') {
            const adTransitions = [
                `And now a word from our sponsors.`,
                `We'll be right back after these messages.`,
                `Let's take a quick break to hear from our partners.`,
                `Stay tuned for more after this brief message.`,
                `A moment of your time for our sponsors, please.`
            ];
            return adTransitions[Math.floor(Math.random() * adTransitions.length)];
        }

        // For transitions from advertisements
        if (prevType === 'ad') {
            const fromAdTransitions = [
                `And we're back with more great music on ${STATION_CONFIG?.stationName || 'our station'}.`,
                `Thanks for your patience. Now back to the hits.`,
                `And now, back to our regularly scheduled programming.`,
                `Let's get back to what you came for - more great tunes.`,
                `That's enough talk. Back to the music!`
            ];
            return fromAdTransitions[Math.floor(Math.random() * fromAdTransitions.length)];
        }

        // For station ID transitions
        if ((prevType === 'id' || nextType === 'intro' || nextType === 'id')) {
            return ""; // No segway for id → music or transitions to intro/id
        }

        // For intro → music transitions, announce the upcoming track
        if (prevType === 'intro' && nextType === 'music') {
            return `Up next on ${STATION_CONFIG?.stationName || 'our station'}, ${nextTitle}${nextMeta.artist ? ` by ${nextMeta.artist}` : ''}.`;
        }

        // For transitions from DJ talk to music
        if (prevType === 'dj' && nextType === 'music') {
            const djToMusicTransitions = [
                `Here's ${nextTitle}.`,
                `Let's kick things up with ${nextTitle}.`,
                `Time for some music. This is ${nextTitle}.`,
                `You're listening to ${STATION_CONFIG?.stationName || 'our station'}, and this is ${nextTitle}.`,
                `Let's get back to the music with ${nextTitle}.`
            ];
            return djToMusicTransitions[Math.floor(Math.random() * djToMusicTransitions.length)];
        }

        // For music to music transitions (use AI for better variety)
        if (prevType === 'music' && nextType === 'music') {
            // For music-to-music, use the AI for interesting transitions
            const context = `${STATION_CONFIG?.context || "You are playing the role of a Radio DJ"}. The station, '${STATION_CONFIG?.stationName || "Unknown Station"}', has the vibe of "${STATION_CONFIG?.vibe || "A mainstream popular commercial radio station"}". DJ Name: '${STATION_CONFIG?.djName || "DJ Bob"}'.`;
            // Extracted default prompt and funny suffix for clarity
            const basePrompt = STATION_CONFIG?.aiPrompts?.segway || "Write a smooth segway.";
            const funnySuffix = includeFunny ? `\n\n${STATION_CONFIG?.aiPrompts?.segwayFunny || "Add a touch of humor to the segway."}` : "";

            // Combine into a single prompt expression
            const prompt = `${basePrompt}${funnySuffix}`;

            // Get noteworthy listener comment if available
            let listenerFeedback = '';
            const noteworthyComment = engagementMonitor.getCommentForSegway();

            if (noteworthyComment) {
                listenerFeedback = `
                Listener Feedback:
                - Username: "${noteworthyComment.author}"
                - Comment: "${noteworthyComment.comment}"
                - Rating: ${noteworthyComment.rating > 0 ? noteworthyComment.rating : 'None'}

                Important: Incorporate this listener feedback naturally into your segway if possible.
                `;

                // Mark comment as referenced
                const commentIndex = engagementMonitor.getNoteworthyComments().findIndex(
                    c => c.comment === noteworthyComment.comment && c.author === noteworthyComment.author
                );
                if (commentIndex >= 0) {
                    engagementMonitor.markCommentReferenced(commentIndex);
                }
            }

            // Create a focused prompt for music-to-music transition
            const userPrompt = `
                You are a lively and enthusiastic DJ on a galactic space station.

                Here's the context for the songs:

                Previous song:
                - Title: "${prevTitle}"
                ${prevMeta?.artist ? `- Artist: ${prevMeta.artist}` : ''}
                ${prevMeta?.album ? `- Album: ${prevMeta.album}` : ''}
                ${prevMeta?.genre ? `- Genre: ${prevMeta.genre}` : ''}
                ${prevMeta?.comment ? `- Note: ${prevMeta.comment}` : ''}
                ${prevRatingInfo}

                ${prevTracksInfo.length > 0 ? `
                Recent tracks history:
                ${prevTracksInfo.map((track, index) => `
                Track ${index + 1}:
                - Title: "${track.title}"
                - Artist: ${track.artist}
                - Type: ${track.type}
                ${track.ratingInfo ? `- ${track.ratingInfo}` : ''}
                `).join('')}
                ` : ''}

                Next song:
                - Title: "${nextTitle}"
                ${nextMeta?.artist ? `- Artist: ${nextMeta.artist}` : ''}
                ${nextMeta?.album ? `- Album: ${nextMeta.album}` : ''}
                ${nextMeta?.genre ? `- Genre: ${nextMeta.genre}` : ''}
                ${nextMeta?.comment ? `- Note: ${nextMeta.comment}` : ''}
                ${nextRatingInfo}

                ${nextTracksInfo.length > 0 ? `
                Upcoming tracks:
                ${nextTracksInfo.map((track, index) => `
                Track ${index + 1}:
                - Title: "${track.title}"
                - Artist: ${track.artist}
                - Type: ${track.type}
                ${track.ratingInfo ? `- ${track.ratingInfo}` : ''}
                `).join('')}
                ` : ''}

                ${3 === 2 ? 
                  (() => {
                    const comment = engagementMonitor.getCommentForSegway();
                    if (comment) {
                      // Mark comment as referenced
                      const index = engagementMonitor.getNoteworthyComments().findIndex(
                        c => c.comment === comment.comment && c.author === comment.author
                      );
                      if (index >= 0) engagementMonitor.markCommentReferenced(index);

                      return `Listener Feedback:
                - Username: "${comment.author}"
                - Comment: "${comment.comment}"
                - Rating: ${comment.rating > 0 ? comment.rating : 'None'}

                Important: Incorporate this listener feedback naturally into your segway if possible.`;
                    }
                    return '';
                  })() 
                  : ''}

                Task:
                Create a short, natural DJ-style transition from the previous track to the next.
                Mention the names of both songs and artists. 
                Only use the extra details (album, genre, notes) **if they help make the transition smoother or funnier** — they are optional flavor.

                ${prompt}

                Respond only with the DJ's spoken words. Limit to 1–2 sentences. Be natural and entertaining.
                `;

            console.log("Generating music-to-music segway between:", prevTitle, "→", nextTitle);

            // Call OpenAI API
            const openaiClient = new openai.OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            const response = await openaiClient.chat.completions.create({
                model: "gpt-4.1-mini",
                messages: [
                    { role: "system", content: context },
                    { role: "user", content: userPrompt },
                ],
                max_tokens: 100,
            });

            const segwayText = response.choices[0].message.content.trim();
            console.log("Generated segway text:", segwayText);
            return segwayText;
        }

        // For transitions from podcast to anything
        if (prevType === 'podcast') {
            const podcastOutroTransitions = [
                `Hope you enjoyed that feature. Now, let's get back to more great content.`,
                `That was an interesting discussion. Let's continue with our programming.`,
                `Thanks for tuning in to that special segment.`,
                `That's all for today's feature. Let's move on.`,
                `And that concludes our special program. Now, back to more music.`
            ];
            return podcastOutroTransitions[Math.floor(Math.random() * podcastOutroTransitions.length)];
        }

        // For transitions to podcast
        if (nextType === 'podcast') {
            const podcastIntroTransitions = [
                `And now, a special feature from our studios.`,
                `Coming up next, we have a fascinating segment for you.`,
                `It's time for our special program.`,
                `Let's take a few minutes for something different.`,
                `And now for something a little different.`
            ];
            return podcastIntroTransitions[Math.floor(Math.random() * podcastIntroTransitions.length)];
        }

        // Default fallback - use AI for any other combinations
        const context = `${STATION_CONFIG?.context || "You are playing the role of a Radio DJ"}. The station, '${STATION_CONFIG?.stationName || "Unknown Station"}', has the vibe of "${STATION_CONFIG?.vibe || "A mainstream popular commercial radio station"}". DJ Name: '${STATION_CONFIG?.djName || "DJ Bob"}'.`;

        // Extracted default prompt and funny suffix for clarity
        const basePrompt = STATION_CONFIG?.aiPrompts?.segway || "Write a smooth segway.";
        const funnySuffix = includeFunny ? `\n\n${STATION_CONFIG?.aiPrompts?.segwayFunny || "Add a touch of humor to the segway."}` : "";

        // Combine into a single prompt expression
        const prompt = `${basePrompt}${funnySuffix}`;

        // Create a richer prompt with whatever information we have
        const userPrompt = `
            You are a lively and enthusiastic DJ on a galactic space station.

            Here's the context for the songs:

            Previous song:
            - Title: "${prevTitle}"
            ${prevMeta?.artist ? `- Artist: ${prevMeta.artist}` : ''}
            ${prevMeta?.album ? `- Album: ${prevMeta.album}` : ''}
            ${prevMeta?.genre ? `- Genre: ${prevMeta.genre}` : ''}
            ${prevMeta?.comment ? `- Note: ${prevMeta.comment}` : ''}
            ${prevRatingInfo}

            ${prevTracksInfo.length > 0 ? `
            Recent tracks history:
            ${prevTracksInfo.map((track, index) => `
            Track ${index + 1}:
            - Title: "${track.title}"
            - Artist: ${track.artist}
            - Type: ${track.type}
            ${track.ratingInfo ? `- ${track.ratingInfo}` : ''}
            `).join('')}
            ` : ''}

            Next song:
            - Title: "${nextTitle}"
            ${nextMeta?.artist ? `- Artist: ${nextMeta.artist}` : ''}
            ${nextMeta?.album ? `- Album: ${nextMeta.album}` : ''}
            ${nextMeta?.genre ? `- Genre: ${nextMeta.genre}` : ''}
            ${nextMeta?.comment ? `- Note: ${nextMeta.comment}` : ''}
            ${nextRatingInfo}

            ${nextTracksInfo.length > 0 ? `
            Upcoming tracks:
            ${nextTracksInfo.map((track, index) => `
            Track ${index + 1}:
            - Title: "${track.title}"
            - Artist: ${track.artist}
            - Type: ${track.type}
            ${track.ratingInfo ? `- ${track.ratingInfo}` : ''}
            `).join('')}
            ` : ''}

            ${2 === 3 ? 
              (() => {
                const comment = engagementMonitor.getCommentForSegway();
                if (comment) {
                  // Mark comment as referenced
                  const index = engagementMonitor.getNoteworthyComments().findIndex(
                    c => c.comment === comment.comment && c.author === comment.author
                  );
                  if (index >= 0) engagementMonitor.markCommentReferenced(index);

                  return `Listener Feedback:
            - Username: "${comment.author}"
            - Comment: "${comment.comment}"
            - Rating: ${comment.rating > 0 ? comment.rating : 'None'}

            Important: Incorporate this listener feedback naturally into your segway if possible.`;
                }
                return '';
              })() 
              : ''}

            Task:
            Create a short, natural DJ-style transition from the previous track to the next.
            Mention the names of both songs and artists. 
            Only use the extra details (album, genre, notes) **if they help make the transition smoother or funnier** — they are optional flavor.

            ${prompt}

            Respond only with the DJ's spoken words. Limit to 1–2 sentences. Be natural and entertaining.
            `;

        console.log("Generating segway between:", prevTitle, "→", nextTitle);

        // Call OpenAI API
        const openaiClient = new openai.OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        const response = await openaiClient.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                { role: "system", content: context },
                { role: "user", content: userPrompt },
            ],
            max_tokens: 150,
        });

        const segwayText = response.choices[0].message.content.trim();
        console.log("Generated segway text:", segwayText);
        return segwayText;
    } catch (error) {
        console.error(`SegwayManager: Error generating segway: ${error.message}`);
        // Fallback text if API fails
        return `And that was ${prevMeta?.title || 'our last track'}. Coming up next on ${STATION_CONFIG?.stationName || 'our station'}!`;
    }
}

/**
 * Generate and save a segway audio file.
 *
 * @param {string} segwayText - Text for the segway.
 * @param {Object} prevMeta - Metadata for the previous track.
 * @param {Object} nextMeta - Metadata for the next track.
 * @param {string} key - Optional key for the segway filename.
 * @returns {Promise<string>} - Path to the generated segway file.
 */
async function prepareSegway(segwayText, prevMeta, nextMeta, key = '') {
    // Check if STATION_CONFIG is defined
    if (typeof STATION_CONFIG === 'undefined' || !STATION_CONFIG) {
        console.error('SegwayManager: STATION_CONFIG is not defined');
        return null;
    }

    const timestamp = Date.now();
    const segwayFileName = `segway_${key || 'transition'}_${timestamp}.mp3`;
    const segwayFilePath = path.join(SEGWAY_DIR, segwayFileName);

    try {
        console.log(`SegwayManager: Generating segway audio (type: ${key || 'transition'})...`);

        // Generate the segway audio file with TTS
        await generateTTS(segwayText, segwayFilePath, {
            title: `${prevMeta.title || "Previous"} -> ${nextMeta.title || "Next"}`,
            artist: STATION_CONFIG?.stationName || 'Unknown Station',
            comment: `Segway from ${prevMeta.type} to ${nextMeta.type}`,
        }, "segway");

        //console.log(`SegwayManager: Segway generated and saved: ${segwayFilePath}`);
        return segwayFilePath;
    } catch (error) {
        console.error(`SegwayManager: Failed to prepare segway: ${error.message}`);
        return null;
    }
}

/**
 * Remove old segway files that are no longer needed.
 *
 * @param {Array<Object>} playbackQueue - Current playback queue (to ensure segways are still relevant).
 * @returns {Promise<void>}
 */
async function removeOldSegways(playbackQueue = []) {
    try {
        if (!fs.existsSync(SEGWAY_DIR)) {
            fs.mkdirSync(SEGWAY_DIR, { recursive: true });
            return;
        }

        const segwayFiles = fs.readdirSync(SEGWAY_DIR)
            .filter(file => file.startsWith('segway_') && file.endsWith('.mp3'));

        if (segwayFiles.length === 0) return;

        console.log(`SegwayManager: Found ${segwayFiles.length} segway files to check`);

        // Keep track of files to delete
        let filesToDelete = [];

        // Get current time for age-based cleanup
        const now = Date.now();

        // Minimum age (in milliseconds) before a segway file can be deleted
        // This prevents deleting files that were just created and might be needed soon
        const MIN_AGE_MS = 60 * 1000; // 60 seconds

        for (const segway of segwayFiles) {
            const segwayPath = path.join(SEGWAY_DIR, segway);

            // Extract timestamp from filename (segway_type_timestamp.mp3)
            const timestampMatch = segway.match(/segway_.*?_(\d+)\.mp3$/);
            const fileTimestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;
            const fileAge = now - fileTimestamp;

            // Skip files that are too new, regardless of queue status
            if (fileAge < MIN_AGE_MS) {
                continue;
            }

            // If playbackQueue is provided, check if segway is still relevant
            if (playbackQueue.length > 0) {
                // Check if this segway is referenced in the queue
                const isRelevant = playbackQueue.some(item => 
                    item.segway && item.segway.filepath === segwayPath
                );

                if (!isRelevant) {
                    filesToDelete.push(segwayPath);
                }
            } else {
                // If no queue provided, mark all old segway files for deletion (cleanup mode)
                // But still respect the minimum age
                filesToDelete.push(segwayPath);
            }
        }

        // Delete the files that are no longer needed
        let deletedCount = 0;
        for (const filePath of filesToDelete) {
            try {
                await unlinkAsync(filePath);
                deletedCount++;
            } catch (err) {
                console.error(`Error deleting segway file ${filePath}: ${err.message}`);
            }
        }

        if (deletedCount > 0) {
            console.log(`SegwayManager: 🧹 Deleted ${deletedCount} old segway files`);
        }
    } catch (err) {
        console.error(`SegwayManager: Failed to remove old segways -> ${err.message}`);
    }
}

module.exports = {
    getTrackContext,
    generateSegway,
    prepareSegway,
    removeOldSegways
};
