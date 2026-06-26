# Implementation Plan: Implement Sentinel AI Homepage

We will implement a premium landing page/dashboard as the home view (`/`) for Sentinel AI, and move the existing ingestion scanner to `/scanner`.

---

## Proposed Changes

### 1. New Component: `HomeView.jsx`
#### [NEW] [HomeView.jsx](file:///Users/remixcube/Developer/jobScanner/src/pages/HomeView.jsx)
* **Goal:** A beautiful, responsive home dashboard that introduces Sentinel AI, showcases real-time telemetry stats, outlines the "Do No Harm" victim protection framework, and provides entry points to key modules.
* **Key Sections:**
  * **Hero Header:** Cyber-ops title banner with glowing glow effects.
  * **Interactive Stat Widgets:** Counters showing fake operational statistics (Scans Analysed, Active Hubs, Avg Threat Index).
  * **Safety & Do No Harm Board:** Highlights local data storage, automatic EXIF stripping, and human-in-the-loop compliance.
  * **Track Navigation Cards:** Quick-link paths to Scanner, Threat DB, and Decoy Engagement.
  * **Terminal Log Simulator:** Real-time logging console animation.

---

### 2. Main App Router Adjustments
#### [MODIFY] [App.jsx](file:///Users/remixcube/Developer/jobScanner/src/App.jsx)
* Update router pathing:
  * Route `/` ➔ `HomeView`
  * Route `/scanner` ➔ `ScannerView`
* Update sidebar and bottom navigation links:
  * Add a **"Home"** tab pointing to `/` (using `Home` icon from Lucide).
  * Update **"Scanner"** tab to point to `/scanner` (instead of `/`).
  * Ensure the active class highlights function properly.

---

## Verification Plan

### Automated Build Validation
* Run npm build or check for lint errors to verify syntax validity:
  ```bash
  npm run build
  ```

### Manual Verification
* Access the main route `/` to verify the Home page loading.
* Navigate to `/scanner` and verify that the Ingestion Terminal functions as expected.
* Expand/collapse widgets, verify navigation, and ensure mobile layouts work.
