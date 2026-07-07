# Sentinel AI - Reviewer Walkthrough Guide

Welcome to the **Sentinel AI** workspace! This guide is designed to help hackathon judges and technical reviewers explore the core features and architectural decisions implemented in the platform.

---

## 🚀 Recommended Evaluation Path

### 1. Ingestion & Analysis (The Scanner)
* Navigate to the **Scanner** page.
* Upload a sample job posting flyer screenshot or paste recruitment text.
* The system performs Optical Character Recognition (OCR), translates non-English text to English, and evaluates 24 risk indicators (like housing isolation, passport control, and upfront fee requests) in real-time.
* Once the scan finishes, click **Review Scan** to view the granular analysis, risk breakdown chart, and predicted playbook stages.

### 2. Recruiter Networks (Audit Registry & Connections Graph)
* Navigate to the **Audit Registry** (previously threat database) to view all ingested scans.
* Switch to the **Connections Graph** view to inspect clustered recruiter handles. Sentinel AI uses Jaccard similarity algorithms to link isolated ads sharing identical Telegram handles, WhatsApp numbers, or keywords, mapping organized recruiter hubs.

### 3. Investigation Safeguards (Decoy Persona CV Builder)
* On the dashboard, select any recruiter profile to view their risk dossier.
* Under the **Decoy CV Generator**, generate a synthetic candidate profile matching the language and background parameters targeted by the recruiter.
* Download the generated PDF CV. Sentinel AI automatically strips all EXIF metadata (geographic logs, camera details) to prevent recruiter counters-OSINT tracking of threat analysts.

---

## 🛡️ Key Safety & Ethics Implementation

In alignment with **UN Do No Harm Guidelines**, the following safeguards were audited and implemented:

* **Trauma-Informed Design**: Terminology throughout the app has been audited to remove alarmist language. User-facing labels refer to "Audit Registry" (instead of "threat database") and "affected workers" (instead of "victims") to maintain a supportive OSINT registry context.
* **Session-Bound Key Storage**: Gemini API keys are held strictly in browser `SessionStorage`. They are destroyed immediately upon closing the tab, preventing persistent local cache extraction.
* **Print Output Sanitization**: The printable warning poster generator escapes all raw OCR strings and model outputs using HTML entity character encoders to prevent XSS execution inside the browser scope.
