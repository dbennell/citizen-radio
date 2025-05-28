const fs = require('fs');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const util = require('util');

const ttsClient = new TextToSpeechClient();
const writeFileAsync = util.promisify(fs.writeFile);

/**
 * Generate text-to-speech (TTS) audio content.
 *
 * @param {string} text - The text to generate speech for.
 * @param {string} outputPath - The path to save the generated audio file.
 * @param {Object} metadata - Additional metadata (e.g., track title, artist, comments).
 * @param {string} type - Type of the TTS content (e.g., "segway", "dj", "ad").
 * @returns {Promise<void>}
 */
// async function generateTTS(text, outputPath, metadata = {}, type = 'unknown') {
//     try {
//         const [response] = await ttsClient.synthesizeSpeech({
//             input: { text },
//             voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
//             audioConfig: { audioEncoding: 'MP3' },
//         });
//
//         await writeFileAsync(outputPath, response.audioContent, 'binary');
//         //console.log(`TTSHelper: Successfully generated TTS for ${type} at ${outputPath}.`);
//     } catch (error) {
//         console.error(`🚨 TTSHelper: Failed to generate TTS for ${type} -> ${error.message}`);
//         throw error;
//     }
// }

async function generateTTS(text, outputPath, metadata, type) {
    const voice = STATION_CONFIG.ttsProfiles[type] || "en-US-Wavenet-D";

    // Determine language code from voice name
    let languageCode = "en-US";  // default

    // Extract language code from voice name if possible
    if (voice && voice.includes('-')) {
        const parts = voice.split('-');
        if (parts.length >= 2) {
            const prefix = parts.slice(0, 2).join('-');
            if (prefix.match(/^[a-z]{2}-[A-Z]{2}$/)) {
                languageCode = prefix;
               // console.log(`Using detected language code ${languageCode} for voice ${voice}`);
            }
        }
    }

    const request = {
        input: { text: text + ' ... ' },
        voice: { languageCode: languageCode, name: voice },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 }
    };

    try {
        const [response] = await ttsClient.synthesizeSpeech(request);
        fs.writeFileSync(outputPath, response.audioContent, "binary");
        //console.log(`TTS audio saved: ${outputPath}`);
    } catch (err) {
        console.error(`Error synthesizing speech with ${voice}:`, err.message);

        const fallbackRequest = {
            input: { text: text + ' ... ' },
            voice: { languageCode: "en-US", name: "en-US-Chirp3-HD-Enceladus" },
            audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 }
        };

        const [fallbackResponse] = await ttsClient.synthesizeSpeech(fallbackRequest);
        fs.writeFileSync(outputPath, fallbackResponse.audioContent, "binary");
        console.log(`⚠️ TTS audio saved with fallback voice: ${outputPath}`);
    }
}

module.exports = {
    generateTTS,
};