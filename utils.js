const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const NodeID3 = require("node-id3");

const runningProcesses = [];

// Utility to compute the "played" directory for a given type
function getPlayedDir(type) {
    return path.join(__dirname, "played", type);
}

function spawnTrackedProcess(command, args, options = {}) {
    const proc = spawn(command, args, options);
    runningProcesses.push(proc);

    proc.on("close", () => {
        const idx = runningProcesses.indexOf(proc);
        if (idx !== -1) runningProcesses.splice(idx, 1);
    });

    proc.on("error", (err) => {
        console.error(`Process error [${command}]:`, err);
    });

    return proc;
}

function moveFileToPlayed(filePath, type) {
    const readyDir = path.join(__dirname, "ready", type);

    /* ------------------------------------------------------------------
     * SEGWAY FILES
     * ------------------------------------------------------------------
     * Segways are one-off transitions that never need to be replayed.
     * Instead of archiving them, we simply delete the file once it has
     * been broadcast.
     * ------------------------------------------------------------------ */
    if (type === "segway" && path.dirname(filePath) === readyDir) {
        try {
            fs.unlinkSync(filePath);
            console.log(`Removed segway file: ${filePath}`);
        } catch (err) {
            console.error(`Failed to remove segway file ${filePath}:`, err);
        }
        return;   // No further processing required
    }

    // Default behaviour for all other types
    const playedDir = getPlayedDir(type);

    if (path.dirname(filePath) === readyDir) {
        fs.mkdirSync(playedDir, { recursive: true });
        const target = path.join(playedDir, path.basename(filePath));
        fs.renameSync(filePath, target);
        console.log(`Moved ${type} file to: ${target}`);
    }
}


// Build fallback metadata using the filename as title and include filename
function buildFallbackMetadata(filePath) {
    return {
        title: path.parse(filePath).name,
        filename: path.basename(filePath)
    };
}

/**
 * Extracts metadata from an MP3 file using ID3 tags.
 * Falls back to using the filename as the title if tags are missing.
 * @param {string} filePath
 * @returns {Object}
 */
function extractMetadata(filePath) {
    try {
        if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
            console.warn(`File not found or empty: ${filePath}`);
            return buildFallbackMetadata(filePath);
        }

        const tags = NodeID3.read(filePath);
        if (!tags) {
            console.warn(`No ID3 tags found for: ${filePath}`);
            return buildFallbackMetadata(filePath);
        }

        const fallback = buildFallbackMetadata(filePath);
        return {
            title: tags.title || fallback.title,
            artist: tags.artist || null,
            album: tags.album || null,
            genre: tags.genre || null,
            comment: tags.comment || null,
            filename: fallback.filename
        };
    } catch (err) {
        console.error(`Error extracting metadata from ${filePath}:`, err);
        return buildFallbackMetadata(filePath);
    }
}

function killAllTrackedProcesses() {
    runningProcesses.forEach(proc => {
        if (!proc.killed) {
            console.log(`Killing PID ${proc.pid}`);
            try {
                proc.kill("SIGTERM");
            } catch (err) {
                console.error(`Failed to kill PID ${proc.pid}:`, err);
            }
        }
    });
}

module.exports = {
    spawnTrackedProcess,
    extractMetadata,
    moveFileToPlayed,
    killAllTrackedProcesses,
    runningProcesses,
};