# AGENT.md — Project Specification for "Trillion"

## Identity & Purpose
- **Name:** Trillion
- **Purpose:** A dependable, voice-first personal AI assistant built to help with math tutor queries, task management, and interactive assistance.
- **Audience:** Single user.
- **Personality & Tone:** Warm, plain-spoken, clear, and brief.

## Core Capabilities (Tier 2 First Tools)
1. **Task & Reminder Management:** Create, list, and track reminders and tasks.
2. **Notes & Math Knowledge Base:** Query notes, syllabus guide (ZIMSEC & general math), and step-by-step problem details.
3. **Message Drafting:** Draft structured notes, responses, and messages.

## Tech Stack & Architecture
- **Language & Runtime:** Node.js (JavaScript / ES Modules)
- **Model Provider (Brain & STT):** Google Gemini (`gemini-3.5-flash` / `gemini-3.5-flash-lite`)
- **Voice Synthesis (TTS):** Google Gemini Native Voice Generation (e.g. Fenrir voice profile), fully bypassing third-party services like ElevenLabs.
- **Execution Host:** Local laptop execution with zero external server dependencies required for initial operation.

## Voice & Interaction Boundaries
- **Interaction Mode:** Text-first conversation loop (Tier 1 & 2), escalating to push-to-talk voice (Tier 3).
- **Hard Safety Gate (Never without confirmation):** 
  - Sending external messages
  - Deleting data or memory entries
  - Spending money
  - Changing system/application configuration settings
- **Proactivity:** Heartbeat-driven background checks (Tier 5), quiet by default (surfaces notices only when noteworthy).

## System Architecture Tiers
- **Tier 1:** Text conversation loop (The Brain)
- **Tier 2:** Tool registry & execution seam (The Hands)
- **Tier 3:** Push-to-Talk Speech-to-Text & Text-to-Speech via Gemini (The Ears & Mouth)
- **Tier 4:** Persistent key-value & factual memory across restarts (The Memory)
- **Tier 5:** Background scheduler & proactive notice inbox (The Heartbeat)
- **Tier 6:** Confirmation safety gates, audit logging, & kill switch (The Rails)
