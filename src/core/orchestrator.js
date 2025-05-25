const fs = require('fs');
const path = require('path');
const { pickNextTrack } = require('../managers/trackManager');
const { getLastPlays, appendPlayLog } = require('../managers/playLogManager');
const { generateSegway, prepareSegway } = require('../processors/promptProcessor');
const { playFile, streamFile, getRandomCoverImage } = require('./streamer');
const { STATION_CONFIG, READY_DIR } = require('./config');
const chalk = require('chalk').default;
const ratingManager = require('../managers/ratingsManager');
const { fetchLiveVideoId, extractMetadata, fetchLastChatComments } = require('../utils');
const { createCanvas, loadImage } = require('canvas'); // npm install canvas

let shouldStop = false;
let stopAfterNextMusic = false;
let persistentVideoId = STATION_CONFIG.youtube?.videoId || null;

/**
 * Renders a live overlay PNG with cover art, track info, rating, and chat comments
 */
async function updateOverlay(trackPath, videoId) {
    const meta = extractMetadata(trackPath);
    const { title = 'Unknown Title', artist = 'Unknown Artist', rating = 0, picture } = meta;

    // Pick cover buffer
    const coverBuffer = (picture?.data && picture.data.length)
        ? picture.data
        : fs.readFileSync(getRandomCoverImage());

    // Grab chat comments…
    let comments = [];
    try { comments = await fetchLastChatComments(videoId, 10); } catch {}

    // Canvas setup
    const W = 1280, H = 720;
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // 1) Draw cover art full-screen, cropped but keeping ratio
    const img = await loadImage(coverBuffer);
    const iw = img.width, ih = img.height;
    // scale so it *covers* the entire canvas
    const scale = Math.max(W/iw, H/ih);
    const nw = iw * scale, nh = ih * scale;
    const dx = (W - nw) / 2, dy = (H - nh) / 2;
    ctx.drawImage(img, dx, dy, nw, nh);

    // 2) Darken bottom band for text
    const bandH = 140;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, H - bandH, W, bandH);

    // 3) Draw track info
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(title, 40, H - bandH + 50);
    ctx.font = '28px sans-serif';
    ctx.fillText(artist, 40, H - bandH + 90);
    ctx.fillText(`★ ${rating}`, 40, H - bandH + 130);

    const padding = 20;
    const lineHeight = 24;
    const boxWidth = 400;
    const boxHeight = padding * 2 + comments.length * lineHeight;
    const boxX = W - boxWidth - padding;
    const boxY = padding;

    // background box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // draw each message
    ctx.fillStyle = '#FFF';
    ctx.font = '20px monospace';
    ctx.textAlign = 'left';
    comments.forEach((msg, i) => {
        const y = boxY + padding + (i + 1) * lineHeight - (lineHeight / 4);
        ctx.fillText(msg, boxX + padding, y);
    });

    // // 4) Draw last 10 comments above the band
    // ctx.font = '20px monospace';
    // comments.forEach((c,i) => {
    //     const y = H - bandH - 20 - (comments.length - 1 - i)*24;
    //     ctx.fillText(`• ${c}`, 40, y);
    // });


    // 5) Write out the PNG
    return new Promise((resolve, reject) => {
        // Write to a temporary file first
        const tempFile = '/tmp/overlay_temp.png';
        const out = fs.createWriteStream(tempFile);

        canvas.createPNGStream().pipe(out);

        out.on('finish', () => {
            try {
                // Atomically replace the overlay file
                fs.renameSync(tempFile, '/tmp/overlay.png');

                // Update the symbolic link if it exists
                if (fs.existsSync('/tmp/current_overlay.png')) {
                    // The symbolic link should already be pointing to /tmp/overlay.png
                    // No need to update it, just ensure the target file is updated
                    console.log('🖼️ Updated overlay image');
                } else {
                    // If the symlink doesn't exist for some reason, create it
                    fs.symlinkSync('/tmp/overlay.png', '/tmp/current_overlay.png');
                    console.log('🖼️ Created new symbolic link to overlay image');
                }

                resolve();
            } catch (err) {
                console.error('❌ Error updating overlay:', err);
                reject(err);
            }
        });

        out.on('error', (err) => {
            console.error('❌ Error writing overlay:', err);
            reject(err);
        });
    });
}


/**
 * Fetches or returns a cached YouTube Live videoId for chat polling
 */
async function getPersistentVideoId() {
    if (persistentVideoId) return persistentVideoId;
    try {
        console.log('🔍 VideoId not set, fetching dynamically...');
        const fetchedId = await fetchLiveVideoId();
        if (fetchedId) {
            console.log(`✅ Fetched videoId: ${fetchedId}`);
            persistentVideoId = fetchedId;
            return persistentVideoId;
        }
    } catch (err) {
        console.error('🚨 Error fetching videoId:', err.message);
    }
    console.warn('⚠ VideoId missing: live chat disabled');
    return null;
}

/**
 * Main playback loop
 */
