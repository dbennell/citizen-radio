// ========================
// File: promptProcessor.js
// ========================
require("dotenv").config();
const fs = require('fs');
const path = require('path');
const {
    extractParticipantInfo,
    processParticipantData
} = require('./podcastParser');

const podcastGenerator = require('./podcastGenerator');

const glob = require("glob");
const chokidar = require("chokidar");
const OpenAI = require("openai");
const textToSpeech = require("@google-cloud/text-to-speech");
const tracksManager  = require("../managers/trackManager");
const ratingManager = require('../managers/ratingsManager');
const engagementMonitor = require('../managers/engagementMonitor');
const { generateTTS } = require('../utils/ttsHelper'); // Use the same helper


const { PROMPT_DIRS, READY_DIR, STATION_CONFIG } = require("../core/config");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ttsClient = new textToSpeech.TextToSpeechClient();
const TEMP_ROOT = path.join(path.dirname(path.dirname(__dirname)), 'data/temp'); // Root directory for temp files

function getTempDirectory(type, baseName = '') {
    return path.join(TEMP_ROOT, type, baseName);
}


function initPromptWatcher() {
    for (const [type, dir] of Object.entries(PROMPT_DIRS)) {
        // Ensure the directory exists before watching it
        if (!fs.existsSync(dir)) {
            console.log(`📁 Creating prompt directory for ${type}: ${dir}`);
            fs.mkdirSync(dir, { recursive: true });
        }

        chokidar.watch(dir, {
            ignoreInitial: false,
            ignored: ["**/*.processed", "**/*.elaborated.txt", "**/*.cfg.json"], // Add *.cfg.json to ignored files
        }).on("add", filePath => {
            if (!filePath.includes(".elaborated") && !filePath.includes(".processed") && !filePath.endsWith(".cfg.json")) {
                processPromptFile(type, filePath);
            }
        });
    }
}

function validateParticipants(participantData, hostNames, guestNames) {
    if (!participantData || typeof participantData !== 'object') {
        throw new Error('Invalid participantData object');
    }

    if (!Array.isArray(hostNames) || !Array.isArray(guestNames)) {
        throw new Error('HostNames and GuestNames should be arrays');
    }

    if (Object.keys(participantData).length === 0) {
        throw new Error('No participant data found');
    }

    hostNames.forEach(name => {
        if (!participantData[name]) {
            throw new Error(`Host "${name}" is missing from participantData`);
        }
    });

    guestNames.forEach(name => {
        if (!participantData[name]) {
            throw new Error(`Guest "${name}" is missing from participantData`);
        }
    });
}

