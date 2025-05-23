// ========================
// File: podcastGenerator.js
// ========================
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const {
  generateScript,
  parseScript,
  processParticipantData
} = require('./podcastParser');

const {
  assignVoiceToName
} = require('./voiceManager');

const {
  synthesizeSpeechWithVoice,
  stitchAudio
} = require('./audioSynthesizer');

async function run(opts) {
  const {
    prompt,
    topic,
    durationMinutes = 6,
    outputFileName = 'podcast_segment.mp3',
    tempDirectory = 'clips',
    hostNames,
    guestNames,
    participantData = {}   // ← default to empty object
  } = opts;

  console.log('==== Starting podcast generation ====');
  console.log('Options:', { prompt: prompt?.slice(0,50)+'…', topic: topic?.slice(0,50)+'…', durationMinutes, outputFileName, tempDirectory });
  console.log('Participants:', { hostNames, guestNames });

  console.log(`Using temp directory for podcast: ${tempDirectory}`);
  fs.mkdirSync(tempDirectory, { recursive: true }); // Ensure temp dir exists

  const input = prompt || topic;
  if (!input) throw new Error('No prompt or topic provided');

  // enrich with gender/title and persist voice-mapping
  console.log('Processing participant metadata…');
  await processParticipantData(participantData);

  // Prepare workspace
  const participants = { hostNames, guestNames, participantData };

  try {
    // Generate the podcast script
    console.log('Generating script…');
    const script = await generateScript(input, durationMinutes, participants, !!prompt);
    console.log('Script excerpt:', script.slice(0, 200) + '…');

    // Save the script immediately in the temp directory
    const scriptPath = path.join(tempDirectory, 'script.txt');
    fs.writeFileSync(scriptPath, script, 'utf8');
    console.log(`✔ Script saved to temp directory: ${scriptPath}`);

    // Parse the script into parts for TTS synthesis
    console.log('Parsing script into parts…');
    const parts = parseScript(script, participants);
    if (parts.length === 0) throw new Error('No parts parsed from script');

    // Synthesize each part as audio files
    const audioFiles = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const gender = participantData[part.character]?.gender || 'neutral';
      const { voiceName, speakerId } = await assignVoiceToName(part.character, part.role, gender);

      part.voiceName = voiceName;
      part.speakerId = speakerId;

      // File path for each synthesized clip
      const clipPath = path.join(tempDirectory, `${speakerId}`, `${Date.now()}_part${i}.mp3`);
      const parentDir = path.dirname(clipPath); // Ensure parent directory exists
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      try {
        await synthesizeSpeechWithVoice(part, clipPath);
        if (fs.existsSync(clipPath) && fs.statSync(clipPath).size > 0) {
          audioFiles.push(clipPath);
        } else {
          console.error(`❗ Empty clip: part ${i}`);
        }
      } catch (err) {
        console.error(`❗ Failed to process part ${i}: ${err.message}`);
      }
    }

    // If no audio files are successfully created
    if (audioFiles.length === 0) {
      throw new Error('No audio generated. Script saved for debugging: ' + scriptPath);
    }

    // Stitch the audio files into the final podcast
    console.log('Stitching audio files…');
    const finalFile = stitchAudio(audioFiles, outputFileName);
    console.log(`✅ Podcast successfully created: ${finalFile}`);

    return { success: true, outputFile: finalFile, scriptPath };

  } catch (err) {
    console.error('❗ Podcast generation failed:', err.message);
    return { success: false, error: err.message };
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = args.reduce((o, v, i, arr) => {
    if (i % 2 === 0) {
      const key = v.replace(/^--/, '');
      let val = arr[i + 1];
      if (['hostNames', 'guestNames'].includes(key)) val = val.split(',');
      if (key === 'durationMinutes') val = Number(val);
      o[key] = val;
    }
    return o;
  }, {});

  run(opts)
      .then(res => {
        if (res.success && res.script) {
          const scriptFile = opts.outputFileName.replace(/\.mp3$/, '.txt');
          fs.writeFileSync(scriptFile, res.script, 'utf8');
          console.log(`Script saved to ${scriptFile}`);
        }
      })
      .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
      });
}

module.exports = { run };