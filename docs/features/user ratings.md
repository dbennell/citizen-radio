
# 📻 Citizen Radio – User Ratings System

## Overview

The User Ratings system introduces interactive audience engagement to **Citizen Radio** by capturing listener feedback through **YouTube comments**. This feedback is used to influence the automated track selection algorithm via a **weighted raffle system**, ensuring audience favorites are featured more often while still preserving diversity and discovery.

This feature supports the immersive, in-universe experience by giving listeners a subtle but meaningful way to shape the playlist and trigger AI DJ responses.

---

## 🎯 Core Goals

- Create a seamless feedback loop between listeners and the station
- Influence track selection without sacrificing variety or fairness
- Preserve modularity, maintainability, and existing anti-repetition logic

---

## 📡 Functionality

### 1. YouTube Comment Monitoring

- Uses the **YouTube Data API** with OAuth2 to fetch **live comments**
- Parses comments for rating-related **emojis** at specific timestamps
- Matches ratings to the **currently playing track**
- Filters noise and spam, ensuring feedback quality
- Stores feedback in a **persistent rating database**

---

### 2. Rating Scale & Emojis

**5-Star Rating System with Emoji Recognition:**

| Rating | Emojis | Meaning                    |
|--------|--------|----------------------------|
| ⭐ 1    | 🔇😡🤬🤡 | Strong negative reaction     |
| ⭐ 2    | 👎      | Dislike                    |
| ⭐ 3    | 🫳      | Neutral / Meh              |
| ⭐ 4    | 👍      | Like                       |
| ⭐ 5    | ❤️😍🥰🤩 | Strong positive reaction     |

Unrated content defaults to 3 stars (neutral) unless specified otherwise.

---

## ⚙️ Selection Logic: Weighted Raffle System

The track selection pipeline is enhanced with **rating-based weighting**, applied **after** filtering for anti-repetition and least-played heuristics.

### Track Selection Pipeline:

```text
1. Filter out recently played tracks
2. Prioritize never-played tracks
3. Sort by least-played/least-recently-played
4. Select candidate pool (e.g. 50% of remaining tracks)
5. Perform weighted raffle:
   - Assign raffle tickets based on star rating
   - Randomly draw from ticket pool
````

### Raffle Ticket Allocation

Each rating adds a corresponding number of raffle "tickets" to the pool. For example:

| Stars | Tickets |
| ----- | ------- |
| ⭐ 1   | 1       |
| ⭐ 3   | 3       |
| ⭐ 5   | 5       |

Even poorly rated or unrated tracks get a chance to play, preserving playlist diversity.

---

## 🧠 `ratingManager.js` – New Module

Core functions:

```javascript
captureYouTubeComments()     // Polls YouTube API for new comments
parseRatingFromComment()     // Extracts rating emoji and timestamp
matchRatingToTrack()         // Associates rating with currently playing track
updateTrackRating()          // Updates rating data
getRatingForTrack()          // Retrieves rating for a given track
getTicketsForTrack()         // Converts rating to raffle tickets
loadRatings()                // Loads ratings from disk
saveRatings()                // Persists ratings to disk
```

Ratings are stored in `ratings.json`.

### Storage Format Example

```json
{
  "music/track1.mp3": {
    "averageRating": 4.2,
    "ratingCount": 15,
    "lastUpdated": "2025-05-23T14:32:18Z",
    "ratings": [
      { "value": 5, "timestamp": "2025-05-22T12:45:22Z" },
      { "value": 4, "timestamp": "2025-05-22T13:12:09Z" }
    ]
  }
}
```

---

## 🎵 `trackManager.js` Modifications

New weighted raffle logic:

```javascript
function performWeightedSelection(candidates) {
    if (!STATION_CONFIG.ratingSystem?.enabled) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    const candidatesWithRatings = candidates.map(candidate => {
        const rating = getRatingForTrack(candidate.rel) || STATION_CONFIG.ratingSystem.defaultRating;
        return {
            ...candidate,
            tickets: STATION_CONFIG.ratingSystem.customWeights[rating] || STATION_CONFIG.ratingSystem.defaultRating
        };
    });

    const rafflePool = [];
    for (const candidate of candidatesWithRatings) {
        for (let i = 0; i < candidate.tickets; i++) {
            rafflePool.push(candidate);
        }
    }

    return rafflePool[Math.floor(Math.random() * rafflePool.length)];
}
```

---

## 🎤 DJ Interaction (via `promptProcessor.js`)

* AI-generated commentary based on recent track ratings
* Example behaviors:

   * Praise popular tracks
   * Joke about disliked tracks
   * Trigger fan-favorite segments ("Top Rated", "Audience Pick")

---

## 📊 Rating Dashboard (Optional Future)

A web UI to:

* Visualize rating trends
* Inspect per-track engagement
* Manually edit or override ratings
* Explore predictive analytics on user behavior

---

## 🔁 Config (`station.json`)

```json
"ratingSystem": {
  "enabled": true,
  "defaultRating": 3,
  "minTickets": 1,
  "maxTickets": 5,
  "customWeights": {
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5
  },
  "commentPollInterval": 30,
  "ratingPersistence": true,
  "displayOnStream": true
}
```

---

## 🧪 Example Raffle Scenario

Given these ratings:

* Track A: ⭐⭐⭐⭐⭐ → 5 tickets
* Track B: ⭐⭐⭐⭐ → 4 tickets
* Track I: ⭐ → 1 ticket
* Track J: (unrated) → 3 tickets

The raffle pool might have 30 tickets total, with Track A having a 16.7% chance to be picked, and Track I only 3.3%—still possible, but far less likely.

---

## 🚧 Implementation Plan

### Phase 1 – Core Rating Capture

* YouTube API integration & comment parsing
* `ratings.json` storage format
* Track matching logic

### Phase 2 – Selection Integration

* Weighted raffle logic
* Track manager refactor
* Playback testing

### Phase 3 – Engagement Features

* DJ response generation
* UI rating display
* Advanced analytics (optional)

---

## 🔐 Technical Considerations

* **API Rate Limits**: Use exponential backoff
* **Comment Volume**: Batch parse and cache
* **Anti-Spam Measures**: Emoji thresholds, per-user limits
* **Stream Delay**: Allow timestamp tolerance windows
* **Fairness**: All tracks must eventually play (unless blacklisted)

---

## ✅ Conclusion

The **User Ratings System** with **Weighted Raffle Selection** brings community interaction to Citizen Radio without compromising its autonomous nature. By allowing listeners to shape the station through feedback, we introduce emotional investment, variety, and dynamic programming—all aligned with the immersive spirit of a living, in-universe broadcast.

```

---

Let me know if you'd like this saved into a file or pushed into a documentation repo.
```
