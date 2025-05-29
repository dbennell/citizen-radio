
# 👩‍💻 Citizen Radio – Contributor Guide

Welcome to the **Citizen Radio** development community! We’re glad you’re here. Whether you’re fixing a bug, improving a feature, or adding something entirely new, this guide will help you contribute effectively while keeping the project stable, fun, and forward-thinking.

---

## 🛠️ Contribution Types

### 🐞 1. Bug Fixes

**What you need to do:**

* **Open an issue first**, if one doesn’t exist, to describe the bug and steps to reproduce it.
* Fix the bug in a clear and focused way.
* Make sure your code follows the style and structure of the existing codebase.
* Add a short comment to your pull request referencing the bug (e.g. `Fixes #42`).
* If applicable, include a simple test or manual verification note.

> ✅ Keep it simple! This is a community project—no red tape here.

---

### ✨ 2. Small Improvements & Enhancements

Examples:

* Improving voice output settings
* Refactoring a function for readability
* Tweaking playback timing logic

**What you need to do:**

* Make the change with minimal disruption to other systems.
* Test manually to confirm it works.
* In your PR:

    * Explain what was improved
    * Mention if any modules were impacted
    * Keep it self-contained

**Optionally** you can also add a new doc in `/docs/changes/` just explaining what you changed and why, expanding on your PR comment if that does not already cover it all

> ℹ️ These changes are easy to roll back—just keep them clean and explain your reasoning.

---

### 🚀 3. New Features

This is where we ask for a bit more planning. Why? To keep the project modular, maintainable, and avoid feature creep.

#### Step 1: Create a Feature Outline

Add a new Markdown file to `/docs/features/` like:
`/docs/features/feature-name.md`

Include:

* **What is this feature?**
* **Why do we want it?**
* **Who is it for?**
* **How would we use it?**

#### Step 2: Write an Implementation Plan

Include this in the same doc (or a second file):

* **What parts of the codebase will be affected?**
* **Will it integrate with other features?**
* **What changes or files will be introduced?**
* **Are there any risks or breaking changes?**

#### Step 3: Add Feature Flag to Config

* Add an `enabled: false` flag under the appropriate section in `default.json`.
* Provide sensible default settings—do not require manual setup to use the feature safely.
* Do not auto-enable the feature unless specifically approved.

> Example:

```json
"myCoolFeature": {
  "enabled": false,
  "settingA": 42,
  "settingB": "default"
}
```

#### Step 4: Testing Strategy

Include a test plan with your PR:

* What tests were added or modified?
* Manual testing notes if no automated test is required
* Mention any known edge cases or limitations

> ✅ Citizen Radio has a test suite, but for now: thoughtful manual tests are totally fine.

#### Step 5: Add a User Guide

Every new feature should have a **user-facing guide** explaining how to use it. Add this to:

`/docs/features/feature-name-user-guide.md`

Make sure it includes:

* How to enable it in the config
* What the feature does
* Example usage or scenarios

We’ll link these from the main README or system summary.

---

## 🧪 Code Style & Standards

* Follow existing naming and modular structure
* Avoid hard-coded values—use config with defaults
* Keep things self-contained when possible
* Comment your logic if it's not immediately obvious

---

## 📥 Submitting Your Pull Request

1. Fork the repo and create your feature branch:
   `git checkout -b feature/my-cool-change`

2. Commit clearly:
   `git commit -m "Add customizable segway fade option"`

3. Push and create a pull request.

Make sure your PR description includes:

* ✅ Type of change (bug, improvement, feature)
* 📄 Link to relevant docs in `/docs/features/`
* 🔍 Summary of testing or usage verification

---

## 💬 Support & Feedback

If you’re unsure about something, open a [GitHub issue](https://github.com/) or drop a question in the community discussion thread. This is a fun, creative project, and we want to keep it collaborative and welcoming.

---

## 🧭 Quick Checklist

| Step                   | Bugfix | Enhancement | Feature |
| ---------------------- | ------ | ----------- | ------- |
| Open issue if needed   | ✅      | Optional    | ✅       |
| Write a feature doc    | ❌      | ❌           | ✅       |
| Code the change        | ✅      | ✅           | ✅       |
| Add a config flag      | ❌      | Optional    | ✅       |
| Test and verify        | ✅      | ✅           | ✅       |
| Add user guide         | ❌      | Optional    | ✅       |
| Submit PR with context | ✅      | ✅           | ✅       |

---

Thank you for helping build **Citizen Radio**—a creative experiment in worldbuilding, immersion, and AI-powered storytelling. We can’t wait to hear what you bring to the airwaves. 🎙️

---

Would you like this turned into a Markdown file for easy dropping into your repo?
