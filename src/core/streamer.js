// ========================
// File: streamer.js (restored and refined)
// ========================
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { spawnTrackedProcess } = require("../utils");
const { STATION_CONFIG, READY_DIR } = require("./config");

let ffmpegStdin;
let youtubeProc;
let lastRotation;

/**
 * Expose the current ffmpeg stdin (for cleanup)
 */
function getFfmpegStdin() {
  return ffmpegStdin;
}

/**
 * Pick a random cover image from the ready/image directory
 */
function getRandomCoverImage() {
  const imgDir = READY_DIR("image");
  const files = fs
    .readdirSync(imgDir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .map((f) => path.join(imgDir, f));

  if (!files.length) {
    throw new Error(`No images found in ${imgDir}`);
  }

  return files[Math.floor(Math.random() * files.length)];
}

/**
 * Start the two-process FFmpeg chain that streams to YouTube
 */
function startYouTubeStreamer() {
  try {
    console.log(
      "🎥 Stream mode is set to YouTube. Initializing YouTube streamer...",
    );
    const cover = getRandomCoverImage();
    console.log("🖼️ Using cover image:", cover);

      // ─── seed initial overlay.png so ffmpeg will find it ───
          try {
        fs.copyFileSync(cover, "/tmp/overlay.png");
        console.log("✅ Initial overlay written to /tmp/overlay.png");
      } catch (err) {
        console.warn("⚠️ Could not seed initial overlay:", err);
      }

    const { rtmpUrl, streamKey } = STATION_CONFIG.youtube;

    if (!streamKey) {
      throw new Error(
        "❌ No YouTube stream key found. Set it in station.json or .env",
      );
    }

    const fifoPath = "/tmp/audio_buffer.fifo";

    // Ensure FIFO exists
    if (!fs.existsSync(fifoPath)) {
      console.log("🛠️ Creating FIFO file:", fifoPath);
      try {
        execSync(`mkfifo ${fifoPath}`);
        console.log("✅ FIFO created successfully:", fifoPath);
      } catch (error) {
        console.error("🚨 Failed to create FIFO:", error);
        throw new Error("Failed to create FIFO.");
      }
    } else {
      console.log("🔄 FIFO already exists:", fifoPath);
    }

    // TODO: set the loglevel based on if we are in debug or not
    // Start the audio buffer process
    const audioBuffer = spawnTrackedProcess(
      "/usr/bin/ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-y",
        "-f",
        "s16le",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-i",
        "pipe:0",
        "-c:a",
        "pcm_s16le",
        "-f",
        "s16le",
        fifoPath,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );

    audioBuffer.on("close", () => {
      console.warn("Audio buffer process exited unexpectedly.");
    });

    audioBuffer.on("error", (err) => {
      console.error("🚨 Error in audio buffer process:", err);
    });

    console.log("🎵 Audio buffer FFmpeg process started.");

      // TODO: set the loglevel based on if we are in debug or not
      const youtubeStreamer = spawnTrackedProcess(
          "/usr/bin/ffmpeg",
          [
              "-hide_banner",
              "-loglevel", "warning",

              // ───────── Video ─────────
              "-re",                      // read at realtime
              "-f", "image2",             // use image demuxer
              "-framerate", "30",         // input at 30 fps
              "-loop", "1",               // loop the single image
              "-i", "/tmp/overlay.png",

              // ───────── Buffering ─────────
              "-thread_queue_size", "1024", // bigger buffer on next input

              // ───────── Audio ─────────
              "-re",
              "-f", "s16le",
              "-ar", "44100",
              "-ac", "2",
              "-i", fifoPath,

              // ───────── Encoders & Filters ─────────
              "-vf", "scale=1280:720,format=yuv420p",
              "-r", "30",
              "-c:v", "libx264",
              "-preset", "veryfast",
              "-tune", "zerolatency",
              "-g", "60",

              // bump your bitrates into YouTube’s sweet spot
              "-b:v", "3500k",
              "-maxrate", "3500k",
              "-bufsize", "7000k",

              "-c:a", "aac",
              "-b:a", "192k",
              "-ar", "44100",
              "-ac", "2",

              // ───────── Output ─────────
              "-f", "flv",
              `${rtmpUrl}/${streamKey}`,
          ],
          { stdio: ["ignore", "inherit", "inherit"] },
      );



      youtubeStreamer.on("close", (code) => {
      console.warn(`YouTube streamer exited with code: ${code}`);
    });

    youtubeStreamer.on("error", (err) => {
      console.error("🚨 Error in YouTube streamer process:", err);
    });

    // Assign variables for stream output and control
    ffmpegStdin = audioBuffer.stdin;
    youtubeProc = youtubeStreamer;

    if (!ffmpegStdin) {
      throw new Error(
        "❌ ffmpegStdin is not available after initializing the audio buffer.",
      );
    }

    console.log("🎥 YouTube streaming pipeline started successfully.");
  } catch (error) {
    console.error("🚨 Error initializing YouTube streamer:", error);
  }

  if (!ffmpegStdin) {
    console.error(
      "❌ ffmpegStdin not set. The audio buffer process may have failed.",
    );
    throw new Error(
      "Failed to initialize ffmpegStdin for the YouTube streaming pipeline.",
    );
  }
}

/**
 * Play a local audio file (e.g., during local playback mode)
 */
// TODO: set the loglevel based on if we are in debug or not
function playFile(file) {
  console.log(`🎵 Playing local file: ${file}`);
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-i",
    file,
    "-vn",
    "-c:a",
    "pcm_s16le",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-f",
    "pulse",
    "default",
  ];

  return new Promise((resolve, reject) => {
    const ff = spawnTrackedProcess("/usr/bin/ffmpeg", args, {
      stdio: "inherit",
    });

    ff.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg playback exited with code ${code}`));
      }
    });
    ff.once("error", reject);
  });
}

/**
 * Stream an audio file into the YouTube pipeline
 */
function streamFile(file) {
  if (!ffmpegStdin) {
    console.warn(`❌ No ffmpegStdin available; cannot stream file: ${file}`);
    return Promise.resolve();
  }

  console.log(`🎧 Streaming file: ${file}`);

  // TODO: set the loglevel based on if we are in debug or not
  return new Promise((resolve, reject) => {
    let streamEnded = false;
    const ff = spawnTrackedProcess(
      "/usr/bin/ffmpeg",
      [
        "-re",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-i",
        file,
        "-f",
        "s16le",
        "-ar",
        "44100",
        "-ac",
        "2",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );

    // Handle pipe errors gracefully
    const pipeStream = ff.stdout.pipe(ffmpegStdin, { end: false });

    pipeStream.on('error', (err) => {
      if (!streamEnded) {
        streamEnded = true;
        console.error("🚨 Pipe stream error:", err.message);

        // Clean up the FFmpeg process
        if (!ff.killed) {
          try {
            ff.kill('SIGTERM');
          } catch (killErr) {
            console.error("Failed to kill FFmpeg process:", killErr);
          }
        }

        reject(new Error(`Pipe stream error: ${err.message}`));
      }
    });

    ff.once("close", (code) => {
      if (!streamEnded) {
        streamEnded = true;
        if (code === 0) {
          resolve();
        } else {
          console.error(`🚨 FFmpeg process exited with code ${code}`);
          reject(new Error(`FFmpeg streaming error: exit code ${code}`));
        }
      }
    });

    ff.once("error", (err) => {
      if (!streamEnded) {
        streamEnded = true;
        console.error("🚨 FFmpeg streaming process error:", err);
        reject(err);
      }
    });
  });
}

/**
 * Stop the YouTube streaming pipeline
 * @returns {Promise} A promise that resolves when the YouTube streamer has been stopped
 */
function stopYouTubeStreamer() {
  console.log("🛑 Stopping YouTube streamer...");

  // Track if we've started cleanup
  let cleanupStarted = false;

  // Return a promise that resolves when cleanup is complete
  return new Promise((resolve) => {
    // Create a cleanup function to avoid code duplication
    const cleanup = () => {
      if (cleanupStarted) return;
      cleanupStarted = true;

      if (youtubeProc && !youtubeProc.killed) {
        console.log(`🛑 Killing YouTube streamer process: PID ${youtubeProc.pid}`);
        try {
          youtubeProc.kill("SIGINT");
        } catch (err) {
          console.error(`Failed to kill YouTube streamer process: ${err.message}`);
        }
        youtubeProc = null;
      }

      if (ffmpegStdin) {
        console.log("🛑 Closing FFmpeg stdin...");
        try {
          ffmpegStdin.end();
        } catch (err) {
          console.error(`Failed to close FFmpeg stdin: ${err.message}`);
        }
        ffmpegStdin = null;
      }

      // Wait a short time for processes to begin terminating
      setTimeout(() => {
        console.log("✅ YouTube streamer shutdown complete");
        resolve();
      }, 500);
    };

    // Execute cleanup
    cleanup();
  });
}
module.exports = {
  getFfmpegStdin,
  startYouTubeStreamer,
  playFile,
  streamFile,
  stopYouTubeStreamer,
    getRandomCoverImage
};
