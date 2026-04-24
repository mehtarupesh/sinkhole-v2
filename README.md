# 1 burrow

This is a PWA (Progressive Web App) that allows you to quickly store snippets, passwords, files (screenshots, images, pdfs, etc.), and links with contextual notes.
It can be accessed from any device with a web browser (mobile or desktop)
It can be installed on mobile so it can be a share target

## Goals
- Easily available on mobile and desktop.
- Private, on-device
- Quick Context Share
    - Users can fire and forget data + context.
- Quick Personalized Access
    - Data is arranged for fast access.
- Using AI (Gemini key from users personal Google account)
  - Auto categorization of data based on content and context.
  - Ability to chat further into a category
- Limited data storage. We encourage users to delete data which has not been accessed for a long time.
  - Goal is to keep users current mental load in the app trimmed down.
- 0 notifications when app is closed. User should not be bothered unless they decide to check the app.

## How it works
- The app is a valid share target, so data can be shared from other apps to the app. This is primary source of data for the app.
  - User shares data, provides context (audio preferred, but text is also supported), and the app transcribes + auto categorizes the data and stores it.
- When user wants to access data, they browse through categories and generate summaries OR chat with the data.

## Data Storage and Sync
Data is stored in IndexedDB in the browser.
It can be exported to a file and imported back in a different device
