
// ========================
// File: podcastParser.js
// ========================
'use strict';

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { assignVoiceToName } = require('./voiceManager');

/**
 * Preprocess script parts for TTS compatibility
 * @param {Array} parts - The parsed script parts
 * @returns {Array} - Preprocessed script parts
 */
function preprocessScriptParts(parts) {
    return parts.map(part => {
        // Remove anything inside square brackets (e.g., [Laughs], [Pauses], etc.)
        part.text = part.text.replace(/\[.*?\]/g, "");

        // Optional: Trim surrounding whitespace after replacements
        part.text = part.text.trim();

        // If necessary, handle custom replacements for sound effects, like [Laughs]
        // Example: Insert a placeholder or mark where a sound effect should go
        if (part.text.includes("[Laughs]")) {
            part.text = part.text.replace(/\[Laughs\]/g, "<LaughSound>");
        }

        return part;
    });
}

/**
 * Extract and process podcast participant information from different prompt formats
 * @param {string} promptText - The raw text of the podcast prompt
 * @returns {Promise<Object>} - Object containing participantData, hostNames, and guestNames
 */
async function extractParticipantInfo(promptText) {
    const functionSpec = {
        name: "extract_participants",
        description: "Extracts podcast participants and their metadata from various prompt formats",
        parameters: {
            type: "object",
            properties: {
                topic: { type: "string" },
                durationMinutes: { type: ["number", "null"] },
                participants: {
                    type: "object",
                    additionalProperties: {
                        type: "object",
                        properties: {
                            name:       { type: "string" },
                            role:       { type: "string", enum: ["HOST", "GUEST"] },
                            occupation: { type: ["string", "null"] },
                            gender:     { type: "string", enum: ["male", "female", "neutral"] },
                            title:      { type: "string" }
                        },
                        required: ["name", "role", "gender", "title"],
                        additionalProperties: false
                    }
                }
            },
            required: ["participants", "topic"],
            additionalProperties: false
        }
    };

    const systemPrompt = `
You are a utility that extracts podcast information from various prompt formats.
You should handle formats like:

FORMAT 1:
Topic: The future of quantum travel
Hosts:
- Markus Reynolds: Male, senior science correspondent
- Leela Chen: Female, engineer
Guests:
- Dr. Xander Smith: Male, quantum physicist
- Captain Aria Jackson: Female, test pilot

FORMAT 2:
## Create a 8 minute podcast about Invictus
host: Dex Rylan
guest: Retired UEE Navy Captain, Lorna Sterling
guest: Ex Invictus organiser, Steve Fisher

FORMAT 3:
host: Dex Rylan
guest: Cheese maker, Audrey kemp
guest: Bob, cheese lover

Parse the duration if specified (default to 6 minutes if not specified).
Extract the topic, and for each participant:
1. Full name
2. Role (HOST/GUEST)
3. Gender (male/female/neutral) - infer from name if not explicitly stated
4. Occupation or description (if provided)
5. Title (Mr/Ms/Dr/Captain/etc.)
    `.trim();

    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user",   content: promptText }
            ],
            functions: [functionSpec],
            function_call: "auto",
            temperature: 0
        });

        console.log("❯ LLM raw response:", JSON.stringify(res.choices[0], null, 2));
        const msg = res.choices[0].message;

        if (msg.function_call?.name === "extract_participants") {
            let args;
            try {
                args = JSON.parse(msg.function_call.arguments);
            } catch (err) {
                console.warn("Failed to parse function_call.arguments:", msg.function_call.arguments, "Error:", err.message);
                throw new Error("Invalid JSON in LLM response for participants");
            }

            // Check if participants object exists and has entries
            if (args && args.participants && typeof args.participants === "object" && Object.keys(args.participants).length > 0) {
                // Extract topic and duration
                const topic = args.topic || "";
                const durationMinutes = args.durationMinutes || 6;

                // Validate participants structure
                const validParticipants = {};
                const hostNames = [];
                const guestNames = [];

                for (const [name, details] of Object.entries(args.participants)) {
                    if (
                        typeof details.name === "string" &&
                        details.role &&
                        (details.role === "HOST" || details.role === "GUEST") &&
                        typeof details.gender === "string" &&
                        typeof details.title === "string"
                    ) {
                        // Add to valid participants
                        validParticipants[name] = {
                            ...details,
                            // Add topic and duration to each participant for accessibility
                            _metadata: { topic, durationMinutes }
                        };

                        // Separate hosts and guests
                        if (details.role === "HOST") hostNames.push(name);
                        if (details.role === "GUEST") guestNames.push(name);
                    } else {
                        console.warn(`Skipping invalid participant entry: ${JSON.stringify({ name, details })}`);
                    }
                }

                if (Object.keys(validParticipants).length > 0) {
                    console.log("Validated participantData from LLM:", validParticipants);
                    return {
                        participantData: validParticipants,
                        hostNames,
                        guestNames,
                        topic,
                        durationMinutes
                    };
                } else {
                    throw new Error("LLM returned invalid participant objects");
                }
            }

            throw new Error("LLM returned empty or malformed participants object");
        }

        throw new Error("Model did not return a function_call");
    } catch (e) {
        console.warn("LLM parsing failed, falling back to manual parsing:", e.message);
        return parseParticipantsManually(promptText);
    }
}

