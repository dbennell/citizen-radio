// ========================
// File: audioSynthesizer.js
// ========================
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const textToSpeech = require('@google-cloud/text-to-speech');

// Initialize clients
const ttsClient = new textToSpeech.TextToSpeechClient();


async function synthesizeSpeechWithVoice(part, filePath) {
    const { text, voiceName, character } = part;

    // Skip parts that are non-speech (e.g., sound effect placeholders)
    if (text.startsWith("<") && text.endsWith(">")) {
        console.log(`Skipping TTS synthesis for placeholder text: ${text}`);
        return false; // Return false to indicate no audio was synthesized
    }

    // Proceed with regular TTS synthesis
    let languageCode = 'en-US';
    if (voiceName && voiceName.includes('-')) {
        const parts = voiceName.split('-');
        if (parts.length >= 2) {
            const prefix = parts.slice(0, 2).join('-');
            languageCode = prefix;
        }
    }

    console.log(`Starting TTS synthesis with voice "${voiceName}" for text: "${text.substring(0, 30)}..."`);

    try {
        const [response] = await ttsClient.synthesizeSpeech({
            input: { text },
            voice: { languageCode, name: voiceName },
            audioConfig: { audioEncoding: 'MP3' }
        });

        fs.writeFileSync(filePath, response.audioContent, 'binary');
        console.log(`Wrote ${response.audioContent.length} bytes of audio data to ${filePath}`);

        return true;
    } catch (err) {
        console.error(`TTS error for ${character}:`, err);
        throw err;
    }
}

// /**
//  * Synthesize a single clip using assigned voice
//  * @param {Object} part - The part to synthesize
//  * @param {string} filePath - The path to save the audio file
//  * @returns {Promise<boolean>} - Whether synthesis was successful
//  */
// async function synthesizeSpeechWithVoice(part, filePath) {
//     const { text, voiceName, character } = part;
//
//     // Determine the correct language code from the voice name
//     let languageCode = 'en-US';  // default
//
//     // Extract language code from voice name (e.g., en-AU from en-AU-Chirp3-HD-Achernar)
//     if (voiceName && voiceName.includes('-')) {
//         const parts = voiceName.split('-');
//         if (parts.length >= 2) {
//             const prefix = parts.slice(0, 2).join('-');
//             languageCode = prefix;
//             //console.log(`Using detected language code ${languageCode} for voice ${voiceName}`);
//         }
//     }
//
//     console.log(`Starting TTS synthesis with voice "${voiceName}" for text: "${text.substring(0, 30)}..."`);
//
//     try {
//         const [response] = await ttsClient.synthesizeSpeech({
//             input: { text },
//             voice: { languageCode, name: voiceName },
//             audioConfig: { audioEncoding: 'MP3' }
//         });
//
//         fs.writeFileSync(filePath, response.audioContent, 'binary');
//         console.log(`Wrote ${response.audioContent.length} bytes of audio data to ${filePath}`);
//
//         return true;
//     } catch (err) {
//         console.error(`TTS error for ${character}:`, err);
//
//         // Try fallback with a standard voice if there's an error
//         try {
//             console.log(`Trying fallback voice for ${character}...`);
//             const fallbackVoice = 'en-US-Chirp3-HD-Enceladus';
//
//             const [response] = await ttsClient.synthesizeSpeech({
//                 input: { text },
//                 voice: { languageCode: 'en-US', name: fallbackVoice },
//                 audioConfig: { audioEncoding: 'MP3' }
//             });
//
//             fs.writeFileSync(filePath, response.audioContent, 'binary');
//             console.log(`Fallback voice used successfully for ${character}`);
//             return true;
//         } catch (fallbackErr) {
//             console.error(`Fallback voice also failed:`, fallbackErr.message);
//             throw err; // Re-throw the original error
//         }
//     }
// }

/** Generate a unique filepath if one already exists */
function generateUniqueFilePath(filePath) {
    if (!fs.existsSync(filePath)) return filePath;
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    let counter = 1;
    let candidate;
    do {
        candidate = path.join(dir, `${base}_${counter++}${ext}`);
    } while (fs.existsSync(candidate));
    return candidate;
}