async function playbackLoop() {
    const pattern = STATION_CONFIG.schedule.defaultPattern;
    const { historySize = 16, weights = {} } = STATION_CONFIG.trackHistory || {};
    const includePodcasts = !!STATION_CONFIG.djOptions?.includePodcasts;

    const uptimeMs = typeof STATION_CONFIG.uptimeHours === 'number'
        ? STATION_CONFIG.uptimeHours * 3600 * 1000
        : null;
    const startTime = Date.now();

    let nextEntry = null;
    const vid = await getPersistentVideoId();
    if (vid) console.log('📹 Live commenting enabled:', vid);

    console.log(chalk.yellow(`▶️ Starting playback: ${pattern.join(', ')}`));
    console.log(chalk.magenta(`⏱️ Uptime: ${STATION_CONFIG.uptimeHours || '∞'}h, mode: ${STATION_CONFIG.uptimeMode || 'none'}`));

    while (!shouldStop) {
        // Uptime enforcement
        if (uptimeMs !== null) {
            const elapsed = Date.now() - startTime;
            if (STATION_CONFIG.uptimeMode === 'cycle' && elapsed >= uptimeMs) {
                console.log('🛑 Uptime reached: ending cycle');
                break;
            }
            if (STATION_CONFIG.uptimeMode === 'track' && elapsed >= uptimeMs) {
                console.log('🛑 Uptime reached: stopping after next track');
                stopAfterNextMusic = true;
            }
        }

        console.log(chalk.green(`🎧 New cycle at ${new Date().toLocaleTimeString()}`));

        for (let i = 0; i < pattern.length && !shouldStop; i++) {
            const type = pattern[i];

            // -- Segway --
            if (type === 'segway') {
                const nextType = pattern[i + 1];
                if (nextType && nextType !== 'segway' && !nextEntry) {
                    nextEntry = await pickNextTrack(nextType);
                }
                if (!nextEntry?.meta?.title) continue;

                const recent = getLastPlays(historySize);
                let ref = recent.slice().reverse().find(e => e.type === 'music' && (weights[e.type] || 0) > 0 && e.meta.title !== 'Placeholder Track');
                if (!ref) ref = recent.find(e => (weights[e.type] || 0) > 0 && e.meta.title !== 'Placeholder Track');

                const prevSegMeta = ref ? { ...ref.meta, type: ref.type } : { type: 'start', title: '' };
                const nextSegMeta = { ...nextEntry.meta, type: nextType };

                try {
                    const text = await generateSegway(prevSegMeta, nextSegMeta);
                    if (!text.trim()) continue;
                    const segFile = await prepareSegway(text, prevSegMeta, nextSegMeta, `${prevSegMeta.type}_to_${nextSegMeta.type}`);
                    if (!segFile) continue;

                    try {
                        if (STATION_CONFIG.streamMode === 'youtube') {
                            await streamFile(segFile);
                        } else {
                            await playFile(segFile);
                        }
                        // Only delete the file after successful playback
                        if (fs.existsSync(segFile)) {
                            fs.unlinkSync(segFile);
                        }
                    } catch (playErr) {
                        console.error('Error playing segway:', playErr);
                        // Don't delete the file if playback failed
                    }
                } catch (err) {
                    console.error('Segway generation error:', err);
                }
                continue;
            }

            // -- Track --
            let entry;
            if (type === 'dj' && includePodcasts) {
                entry = await pickNextTrackWithPodcasts();
            } else if (nextEntry) {
                entry = nextEntry;
                nextEntry = null;
            } else {
                entry = await pickNextTrack(type);
            }
            if (!entry) continue;

            try {
                const trackRel = path.relative(READY_DIR(''), entry.filepath);
                if (type === 'music' && STATION_CONFIG.ratingSystem?.enabled) {
                    ratingManager.setCurrentlyPlaying({ trackRel, title: entry.meta.title, artist: entry.meta.artist, type });
                    const windowStart = ratingManager.openCommentWindow();
                    console.log(`📊 Rating: tracking "${entry.meta.title}" from ${windowStart}`);
                }

                try {
                    if (STATION_CONFIG.streamMode === 'youtube') {
                        await updateOverlay(entry.filepath, vid);
                        await streamFile(entry.filepath);
                    } else {
                        await playFile(entry.filepath);
                    }

                    // Only log the play if streaming was successful
                    appendPlayLog(trackRel, type, entry.meta);

                    if (type === 'music' && STATION_CONFIG.ratingSystem?.enabled) {
                        const windowEnd = ratingManager.closeCommentWindow();
                        const count = await ratingManager.pollForComments(vid);
                        console.log(`📊 Collected ${count} comment${count===1?'':'s'} up to ${windowEnd}`);
                    }
                } catch (playErr) {
                    console.error(`Error streaming ${type} "${entry.meta.title}":`, playErr);

                    // If we're in YouTube mode, try to recover the streaming pipeline
                    if (STATION_CONFIG.streamMode === 'youtube') {
                        try {
                            console.log('🔄 Attempting to recover streaming pipeline...');
                            const { recoverStreamingPipeline } = require('./streamer');
                            await recoverStreamingPipeline();
                            console.log('✅ Streaming pipeline recovery complete, continuing playback');
                        } catch (recoverErr) {
                            console.error('❌ Failed to recover streaming pipeline:', recoverErr);
                            // Add a delay before continuing to avoid rapid failure loops
                            console.log('⏱️ Waiting before continuing playback...');
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        }
                    }
                }
            } catch (err) {
                console.error(`Error preparing ${type} for playback:`, err);
            }

            if (stopAfterNextMusic && type === 'music') {
                console.log('🛑 Stopping after this music track.');
                shouldStop = true;
                break;
            }
        }
    }
}

// Helper for DJ/podcast mix
async function pickNextTrackWithPodcasts() {
    const djDir = READY_DIR('dj');
    const podDir = READY_DIR('podcast');
    const djFiles = fs.readdirSync(djDir).map(f => path.join(djDir, f));
    const podFiles = fs.readdirSync(podDir).map(f => path.join(podDir, f));
    const all = [...djFiles, ...podFiles].filter(f => /\.(mp3|wav)$/i.test(f));
    if (!all.length) return null;
    const choice = all[Math.floor(Math.random() * all.length)];
    const meta = await extractMetadata(choice);
    return { filepath: choice, meta };
}

function stopPlayback() { shouldStop = true; }
function requestStop() { stopAfterNextMusic = true; }

module.exports = {
    playbackLoop,
    stopPlayback,
    requestStop,
    getPersistentVideoId
};
