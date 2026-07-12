# Sentinel AI

An OSINT workspace for scanning job ads and flyers for signs of human trafficking, forced labor, or cyber-scam recruitment.

Built for NGOs, analysts, and advocacy groups to screen suspicious postings and map recruitment campaigns.

## Features

- **OCR Scanner** — extract text from screenshots or camera captures.
- **Risk Heuristics** — flags common recruitment red flags (upfront fees, passport control, housing compounds, salary anomalies).
- **Translation & Dialect OSINT** — uses Google Gemini to spot translation artifacts and infer recruiter locations.
- **Recruiter Network Mapping** — clusters posts by shared contact handles and text similarity.
- **Decoy Console** — generate synthetic personas and sanitized CVs for safe investigation.
- **STIX 2.1 Export** — share intelligence as standard threat-intel bundles.

## Data & Ethics

All data is synthetic or from publicly available sources — no live operations, no engagement with active networks. The live feed reads only public Telegram web previews (read-only, no accounts or bots); demo content and decoys are fictional. API keys stay in session storage and are never persisted.
