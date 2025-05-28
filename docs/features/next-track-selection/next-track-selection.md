Based on your detailed design, here's a comprehensive description of the **Track Selection Algorithm** in markdown format, integrating everything from exclusion logic to mood matching, track requests, and pattern overrides:

---

````markdown
# 🎛️ Citizen Radio – Next Track Selection System

This document outlines the logic behind Citizen Radio's adaptive and intelligent track selection process. It is designed to maintain variety, respond to listener feedback, follow mood-energy dynamics, and integrate real-time content like requests or DJ commentary.

---

## 🎯 Selection Strategy Summary

- Respect **scheduling patterns** while allowing for **interruptions** (e.g. requests, news).
- Enforce a **Total Exclusion Window** based on:
  - Time since last play
  - Number of recent plays
- Bias toward:
  - Tracks with **fewer plays** (discovery)
  - Tracks with **higher ratings** (popularity)
  - Tracks with **better fit** to current **mood/energy wave**
- Handle **missing metadata gracefully** (e.g. default mood/energy = 5)
- Support **user requests** by dynamically prioritizing specific tracks

---

## 🧠 Metadata Requirements

All track scoring data should come from the MP3 file metadata. The following fields should be present in the MP3 file metadata:

| Field | Type | Purpose |
|-------|------|---------|
| `title` / `artist` | `string` | Display + cooldown logic |
| `genre` | `string[]` | Thematic consistency |
| `mood` | `number` (1–10) | Wave matching |
| `energy` | `number` (1–10) | Wave matching |
| `rating` | `number` (1–5) | Popularity bias |
| `cover art image` | binary | Visual display |

Additional metadata is derived from other sources:
- `playCount` and `lastPlayed` are obtained from the `play.log`
- `type` is determined based on the folder the file is in, using `relPath`
- `isRequested` comes from the RequestManager feature

---

## 🌊 Procedural Mood/Energy Wave

- 2D waveforms generated with random wavelength (10–100 mins)
- One represents target `mood` and the other `energy` levels over time
- Used as a reference to match track properties

So we can have sad but high energy rap songs raging away full of teenage angst
or sad and slow lamenting ballads
or happy and slow wistful joyful ballads
or happy and high energy, high tempo dance tracks or jigs and shanties

We don't want to worry so much about genre as the whole station will have a theme and vibe
so we could be a station dedicated to classical or rap or techo etc as a prefilter to this process

```js
const currentMood = moodWave.getValue(Date.now());
const currentEnergy = energyWave.getValue(Date.now());
````

---

## ⛔ Total Exclusion Filter

Exclude tracks that:

* Were played in the last `X` minutes **OR**
* Appear in the last `Y` entries in the `play.log`

Applies to all content types. because we don't want to play the same dj-talk content or podcast either
and even adverts will be better if we don't keep playing the same one back to back each time

```js
function isTotallyExcluded(track, playLog, config) {
  const timeSince = Date.now() - track.lastPlayed;
  const recentlyPlayed = playLog.slice(-config.recentTrackCount).includes(track.id);
  return timeSince < config.recentTimeWindowMs || recentlyPlayed;
}
```

If this filter results in no available tracks, the system will fall back to using the full track list, ignoring the exclusion filter.

---

## ⚖️ Scoring Formula

Tracks that pass the exclusion filter are scored using:

```js
function scoreTrack(track) {
  const ratingScore = normalize(track.averageRating || 3);      // 0–1
  const frequencyScore = 1 - (track.playCount / maxPlaysSeen);       // 0–1
  const moodFit = 1 - Math.abs((track.mood || 5) - currentMood) / 10;
  const energyFit = 1 - Math.abs((track.energy || 5) - currentEnergy) / 10;
  const waveFit = (moodFit + energyFit) / 2;

  let baseScore = (ratingScore * 0.4) + (frequencyScore * 0.3) + (waveFit * 0.3);

  if (track.isRequested) baseScore += 1.5; // strong boost for requested tracks

  return baseScore;
}
```

---

## 🎲 Weighted Selection (Raffle)

Once all scores are computed:

* Normalize them into weights
* Use a weighted random draw to ensure probabilistic variety

```js
function pickWeighted(tracks) {
  const totalWeight = tracks.reduce((sum, t) => sum + t.score, 0);
  let pick = Math.random() * totalWeight;

  for (const track of tracks) {
    if (pick < track.score) return track;
    pick -= track.score;
  }
}
```

---

## 🗓️ Schedule-Driven Context

Tracks are selected based on the next content type in the schedule:

```json
"schedule": {
  "defaultPattern": [
    "intro", "segway", "music", "segway", "music", "ad", 
    "music", "dj", "segway", "music", "segway", "music", 
    "ad", "music"
  ]
}
```

* This is treated as a **generative grammar** for audio slots.
* Schedule can be temporarily overridden by **urgent content**:

    * Breaking news
    * High-priority requests
    * In-universe events

---

## 🚨 Pattern Deviation

When priority content is present:

* Defer pattern continuation
* Inject request or breaking segment
* Resume schedule where appropriate

```js
if (priorityTrack) {
  return priorityTrack;
} else {
  return pickNextByPattern(scheduleSlot);
}
```

---

## 🧪 Future Enhancements

* Real-time mood shift triggers (based on DJ input or story events)
* Audience-driven wave modulation (e.g. based on comment sentiment)
* Auto-curation daemon to manage the in-rotation pool

---

```

Would you like this structured as code comments inside your current logic, or turned into an actual implementation in JS/Node?
```