async function processPromptFile(type, filePath) {
    const baseName = path.basename(filePath, ".txt"); // Get the base name of the file
    const tempDir = getTempDirectory(type, baseName); // Temp directory for processed files
    const promptFileInTemp = path.join(tempDir, `${baseName}.txt`); // Destination for prompt file in temp
    const elaboratedFile = path.join(tempDir, `${baseName}.elaborated.txt`);
    const configFile = path.join(tempDir, `${baseName}.cfg.json`);
    const outputExt = type === "image" ? "png" : "mp3";
    const outputFile = path.join(READY_DIR(type), `${baseName}.${outputExt}`);
    const archiveDir = path.join(__dirname, "archive", type); // Optional archive directory for processed prompts

    let elaboratedText;

    try {
        // Ensure temp and archive directories exist
        fs.mkdirSync(tempDir, { recursive: true });
        //fs.mkdirSync(archiveDir, { recursive: true }); // Optional archive directory

        // Move the prompt file into the temp directory
        if (!fs.existsSync(promptFileInTemp)) {
            fs.renameSync(filePath, promptFileInTemp); // Move prompt file into the temp folder
            console.log(`✔ Moved prompt file to temp: ${promptFileInTemp}`);
        }

        // Read the prompt content
        const promptContent = fs.readFileSync(promptFileInTemp, "utf-8").trim();
        if (!promptContent) {
            console.warn(`⚠ No content found in the prompt file: ${promptFileInTemp}`);
            return;
        }

        // Handle processing...
        if (type !== "podcast") {
            if (fs.existsSync(elaboratedFile)) {
                elaboratedText = fs.readFileSync(elaboratedFile, "utf-8").trim();
            } else {
                elaboratedText = await expandPromptWithContext(promptContent, type);
                fs.writeFileSync(elaboratedFile, elaboratedText, "utf-8");
                console.log(`✔ Created elaborated file: ${elaboratedFile}`);
            }
        } else {
            elaboratedText = promptContent; // For podcasts, use the original content directly
        }

        // Handle specific types (e.g., image, dj, podcast)
        if (type === "image") {
            if (!fs.existsSync(outputFile)) {
                await generateImage(elaboratedText, outputFile);
            }
        } else if (["dj", "ad", "intro", "segue"].includes(type)) {
            if (!fs.existsSync(outputFile)) {
                await generateTTS(elaboratedText, outputFile, {
                    title: baseName,
                    artist: STATION_CONFIG.djName,
                    lyrics: elaboratedText,
                }, type);
            }
        } else if (type === "podcast") {
            if (!fs.existsSync(outputFile)) {
                console.log(`🫛 Generating podcast → ${outputFile}`);

                const extractedInfo = await extractParticipantInfo(promptContent) || {
                    participantData: {},
                    hostNames: [],
                    guestNames: [],
                    topic: "",
                    durationMinutes: 6
                };

                const { participantData, hostNames, guestNames, topic, durationMinutes } = extractedInfo;

                try {
                    // Validate extracted participant data
                    validateParticipants(participantData, hostNames, guestNames);
                    //console.log("Validated participant data:", participantData);
                } catch (err) {
                    console.error("❗ Participant validation failed:", err.message);
                    return; // Abort processing if validation fails
                }

                console.log("Extracted participantData:", participantData);
                console.log("Hosts:", hostNames);
                console.log("Guests:", guestNames);
                console.log("Topic:", topic);
                console.log("Duration:", durationMinutes, "minutes");

                await processParticipantData(participantData);

                let podcastConfig = {
                    prompt: promptContent,
                    topic,
                    durationMinutes,
                    hostNames,
                    guestNames,
                    participantData,
                    outputFileName: outputFile,
                    tempDirectory: tempDir,
                };

                if (fs.existsSync(configFile)) {
                    const customConfig = JSON.parse(fs.readFileSync(configFile, "utf-8"));
                    podcastConfig = {
                        ...customConfig,
                        prompt: promptContent,
                        outputFileName: outputFile,
                        tempDirectory: tempDir,
                        participantData,
                    };
                }

                const result = await podcastGenerator.run(podcastConfig);

                if (!result.success) {
                    console.error(`Podcast generation failed: ${result.error}`);
                } else {
                    console.log(`✅ Podcast saved → ${outputFile}`);
                }
            }
        }
    } catch (err) {
        console.error(`❗ Error processing ${type} (${filePath}):`, err);
    } finally {
        try {
            // Move the processed prompt file to an archive or delete it
            if (!STATION_CONFIG.debug) {
                console.log(`🧹 Removing processed prompt file: ${promptFileInTemp}`);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath); // Optionally remove the original file
            } else {
                // Optionally archive the processed file
                // const archivePath = path.join(archiveDir, `${baseName}.txt`);
                // fs.renameSync(promptFileInTemp, archivePath);
                // console.log(`✔ Moved processed prompt to archive: ${archivePath}`);
            }
        } catch (cleanupErr) {
            console.error(`❗ Failed to cleanup prompt file (${filePath}):`, cleanupErr.message);
        }
    }
}

function cleanTempDirectory(rootDir) {
    console.log(`🧹 Cleaning up all temporary files in: ${rootDir}`);
    fs.rmSync(rootDir, { recursive: true, force: true });
    console.log(`✅ Temp directory cleaned: ${rootDir}`);
}


async function expandPromptWithContext(textPrompt, type) {
    const context = `${STATION_CONFIG.context}. The station, '${STATION_CONFIG.stationName}', has the vibe of "${STATION_CONFIG.vibe}". DJ Name: '${STATION_CONFIG.djName}'.`;
    const personality = STATION_CONFIG.aiPrompts[type] || "";
    const userPrompt = `Base Prompt (Type: ${type}): "${textPrompt}"

Personality:
${personality}`;

    const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
            { role: "system", content: context },
            { role: "user", content: userPrompt }
        ],
        max_tokens: 2000
    });
    return response.choices[0].message.content.trim();
}