const genderDetect = require('gender-detection');

function parseParticipantsManually(promptText) {
    const participantData = {};
    const hostNames = [];
    const guestNames = [];

    // Extract topic
    let topic = "";
    let durationMinutes = 6; // Default duration

    const lines = promptText.split("\n").map(l => l.trim()).filter(Boolean);

    // First, try to extract topic and duration
    for (const line of lines) {
        // Check for lines explicitly starting with "Topic:" or a heading that mentions "podcast"
        if (/^topic:\s*(.+)/i.test(line)) {
            topic = line.replace(/^topic:\s*/i, '').trim();
        }
        // Look for headings that might include duration and topic
        else if (/^#+\s*create\s+a\s+(\d+)(?:\s*\-?minute|\s*min\.?|\s*m)?\s+podcast(?:\s+about\s+(.+))?/i.test(line)) {
            const match = line.match(/^#+\s*create\s+a\s+(\d+)(?:\s*\-?minute|\s*min\.?|\s*m)?\s+podcast(?:\s+about\s+(.+))?/i);
            if (match) {
                durationMinutes = parseInt(match[1], 10);
                if (match[2]) topic = match[2].trim();
            }
        }
        // For unlabeled topics, check lines starting with podcast about
        else if (/^podcast\s+about\s+(.+)/i.test(line)) {
            topic = line.replace(/^podcast\s+about\s+/i, '').trim();
        }
    }

    // If no topic found and first line isn't a host/guest, use it as topic
    if (!topic && lines.length > 0 && !lines[0].match(/^(host|guest):/i)) {
        topic = lines[0].trim();
    }

    // Identify and extract participants
    for (const line of lines) {
        // Standardized role extraction with better regex
        // Match formats: "host: Name", "guest: Name", "HOST - Name", etc.
        const roleMatch = line.match(/^(host|guest)(?::|[\s\-]+)(.+)$/i);

        if (!roleMatch) continue;

        const role = roleMatch[1].toUpperCase();
        let raw = roleMatch[2].trim(); // Text after role identifier

        // Attempt to isolate name and occupation
        let name = raw;
        let occupation = null;

        // Check for various occupation formats

        // Format: "Name (Occupation)"
        const parenthesesMatch = name.match(/^([^(]+)\s*\(([^)]+)\)$/);
        if (parenthesesMatch) {
            name = parenthesesMatch[1].trim();
            occupation = parenthesesMatch[2].trim();
        }
        // Format: "Occupation, Name"
        else {
            const commaSplit = raw.split(',').map(part => part.trim());
            if (commaSplit.length > 1) {
                // Last part is likely the name, everything before is occupation
                name = commaSplit[commaSplit.length - 1];
                occupation = commaSplit.slice(0, -1).join(', ');
            }
        }

        // Extract title from name if present
        const titleMatch = name.match(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Captain|Capt\.?|Cmdr\.?|Prof\.?|Retired|Ex)\s+/i);
        let title = null;
        if (titleMatch) {
            title = titleMatch[1].replace(/\.$/, ''); // Remove trailing period from title
            name = name.replace(titleMatch[0], '').trim();
        }

        // Handle titles that might be in the occupation
        if (occupation) {
            // Look for title patterns in occupation
            const titleInOcc = occupation.match(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Captain|Capt\.?|Cmdr\.?|Prof\.?|Retired|Ex)/i);
            if (titleInOcc && !title) {
                title = titleInOcc[1].replace(/\.$/, '');
            }
        }

        // Extract nickname in quotes if present
        const nicknameMatch = name.match(/"([^"]+)"/);
        const nickname = nicknameMatch ? nicknameMatch[1] : null;
        if (nicknameMatch) {
            name = name.replace(nicknameMatch[0], '').replace(/\s+/g, ' ').trim();
        }

        // Use gender-detection for first name, fall back to neutral
        const firstName = name.split(' ')[0];
        let gender = genderDetect.detect(firstName);
        if (!gender || !['male', 'female'].includes(gender)) {
            gender = 'neutral';
        }

        // Set default title based on gender if none was found
        title = title || (gender === 'female' ? 'Ms' : gender === 'male' ? 'Mr' : 'Mx');

        // Construct final name with nickname if present
        const fullName = nickname ? `${name} ("${nickname}")` : name;

        // Add participant data to our collection
        participantData[fullName] = {
            name: fullName,
            role,
            occupation: occupation || null,
            gender,
            title,
            _metadata: { topic, durationMinutes }
        };

        // Categorize by role
        if (role === 'HOST') hostNames.push(fullName);
        else if (role === 'GUEST') guestNames.push(fullName);
    }

    console.log('Extracted participantData (manual fallback):', participantData);
    console.log('Hosts:', hostNames);
    console.log('Guests:', guestNames);

    return {
        participantData,
        hostNames,
        guestNames,
        topic,
        durationMinutes
    };
}

