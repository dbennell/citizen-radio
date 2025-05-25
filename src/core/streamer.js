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
let audioBufferProc;
let isRecovering = false;

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
 * @returns {Promise} A promise that resolves when the YouTube streamer has been started
 */
function startYouTubeStreamer() {
  return new Promise((resolve, reject) => {
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

      // Create a symbolic link to the overlay image
      try {
          // Remove existing symlink if it exists
          if (fs.existsSync("/tmp/current_overlay.png")) {
              fs.unlinkSync("/tmp/current_overlay.png");
          }
          // Create a new symlink
          fs.symlinkSync("/tmp/overlay.png", "/tmp/current_overlay.png");
          console.log("✅ Created symbolic link to overlay image");
      } catch (err) {
          console.warn("⚠️ Could not create symbolic link to overlay:", err);
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
      // Start the audio buffer process with improved buffer settings
      audioBufferProc = spawnTrackedProcess(
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
          "-thread_queue_size", "8192",  // Increased thread queue size
          "-i",
          "pipe:0",
          "-c:a",
          "pcm_s16le",
          "-f",
          "s16le",
          "-bufsize", "16384k",  // Increased buffer size
          fifoPath,
        ],
        { stdio: ["pipe", "inherit", "inherit"] },
      );

      audioBufferProc.on("close", (code) => {
        console.warn(`Audio buffer process exited unexpectedly with code: ${code}`);

        // Don't attempt recovery if we're already in the process of recovering
        // or if we're intentionally shutting down
        if (!isRecovering && ffmpegStdin) {
          console.log("🔄 Attempting to recover audio buffer process...");

          // Add a small delay before recovery to allow resources to be released
          setTimeout(() => {
            recoverStreamingPipeline()
              .then(() => {
                console.log("✅ Audio buffer process recovery successful");
              })
              .catch(err => {
                console.error("❌ Audio buffer process recovery failed:", err.message);
              });
          }, 2000);
        }
      });

      audioBufferProc.on("error", (err) => {
        console.error("🚨 Error in audio buffer process:", err);

        // Don't attempt recovery if we're already in the process of recovering
        // or if we're intentionally shutting down
        if (!isRecovering && ffmpegStdin) {
          console.log("🔄 Attempting to recover from audio buffer error...");

          // Add a small delay before recovery to allow resources to be released
          setTimeout(() => {
            recoverStreamingPipeline()
              .then(() => {
                console.log("✅ Audio buffer error recovery successful");
              })
              .catch(err => {
                console.error("❌ Audio buffer error recovery failed:", err.message);
              });
          }, 2000);
        }
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
                "-i", "/tmp/current_overlay.png",  // Use symbolic link to allow image updates

                // ───────── Buffering ─────────
                "-thread_queue_size", "8192", // bigger buffer on next input

                // ───────── Audio ─────────
                "-re",
                "-f", "s16le",
                "-ar", "44100",
                "-ac", "2",
                "-thread_queue_size", "8192", // Increased thread queue size for audio
                "-i", fifoPath,

                // ───────── Encoders & Filters ─────────
                "-vf", "scale=1280:720,format=yuv420p",
                "-r", "30",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-tune", "zerolatency",
                "-g", "60",

                // bump your bitrates into YouTube's sweet spot
                "-b:v", "4000k",
                "-maxrate", "4000k",
                "-bufsize", "16384k",        // Increased buffer size

                // Explicitly map video and audio streams
                "-map", "0:v",
                "-map", "1:a",

                "-c:a", "aac",
                "-b:a", "192k",
                "-ar", "44100",
                "-ac", "2",

                // Ensure audio is included
                "-shortest",

                // Avoid issues with pipe closing
                "-max_interleave_delta", "0", // Don't delay packets for interleaving
                "-fflags", "+nobuffer",       // Reduce buffering
                "-flags", "+low_delay",       // Low delay mode

                // ───────── Output ─────────
                "-f", "flv",
                "-flvflags", "no_duration_filesize", // Prevent header update errors
                "-live_start_index", "0",            // Start streaming immediately
                "-reconnect", "1",                   // Enable reconnection
                "-reconnect_streamed", "1",          // Reconnect if the stream fails
                "-reconnect_delay_max", "5",         // Maximum reconnection delay in seconds
                `${rtmpUrl}/${streamKey}`,
            ],
            { stdio: ["ignore", "inherit", "inherit"] },
        );



        youtubeStreamer.on("close", (code) => {
        console.warn(`YouTube streamer exited with code: ${code}`);

        // Don't attempt recovery if we're already in the process of recovering
        // or if we're intentionally shutting down
        if (!isRecovering && ffmpegStdin) {
          console.log("🔄 Attempting to recover from YouTube streamer exit...");

          // Add a small delay before recovery to allow resources to be released
          setTimeout(() => {
            recoverStreamingPipeline()
              .then(() => {
                console.log("✅ YouTube streamer recovery successful");
              })
              .catch(err => {
                console.error("❌ YouTube streamer recovery failed:", err.message);
              });
          }, 2000);
        }
      });

      youtubeStreamer.on("error", (err) => {
        console.error("🚨 Error in YouTube streamer process:", err);

        // Don't attempt recovery if we're already in the process of recovering
        // or if we're intentionally shutting down
        if (!isRecovering && ffmpegStdin) {
          console.log("🔄 Attempting to recover from YouTube streamer error...");

          // Add a small delay before recovery to allow resources to be released
          setTimeout(() => {
            recoverStreamingPipeline()
              .then(() => {
                console.log("✅ YouTube streamer error recovery successful");
              })
              .catch(err => {
                console.error("❌ YouTube streamer error recovery failed:", err.message);
              });
          }, 2000);
        }
      });

      // Assign variables for stream output and control
      ffmpegStdin = audioBufferProc.stdin;
      youtubeProc = youtubeStreamer;

      if (!ffmpegStdin) {
        throw new Error(
          "❌ ffmpegStdin is not available after initializing the audio buffer.",
        );
      }

      console.log("🎥 YouTube streaming pipeline started successfully.");

      // Give a short delay to ensure everything is properly initialized
      setTimeout(() => {
        if (ffmpegStdin && !ffmpegStdin.destroyed) {
          resolve();
        } else {
          reject(new Error("ffmpegStdin is not available or is destroyed after initialization"));
        }
      }, 1000);
    } catch (error) {
      console.error("🚨 Error initializing YouTube streamer:", error);
      reject(error);
    }
  });
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
async function streamFile(file) {
  // Check if ffmpegStdin is available
  if (!ffmpegStdin) {
    console.warn(`❌ No ffmpegStdin available; attempting recovery before streaming: ${file}`);
    try {
      await recoverStreamingPipeline();

      // Check if recovery was successful
      if (!ffmpegStdin) {
        console.error(`❌ Recovery failed, still no ffmpegStdin available; cannot stream file: ${file}`);
        throw new Error("Failed to recover streaming pipeline");
      }

      // Try again after recovery
      return streamFile(file);
    } catch (err) {
      console.error(`❌ Recovery failed: ${err.message}`);
      throw new Error(`Cannot stream file due to recovery failure: ${err.message}`);
    }
  }

  // Check if ffmpegStdin is destroyed (safely check the property)
  if (ffmpegStdin && ffmpegStdin.destroyed) {
    console.warn(`⚠️ FFmpeg stdin is destroyed, attempting recovery before streaming: ${file}`);
    try {
      await recoverStreamingPipeline();

      // Check if recovery was successful
      if (!ffmpegStdin || ffmpegStdin.destroyed) {
        console.error(`❌ Recovery failed, FFmpeg stdin is still destroyed; cannot stream file: ${file}`);
        throw new Error("Failed to recover FFmpeg stdin");
      }

      // Try again after recovery
      return streamFile(file);
    } catch (err) {
      console.error(`❌ Recovery failed: ${err.message}`);
      throw new Error(`Cannot stream file due to recovery failure: ${err.message}`);
    }
  }

  // Check if the FIFO pipe still exists
  const fifoPath = "/tmp/audio_buffer.fifo";
  if (!fs.existsSync(fifoPath)) {
    console.warn(`⚠️ FIFO pipe not found, attempting recovery before streaming: ${file}`);
    try {
      await recoverStreamingPipeline();

      // Check if recovery was successful
      if (!fs.existsSync(fifoPath)) {
        console.error(`❌ Recovery failed, FIFO pipe still not found; cannot stream file: ${file}`);
        throw new Error("Failed to recreate FIFO pipe");
      }

      // Try again after recovery
      return streamFile(file);
    } catch (err) {
      console.error(`❌ Recovery failed: ${err.message}`);
      throw new Error(`Cannot stream file due to recovery failure: ${err.message}`);
    }
  }

  console.log(`🎧 Streaming file: ${file}`);

  // TODO: set the loglevel based on if we are in debug or not
  return new Promise((resolve, reject) => {
    let streamEnded = false;
    let pipeStream = null;

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
        "-bufsize", "8192k",  // Match buffer size with other processes
        "-thread_queue_size", "4096",  // Increase thread queue size
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );

    // Function to handle cleanup
    const cleanupAndReject = (error) => {
      if (streamEnded) return;
      streamEnded = true;

      console.error(`🚨 Stream error: ${error.message}`);

      // Clean up the FFmpeg process
      if (ff && !ff.killed) {
        try {
          ff.kill('SIGTERM');
        } catch (killErr) {
          console.error("Failed to kill FFmpeg process:", killErr);
        }
      }

      // Wait a moment for resources to be released
      setTimeout(() => {
        // Check if we need to recover the pipeline
        if (error.message.includes("Broken pipe") || 
            error.message.includes("EPIPE") || 
            error.message.includes("write EPIPE") ||
            error.message.includes("pipe error") ||
            error.message.includes("Error writing trailer") ||
            error.message.includes("Error closing file")) {
          console.log("🔄 Pipe error detected, attempting to recover streaming pipeline...");

          // Set ffmpegStdin to null to prevent further writes during recovery
          ffmpegStdin = null;

          recoverStreamingPipeline()
            .then(() => {
              console.log("✅ Pipeline recovered after pipe error");
              // Resolve with a special error that indicates recovery was attempted
              reject(new Error("Stream error recovered, but current file playback was interrupted"));
            })
            .catch(recoverErr => {
              console.error("❌ Recovery failed:", recoverErr);
              reject(error);
            });
        } else {
          reject(error);
        }
      }, 500); // Increased timeout to give more time for resources to be released
    };

    // Set up error handlers first
    ff.once("error", (err) => {
      cleanupAndReject(new Error(`FFmpeg process error: ${err.message}`));
    });

    ff.once("close", (code) => {
      if (!streamEnded) {
        if (code === 0) {
          streamEnded = true;
          resolve();
        } else {
          cleanupAndReject(new Error(`FFmpeg streaming error: exit code ${code}`));
        }
      }
    });

    // Now set up the pipe after error handlers are in place
    try {
      // Check if ffmpegStdin is still available
      if (!ffmpegStdin || ffmpegStdin.destroyed) {
        throw new Error("FFmpeg stdin is no longer available");
      }

      // Handle pipe errors gracefully
      pipeStream = ff.stdout.pipe(ffmpegStdin, { end: false });

      pipeStream.on('error', (err) => {
        cleanupAndReject(new Error(`Pipe stream error: ${err.message}`));
      });

      // Add a timeout to detect stalled pipes
      let pipeTimeout;
      let lastDataTime = Date.now();

      const resetPipeTimeout = () => {
        if (pipeTimeout) clearTimeout(pipeTimeout);
        pipeTimeout = setTimeout(() => {
          const timeSinceLastData = Date.now() - lastDataTime;
          if (!streamEnded && timeSinceLastData >= 60000) {
            cleanupAndReject(new Error("Pipe stream timeout - possible stall"));
          } else if (!streamEnded) {
            // If we still have data flowing but not finished, reset the timeout
            resetPipeTimeout();
          }
        }, 60000); // 60 seconds timeout
      };

      // Start the initial timeout
      resetPipeTimeout();

      // Monitor data flow from the FFmpeg process's stdout
      ff.stdout.on('data', () => {
        lastDataTime = Date.now();
      });

      // Clear the timeout when the stream ends normally
      ff.once('close', () => {
        if (pipeTimeout) clearTimeout(pipeTimeout);
      });

    } catch (err) {
      // If we fail to create the pipe, attempt recovery
      console.error(`Failed to create pipe: ${err.message}`);

      // Clean up the FFmpeg process
      if (ff && !ff.killed) {
        try {
          ff.kill('SIGTERM');
        } catch (killErr) {
          console.error("Failed to kill FFmpeg process:", killErr);
        }
      }

      // Attempt to recover the streaming pipeline
      console.log("🔄 Pipe creation failed, attempting to recover streaming pipeline...");

      // Set ffmpegStdin to null to prevent further writes during recovery
      ffmpegStdin = null;

      recoverStreamingPipeline()
        .then(() => {
          cleanupAndReject(new Error(`Failed to create pipe, recovery attempted: ${err.message}`));
        })
        .catch(recoverErr => {
          console.error("❌ Recovery failed:", recoverErr);
          cleanupAndReject(new Error(`Failed to create pipe and recovery failed: ${err.message}`));
        });
    }
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
          console.error('Failed to kill YouTube streamer process:', err.message);
        }
        youtubeProc = null;
      }

      if (ffmpegStdin) {
        console.log("🛑 Closing FFmpeg stdin...");
        try {
          ffmpegStdin.end();
        } catch (err) {
          console.error('Failed to close FFmpeg stdin:', err.message);
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
/**
 * Recover the streaming pipeline after an unexpected failure
 * @returns {Promise} A promise that resolves when recovery is complete
 */
async function recoverStreamingPipeline() {
  if (isRecovering) return Promise.resolve();

  isRecovering = true;
  console.log("🔄 Starting streaming pipeline recovery...");

  // Reset stream state variables
  streamEnded = false;

  try {
    // Clean up existing processes
    if (ffmpegStdin) {
      try {
        ffmpegStdin.end();
        ffmpegStdin = null;
      } catch (err) {
        console.error("⚠️ Error closing FFmpeg stdin:", err.message);
      }
    }

    if (youtubeProc && !youtubeProc.killed) {
      try {
        youtubeProc.kill("SIGINT");
        youtubeProc = null;
      } catch (err) {
        console.error("⚠️ Error killing YouTube streamer:", err.message);
      }
    }

    if (audioBufferProc && !audioBufferProc.killed) {
      try {
        audioBufferProc.kill("SIGINT");
        audioBufferProc = null;
      } catch (err) {
        console.error("⚠️ Error killing audio buffer process:", err.message);
      }
    }

    // Wait a moment for processes to fully terminate
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Ensure the FIFO pipe is recreated
    const fifoPath = "/tmp/audio_buffer.fifo";
    try {
      // Remove the existing FIFO if it exists
      if (fs.existsSync(fifoPath)) {
        fs.unlinkSync(fifoPath);
        console.log("🧹 Removed existing FIFO:", fifoPath);
      }

      // Create a new FIFO
      execSync(`mkfifo ${fifoPath}`);
      console.log("✅ FIFO recreated successfully:", fifoPath);
    } catch (error) {
      console.error("🚨 Failed to recreate FIFO:", error);
      // Continue anyway, as startYouTubeStreamer will attempt to create it if needed
    }

    // Make sure we don't have any zombie processes
    try {
      // Check for any lingering ffmpeg processes and kill them
      execSync('pkill -f "ffmpeg.*audio_buffer.fifo" || true');
      execSync('pkill -f "ffmpeg.*overlay.png" || true');
    } catch (error) {
      // Ignore errors from pkill, as it might return non-zero if no processes are found
      console.log("⚠️ Note: pkill commands may have returned non-zero (this is normal if no processes were found)");
    }

    // Wait a moment for processes to fully terminate
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Restart the streaming pipeline and wait for it to complete
    await startYouTubeStreamer();

    // Verify that the streaming pipeline was successfully restarted
    if (!ffmpegStdin) {
      throw new Error("Failed to initialize ffmpegStdin during recovery");
    }

    console.log("✅ Streaming pipeline recovery complete");

    // Add a short delay to ensure everything is properly initialized
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("✅ Streaming pipeline recovery complete, continuing playback");
    return Promise.resolve();
  } catch (err) {
    console.error("❌ Failed to recover streaming pipeline:", err);

    // If recovery failed, try one more time with a more aggressive approach
    try {
      console.log("🔄 Attempting more aggressive recovery...");

      // Kill all ffmpeg processes
      execSync('pkill -9 -f ffmpeg || true');

      // Wait a moment for processes to fully terminate
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Recreate the FIFO
      const fifoPath = "/tmp/audio_buffer.fifo";
      if (fs.existsSync(fifoPath)) {
        fs.unlinkSync(fifoPath);
        console.log("🧹 Removed existing FIFO:", fifoPath);
      }

      execSync(`mkfifo ${fifoPath}`);
      console.log("✅ FIFO recreated successfully:", fifoPath);

      // Restart the streaming pipeline and wait for it to complete
      await startYouTubeStreamer();

      if (!ffmpegStdin) {
        throw new Error("Failed to initialize ffmpegStdin during aggressive recovery");
      }

      console.log("✅ Aggressive recovery complete");

      // Add a short delay to ensure everything is properly initialized
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log("✅ Aggressive recovery complete, continuing playback");
      return Promise.resolve();
    } catch (aggressiveErr) {
      console.error("❌ Aggressive recovery also failed:", aggressiveErr);
      // At this point, we've tried everything we can
      return Promise.reject(new Error("Failed to recover streaming pipeline after multiple attempts"));
    }
  } finally {
    isRecovering = false;
  }
}

/**
 * Update YouTube stream metadata (title, description, etc.)
 * @returns {Promise} A promise that resolves when the metadata has been updated
 */
async function updateYouTubeStreamMetadata() {
  try {
    // This is a placeholder implementation
    // In a real implementation, this would update the YouTube stream metadata
    // using the YouTube API or another method
    console.log("📝 Updating YouTube stream metadata...");
    return Promise.resolve();
  } catch (error) {
    console.error("❌ Error updating YouTube stream metadata:", error);
    return Promise.reject(error);
  }
}

module.exports = {
  getFfmpegStdin,
  startYouTubeStreamer,
  playFile,
  streamFile,
  stopYouTubeStreamer,
  getRandomCoverImage,
  recoverStreamingPipeline,
  updateYouTubeStreamMetadata
};