async function generateImage(prompt, outputPath) {
    const response = await openai.images.generate({ prompt, model: "gpt-image-1", size: "1536x1024" });
    const imageBytes = Buffer.from(response.data[0].b64_json, "base64");
    fs.writeFileSync(outputPath, imageBytes);
    console.log(`Image saved: ${outputPath}`);
}

// async function generateTTS(text, outputPath, metadata, type) {
//     const voice = STATION_CONFIG.ttsProfiles[type] || "en-US-Wavenet-D";
//
//     // Determine language code from voice name
//     let languageCode = "en-US";  // default
//
//     // Extract language code from voice name if possible
//     if (voice && voice.includes('-')) {
//         const parts = voice.split('-');
//         if (parts.length >= 2) {
//             const prefix = parts.slice(0, 2).join('-');
//             if (prefix.match(/^[a-z]{2}-[A-Z]{2}$/)) {
//                 languageCode = prefix;
//                // console.log(`Using detected language code ${languageCode} for voice ${voice}`);
//             }
//         }
//     }
//
//     const request = {
//         input: { text: text + ' ... ' },
//         voice: { languageCode: languageCode, name: voice },
//         audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 }
//     };
//
//     try {
//         const [response] = await ttsClient.synthesizeSpeech(request);
//         fs.writeFileSync(outputPath, response.audioContent, "binary");
//         //console.log(`TTS audio saved: ${outputPath}`);
//     } catch (err) {
//         console.error(`Error synthesizing speech with ${voice}:`, err.message);
//
//         // Try fallback with a standard voice
//         console.log("Trying fallback voice...");
//         const fallbackRequest = {
//             input: { text: text + ' ... ' },
//             voice: { languageCode: "en-US", name: "en-US-Chirp3-HD-Enceladus" },
//             audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 }
//         };
//
//         const [fallbackResponse] = await ttsClient.synthesizeSpeech(fallbackRequest);
//         fs.writeFileSync(outputPath, fallbackResponse.audioContent, "binary");
//         console.log(`TTS audio saved with fallback voice: ${outputPath}`);
//     }
// }