function parseScript(script, participants) {
    const lines = script.split(/\r?\n/).filter(l => l.trim()); // Split script into lines, ignoring empty lines
    const parts = [];
    const { hostNames = [], guestNames = [], participantData = {} } = participants;

    console.log(`Parsing script with ${hostNames.length} hosts and ${guestNames.length} guests`);
    console.log(`Host names: ${JSON.stringify(hostNames)}`);
    console.log(`Guest names: ${JSON.stringify(guestNames)}`);

    // Map participants to their tags
    const nameMap = {};
    hostNames.forEach((name, index) => {
        const tag = `HOST${hostNames.length > 1 ? index + 1 : ''}`;
        nameMap[tag] = name;
        console.log(`Mapped ${tag} to ${name}`);
    });

    guestNames.forEach((name, index) => {
        const tag = `GUEST${guestNames.length > 1 ? index + 1 : ''}`;
        nameMap[tag] = name;
        console.log(`Mapped ${tag} to ${name}`);
    });

    let lastSpeaker = null; // Keep track of the last valid speaker

    for (const line of lines) {
        // 1. Handle metadata or context lines (e.g., "(HOST: Dex Rylan)")
        if (line.startsWith('(') && line.endsWith(')')) {
            console.log(`Skipping metadata/context line: ${line}`);
            continue; // Ignore metadata or context
        }

        // 2. Handle standard "TAG: Text" format
        const standardMatch = line.match(/^([A-Z]+\d*):\s*(.+)$/);
        if (standardMatch) {
            const tag = standardMatch[1];
            const text = standardMatch[2].trim();
            const character = nameMap[tag] || tag;
            const role = tag.startsWith('HOST') ? 'HOST' : 'GUEST';

            if (text) {
                parts.push({ tag, character, role, text });
                lastSpeaker = character; // Update last speaker
            } else {
                console.warn(`Warning: Empty text for ${tag}`);
            }
            continue;
        }

        // 3. Handle joint speaker tags (e.g., "GUEST1 & GUEST2: Bye!")
        const jointMatch = line.match(/^([A-Z]+\d*)\s*&\s*([A-Z]+\d*):\s*(.+)$/);
        if (jointMatch) {
            const tag1 = jointMatch[1];
            const tag2 = jointMatch[2];
            const text = jointMatch[3].trim();

            const char1 = nameMap[tag1] || tag1;
            const char2 = nameMap[tag2] || tag2;

            if (text) {
                parts.push({ tag: tag1, character: char1, role: tag1.startsWith('HOST') ? 'HOST' : 'GUEST', text });
                parts.push({ tag: tag2, character: char2, role: tag2.startsWith('HOST') ? 'HOST' : 'GUEST', text });
            } else {
                console.warn(`Warning: Empty text for joint speakers ${tag1} and ${tag2}`);
            }
            continue;
        }

        // 4. Assign untagged lines to the last speaker (fallback)
        if (lastSpeaker) {
            console.warn(`Assigning untagged line to last speaker (${lastSpeaker}): ${line}`);
            const text = line.trim();
            if (text) {
                const role = hostNames.includes(lastSpeaker) ? 'HOST' : 'GUEST';
                const tag = role + (role === 'HOST' && hostNames.length > 1
                    ? hostNames.indexOf(lastSpeaker) + 1
                    : role === 'GUEST' && guestNames.length > 1
                        ? guestNames.indexOf(lastSpeaker) + 1
                        : '');

                parts.push({ tag, character: lastSpeaker, role, text });
            }
            continue;
        }

        // 5. Handle meta instructions (e.g., "[End segment]")
        if (line.startsWith('[') && line.endsWith(']')) {
            console.log(`Skipping meta instruction: ${line}`);
            continue; // Ignore meta instructions
        }

        // 6. If nothing matches, log a warning
        console.warn(`Warning: Could not process line: ${line}`);
    }

    // Preprocess parsed parts for TTS compatibility
    const processedParts = preprocessScriptParts(parts);

    console.log(`Parsed and preprocessed ${processedParts.length} parts from script`);
    return processedParts;
}

