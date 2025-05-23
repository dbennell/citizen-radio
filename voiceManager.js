// ========================
// File: voiceManager.js
// ========================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const { STATION_CONFIG } = require('./config');
const ttsClient     = new TextToSpeechClient();
const MAPPING_FILE  = path.join(__dirname, 'voiceMapping.json');

// in-memory
let mapping         = {};
let availableVoices = { male: [], female: [], neutral: [] };
let initialized     = false;

// helper to test glob-style filters
function matchesFilter(voiceName, patterns) {
    return patterns.some(pat => {
        // escape dot, replace * → .*
        const re = new RegExp('^' +
            pat.replace(/\./g, '\\.').replace(/\*/g, '.*') +
            '$'
        );
        return re.test(voiceName);
    });
}

async function init() {
    if (initialized) return;
    initialized = true;

    // load existing mapping
    if (fs.existsSync(MAPPING_FILE)) {
        try {
            mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        } catch (_) {
            mapping = {};
        }
    }

    // gather built-in voices and allowed patterns
    const builtIns = Object.values(STATION_CONFIG.ttsProfiles || {});
    const allowed  = STATION_CONFIG.ttsAllowedPatterns || [];


    // fetch all voices
    const [result] = await ttsClient.listVoices({});
    for (const v of result.voices) {
        if (!v.ssmlGender) continue;
        // only pick en-language variants here
        if (!v.languageCodes.some(l => l.startsWith('en-'))) continue;

        const g = v.ssmlGender.toLowerCase();
        if (availableVoices[g]) {
            availableVoices[g].push(v.name);
        }
    }

    // remove baked-in voices and apply allowed filter
    for (const gender of Object.keys(availableVoices)) {
        availableVoices[gender] = availableVoices[gender]
            .filter(name => !builtIns.includes(name))
            .filter(name => !allowed.length || matchesFilter(name, allowed));
    }

    // remove already-mapped names from pools
    for (const { voiceName } of Object.values(mapping)) {
        for (const g of Object.keys(availableVoices)) {
            const idx = availableVoices[g].indexOf(voiceName);
            if (idx !== -1) availableVoices[g].splice(idx, 1);
        }
    }
}

function saveMapping() {
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2), 'utf8');
}

/**
 * Assigns a unique TTS voice to each participant name.
 * gender: "male"|"female"|"neutral"
 */
async function assignVoiceToName(name, role, gender = 'neutral') {
    await init();

    if (mapping[name]) {
        return mapping[name];
    }

    // choose from gender pool or fallback
    let pool = (availableVoices[gender].length)
        ? availableVoices[gender]
        : [].concat(availableVoices.male, availableVoices.female, availableVoices.neutral);

    if (!pool.length) throw new Error('No TTS voices left to assign!');

    const idx       = Math.floor(Math.random() * pool.length);
    const voiceName = pool[idx];
    const speakerId = crypto.createHash('md5').update(name).digest('hex').slice(0, 6);

    // remove from all pools
    for (const g of Object.keys(availableVoices)) {
        const i = availableVoices[g].indexOf(voiceName);
        if (i !== -1) availableVoices[g].splice(i, 1);
    }

    mapping[name] = { voiceName, speakerId };
    saveMapping();
    return mapping[name];
}

module.exports = { assignVoiceToName };