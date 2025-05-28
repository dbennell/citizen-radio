# Citizen Radio Project

## Overview
Citizen Radio is an automated radio station and podcast generator that creates immersive, in-universe audio content for the Star Citizen game universe. It streams continuous music, AI-generated talk segments, advertisements, and podcasts to YouTube while simulating a fictional radio station (Radio Arc-Corp) broadcasting from within the game world.

## Key Features
- **24/7 YouTube Live Streaming**: Automatically streams radio content with synchronized cover art rotation
- **Dynamic Content Scheduling**: Intelligently schedules music, DJ segments, ads, and podcasts in customizable patterns
- **AI-Powered Script Generation**: Uses OpenAI's GPT-4 to create realistic radio content including:
    - DJ talk segments with personality and game-world references
    - In-universe advertisements for fictional products
    - Station IDs and transitions
    - Full-length podcast episodes with hosts and guests discussing topics from the Star Citizen universe
- **Smart Track Selection**: Uses procedural mood/energy waves, ratings, play frequency, and listener requests to intelligently select content
- **Text-to-Speech Synthesis**: Converts AI-generated scripts to audio using Google Cloud's Text-to-Speech API
- **Voice Assignment System**: Assigns appropriate voices to different characters based on gender, role, and persistence across episodes
- **AI Image Generation**: Creates station artwork for stream visualization using OpenAI's image API
- **User Ratings & Engagement**: Collects ratings and comments from live chat, displays them in the stream, and enables DJs to reference feedback
- **Analytics & Recommendations**: Processes user feedback to generate insights, trends, and content recommendations

## Technical Architecture
The system is built with a modular design consisting of several key components:

- **orchestrator.js**: Main playback loop that controls content rotation and scheduling
- **promptProcessor.js**: Watches for new prompts and triggers appropriate content generation
- **podcastGenerator.js**: Builds complete podcast episodes from user prompts
- **trackManager.js**: Smart selection system for avoiding content repetition
- **streamer.js**: Handles FFmpeg pipelines for audio/video streaming
- **voiceManager.js**: Assigns and persists voice profiles for characters
- **audioSynthesizer.js**: Converts text to speech and processes audio files
- **ratingsManager.js**: Collects and manages user ratings for tracks
- **analyticsEngine.js**: Processes ratings data to generate insights and trends
- **recommendationSystem.js**: Provides actionable content recommendations based on analytics
- **moodEnergyManager.js**: Manages procedural mood/energy waves for track selection
- **requestManager.js**: Handles track requests with priority management
- **sentimentAnalyzer.js**: Analyzes comment sentiment to generate human-readable summaries
- **engagementMonitor.js**: Monitors chat for noteworthy comments to reference in segways

## How It Works
1. **Station Configuration**: Defines station identity, DJ personality, scheduling patterns, and voice profiles
2. **Content Scheduling**: Follows configured patterns to decide what plays next (music, ads, DJ segments, etc.)
3. **Content Generation**:
    - For talk segments: AI generates scripts which are converted to speech
    - For podcasts: Topics and participants are processed, scripts generated, and multi-voice conversations synthesized
    - For images: AI generates custom artwork based on prompts

4. **Audio Processing**: All content is processed with proper audio normalization and transitions
5. **Streaming**: Content is seamlessly piped into the YouTube live stream with synchronized visuals
6. **Listener Engagement**:
    - Collects ratings and comments from live chat
    - Stores feedback in both JSON files and MP3 metadata
    - Analyzes sentiment in comments to generate summaries
    - References noteworthy listener comments in DJ segways
7. **Analytics & Recommendations**:
    - Processes ratings to identify trends and outliers
    - Generates actionable recommendations for content selection
    - Provides insights into audience preferences

## Stream Components
- **Music Tracks**: Plays music files from the ready/music directory
- **DJ Segments**: AI-generated casual DJ talk with station identification and personality
- **Advertisements**: Fictional in-universe product ads
- **Station IDs & Intros**: Brief station identification clips
- **Segways**: Smooth transitions between content types
- **Podcasts**: Longer-form talk segments with multiple characters discussing in-universe topics
- **Images**: Artwork displayed on the stream, rotated periodically
- **Live Chat Integration**: Displays YouTube live chat comments on the stream
- **Rating System**: Collects and displays user ratings for music tracks
- **Analytics Engine**: Processes user ratings to generate insights and trends
- **Recommendation System**: Provides actionable content recommendations based on analytics
- **MP3 Metadata Integration**: Stores ratings and sentiment in MP3 file metadata
- **Enhanced Engagement**: Acknowledges listener feedback during broadcasts
- **Mood/Energy Waves**: Procedural waves that influence track selection for dynamic listening experience

