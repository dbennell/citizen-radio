// start.js
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const hasAnalyzeFlag = args.includes('--analyze');
const musicDirIndex = args.findIndex(arg => arg === '--music-dir');
const musicDir = musicDirIndex !== -1 && args.length > musicDirIndex + 1 
    ? path.resolve(args[musicDirIndex + 1])
    : path.join(__dirname, 'data/ready/music');

if (hasAnalyzeFlag) {
    // Run the audio analyzer
    const { analyzeDirectory } = require('./src/utils/audioAnalysisRunner');

    analyzeDirectory(musicDir)
        .then(() => {
            console.log('✅ Audio analysis complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Error during audio analysis:', error);
            process.exit(1);
        });
} else {
    // Start the station as usual
    require('./src/core/main.js');
}