/** Remove a directory recursively */
function cleanup(directory) {
    if (fs.existsSync(directory)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

/**
 * Stitch audio files with overlap, then cleanup
 * @param {string[]} files - The audio files to stitch
 * @param {string} output - The output file path
 * @returns {string} - The path to the output file
 */
function stitchAudio(files, output) {
    console.log(`Stitching ${files.length} audio files to ${output}`);
    if (!files.length) {
        throw new Error('No audio files to stitch');
    }

    // Check each file to make sure it exists and has content
    const validFiles = files.filter(file => {
        if (!fs.existsSync(file)) {
            console.error(`File does not exist: ${file}`);
            return false;
        }
        const stats = fs.statSync(file);
        if (stats.size === 0) {
            console.error(`File is empty: ${file}`);
            return false;
        }
        //console.log(`File is valid: ${file} (${stats.size} bytes)`);
        return true;
    });

    if (validFiles.length === 0) {
        throw new Error('No valid audio files to stitch (all files are missing or empty)');
    }

    // If we only have one valid file, just copy it to the output
    if (validFiles.length === 1) {
        console.log(`Only one valid audio file, copying directly to output`);
        fs.copyFileSync(validFiles[0], output);
        return output;
    }

    const safeOutput = generateUniqueFilePath(output);
    const listFile = path.join(path.dirname(safeOutput), `filelist_${Date.now()}.txt`);
    const content = validFiles.map(f=>`file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(listFile, content, 'utf8');
    console.log(`Created file list at ${listFile}`);

    try {
        // Use a proper filter_complex for crossfading multiple files
        if (validFiles.length === 2) {
            // For exactly 2 files, we can use a simpler approach
            console.log('Running ffmpeg with crossfade for 2 files...');
            execSync(`ffmpeg -hide_banner -loglevel warning -i "${validFiles[0]}" -i "${validFiles[1]}" -filter_complex "[0:a][1:a]acrossfade=d=0.2:c1=tri:c2=tri[a]" -map "[a]" "${safeOutput}"`, { stdio: 'inherit' });
            console.log('FFmpeg crossfade complete.');
        } else {
            // For more than 2 files, use a more complex approach with concat demuxer
            // First normalize each file to consistent audio format
            const normalizedDir = path.join(path.dirname(safeOutput), `normalized_${Date.now()}`);
            fs.mkdirSync(normalizedDir, { recursive: true });

            console.log('Normalizing audio files for consistent processing...');
            const normalizedFiles = [];

            // Process each file to consistent format
            for (let i = 0; i < validFiles.length; i++) {
                const normalizedFile = path.join(normalizedDir, `norm_${i}.mp3`);
                execSync(`ffmpeg -hide_banner -loglevel warning -i "${validFiles[i]}" -af "loudnorm=I=-16:TP=-1:LRA=11" "${normalizedFile}"`, { stdio: 'inherit' });
                normalizedFiles.push(normalizedFile);
            }

            console.log('Running simple concatenation...');
            // Create a new list file for normalized files
            const normListFile = path.join(normalizedDir, 'norm_filelist.txt');
            const normContent = normalizedFiles.map(f=>`file '${f.replace(/'/g, "'\\''")}'`).join('\n');
            fs.writeFileSync(normListFile, normContent, 'utf8');

            // Simple concatenation (without crossfade)
            execSync(`ffmpeg -hide_banner -loglevel warning -f concat -safe 0 -i "${normListFile}" -c copy "${safeOutput}"`, { stdio: 'inherit' });
            console.log('FFmpeg concatenation complete.');

            // Clean up the normalized files
            fs.rmSync(normalizedDir, { recursive: true, force: true });
        }
    } catch (err) {
        console.warn('Advanced audio processing failed, retrying simple concat...', err.message);
        try {
            // Fallback to simple concatenation without any processing
            execSync(`ffmpeg -hide_banner -loglevel warning -f concat -safe 0 -i "${listFile}" -c copy "${safeOutput}"`, { stdio: 'inherit' });
            console.log('FFmpeg simple concat complete.');
        } catch (err2) {
            console.error('Both ffmpeg methods failed:', err2.message);
            throw new Error(`FFmpeg failed: ${err2.message}`);
        }
    } finally {
        console.log('Cleaning up temp files...');
        fs.rmSync(listFile, { force: true });
    }
    return safeOutput;
}

module.exports = {
    synthesizeSpeechWithVoice,
    stitchAudio,
    generateUniqueFilePath,
    cleanup
};