## Technologies Used
- **Node.js**: Core application runtime environment
- **FFmpeg**: Audio processing and live streaming
- **OpenAI API**: Content generation (text and images)
- **Google Cloud Text-to-Speech**: Voice synthesis
- **YouTube Live Streaming API**: Broadcast destination
- **Chokidar**: File system watching for prompt detection

## Project Structure
``` 
citizen-radio/
├── .env                 # Environment variables (API keys)
├── config/              # Configuration files
│   └── default.json     # Default station configuration
├── src/                 # Source code
│   ├── core/            # Core functionality
│   │   ├── config.js    # Configuration loading
│   │   ├── main.js      # Application entry point
│   │   ├── orchestrator.js # Main playback loop
│   │   └── streamer.js  # FFmpeg streaming
│   ├── audio/           # Audio processing
│   ├── managers/        # Management components
│   ├── podcast/         # Podcast generation
│   ├── processors/      # Content processors
│   ├── prompts/         # Prompt handling
│   ├── segways/         # Transition handling
│   ├── types/           # TypeScript definitions
│   ├── utils/           # Utility functions
│   └── voice/           # Voice synthesis
├── data/                # Data files
│   ├── prompts/         # User-created content prompts
│   │   ├── ads/         # Advertisement prompts
│   │   ├── dj/          # DJ talk prompts
│   │   ├── intros/      # Station ID prompts
│   │   ├── podcast/     # Podcast episode prompts
│   │   └── images/      # Image generation prompts
│   ├── ready/           # Processed content ready for streaming
│   │   ├── music/       # Music tracks
│   │   ├── ad/          # Generated advertisements
│   │   ├── dj/          # Generated DJ segments
│   │   ├── intro/       # Generated station IDs
│   │   ├── podcast/     # Generated podcast episodes
│   │   └── image/       # Cover images for stream
│   ├── temp/            # Temporary files during processing
│   └── archive/         # Optional archive of processed content
├── tests/               # Test files
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   ├── e2e/             # End-to-end tests
│   ├── performance/     # Performance tests
│   └── fixtures/        # Test fixtures
├── docs/                # Documentation
├── example/             # Example files
├── assets/              # Static assets
├── scripts/             # Helper scripts
└── play.log             # Log of played content
```
## Setup Instructions
1. **Clone the Repository**
``` 
   git clone https://github.com/yourusername/citizen-radio.git
   cd citizen-radio
```
2. **Install Dependencies**
``` 
   npm install
```
3. **Environment Configuration**
    - Create a `.env` file in the project root:
``` 
     touch .env
```
    - Edit the file and add your API keys:
``` 
     OPENAI_API_KEY=your_openai_api_key_here
     GOOGLE_TTS_API_KEY=your_google_tts_api_key_here
     YOUTUBE_STREAM_KEY=your_youtube_stream_key_here
     YOUTUBE_API_KEY=your_youtube_api_key_here
```
4. **Station Configuration**
    - The default configuration is in `config/default.json`
    - You can customize this file or create a new one in the config directory
    - Example configuration:
``` json
     {
       "stationName": "Your Station Name",
       "djName": "Your DJ Name",
       "uptimeHours": null,
       "uptimeMode": "track",
       "vibe": "Description of your station's vibe and personality",
       "schedule": {
         "defaultPattern": ["intro", "music", "dj", "music", "ad", "music"]
       }
     }
```
- See the Configuration section below for detailed options

