# 🛰️ Citizen Radio

## 📡 Overview
Citizen Radio is a fully automated, AI-powered radio station system that creates immersive, in-universe audio content for fictional worlds like the Star Citizen game universe. It streams continuous music, AI-generated talk segments, advertisements, and podcasts to YouTube while simulating a fictional radio station broadcasting from within the game world.

The system runs 24/7 without human intervention, creating a compelling and dynamic listening experience that evolves over time based on listener feedback and engagement.

## ✨ Key Features
- **24/7 YouTube Live Streaming**: Automatically streams radio content with synchronized cover art rotation
- **AI-Powered Content Generation**: Uses OpenAI's GPT-4 to create:
  - DJ talk (or News) segments with personality and game-world references
  - In-universe advertisements for fictional products
  - Station IDs and transitions (segues)
  - Full-length podcast episodes with multiple characters discussing in-universe topics
- **Dynamic Content Scheduling**: Intelligently schedules content in customizable patterns
- **Advanced Track Selection**: Uses ratings, play frequency, mood/energy waves, and listener requests
- **Voice Synthesis & Management**: Converts AI scripts to speech with consistent character voices
- **Content Pre-Queuing**: Prepares content in advance for seamless transitions
- **User Ratings & Engagement**: Collects feedback from live chat and references it in broadcasts
- **Analytics & Recommendations**: Processes user feedback to improve content selection
- **Automated Error Recovery**: Self-heals from common streaming and API issues

## 🚀 Quick Start (New Users)

### ✅ Requirements

