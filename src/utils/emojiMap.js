// utils/emojiMap.js
const fs     = require('fs');
const path   = require('path');
const emoji  = require('emoji-dictionary');   // npm install emoji-dictionary
const EMOJI_DIR = path.join(__dirname, '../../assets/emojis');

/**
 * Build a mapping from actual emoji character to the matching PNG filename.
 */
function buildEmojiMap() {
    const files = fs.readdirSync(EMOJI_DIR);
    const map = {};

    // Log the files we found for debugging
    console.log(`Found ${files.filter(f => f.endsWith('.png')).length} PNG files in ${EMOJI_DIR}`);

    // Direct mappings for emoji ratings (from README.md)
    const directMappings = {
       /// '🔇': 'mute.png', // This file doesn't exist, will try to find similar
        '😡': 'angry.png',
        '🤬': 'face_with_symbols_on_mouth.png', // Updated to match existing file
        '🤡': 'clown_face.png', // Updated to match existing file
        '👎': '-1.png', // Updated to match existing file
        '🫳': 'hand.png', // Updated to match existing file
        '👍': '+1.png', // Updated to match existing file
        '❤️': 'heart.png',
        '❤': 'heart.png', // Handle both variants
        '♥️': 'heart.png', // Handle both variants
        '♥': 'heart.png', // Handle both variants
        '😍': 'heart_eyes.png',
        '🥰': 'heart.png', // Updated to match existing file (closest match)
        '🤩': 'star-struck.png' // Updated to match existing file
    };

    // First, try to map using emoji-dictionary for all files
    for (const file of files) {
        if (!file.endsWith('.png')) continue;
        const shortName = path.basename(file, '.png');    // e.g. "smile", "rolling_on_the_floor_laughing"

        // Try different variations of the shortname
        let char = emoji.getUnicode(shortName);         // e.g. "😄", "🤣"

        if (!char) {
            // Try replacing underscores with spaces
            const altSpace = shortName.replace(/_/g, ' ');
            char = emoji.getUnicode(altSpace);
        }

        if (!char) {
            // Try replacing underscores with hyphens
            const altHyphen = shortName.replace(/_/g, '-');
            char = emoji.getUnicode(altHyphen);
        }

        if (char) {
            map[char] = path.join(EMOJI_DIR, file);
            //console.log(`Mapped emoji ${char} to file ${file}`);
        } else {
            //console.log(`Could not map file ${file} to an emoji character`);
        }
    }

    // Then, apply direct mappings for the emoji ratings
    for (const [emojiChar, fileName] of Object.entries(directMappings)) {
        const filePath = path.join(EMOJI_DIR, fileName);

        // Check if the file exists before adding the mapping
        if (fs.existsSync(filePath)) {
            map[emojiChar] = filePath;
            //console.log(`Applied direct mapping for ${emojiChar} to ${fileName}`);
        } else {
            // Try to find a close match for the filename
            const similarFiles = files.filter(f => 
                f.endsWith('.png') && 
                (f.toLowerCase().includes(fileName.replace('.png', '').toLowerCase()) ||
                 fileName.replace('.png', '').toLowerCase().includes(f.toLowerCase().replace('.png', '')))
            );

            if (similarFiles.length > 0) {
                map[emojiChar] = path.join(EMOJI_DIR, similarFiles[0]);
                console.log(`Found similar file ${similarFiles[0]} for ${emojiChar} (wanted ${fileName})`);
            } else {
                console.log(`Warning: Could not find file ${fileName} for emoji ${emojiChar}`);
            }
        }
    }

    console.log(`Built emoji map with ${Object.keys(map).length} entries`);
    return map;
}

module.exports = buildEmojiMap();
