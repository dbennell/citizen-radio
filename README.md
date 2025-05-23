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
- **Smart Track Selection**: Prevents repetition with weighted history tracking for all content types
- **Text-to-Speech Synthesis**: Converts AI-generated scripts to audio using Google Cloud's Text-to-Speech API
- **Voice Assignment System**: Assigns appropriate voices to different characters based on gender, role, and persistence across episodes

## Technical Components
- **Live Streaming**: Uses FFmpeg to maintain a continuous audio/video stream to YouTube
- **Content Generation**: Creates various types of radio content on-demand using AI
- **Track Management**: Intelligent selection system that avoids repetition
- **Podcast Creation**:
    - Script generation with proper dialogue structure
    - Character voice assignment and persistence
    - Audio synthesis and processing
- **Stream Visualization**: Rotates station artwork on the live stream

## How It Works
1. **Station Configuration**: Defines station identity, DJ personality, scheduling patterns, and voice profiles
2. **Content Scheduling**: Follows configured patterns to decide what plays next (music, ads, DJ segments, etc.)
3. **Content Generation**:
- For talk segments: AI generates scripts which are converted to speech
- For podcasts: Topics and participants are processed, scripts generated, and multi-voice conversations synthesized
4. **Audio Processing**: All content is processed with proper audio normalization and transitions
5. **Streaming**: Content is seamlessly piped into the YouTube live stream with synchronized visuals

## Stream Components
- **Music Tracks**: Plays music files from the ready/music directory
- **DJ Segments**: AI-generated casual DJ talk with station identification and personality
- **Advertisements**: Fictional in-universe product ads
- **Station IDs & Intros**: Brief station identification clips
- **Segways**: Smooth transitions between content types
- **Podcasts**: Longer-form talk segments with multiple characters discussing in-universe topics

## Technologies Used
- Node.js for application logic
- FFmpeg for audio processing and live streaming
- OpenAI API for content generation
- Google Cloud Text-to-Speech for voice synthesis
- YouTube Live Streaming API

## Project Structure
- Modular design with separate components for:
    - Stream management and broadcasting
    - Content scheduling and playback
    - Track selection and history tracking
    - Podcast generation and processing
    - AI content creation

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
- Copy the example environment file:
  ```
  cp .env.example .env
  ```
- Edit the `.env` file and add your API keys:
  ```
  OPENAI_API_KEY=your_openai_api_key_here
  YOUTUBE_STREAM_KEY=your_youtube_stream_key_here
  ```

4. **Station Configuration**
- Edit `station.json` to customize your radio station:
  ```json
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

5. **Add Content**
- Place MP3 files in the appropriate `ready/` directories
- Add image files to `ready/image/` for stream visualization

6. **Start the Station**
- Basic start:
  ```
  npm start
  ```
- With custom uptime:
  ```
  npm start -- --uptime 4 --uptime-mode track
  ```

## Configuration Options

### Station Configuration (`station.json`)

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

### Command Line Arguments

The following command line arguments can override settings in `station.json`:

- `--uptime <hours>`: Set the station's running time in hours (e.g., `--uptime 4` for 4 hours)
- `--uptime-mode <mode>`: Set the uptime mode:
    - `track`: Station will stop after the specified number of hours
    - `cycle`: Station will complete its current content cycle before stopping

## Content Generation

### Adding Text Prompts

The system automatically monitors the `prompts/` directories for new text files to process:

1. **Create a Text Prompt File**:
    - Create a `.txt` file in the appropriate prompt folder:
        - `prompts/dj/` - For DJ talk segments
        - `prompts/ads/` - For advertisements
        - `prompts/intros/` - For station IDs and transitions
        - `prompts/podcast/` - For podcast episodes
        - `prompts/images/` - For generating station artwork

2. **Format Your Prompt**:
    - For simple content (dj, ads, intros): Write a brief description or outline
    - For podcasts: Include topic, hosts, guests, and any specific direction

3. **Prompt Processing**:
    - The system will automatically detect new text files
    - AI will expand your basic prompt into fully-formed content
    - Text will be converted to speech using the appropriate voice profile
    - Resulting audio will be placed in the corresponding `ready/` directory

### Podcast Generation

Podcasts can be defined in multiple formats. Here are some examples:

#### Detailed Format
   ```
   Topic: The future of quantum travel technology
   
   Directon:
   - Please spend about 4 minutes with each guest
   - Xander is hopfully optimistic about his drive
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
    
    Remeber: invictus is hosted in Area 18 this year, which is where you are located
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

For more control, create a `.cfg.json` file with the same base name as your prompt to customize parameters like episode length, style, and other settings.



Citizen Radio brings the Star Citizen universe to life through an immersive radio experience, combining AI-generated content with music to create a persistent broadcast that enhances the game's atmosphere and lore.