# Feedback and Ratings System Explanation

## Overview

This document explains the relationship between the feedback and ratings systems in CitizenRadio, clarifying how `feedback.log` and `ratings.log` are used, and how they interact with MP3 metadata.

## Key Components

### 1. Chat Processing
- Chat messages from the stream are parsed for specific emojis
- Messages with these emojis are considered both feedback and reviews
- The emojis map to a review score (1-5 stars)

### 2. Storage Mechanisms

#### feedback.log
- **Purpose**: Temporary buffer for feedback until enough entries are collected
- **Content**: Contains feedback entries with track path, rating, author, comment, and timestamp
- **Lifecycle**: Entries are removed after processing (when updateThreshold or maxFeedbackPerTrack is reached)
- **Usage**: Acts as a buffer to prevent frequent updates to MP3 files, which could be resource-intensive

#### ratings.log
- **Purpose**: Persistent storage for rating data
- **Content**: Contains average ratings, rating counts, and individual ratings for each track
- **Lifecycle**: Persists between application restarts, with processed ratings being cleared after MP3 metadata is updated
- **Usage**: Provides a historical record of ratings and serves as a fallback if MP3 metadata is not available

#### MP3 Metadata
- **Purpose**: Authoritative storage for track metadata
- **Content**: Contains rating, rating count, sentiment summary, BPM, energy, and mood
- **Lifecycle**: Persists with the MP3 file, making it portable and self-contained
- **Usage**: Provides a portable, self-contained way to store track metadata

## Workflow

1. **Chat Processing**:
   - Chat messages are parsed for specific emojis
   - If an emoji is found, it's mapped to a rating (1-5)
   - The rating is added to both feedback.log and ratings.log

2. **Feedback Processing**:
   - When enough feedback entries are collected for a track (updateThreshold or maxFeedbackPerTrack), they are processed
   - Feedback entries are removed from feedback.log
   - Sentiment analysis is performed on the feedback comments
   - The MP3 metadata is updated with the new rating, rating count, and sentiment summary

3. **Ratings Persistence**:
   - After processing feedback, the processed ratings are cleared from ratings.log
   - Only the most recent 5 ratings are kept for display purposes

4. **Audio Analysis**:
   - Audio files are analyzed to extract BPM, energy, and mood
   - This information is stored in both JSON files and MP3 metadata

## Relationship Between Feedback and Ratings

While `feedback.log` and `ratings.log` may seem redundant, they serve different purposes:

1. `feedback.log` is a temporary buffer for feedback that needs to be processed
2. `ratings.log` is a persistent store for rating data that can be used as a fallback

Both are derived from the same source (chat messages with rating emojis), but they are used differently in the system. The MP3 metadata is the authoritative source for track metadata, with the logs serving as temporary storage and fallback mechanisms.

## Recent Changes

We've recently updated the system to ensure that:

1. BPM, energy, and mood tags are stored in MP3 metadata
2. Review scores are saved to MP3 metadata
3. Sentiment analysis is performed on feedback messages and stored in MP3 metadata

These changes make the MP3 files more portable and self-contained, reducing reliance on external metadata.