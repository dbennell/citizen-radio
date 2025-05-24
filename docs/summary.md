
# 🛰️ Citizen Radio — Full System Summary

**Citizen Radio** is a fully automated, AI-powered radio station system that generates, synthesizes, schedules, and streams immersive audio content. Built for a **fictional in-universe experience** (e.g., *Star Citizen*), it combines GPT-based natural language generation, TTS synthesis, smart playback logic, and live streaming to deliver a compelling, always-on broadcast—entirely autonomously.

---

## 🧠 Core Capabilities

### 1. **AI Content Generation**

* Uses **OpenAI GPT-4** to generate:

  * DJ talk segments
  * In-universe advertisements
  * Station IDs
  * Segways (transitions)
  * Multi-character podcast scripts
* Expands short prompts into fully elaborated text with contextual awareness of the station's theme, DJ, and vibe
* Uses flexible, type-specific AI prompt templates
* Extracts metadata (e.g. speaker roles, gender, titles) from raw input

### 2. **Prompt Automation System**

* `promptProcessor.js` watches prompt folders using **Chokidar**
* Automatically detects and processes new `.txt` prompt files
* Routes prompts based on type (e.g. `dj`, `ad`, `podcast`, `image`)
* Performs:

  * Prompt elaboration (GPT-4)
  * TTS generation (Google TTS)
  * Podcast script parsing and synthesis
  * Image generation (via OpenAI image API)
* Produces ready-to-broadcast MP3 or image content in structured output folders
* Cleans up or archives processed prompts based on debug mode

### 3. **Voice Management & Synthesis**

* Leverages **Google Cloud Text-to-Speech**
* Assigns consistent voices across episodes based on:

  * Gender
  * Occupation
  * Voice filters defined in station config
* Caches and persists voice mappings to JSON
* Includes fallback logic for failed synths
* Ensures gender-appropriate and vibe-consistent vocal output

### 4. **Podcast Engine**

* Builds **multi-character podcasts** from plain-text prompts:

  * Extracts participants and roles
  * Assigns voices using `voiceManager`
  * Synthesizes each speech segment
  * Stitches audio into a single episode
* Handles edge cases like missing participant info or invalid configurations
* Fully automated via integration with `promptProcessor.js`

### 5. **Audio Playback & Streaming**

* Uses **FFmpeg** for audio stitching and streaming
* Streams to **YouTube Live (RTMP)** with rotating visual overlays
* Handles:

  * Music playback
  * Segways
  * Voice segments
  * Podcast episodes
* Operates in local playback or stream mode with seamless switching

### 6. **Smart Scheduling & Playback**

* Main loop (`orchestrator.js`) selects what to play next based on:

  * Scheduling config
  * Weighted history (to avoid repetition)
  * Fallback logic for missing content types
* Injects segways using AI or templated transitions
* Allows graceful stop/pause control and runtime toggles
* Honors `station.json` patterns for timing, variety, and vibe

### 7. **Configuration & Extensibility**

* Controlled via `station.json`, a human-editable config file defining:

  * DJ persona and station branding
  * Playback mix and rotation frequency
  * AI prompt templates
  * TTS voice profiles
* Supports runtime flags and environment variable overrides
* All audio/image/media organized in structured directories:

  * `prompts/`, `ready/`, `played/`, `temp/`, `archive/`

---

## 🧰 Technical Architecture

| Component             | Description                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `index.js`            | App entry point; initializes modules, handles signals, keybinds, and temp cleanup                |
| `promptProcessor.js`  | Watches for new prompts, elaborates content, triggers generation (TTS, podcast, segways, images) |
| `orchestrator.js`     | Main playback loop with type rotation, segway generation, and control signaling                  |
| `podcastGenerator.js` | Builds full podcast episodes (from prompt to MP3)                                                |
| `podcastParser.js`    | Parses podcast scripts and extracts participant metadata                                         |
| `audioSynthesizer.js` | Handles voice synthesis (TTS) and MP3 stitching with transitions                                 |
| `voiceManager.js`     | Assigns and persists voice mappings to maintain speaker consistency                              |
| `trackManager.js`     | Selects next track using play history and usage weighting                                        |
| `playLogManager.js`   | Logs plays, manages in-memory cache, and supports recent-track queries                           |
| `streamer.js`         | Runs FFmpeg pipelines for local audio or YouTube live streaming                                  |
| `config.js`           | Loads and merges `station.json` settings, provides path helpers                                  |
| `station.json`        | Core configuration defining personality, schedule, TTS, prompts, and streaming                   |
| `utils.js`            | Helper utilities for metadata, file management, and process cleanup                              |

---

## 📦 Content Types

* **Music Tracks** – MP3s scheduled into playback rotation
* **DJ Segments** – Generated station banter and transitions
* **Advertisements** – Fictional, lore-appropriate ad spots
* **Station IDs** – Short branded identifiers for continuity
* **Segways** – Audio transitions generated via AI or templates
* **Podcasts** – Full talk show-style segments with multiple characters
* **Images** – Used as visual overlays for streaming platforms

---

## 🧩 Integration Points

* **OpenAI API** – For AI-driven script, segway, and image generation
* **Google Cloud TTS** – For realistic, diverse voice synthesis
* **FFmpeg** – Audio stitching and live RTMP streaming
* **YouTube** – Output destination for 24/7 in-universe broadcast
* **Node.js** – Runtime environment managing all orchestration

---

## 🔧 Developer & Ops Features

* Graceful shutdown on SIGINT/SIGTERM
* File watcher automatically processes dropped prompts
* CLI overrides and runtime config
* Play history logs + replay prevention
* Voice mappings persisted to JSON for continuity
* Easy-to-edit config in `station.json`
* Debug/archive modes for prompt processing

---

## 🎯 Use Case & Vision

Citizen Radio creates a **self-sustaining, immersive broadcast** designed for **fictional sci-fi worlds**. With AI content generation, character-driven dialogue, and high-fidelity voice synthesis, it simulates the experience of tuning into a real radio station inside a living game universe.

Ideal for:

* Star Citizen in-universe radio streams
* Tabletop RPG atmospheric broadcasts
* Sci-fi ARG storytelling tools
* World-building for interactive fiction and immersive experiences

Its fully modular structure allows new content types, new formats, and deeper integrations with minimal effort—making it as scalable as it is immersive.