* Ubuntu 22.04+ (Ubuntu 24.10 may have unstable repos)
* **Node.js v16+**
* **FFmpeg** (must be in your PATH)
* **API keys** for:

   * [OpenAI](https://platform.openai.com/)
   * [Google Cloud Text-to-Speech](https://cloud.google.com/text-to-speech)
   * [YouTube API](https://console.cloud.google.com/apis)
   * **YouTube streaming enabled** on your account


If you do not have node.js or npm run
```bash
sudo apt update
sudo apt install node
sudo apt install npm
```

If you do not have ffmpeg run
```bash
sudo apt update
sudo apt install ffmpeg
```

---

### 📥 1. Clone & Install

```bash
git clone https://github.com/dbennell/citizen-radio.git
cd citizen-radio

# Optional: update system packages
sudo apt update && sudo apt upgrade

# Install Node.js dependencies
npm install
```


---

### ⚙️ 2. Set Up Environment Variables

Create a `.env` file:

```bash
touch .env
```

Add your API keys:

```
# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key

# Googles TTS service 
GOOGLE_APPLICATION_CREDENTIALS=your_google_auth_key.json

# YouTube streaming settings
YOUTUBE_STREAM_KEY=your_youtube_stream_key 
YOUTUBE_API_KEY=your_youtube_api_key 

```

---

## 🎙 How to Set Up Google TTS

The Citizen Radio system uses the official Google Cloud Text-to-Speech **Node.js SDK**, which requires **Application Default Credentials**.

1. **Create a Google Cloud project**
   [https://console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate)

2. **Enable the Text-to-Speech API**
   [https://console.cloud.google.com/apis/library/texttospeech.googleapis.com](https://console.cloud.google.com/apis/library/texttospeech.googleapis.com)

3. **Create a service account**
   [https://console.cloud.google.com/iam-admin/serviceaccounts](https://console.cloud.google.com/iam-admin/serviceaccounts)

4. **Grant it the "Text-to-Speech API User" role**

5. **Create a key** for the service account:

* Select "Create Key"
* Choose **JSON** format
* Download the file

6. **Save the file** to your system (e.g., `/home/ubuntu/google-tts.json`)

7. **Set the environment variable** in your `.env` file:

   ```env
   GOOGLE_APPLICATION_CREDENTIALS=/home/ubuntu/google-tts.json
   ```

---

### 🎧 3. Add Sample Content

```bash
rsync -av example/ready/ data/ready/
```

Or, manually add:

* MP3s → `data/ready/music/`
* Images → `data/ready/image/`

---

### ▶️ 4. Start Broadcasting

```bash
npm start                # Default stream mode (YouTube)
npm start --uptime 4     # Stream for 4 hours then stop
npm start --debug        # Verbose logs, keep temp files
npm start --stream-mode local  # Run without streaming (for testing)
```

5. **Control the Station**
   - `Ctrl+C`: Immediately stop the station
   - `Ctrl+X`: Stop after the current music track finishes


6. **Headless**

   If you want to be able to start the service and go on doing other things...
   ```
   tmux new -s citizenradio
   npm start
   ```
   [Ctrl+B] then [D] to detach 

   And then to reattach again later
   ```
   tmux attach -t citizenradio
   ```

## 📀️ Creating Content

### Adding Music
Place MP3 files in `data/ready/music/` to add them to the rotation.

### Analyzing Audio Files
The system includes an audio analyzer utility that evaluates music files for mood and energy metrics, which helps with better track selection based on the desired atmosphere:

```bash
# Analyze all MP3 files in the default music directory
node start.js --analyze

# Analyze files in a specific directory
node start.js --analyze --music-dir /path/to/music
```

The analyzer:
- Evaluates each track for mood (energetic, peaceful, aggressive, melancholic, neutral)
- Measures energy levels (RMS energy, dynamic range, loudness)
- Detects BPM (beats per minute)
- Identifies if the track has vocals
- Saves analysis results alongside each audio file and in a central database
- Provides a summary of mood and energy distribution across your music library

Analysis results are used by the track selection algorithm to create better mood transitions and energy waves throughout the broadcast.

### Creating AI-Generated Content
The system automatically processes text prompts placed in specific folders:

1. **Create a Text Prompt File**
   Create `.txt` files in the appropriate folder:
   - `data/prompts/dj/` - For DJ talk segments
   - `data/prompts/ads/` - For advertisements
   - `data/prompts/intros/` - For station IDs
   - `data/prompts/podcast/` - For podcast episodes
   - `data/prompts/images/` - For cover art

2. **Write Your Prompt**
   For DJ segments, ads, or intros, a simple description works:
   ```
   Talk about the latest racing event on ArcCorp and mention the upcoming Invictus Launch Week.
   ```

   For podcasts, include participants:
   ```
   Topic: The future of quantum travel technology

   host: Markus Reynolds, science correspondent
   guest: Dr. Xander Smith, quantum physicist
   guest: Captain Aria Jackson, test pilot

   Notes: Discuss the new QD-9000 drive technology and its implications for space travel.
   ```

3. **Automatic Processing**
   - The system detects new files and processes them automatically
   - AI expands your prompt into full content
   - Text is converted to speech with appropriate voices
   - Finished audio is placed in the corresponding `data/ready/` directory

## 🪛️ Configuration

### Basic Configuration
Edit `config/default.json` to customize your station:

```json
{
  "stationName": "Your Station Name",
  "djName": "Your DJ Name",
  "vibe": "Description of your station's style and personality",
  "schedule": {
    "defaultPattern": ["intro", "music", "dj", "music", "ad", "music"]
  },
  "streamMode": "youtube",  // or "local" for testing without streaming
  "debug": false
}
```

### Advanced Settings
The configuration file supports many advanced options:

- **Content Scheduling**: Customize the pattern and frequency of different content types
- **Voice Profiles**: Assign specific voices to different content types
- **AI Prompts**: Customize the instructions given to the AI for each content type
- **Rating System**: Configure how user feedback is collected and processed
- **YouTube Integration**: Set streaming parameters and metadata updates

See the `config/default.json` file for all available options.

## 🔧 Command Line Options

- `node start --video your_video_id`: Start with a specific YouTube video ID
- `node start --uptime 4`: Run for 4 hours then stop
- `node start --uptime-mode cycle`: Complete the current content cycle before stopping
- `node start --debug`: Enable debug mode with verbose logging
- `node start --stream-mode local`: Run in local mode without streaming
- `node start --analyze`: Run the audio analyzer to evaluate mood and energy for all MP3 files in the music directory
- `node start --analyze --music-dir /path/to/music`: Analyze audio files in a specific directory

## 📁 Project Structure

```
citizen-radio/
├── config/              # Configuration files
├── src/                 # Source code
│   ├── core/            # Core functionality
│   ├── managers/        # Component managers
│   ├── processors/      # Content processors
│   └── utils/           # Utility functions
├── data/                # Data files
│   ├── prompts/         # Input prompts
│   ├── ready/           # Processed content
│   ├── temp/            # Temporary files
│   └── archive/         # Archived content
├── tests/               # Test files
└── docs/                # Documentation
```

## 🧪 Testing

Run tests with:
```bash
npm test                  # Run all tests
npm run test:unit         # Run unit tests
npm run test:integration  # Run integration tests
npm run test:e2e          # Run end-to-end tests
npm run test:coverage     # Generate coverage report
```


## 📦 Standard Update Process

1. **Stop the service** (if running):
   ```bash
   # If running in foreground: Ctrl+C or Ctrl+X
   # If running in tmux session:
   tmux attach -t citizenradio
   # Then Ctrl+C or Ctrl+X to stop
   ```

2. **Backup your configuration and data** (recommended):
   ```bash
   # Backup your environment file
   cp .env .env.backup
   
   # Backup your custom configuration
   cp config/default.json config/default.json.backup
   
   # Backup your content (optional, but recommended)
   tar -czf data-backup-$(date +%Y%m%d).tar.gz data/
   ```

3. **Pull the latest changes**:
   ```bash
   git pull origin main
   ```

4. **Update dependencies** (if package.json changed):
   ```bash
   npm install
   ```

5. **Check for configuration changes**:
   ```bash
   # Compare your config with the new default (if updated)
   diff config/default.json.backup config/default.json
   ```

6. **Restart the service**:
   ```bash
   npm start
   ```


## 🔍 Troubleshooting

### Common Issues

1. **Updating From Git Issues**
   - if you have merge issues after pulling from origin main, and you have't done any local changes, 
   - you are just an end user install then use to wipe clean with the new version.
   ```
   git reset --hard HEAD
   git pull --rebase
   ```

2. **API Key Problems**
   - Verify your API keys in the `.env` file
   - Check API usage limits and billing status

3. **Streaming Issues**
   - Ensure FFmpeg is installed correctly
   - Check your YouTube stream settings
   - Run `pkill -f ffmpeg` to kill any lingering processes
   - Verify no other processes are using `/tmp/audio_buffer.fifo`

4. **Content Generation Problems**
   - Check the logs for API errors
   - Verify prompt formats
   - Look in `data/temp/` for intermediate files (with debug mode enabled)

### Debug Mode
Enable debug mode to keep temporary files and get verbose logging:
```bash
npm start --debug
```

## 🛠️ Development Guide

### Adding New Features
1. **Understand the Architecture**
   - Review the modular design in `src/`
   - See how components interact via the orchestrator

2. **Local Testing**
   - Use `streamMode: "local"` for testing without streaming
   - Enable `debug: true` to preserve intermediate files

3. **Creating New Content Types**
   - Add a new type to the scheduling pattern
   - Create processor modules for the new type
   - Update the orchestrator to handle the new type

4. **Testing Your Changes**
   - Write unit tests for new components
   - Run integration tests to verify interactions
   - Test with real prompts and content

For more detailed technical information, see the [full system summary](docs/summary.md).

Or if you are interested in helping contribute to the project, see the [contributor guide](docs/contributor-guide.md).

## 📚 Additional Resources

- [Full System Summary](docs/summary.md): Comprehensive technical documentation
- [Feature Documentation](docs/features/): Detailed information about specific features
- [API Documentation](docs/api/): API reference for developers
- [Architecture Guide](docs/architecture/): System architecture and design patterns

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
