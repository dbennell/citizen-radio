# Citizen Radio Project
## Overview
Citizen Radio is an automated radio station and podcast generator that creates immersive, in-universe audio content for the Star Citizen game universe. It streams continuous music, AI-generated talk segments, advertisements, and podcasts to YouTube while simulating a fictional radio station (Radio Arc-Corp) broadcasting from within the game world.
## Key Features
- : Automatically streams radio content with synchronized cover art rotation **24/7 YouTube Live Streaming**
- **Dynamic Content Scheduling**: Intelligently schedules music, DJ segments, ads, and podcasts in customizable patterns
- : Uses OpenAI's GPT-4 to create realistic radio content including:
    - DJ talk segments with personality and game-world references
    - In-universe advertisements for fictional products
    - Station IDs and transitions
    - Full-length podcast episodes with hosts and guests discussing topics from the Star Citizen universe

**AI-Powered Script Generation**
- **Smart Track Selection**: Prevents repetition with weighted history tracking for all content types
- : Converts AI-generated scripts to audio using Google Cloud's Text-to-Speech API **Text-to-Speech Synthesis**
- **Voice Assignment System**: Assigns appropriate voices to different characters based on gender, role, and persistence across episodes
- **AI Image Generation**: Creates station artwork for stream visualization using OpenAI's image API

## Technical Architecture
The system is built with a modular design consisting of several key components:
- : Main playback loop that controls content rotation and scheduling **orchestrator.js**
- : Watches for new prompts and triggers appropriate content generation **promptProcessor.js**
- : Builds complete podcast episodes from user prompts **podcastGenerator.js**
- : Smart selection system for avoiding content repetition **trackManager.js**
- : Handles FFmpeg pipelines for audio/video streaming **streamer.js**
- : Assigns and persists voice profiles for characters **voiceManager.js**
- : Converts text to speech and processes audio files **audioSynthesizer.js**

## How It Works
1. **Station Configuration**: Defines station identity, DJ personality, scheduling patterns, and voice profiles
2. **Content Scheduling**: Follows configured patterns to decide what plays next (music, ads, DJ segments, etc.)
3. **Content Generation**:
    - For talk segments: AI generates scripts which are converted to speech
    - For podcasts: Topics and participants are processed, scripts generated, and multi-voice conversations synthesized
    - For images: AI generates custom artwork based on prompts

4. **Audio Processing**: All content is processed with proper audio normalization and transitions
5. **Streaming**: Content is seamlessly piped into the YouTube live stream with synchronized visuals

## Stream Components
- **Music Tracks**: Plays music files from the ready/music directory
- **DJ Segments**: AI-generated casual DJ talk with station identification and personality
- **Advertisements**: Fictional in-universe product ads
- : Brief station identification clips **Station IDs & Intros**
- **Segways**: Smooth transitions between content types
- **Podcasts**: Longer-form talk segments with multiple characters discussing in-universe topics
- **Images**: Artwork displayed on the stream, rotated periodically

## Technologies Used
- : Core application runtime environment **Node.js**
- **FFmpeg**: Audio processing and live streaming
- **OpenAI API**: Content generation (text and images)
- : Voice synthesis **Google Cloud Text-to-Speech**
- **YouTube Live Streaming API**: Broadcast destination
- **Chokidar**: File system watching for prompt detection

## Project Structure
``` 
citizen-radio/
├── .env                 # Environment variables (API keys)
├── station.json         # Station configuration
├── index.js             # Application entry point
├── prompts/             # User-created content prompts
│   ├── ads/             # Advertisement prompts
│   ├── dj/              # DJ talk prompts
│   ├── intros/          # Station ID prompts
│   ├── podcast/         # Podcast episode prompts
│   └── images/          # Image generation prompts
├── ready/               # Processed content ready for streaming
│   ├── music/           # Music tracks
│   ├── ad/              # Generated advertisements
│   ├── dj/              # Generated DJ segments
│   ├── intro/           # Generated station IDs
│   ├── podcast/         # Generated podcast episodes
│   └── image/           # Cover images for stream
├── temp/                # Temporary files during processing
├── archive/             # Optional archive of processed content
└── play.log             # Log of played content
```
## Setup Instructions
1. **Clone the Repository**
``` 
   git clone https://github.com/yourusername/citizen-radio.git
   cd citizen-radio
```
1. **Install Dependencies**
``` 
   npm install
```
1. **Environment Configuration**
    - Copy the example environment file:
``` 
     cp .env.example .env
```
- Edit the file and add your API keys: `.env`
``` 
     OPENAI_API_KEY=your_openai_api_key_here
     YOUTUBE_STREAM_KEY=your_youtube_stream_key_here
```
1. **Station Configuration**
    - Edit to customize your radio station: `station.json`
