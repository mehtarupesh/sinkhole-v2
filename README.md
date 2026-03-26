# 1 burrow

This is a PWA (Progressive Web App) that allows you to quickly store snippets, passwords, files (screenshots, images, pdfs, etc.), and links with contextual notes.
It can be accessed from any device with a web browser (mobile or desktop), and 2 devices can be connected to each other to sync the data.

## Goals
- Easily available on mobile and desktop.
- Private
- Quick Context Share, Quick Personalized Access
- Auto categorization of data based on content and context.
- 0 notifications. User should not be bothered unless they decide to check the app.

## How it works

- User opens app and presented with categories of data presented in carousels. Lets call these data as Units of information.
- The app is a valid share target, so data can be shared from other apps to the app. This is primary source of data for the app.
  - User shares data, provides context (audio preferred, but text is also supported), and the app transcribes + auto categorizes the data and stores it.
- When user wants to access data, they browse through categories or search for specific data.

## Data Storage and Sync
Data is stored in IndexedDB in the browser.
It can be exported to a file and imported back.
It can be synced between devices using PeerJS.
