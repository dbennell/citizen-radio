// ========================
// File: config.js
// ========================
const fs = require("fs");
const path = require("path");

function loadStationConfig() {
    try {
        const configPath = path.join(__dirname, "station.json");
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        console.log(`Loaded station configuration: ${config.stationName}`);
        return config;
    } catch (error) {
        console.error("Failed to load station configuration:", error.message);
        process.exit(1);
    }
}

const BASE_DIR = __dirname;
const PROMPT_DIRS = {
    ad:      path.join(BASE_DIR, 'prompts/ads'),
    intro:   path.join(BASE_DIR, 'prompts/intros'),
    dj:      path.join(BASE_DIR, 'prompts/dj'),
    music:   path.join(BASE_DIR, 'prompts/music'),
    podcast: path.join(BASE_DIR, 'prompts/podcast'),
    image:   path.join(BASE_DIR, 'prompts/images'),
};
const READY_DIR = type => path.join(BASE_DIR, `ready/${type}`);
const PLAYED_DIR = type => path.join(BASE_DIR, `played/${type}`);
const STATION_CONFIG = loadStationConfig();

// Override YouTube stream key with environment variable if available
if (process.env.YOUTUBE_STREAM_KEY) {
    if (!STATION_CONFIG.youtube) {
        STATION_CONFIG.youtube = {
            rtmpUrl: "rtmp://a.rtmp.youtube.com/live2"
        };
    }
    STATION_CONFIG.youtube.streamKey = process.env.YOUTUBE_STREAM_KEY;
}


// --- new CLI‐override logic for uptime ----------------
const args = process.argv.slice(2);
let cliUptimeHours = null;
let cliUptimeMode = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === "--uptime" && args[i + 1] !== undefined) {
        const v = parseFloat(args[i + 1]);
        if (!isNaN(v) && v >= 0) cliUptimeHours = v;
    }
    if (args[i] === "--uptime-mode" && args[i + 1] !== undefined) {
        const m = args[i + 1];
        if (m === "cycle" || m === "track") cliUptimeMode = m;
    }
}

if (cliUptimeHours !== null) {
    STATION_CONFIG.uptimeHours = cliUptimeHours;
} else if (STATION_CONFIG.uptimeHours === undefined) {
    STATION_CONFIG.uptimeHours = null;
}

if (cliUptimeMode) {
    STATION_CONFIG.uptimeMode = cliUptimeMode;
} else if (STATION_CONFIG.uptimeMode === undefined) {
    STATION_CONFIG.uptimeMode = "cycle";
}
// -------------------------------------------------------

module.exports = { PROMPT_DIRS, READY_DIR, PLAYED_DIR, STATION_CONFIG };