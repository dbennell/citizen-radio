# Segway Implementation

## Overview

Segways are 100% dynamic content generated on the spot and never reused. They provide transitions between different types of content in the radio station's playback. This document describes the implementation of segways in the Citizen Radio project.

## Key Features

1. **Dynamic Generation**: Segways are generated on-the-fly based on the context of the previous and upcoming tracks.
2. **Contextual Awareness**: Segways can reference:
   - What the listener just heard (previous tracks)
   - Listener feedback and ratings
   - Random funny comments (25% chance by default)
   - Upcoming tracks with their ratings and metadata

3. **Efficient Resource Management**:
   - Segway files are deleted after playback
   - Segways are not logged to play.log since they're never reused

## Implementation Details

### Track History and Queue Integration

The segway generation process now takes into account:
- Up to 2 previous tracks from the play history (excluding ads)
- Up to 2 upcoming tracks from the content queue

This provides richer context for generating more natural and engaging transitions.

### Segway Generation Process

1. The `contentQueueManager.js` fetches:
   - Previous tracks from play history
   - Next tracks from the content queue
   
2. These are passed to the `generateSegway` function along with the immediate previous and next track metadata.

3. The `generateSegway` function:
   - Processes track information
   - Filters out ads and irrelevant content
   - Includes ratings and feedback when available
   - Generates a contextual segway using OpenAI

4. The segway is then synthesized to speech and queued for playback.

5. After playback, the segway file is automatically deleted.

### Configuration

Segway behavior can be configured in `default.json`:

```json
{
  "segwayFunny": 0.25,
  "aiPrompts": {
    "segway": "Write a seamless transition between segments. Only the text to be spoken!",
    "segwayFunny": "Before announcing the next track, throw in a quick, off-the-cuff, DJ-style joke, cheeky comment or thought of the day."
  }
}
```

- `segwayFunny`: Probability (0-1) of including a funny comment
- `aiPrompts.segway`: Base prompt for generating segways
- `aiPrompts.segwayFunny`: Additional prompt for funny comments

## Usage

Segways are automatically generated and played between content items. No manual intervention is required.

The system handles:
- Generating appropriate segways based on content types
- Playing segways before the main content
- Cleaning up segway files after use