// ========================
// File: config.js
// ========================
const fs = require("fs");
const path = require("path");

function loadStationConfig() {
    // Check if we're in a test environment before trying to load the config
    const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                             process.env.JEST_WORKER_ID !== undefined || 
                             process.env.npm_lifecycle_script?.includes('jest');

    // In test environment, return a default test configuration
    if (isTestEnvironment) {
        console.log("Using default test configuration");
        return {
            stationName: "Test Station",
            ratingSystem: {
                enabled: true,
                streamDelay: 60,
                defaultRating: 3,
                minTickets: 1,
                maxTickets: 5
            },
            fileIO: {
                chat: {
                    bufferSize: 1024,
                    flushInterval: 1000,
                    rotationSize: 1024 * 1024,
                    maxArchives: 5
                },
                ratings: {
                    bufferSize: 1024,
                    flushInterval: 1000
                }
            },
            youtube: {
                apiAvailable: false
            }
        };
    }
    else {
        // For non-test environments, try to load the real config
        try {
            const configPath = path.join(__dirname, "../../config/default.json");
            const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            console.log(`⚙️ Loaded station configuration: ${config.stationName}`);
            return config;
        } catch (error) {
            console.error("🚫 Failed to load station configuration:", error.message);
            process.exit(1);
        }
    }
}

const PROJECT_ROOT = path.join(__dirname, '../..');
const PROMPT_DIRS = {
    ad:      path.join(PROJECT_ROOT, 'assets/prompts/ads'),
    intro:   path.join(PROJECT_ROOT, 'assets/prompts/intros'),
    dj:      path.join(PROJECT_ROOT, 'assets/prompts/dj'),
    music:   path.join(PROJECT_ROOT, 'assets/prompts/music'),
    podcast: path.join(PROJECT_ROOT, 'assets/prompts/podcast'),
    image:   path.join(PROJECT_ROOT, 'assets/prompts/images'),
};
const READY_DIR = type => path.join(PROJECT_ROOT, `data/ready/${type}`);

// TODO: Rename to ARCHIVE_DIR
const PLAYED_DIR = type => path.join(PROJECT_ROOT, `data/archive/${type}`);
const STATION_CONFIG = loadStationConfig();


// Handle YouTube API settings from environment
if (process.env.YOUTUBE_API_KEY && process.env.YOUTUBE_VIDEO_ID) {
    if (!STATION_CONFIG.youtube) {
        STATION_CONFIG.youtube = {};
    }
    // We don't add these to STATION_CONFIG to avoid accidentally committing them
    // But we do indicate they're available with a flag
    STATION_CONFIG.youtube.apiAvailable = true;
}
// Override YouTube stream key with environment variable if available
if (process.env.YOUTUBE_STREAM_KEY) {
    if (!STATION_CONFIG.youtube) {
        STATION_CONFIG.youtube = {
            rtmpUrl: "rtmp://a.rtmp.youtube.com/live2"
        };
    }
    STATION_CONFIG.youtube.streamKey = process.env.YOUTUBE_STREAM_KEY;
}
// Add this near the YouTube stream key handling section
if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_ACCESS_TOKEN) {
    if (!STATION_CONFIG.youtube) {
        STATION_CONFIG.youtube = {
            rtmpUrl: "rtmp://a.rtmp.youtube.com/live2"
        };
    }
    STATION_CONFIG.youtube.oauthAvailable = true;
}

// Handle CLI arguments
const args = process.argv.slice(2);
let cliVideoId = null;
let cliUptimeHours = null;
let cliUptimeMode = null;
let cliStreamMode = null;


// Check if the first argument is a video ID (not starting with --)
if (args.length > 0 && !args[0].startsWith('--')) {
    cliVideoId = args[0];
    // Remove the first argument so it doesn't interfere with other argument parsing
    args.shift();
}

for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--video" || args[i] === "-video") && args[i + 1]) {
        cliVideoId = args[i + 1];
    }
    if (args[i] === "--uptime" && args[i + 1] !== undefined) {
        const v = parseFloat(args[i + 1]);
        if (!isNaN(v) && v >= 0) cliUptimeHours = v;
    }
    if (args[i] === "--uptime-mode" && args[i + 1] !== undefined) {
        const m = args[i + 1];
        if (m === "cycle" || m === "track") cliUptimeMode = m;
    }
    if (args[i] === "--local") {
        cliStreamMode = "local";
    }
}

// Resolve videoId using CLI, .env, or station.json
// We'll set it to null initially if not provided, and fetch it later if needed
STATION_CONFIG.youtube = {
    ...(STATION_CONFIG.youtube || {}),
    videoId: cliVideoId || process.env.YOUTUBE_VIDEO_ID || STATION_CONFIG.youtube?.videoId || null,
    // Flag to indicate if we should try to fetch the video ID if not provided
    shouldFetchVideoId: !cliVideoId && !process.env.YOUTUBE_VIDEO_ID && !STATION_CONFIG.youtube?.videoId
};

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

// Add stream mode handling after the uptime mode section
// CLI parameter takes precedence over config file
if (cliStreamMode) {
    console.log(`🔄 Stream mode set to '${cliStreamMode}' via CLI parameter`);
    STATION_CONFIG.streamMode = cliStreamMode;
} else if (STATION_CONFIG.streamMode) {
    // Use the value from config file if available
    console.log(`🔄 Using configured stream mode: '${STATION_CONFIG.streamMode}'`);
} else {
    // Default to 'youtube' if not specified anywhere
    STATION_CONFIG.streamMode = 'youtube';
    console.log(`🔄 Using default stream mode: 'youtube'`);
}


// -------------------------------------------------------

module.exports = { PROMPT_DIRS, READY_DIR, PLAYED_DIR, STATION_CONFIG };