5. **YouTube Stream Setup**
    - To stream to YouTube, you need to set up a live stream in YouTube Studio:
        1. Go to [YouTube Studio](https://studio.youtube.com/)
        2. Click on "Create" in the top-right corner and select "Go live"
        3. If this is your first time, you may need to verify your account and wait 24 hours
        4. Select "Stream" option (not "Webcam")
        5. Fill in the basic details for your stream (title, description, etc.)
        6. Make note of or copy the following important details:
            - **Stream Key**: Found under the "Stream settings" section
            - **Video ID**: This is the part of the stream URL after `v=` (e.g., for `https://youtube.com/watch?v=abcdefghijk`, the Video ID is `abcdefghijk`)
        7. Click "Create Stream" to save your settings

    - Add these details to your configuration:
        - Add the Stream Key to your `.env` file:
        ```
        YOUTUBE_STREAM_KEY=your_youtube_stream_key_here
        ```
        - Add the Video ID to your `config/default.json` file:
        ```json
        "youtube": {
          "videoId": "your_video_id_here"
        }
        ```
        - Alternatively, you can provide these as command line arguments when starting the station:
        ```
        npm start -- --youtube-stream-key=your_stream_key --youtube-video-id=your_video_id
        ```

        - For convenience, you can also specify the video ID directly as the first argument:
        ```
        npm start your_video_id
        ```

        - Or using the shorter flag:
        ```
        npm start -video your_video_id
        ```

        - If no video ID is provided, the system will attempt to automatically find the most recent live stream using the YouTube API (requires YOUTUBE_API_KEY to be set in your .env file)

    - For live feedback and user ratings:
        1. Go to [Google Cloud Console](https://console.cloud.google.com/)
        2. Create a new project or select an existing one
        3. Enable the YouTube Data API v3
        4. Create an API key
        5. Add the API key to your `.env` file:
        ```
        YOUTUBE_API_KEY=your_youtube_api_key_here
        ```

6. **Add Content**
    - Place MP3 files in the appropriate directories `data/ready/`
    - Add image files for stream visualization in `data/ready/image/`

7. **Or Use Example Content**
    - The project includes example content in the `example/` directory
    - You can copy it to the data directory:
    ```
    cp -r example/* data/
    ```
    - This will copy the necessary example files, giving you everything you need to test it out right away.

8. **Start the Station**
          - Basic start:
        ``` 
             npm start
        ```
        - Start with custom uptime args:
        ``` 
             npm start --uptime 4
        ```
        - Keyboard shortcuts while running:
          - `Ctrl+C`: Immediately stop the station
          - `Ctrl+X`: Stop the station after the current music track
## Configuration Options
### Station Configuration (`config/default.json`)
#### Basic Settings
- `stationName`: Name of your radio station
- `djName`: Name of the main DJ persona
- `uptimeHours`: use 'null' for never stop or a number in hours
- `uptimeMode`: when we do end/exit should we wait for the end of full cycle or just the next track
- `debug`: Enable debug mode (keeps temporary files)
- `streamMode`: Set to "youtube" for YouTube streaming or "local" for testing

#### Content Settings
- `context`: Contextual information for AI to understand the setting
- `vibe`: Description of your station's personality and style
- `segwayFunny`: Probability (0-1) of generating humorous transitions
- `djOptions.includePodcasts`: Whether to include podcasts in the rotation alongside dj talk segments

#### Track History
- `trackHistory.historySize`: How many recently played tracks to remember
- `trackHistory.weights`: Relative weights for different content types used in segways

#### Voice Settings
- `ttsProfiles`: Voice assignments for different content types
- `ttsAllowedPatterns`: Patterns for allowed voices

#### AI Prompts
- `aiPrompts.dj`: Prompt for DJ segments
- `aiPrompts.ad`: Prompt for advertisements
- `aiPrompts.intro`: Prompt for station IDs/intros
- `aiPrompts.segway`: Prompt for transitions between content
- `aiPrompts.segwayFunny`: Prompt for humorous transitions

#### Scheduling
- `schedule.defaultPattern`: Array defining the content rotation pattern

#### Rating System
- `ratingSystem.enabled`: Enable or disable the rating system
- `ratingSystem.defaultRating`: Default rating for tracks without ratings
- `ratingSystem.minTickets`: Minimum number of rating tickets
- `ratingSystem.maxTickets`: Maximum number of rating tickets
- `ratingSystem.ratingPersistence`: Whether to persist ratings between sessions
- `ratingSystem.displayOnStream`: Whether to display ratings on the stream
- `ratingSystem.streamDelay`: Delay in seconds before displaying ratings

#### YouTube Streaming
- `youtube.rtmpUrl`: RTMP URL for YouTube streaming
- `youtube.videoId`: YouTube video ID for the live stream
- `youtube.updateMetadata`: Whether to update stream metadata periodically
- `youtube.createAutomatically`: Whether to create a new stream automatically

### Command Line Arguments
The following command line arguments can override settings in the configuration file:

- `<video_id>`: Specify the YouTube video ID as the first argument (e.g., `npm start 7stobQGa1`)
- `-video <video_id>` or `--video <video_id>`: Specify the YouTube video ID (e.g., `npm start -video 7stobQGa1`)
- `--uptime <hours>`: Set the station's running time in hours (e.g., `--uptime 4` for 4 hours)
- `--uptime-mode <mode>`: Set the uptime mode:
    - `track`: Station will stop after the specified number of hours
    - `cycle`: Station will complete its current content cycle before stopping
- `--debug`: Enable debug mode (keeps temporary files and provides more verbose logging)

If no video ID is provided, the system will attempt to automatically find the most recent live stream using the YouTube API (requires YOUTUBE_API_KEY to be set in your .env file).

## Content Generation
### Adding Text Prompts
The system automatically monitors the directories for new text files to process: `data/prompts/`
1. **Create a Text Prompt File**:
   - Create a file in the appropriate prompt folder:
       - `data/prompts/dj/` - For DJ talk segments
       - `data/prompts/ads/` - For advertisements
       - `data/prompts/intros/` - For station IDs and transitions
       - `data/prompts/podcast/` - For podcast episodes
       - `data/prompts/images/` - For generating station artwork

   Use the `.txt` extension for all prompt files.

2. **Format Your Prompt**:
    - For simple content (dj, ads, intros): Write a brief description or outline
    - For podcasts: Include topic, hosts, guests, and any specific direction
    - For images: Describe the artwork you want to generate

3. **Prompt Processing**:
    - The system will automatically detect new text files using Chokidar
    - AI will expand your basic prompt into fully-formed content
    - Text will be converted to speech using the appropriate voice profile
    - Resulting audio will be placed in the corresponding directory `data/ready/`

### Podcast Generation
Podcasts can be defined in multiple formats. Here are some examples:
#### Detailed Format
``` 
Topic: The future of quantum travel technology

Direction:
- Please spend about 4 minutes with each guest
- Xander is hopefully optimistic about his drive
- Leela keeps trying to undermine the new tech

Hosts:
- Markus Reynolds: Male, senior science correspondent, enthusiastic about new tech
- Leela Chen: Female, engineer, skeptical but knowledgeable

Guests:
- Dr. Xander Smith: Male, quantum physicist, developer of the new QD-9000 drive
- Captain Aria Jackson: Female, test pilot, first to use the experimental drive

Notes:
The podcast should discuss recent breakthroughs in this new quantum drive technology,
with Dr. Smith explaining the technical details while Captain Jackson shares
her experiences testing the new drive.
```
#### Simple Format with Duration
``` 
## Create a 8 minute podcast about Invictus

host: Dex Rylan 
guest: Retired UEE Navy Captain, Lorna Sterling 
guest: Ex Invictus organiser, Steve Fisher

Remember: invictus is hosted in Area 18 this year, which is where you are located
```
#### Minimal Format
``` 
Talk about cheese

host: Dex Rylan 
guest: Cheese maker, Audrey Kemp 
guest: Bob, cheese lover
```
The system automatically:
- Detects format and extracts participants, topic and duration (default: 6 minutes)
- Assigns appropriate voices based on gender (inferred from names when not specified)
- Creates consistent voice assignments so characters sound the same across episodes
- Generates natural conversation between all participants

For more control, create a file with the same base name as your prompt and a `.cfg.json` extension to customize parameters like episode length, style, and other settings.
## Testing
The project includes a comprehensive testing infrastructure with different types of tests:

### Running Tests
To run all tests:
```
npm test
```

To run specific test types:
```
npm run test:unit        # Run unit tests
npm run test:integration # Run integration tests
npm run test:e2e         # Run end-to-end tests
npm run test:performance # Run performance tests
```

### Test Coverage
To generate a test coverage report:
```
npm run test:coverage
```

### Test Types
1. **Unit Tests**: Test individual components in isolation
   - Located in `tests/unit/`
   - Cover core components, managers, processors, and utilities

2. **Integration Tests**: Test interactions between components
   - Located in `tests/integration/`
   - Cover content generation pipeline and streaming pipeline

3. **End-to-End Tests**: Test complete workflows
   - Located in `tests/e2e/`
   - Cover broadcast cycles, content variety, rating collection, and error recovery

4. **Performance Tests**: Test system performance
   - Located in `tests/performance/`
   - Cover memory usage, CPU usage, resource cleanup, and long-running stability

### Test Fixtures
Sample data for tests is located in `tests/fixtures/`:
- Sample audio files
- Sample station configurations
- Sample YouTube comments
- Sample AI responses

## Developer Workflow
For developers looking to extend or modify the system:
1. **Development Environment Setup**
    - Install dependencies with `npm install`
    - Create a local file with API keys `.env`

2. **Testing Changes**
    - Use `streamMode: "local"` in config/default.json for local testing
    - Test prompt processing with sample files in each prompt directory
    - Debug module interactions by enabling `debug: true` in config/default.json
    - Run unit tests for components you modify (see Testing section)

3. **Adding New Features**
    - The modular architecture allows for adding new content types
    - Extend the scheduling pattern in config/default.json to include new types
    - Create new processor modules following the existing patterns
    - Add tests for new functionality

4. **Troubleshooting**
    - Check the `data/temp` directory for intermediate files when debug mode is enabled
    - Monitor console output for process and API interaction logs
    - Review play.log for content scheduling history
    - Check test failures for clues about issues
    - Use the `--debug` flag when running the application for more verbose logging

    **Streaming Issues**
    - If you encounter streaming pipeline failures, the application will attempt to automatically recover
    - Check for "Pipe error detected" or "Broken pipe" messages in the logs
    - If recovery fails, try restarting the application
    - Ensure that no other processes are using the FIFO pipe at `/tmp/audio_buffer.fifo`
    - Check that FFmpeg is installed and working correctly
    - If streaming issues persist, try running `pkill -f ffmpeg` to kill any lingering FFmpeg processes before starting the application