// /**
//  * Parse script text into speaker parts with names
//  * @param {string} script - The script text
//  * @param {Object} participants - The participants information
//  * @returns {Array} - Array of parsed script parts
//  */
// function parseScript(script, participants) {
//     const lines = script.split(/\r?\n/).filter(l=>l.trim());
//     const parts = [];
//     const { hostNames = [], guestNames = [], participantData = {} } = participants;
//     const hostCount = hostNames.length;
//     const guestCount = guestNames.length;
//
//     console.log(`Parsing script with ${hostCount} hosts and ${guestCount} guests`);
//     console.log(`Host names: ${JSON.stringify(hostNames)}`);
//     console.log(`Guest names: ${JSON.stringify(guestNames)}`);
//
//     const nameMap = {};
//     hostNames.forEach((n,i) => {
//         const tag = `HOST${hostCount>1?i+1:''}`;
//         nameMap[tag] = n;
//         console.log(`Mapped ${tag} to ${n}`);
//     });
//
//     guestNames.forEach((n,i) => {
//         const tag = `GUEST${guestCount>1?i+1:''}`;
//         nameMap[tag] = n;
//         console.log(`Mapped ${tag} to ${n}`);
//     });
//
//     // Look for common script formats
//     for (let i = 0; i < lines.length; i++) {
//         const line = lines[i];
//
//         // Standard format: "TAG: text"
//         const standardMatch = line.match(/^([A-Z]+\d*):\s*(.+)$/);
//         if (standardMatch) {
//             const tag = standardMatch[1];
//             const text = standardMatch[2];
//             if (!text.trim()) {
//                 console.warn(`Warning: Empty text for ${tag} at line ${i+1}`);
//                 continue; // Skip empty lines
//             }
//
//             const character = nameMap[tag] || tag;
//             const role = tag.startsWith('HOST') ? 'HOST' : 'GUEST';
//             parts.push({ tag, character, role, text });
//             continue;
//         }
//
//         // Alternative format with character name: "Character name: text"
//         for (const [tag, name] of Object.entries(nameMap)) {
//             if (line.startsWith(`${name}:`)) {
//                 const text = line.substring(name.length + 1).trim();
//                 if (!text) {
//                     console.warn(`Warning: Empty text for ${name} at line ${i+1}`);
//                     continue;
//                 }
//
//                 const role = tag.startsWith('HOST') ? 'HOST' : 'GUEST';
//                 parts.push({ tag, character: name, role, text });
//                 break;
//             }
//         }
//     }
//
//     // If script parsing found no parts but has hosts/guests defined, try to extract by section
//     if (parts.length === 0 && (hostNames.length > 0 || guestNames.length > 0)) {
//         console.log("No parts found with standard format. Trying to parse by section...");
//
//         let currentSpeaker = null;
//         let currentText = [];
//
//         for (const line of lines) {
//             // Check if line starts with a speaker name (with or without colon)
//             let foundSpeaker = false;
//
//             for (const name of [...hostNames, ...guestNames]) {
//                 if (line.startsWith(name) && (line[name.length] === ':' || line[name.length] === ' ')) {
//                     // Save previous speaker's text if any
//                     if (currentSpeaker && currentText.length > 0) {
//                         const role = hostNames.includes(currentSpeaker) ? 'HOST' : 'GUEST';
//                         const tag = role + (role === 'HOST' && hostNames.length > 1 ? hostNames.indexOf(currentSpeaker) + 1 :
//                             role === 'GUEST' && guestNames.length > 1 ? guestNames.indexOf(currentSpeaker) + 1 : '');
//
//                         parts.push({
//                             tag,
//                             character: currentSpeaker,
//                             role,
//                             text: currentText.join(' ')
//                         });
//                         currentText = [];
//                     }
//
//                     currentSpeaker = name;
//                     const textStart = line.indexOf(':') + 1;
//                     if (textStart > 0 && textStart < line.length) {
//                         currentText.push(line.substring(textStart).trim());
//                     }
//
//                     foundSpeaker = true;
//                     break;
//                 }
//             }
//
//             if (!foundSpeaker && currentSpeaker) {
//                 currentText.push(line);
//             }
//         }
//
//         // Add the last speaker's text
//         if (currentSpeaker && currentText.length > 0) {
//             const role = hostNames.includes(currentSpeaker) ? 'HOST' : 'GUEST';
//             const tag = role + (role === 'HOST' && hostNames.length > 1 ? hostNames.indexOf(currentSpeaker) + 1 :
//                 role === 'GUEST' && guestNames.length > 1 ? guestNames.indexOf(currentSpeaker) + 1 : '');
//
//             parts.push({
//                 tag,
//                 character: currentSpeaker,
//                 role,
//                 text: currentText.join(' ')
//             });
//         }
//     }
//
//     if (parts.length === 0) {
//         // As a last resort, try to automatically assign parts using a simple heuristic
//         console.log("No parts found with named speakers. Trying fallback parsing...");
//
//         // Check for alternating paragraphs (common in dialogue)
//         let speakerIndex = 0;
//         const availableSpeakers = [...hostNames, ...guestNames];
//
//         if (availableSpeakers.length > 0) {
//             for (const paragraph of script.split(/\n\n+/)) {
//                 if (paragraph.trim()) {
//                     const speaker = availableSpeakers[speakerIndex % availableSpeakers.length];
//                     const role = hostNames.includes(speaker) ? 'HOST' : 'GUEST';
//                     const tag = role + (role === 'HOST' && hostNames.length > 1 ? hostNames.indexOf(speaker) + 1 :
//                         role === 'GUEST' && guestNames.length > 1 ? guestNames.indexOf(speaker) + 1 : '');
//
//                     parts.push({
//                         tag,
//                         character: speaker,
//                         role,
//                         text: paragraph.trim()
//                     });
//
//                     speakerIndex++;
//                 }
//             }
//         }
//     }
//
//     console.log(`Parsed ${parts.length} parts from script`);
//     return parts;
// }