// Segue functionality has been moved to segwayManager.js
// The following functions have been removed:
// - generateSegway
// - prepareSegway
async function generateSegway(prevMeta, nextMeta, prevTracks = [], nextTracks = []) {
    try {
        // Normalize metadata
        const prevTitle = prevMeta?.title || (prevMeta?.filename ? prevMeta.filename.replace(/\.[^/.]+$/, "") : "previous track");
        const prevType = prevMeta?.type || "unknown";
        const nextTitle = nextMeta?.title || (nextMeta?.filename ? nextMeta.filename.replace(/\.[^/.]+$/, "") : "upcoming content");
        const nextType = nextMeta?.type || "upcoming content";
        const includeFunny = Math.random() < (STATION_CONFIG.segwayFunny || 0);

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
                            trackInfo.ratingInfo = `This track has a listener rating of ${rating.toFixed(1)}/5.`;
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
                            trackInfo.ratingInfo = `This track has a listener rating of ${rating.toFixed(1)}/5.`;

                            // For highly rated tracks, add special note
                            if (rating >= 4.5) {
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
                    prevRatingInfo = `This track has a listener rating of ${rating.toFixed(1)}/5.`;
                }
            }

            if (nextMeta.type === 'music' && nextMeta.relPath) {
                const rating = ratingManager.getRatingForTrack(nextMeta.relPath);
                if (rating) {
                    nextRatingInfo = `The upcoming track has a listener rating of ${rating.toFixed(1)}/5.`;

                    // For highly rated tracks, suggest special introduction
                    if (rating >= 4.5) {
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
                `And we're back with more great music on ${STATION_CONFIG.stationName}.`,
                `Thanks for your patience. Now back to the hits.`,
                `And now, back to our regularly scheduled programming.`,
                `Let's get back to what you came for - more great tunes.`,
                `That's enough talk. Back to the music!`
            ];
            return fromAdTransitions[Math.floor(Math.random() * fromAdTransitions.length)];
        }

        // For station ID transitions
        if ((prevType === 'id' || nextType === 'intro' || nextType === 'id')) {
            return ""; // No segue for id → music or transitions to intro/id
        }

        // For intro → music transitions, announce the upcoming track
        if (prevType === 'intro' && nextType === 'music') {
            return `Up next on ${STATION_CONFIG.stationName}, ${nextTitle}${nextMeta.artist ? ` by ${nextMeta.artist}` : ''}.`;
        }

        // For transitions from DJ talk to music
        if (prevType === 'dj' && nextType === 'music') {
            const djToMusicTransitions = [
                `Here's ${nextTitle}.`,
                `Let's kick things up with ${nextTitle}.`,
                `Time for some music. This is ${nextTitle}.`,
                `You're listening to ${STATION_CONFIG.stationName}, and this is ${nextTitle}.`,
                `Let's get back to the music with ${nextTitle}.`
            ];
            return djToMusicTransitions[Math.floor(Math.random() * djToMusicTransitions.length)];
        }

        // For music to music transitions (use AI for better variety)
        if (prevType === 'music' && nextType === 'music') {
            // For music-to-music, use the AI for interesting transitions
            const context = `${STATION_CONFIG.context}. The station, '${STATION_CONFIG.stationName}', has the vibe of "${STATION_CONFIG.vibe}". DJ Name: '${STATION_CONFIG.djName}'.`;
            // Extracted default prompt and funny suffix for clarity
            const basePrompt = STATION_CONFIG.aiPrompts.segue || "Write a smooth segue.";
            const funnySuffix = includeFunny ? `\n\n${STATION_CONFIG.aiPrompts.segwayFunny}` : "";

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

                Important: Incorporate this listener feedback naturally into your segue if possible.
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

                Here’s the context for the songs:

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

                ${STATION_CONFIG.enhancedEngagement?.enabled ? 
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

                Important: Incorporate this listener feedback naturally into your segue if possible.`;
                    }
                    return '';
                  })() 
                  : ''}

                Task:
                Create a short, natural DJ-style transition from the previous track to the next.
                Mention the names of both songs and artists. 
                Only use the extra details (album, genre, notes) **if they help make the transition smoother or funnier** — they are optional flavor.

                ${prompt}

                Respond only with the DJ’s spoken words. Limit to 1–2 sentences. Be natural and entertaining.
                `;

            console.log("Generating music-to-music segue between:", prevTitle, "→", nextTitle);

            // Call OpenAI API
            const openai = require('openai');
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
            console.log("Generated segue text:", segwayText);
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
        const context = `${STATION_CONFIG.context}. The station, '${STATION_CONFIG.stationName}', has the vibe of "${STATION_CONFIG.vibe}". DJ Name: '${STATION_CONFIG.djName}'.`;

        // Extracted default prompt and funny suffix for clarity
        const basePrompt = STATION_CONFIG.aiPrompts.segue || "Write a smooth segue.";
        const funnySuffix = includeFunny ? `\n\n${STATION_CONFIG.aiPrompts.segwayFunny}` : "";

        // Combine into a single prompt expression
        const prompt = `${basePrompt}${funnySuffix}`;

        // Create a richer prompt with whatever information we have
        const userPrompt = `
            You are a lively and enthusiastic DJ on a galactic space station.

            Here’s the context for the songs:

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

            ${STATION_CONFIG.enhancedEngagement?.enabled ? 
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

            Important: Incorporate this listener feedback naturally into your segue if possible.`;
                }
                return '';
              })() 
              : ''}

            Task:
            Create a short, natural DJ-style transition from the previous track to the next.
            Mention the names of both songs and artists. 
            Only use the extra details (album, genre, notes) **if they help make the transition smoother or funnier** — they are optional flavor.

            ${prompt}

            Respond only with the DJ’s spoken words. Limit to 1–2 sentences. Be natural and entertaining.
            `;

        console.log("Generating segue between:", prevTitle, "→", nextTitle);

        // Call OpenAI API
        const openai = require('openai');
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
        console.log("Generated segue text:", segwayText);
        return segwayText;
    } catch (error) {
        console.error(`Error generating segue: ${error.message}`);
        // Fallback text if API fails
        return `And that was ${prevMeta?.title || 'our last track'}. Coming up next on ${STATION_CONFIG.stationName}!`;
    }
}

module.exports = { initPromptWatcher };
