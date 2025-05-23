// ========================
// File: index.js
// ========================
const { createDirectories, initPromptWatcher } = require('./promptProcessor');
const { playbackLoop, stopPlayback, requestStop}          = require('./orchestrator');
const { startYouTubeStreamer, getFfmpegStdin }= require('./streamer');
const tracksManager                           = require('./trackManager');
const playLog                                 = require('./playLogManager');
const { runningProcesses }                    = require('./utils');
const { STATION_CONFIG }                      = require('./config');
const fs = require('fs');
const path = require('path');


const TEMP_ROOT = path.join(__dirname, 'temp');


function cleanup() {
    stopPlayback();

    // ask ffmpeg to finish
    const stdin = getFfmpegStdin();
    if (stdin) stdin.end();

    if (STATION_CONFIG.streamMode === 'youtube') {
        // cleanly shut down our YouTube FFmpegs
        const { stopYouTubeStreamer } = require('./streamer');
        stopYouTubeStreamer();
    }

    runningProcesses.forEach(p => { if (!p.killed) p.kill('SIGINT'); });

    setTimeout(() => process.exit(0), 200);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function setupKeyListener() {
    if (!process.stdin.isTTY) return;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', chunk => {
        const code = chunk[0];
        if (code === 0x18) {                // Ctrl-X
            console.log('⏭️ Ctrl-X pressed; will stop after next music track.');
            requestStop();
        }
        if (code === 0x03) {                // Ctrl-C
            cleanup();
        }
    });
}

function cleanTempDirectory(rootDir) {
    console.log(`🧹 Cleaning up all temporary files in: ${rootDir}`);
    fs.rmSync(rootDir, { recursive: true, force: true });
    console.log(`✅ Temp directory cleaned: ${rootDir}`);
}


(async () => {
    console.log(`🪳 Debug mode is ${STATION_CONFIG.debug ? 'ON' : 'OFF'}`);
    cleanTempDirectory(TEMP_ROOT);
    createDirectories();
    initPromptWatcher();
    setupKeyListener();

    tracksManager.cleanupSegways();

    if (STATION_CONFIG.streamMode === 'youtube') {
        startYouTubeStreamer();
    }

    await playbackLoop();
    cleanup();
})();
