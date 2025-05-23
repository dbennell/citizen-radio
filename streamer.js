// ========================
// File: streamer.js
// ========================
const fs    = require('fs');
const path  = require('path');
const { spawnTrackedProcess, extractMetadata } = require('./utils');
const { STATION_CONFIG, READY_DIR }           = require('./config');

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
 * Pick a random cover image from ready/image
 */
function getRandomCoverImage() {
    const imgDir = READY_DIR('image');
    const files = fs.readdirSync(imgDir)
        .filter(f => /\.(png|jpe?g)$/i.test(f))
        .map(f => path.join(imgDir, f));

    if (!files.length) {
        throw new Error(`No images found in ${imgDir}`);
    }

    return files[Math.floor(Math.random() * files.length)];
}

/**
 * Start the two‐process FFmpeg chain that streams to YouTube
 */
function startYouTubeStreamer() {
    const cover = getRandomCoverImage();
    console.log('▶️ Starting YouTube FFmpeg with cover →', cover);

    const { rtmpUrl, streamKey } = STATION_CONFIG.youtube;
    const fifoPath = '/tmp/audio_buffer.fifo';

    // ensure fifo exists
    if (!fs.existsSync(fifoPath)) {
        require('child_process').execSync(`mkfifo ${fifoPath}`);
    }

    // 1) audio buffer
    const audioBuffer = spawnTrackedProcess(
        '/usr/bin/ffmpeg',
        [
            '-hide_banner','-loglevel','warning',
            '-y',
            '-f','s16le','-ar','44100','-ac','2','-i','pipe:0',
            '-c:a','pcm_s16le','-f','s16le', fifoPath
        ],
        { stdio: ['pipe','inherit','inherit'] }
    );

    // 2) streamer
    const youtubeStreamer = spawnTrackedProcess(
        '/usr/bin/ffmpeg',
        [
            '-hide_banner','-loglevel','warning',
            // throttle the video feed in real-time
            '-re','-f','lavfi','-i','color=c=black:s=1280x720:r=5,format=yuv420p',
            '-loop','1','-framerate','5','-i', cover,
            // null-audio to keep FFmpeg happy when no music is playing
            '-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100',
            // throttle the raw audio FIFO in real-time
            '-re','-f','s16le','-ar','44100','-ac','2','-i', fifoPath,
            '-filter_complex',
            '[0:v][1:v]overlay=x=(W-w)/2:y=(H-h)/2,format=yuv420p[v];' +
            '[2:a][3:a]amix=inputs=2:duration=first:dropout_transition=2[aout]',
            '-map','[v]','-map','[aout]',
            '-c:v','libx264','-preset','veryfast','-tune','zerolatency','-g','60',
            '-pix_fmt','yuv420p','-b:v','2500k','-maxrate','2500k','-bufsize','5000k',
            '-c:a','aac','-b:a','192k','-ar','44100','-ac','2',
            // drop wallclock timestamps and let FFmpeg sync inputs by their own PTS
            '-r','5','-fps_mode','cfr',
            '-max_muxing_queue_size','9999',
            '-f','flv', `${rtmpUrl}/${streamKey}`
        ],
        { stdio: ['ignore','inherit','inherit'] }
    );

    // wire up
    ffmpegStdin = audioBuffer.stdin;
    youtubeProc = youtubeStreamer;
    lastRotation = Date.now();

    // errors & cleanup
    ffmpegStdin.on('error', e => {
        if (!['EPIPE','ECONNRESET'].includes(e.code)) console.error('ffmpegStdin error:', e);
    });
    youtubeStreamer.on('close', (code, sig) => {
        console.warn(`YouTube FFmpeg exited (code=${code}, sig=${sig})`);
    });
    audioBuffer.on('close', () => {
        if (!youtubeStreamer.killed) youtubeStreamer.kill();
    });
}

/**
 * Play a local file to the pulse sink (or speakers)
 */
function playFile(file) {
    const args = [
        '-hide_banner','-loglevel','warning',
        '-i', file, '-vn',
        '-c:a','pcm_s16le','-ar','44100','-ac','2',
        '-f','pulse','default'
    ];
    return new Promise((resolve, reject) => {
        const ff = spawnTrackedProcess('/usr/bin/ffmpeg', args, { stdio: 'inherit' });
        ff.once('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
        ff.once('error', reject);
    });
}

/**
 * Stream a file into the YouTube pipeline
 */
function streamFile(file) {
    // if no pipe, skip
    if (!ffmpegStdin) {
        console.warn('No ffmpegStdin; skipping streamFile');
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const proc = spawnTrackedProcess(
            '/usr/bin/ffmpeg',
            ['-re','-hide_banner','-loglevel','warning','-i',file,'-f','s16le','-ar','44100','-ac','2','pipe:1'],
            { stdio: ['ignore','pipe','inherit'] }
        );

        proc.stdout.pipe(ffmpegStdin, { end: false });

        proc.once('close', code => code === 0 ? resolve() : resolve());
        proc.once('error', reject);
    });
}

function stopYouTubeStreamer() {
    // kill the streamer
    if (youtubeProc && !youtubeProc.killed) {
        youtubeProc.kill('SIGINT');
        youtubeProc = null;
    }
    // close the audio FIFO
    if (ffmpegStdin) {
        ffmpegStdin.end();
        ffmpegStdin = null;
    }
}

module.exports = {
    getFfmpegStdin,
    startYouTubeStreamer,
    playFile,
    streamFile,
    stopYouTubeStreamer
};