/**
 * Generate a podcast script using OpenAI
 * @param {string} promptText - The prompt text
 * @param {number} duration - The duration in minutes
 * @param {Object} participants - The participants information
 * @param {boolean} isFullPrompt - Whether this is a full prompt
 * @returns {Promise<string>} - The generated script
 */
async function generateScript(promptText, duration, participants, isFullPrompt = false) {
    const openai = new (require('openai').OpenAI)({ apiKey: process.env.OPENAI_API_KEY });

    const { hostNames = [], guestNames = [], participantData = {} } = participants;
    const hostCount = hostNames.length;
    const guestCount = guestNames.length;

    // Process participant data to include gender, title, etc.
    await processParticipantData(participantData);

    // Create descriptive strings for hosts and guests
    const hostDesc = hostCount
        ? `${hostCount} host${hostCount>1?'s':''} (${hostNames.map((n,i)=> {
            const pd = participantData[n] || {};
            return `Host${i+1}: ${pd.name}, ${pd.gender || 'unknown'}${pd.occupation ? `, ${pd.occupation}` : ''}`;
        }).join(', ')})`
        : 'no hosts';

    const guestDesc = guestCount
        ? `${guestCount} guest${guestCount>1?'s':''} (${guestNames.map((n,i)=> {
            const pd = participantData[n] || {};
            return `Guest${i+1}: ${pd.name}, ${pd.gender || 'unknown'}${pd.occupation ? `, ${pd.occupation}` : ''}`;
        }).join(', ')})`
        : 'no guests';

    const tags = [
        ...hostNames.map((_,i)=>`HOST${hostCount>1?i+1:''}`),
        ...guestNames.map((_,i)=>`GUEST${guestCount>1?i+1:''}`)
    ].join(', ');

    const header = isFullPrompt
        ? `Create a ${duration}-minute podcast segment based on the following info:\n\n${promptText}`
        : `Write a ${duration}-minute podcast segment on the topic: "${promptText}".`;

    const systemPrompt = `The podcast has ${hostDesc} and ${guestDesc}.\n` +
        `Do Use speaker tags: ${tags}.\n` +
        `Don't break the 4th wall (like mentioning game versions, 'Star Citizen' or 'The Verse'), Keep in character(s) at all times.\n` +
        `Guidelines: fictional podcast in the Star Citizen universe; host from Radio ArcCorp on ArcCorp in 'Area 18'; 
         lighthearted; no emotes; quick intro, then a fast, natural and loose back-and-forth flowing conversation, ending with a short wrap-up conclusion.`;

    const fullPrompt = `${header}\n\n${systemPrompt}`;

    const res = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: fullPrompt }]
    });
    return res.choices[0].message.content;
}

/**
 * Process participant data to add gender, title, and save to voice mapping
 * @param {Object} participantData - The participant data object
 * @returns {Promise<void>}
 */
async function processParticipantData(participantData) {
    const participants = [];

    for (const [name, info] of Object.entries(participantData)) {
        // Use assignVoiceToName, which will init and load existing mappings internally
        const { voiceName, speakerId } = await assignVoiceToName(name, info.role, info.gender);

        participants.push({
            name,
            ...info,
            voiceName,
            speakerId
        });
    }

    return participants;
}


module.exports = {
    extractParticipantInfo,
    parseScript,
    generateScript,
    processParticipantData
};