``` json
     {
       "stationName": "Your Station Name",
       "djName": "Your DJ Name",
       "imageInterval": 480,
       "uptimeHours": null,
       "uptimeMode": "track",
       "vibe": "Description of your station's vibe and personality",
       "schedule": {
         "defaultPattern": ["intro", "music", "dj", "music", "ad", "music"]
       }
     }
```
- See the Configuration section below for detailed options
    1. **Add Content**
        - Place MP3 files in the appropriate directories `ready/`
        - Add image files to for stream visualization `ready/image/`
    2. **Or copy Example Content**
        - `bash cp -r example/*`
        - This will copy the necessary example files to the main directory, giving you everything you need to test it out right away.
    3. **Start the Station**
          - Basic start:
        ``` 
             npm start
        ```
        - Start with custom uptime args:
        ``` 
             npm start --uptime 4
        ```
## Configuration Options
### Station Configuration () `station.json`
#### Basic Settings
- `stationName`: Name of your radio station
- `djName`: Name of the main DJ persona
- `imageInterval`: How often to rotate cover images (in seconds)
- `uptimeHours`: use 'null' for never stop or a number in hours
- `uptimeMode`: when we do end/exit should we wait for the end of full cycle or just the next track
- `debug`: Enable debug mode (keeps temporary files)
- `streamMode`: Set to "youtube" for YouTube streaming or "local" for testing

#### Content Settings
- `context`: Contextual information for AI to understand the setting
- : Description of your station's personality and style `vibe`
- `segwayFunny`: Probability (0-1) of generating humorous transitions
- : Whether to include podcasts in the rotation alongside dj talk segments `djOptions.includePodcasts`

#### Track History
- : How many recently played tracks to remember `trackHistory.historySize`
- : Relative weights for different content types used in segways `trackHistory.weights`

#### Voice Settings
- `ttsProfiles`: Voice assignments for different content types
- `ttsAllowedPatterns`: Patterns for allowed voices

#### AI Prompts
- : Prompt for DJ segments `aiPrompts.dj`
- : Prompt for advertisements `aiPrompts.ad`
- : Prompt for station IDs/intros `aiPrompts.intro`
- : Prompt for transitions between content `aiPrompts.segway`
- : Prompt for humorous transitions `aiPrompts.segwayFunny`

#### Scheduling
- : Array defining the content rotation pattern `schedule.defaultPattern`

### Command Line Arguments
The following command line arguments can override settings in : `station.json`
- : Set the station's running time in hours (e.g., for 4 hours) `--uptime <hours>``--uptime 4`
- : Set the uptime mode:
    - `track`: Station will stop after the specified number of hours
    - `cycle`: Station will complete its current content cycle before stopping

`--uptime-mode <mode>`

## Content Generation
### Adding Text Prompts
The system automatically monitors the directories for new text files to process: `prompts/`
1. **Create a Text Prompt File**:
    - Create a file in the appropriate prompt folder:
        - - For DJ talk segments `prompts/dj/`
        - - For advertisements `prompts/ads/`
        - - For station IDs and transitions `prompts/intros/`
        - - For podcast episodes `prompts/podcast/`
        - - For generating station artwork `prompts/images/`

`.txt`

2. **Format Your Prompt**:
    - For simple content (dj, ads, intros): Write a brief description or outline
    - For podcasts: Include topic, hosts, guests, and any specific direction
    - For images: Describe the artwork you want to generate

3. **Prompt Processing**:
    - The system will automatically detect new text files using Chokidar
    - AI will expand your basic prompt into fully-formed content
    - Text will be converted to speech using the appropriate voice profile
    - Resulting audio will be placed in the corresponding directory `ready/`

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

For more control, create a file with the same base name as your prompt to customize parameters like episode length, style, and other settings. `.cfg.json`
## Developer Workflow
For developers looking to extend or modify the system:
1. **Development Environment Setup**
    - Install dependencies with `npm install`
    - Create a local file with API keys `.env`

2. **Testing Changes**
    - Use `streamMode: "local"` in station.json for local testing
    - Test prompt processing with sample files in each prompt directory
    - Debug module interactions by enabling `debug: true` in station.json

3. **Adding New Features**
    - The modular architecture allows for adding new content types
    - Extend the scheduling pattern in station.json to include new types
    - Create new processor modules following the existing patterns

4. **Troubleshooting**
    - Check the directory for intermediate files when debug mode is enabled `/temp`
    - Monitor console output for process and API interaction logs
    - Review play.log for content scheduling history
