import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase, mapRecordToDb } from '../utils/supabaseClient';
import { analyzeJobPosting } from '../services/geminiService';
import { calculateRiskScore, getRiskLevel } from '../utils/scoring';
import { getActiveApiKey } from '../utils/apiKey';
import { TELEGRAM_SNAPSHOT } from '../data/telegramSnapshot';

// ─────────────────────────────────────────────────────────────────────────────
// useTelegramFeed — live ingestion engine for PUBLIC Telegram channels.
//
// Polls the `telegram-feed` edge function (which reads the t.me/s/<channel>
// public web preview — no credentials, read-only), diffs against a per-channel
// cursor, and runs each unseen post through the exact pipeline manual scans
// use: analyzeJobPosting → calculateRiskScore → insert into `scans`.
//
// Feed records are tagged so the Audit Registry can tell them apart:
//   ingestionMethod 'Telegram Live Feed', batchId `tgfeed_<channel>` — each
//   channel becomes its own collapsible registry folder.
//
// If the edge function is unreachable, a build-time snapshot of the same
// channels keeps the feed (and the demo) alive.
// ─────────────────────────────────────────────────────────────────────────────

const CHANNELS_KEY = 'tg_feed_channels_v1';
const CURSOR_KEY = (ch) => `tg_feed_cursor_${ch}`;
const POLL_MS = 45_000;
const MAX_POSTS_PER_TICK = 8;   // bound Gemini spend per poll
const SCAN_GAP_MS = 6000;       // same pacing as the CSV batch pipeline

const DEFAULT_CHANNELS = [
  { username: 'workinuae', title: 'Work in UAE 🇦🇪', active: true },
  { username: 'thailandjobforindians', title: 'Thailand jobs', active: true },
];

const loadChannels = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(CHANNELS_KEY) || 'null');
    if (Array.isArray(raw) && raw.length) return raw;
  } catch { /* fall through */ }
  return DEFAULT_CHANNELS;
};

const getCursor = (ch) => Number(localStorage.getItem(CURSOR_KEY(ch))) || 0;
const setCursor = (ch, id) => localStorage.setItem(CURSOR_KEY(ch), String(id));

export default function useTelegramFeed({ user, profile }) {
  const [channels, setChannels] = useState(loadChannels);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ screened: 0, flagged: 0 });
  const [lastPollAt, setLastPollAt] = useState(null);
  const [usingSnapshot, setUsingSnapshot] = useState(false);
  const [latestPost, setLatestPost] = useState(null);

  const timerRef = useRef(null);
  const busyRef = useRef(false);
  const runningRef = useRef(false);
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const addLog = useCallback((type, message) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-120), { time, type, message }]);
  }, []);

  const persistChannels = useCallback((next) => {
    setChannels(next);
    localStorage.setItem(CHANNELS_KEY, JSON.stringify(next));
  }, []);

  // ── Fetch recent posts for one channel: live edge first, snapshot fallback ──
  const fetchPosts = useCallback(async (username, after) => {
    try {
      const { data, error } = await supabase.functions.invoke('telegram-feed', {
        body: { channel: username, after },
      });
      if (error) throw new Error(error.message || 'edge unreachable');
      if (data?.error) throw new Error(data.error.message);
      setUsingSnapshot(false);
      return { posts: data.posts || [], title: data.title, live: true };
    } catch (err) {
      const snap = (TELEGRAM_SNAPSHOT[username] || []).filter(p => p.id > after);
      if (snap.length || TELEGRAM_SNAPSHOT[username]) {
        setUsingSnapshot(true);
        return { posts: snap, title: username, live: false };
      }
      throw err;
    }
  }, []);

  // ── Validate + preview a channel before adding it ───────────────────────────
  const addChannel = useCallback(async (rawUsername) => {
    const username = rawUsername.replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9_]{4,32}$/.test(username)) {
      throw new Error('Invalid channel username');
    }
    if (channelsRef.current.some(c => c.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('Channel already in the watch list');
    }
    const { data, error } = await supabase.functions.invoke('telegram-feed', {
      body: { channel: username },
    });
    if (error) throw new Error(error.message || 'Could not reach the ingestion service');
    if (data?.error) throw new Error(data.error.message);
    if (!data.posts?.length) throw new Error('Channel is readable but has no text posts');
    persistChannels([...channelsRef.current, { username, title: data.title || username, active: true }]);
    return { title: data.title, latest: data.posts[data.posts.length - 1] };
  }, [persistChannels]);

  const toggleChannel = useCallback((username) => {
    persistChannels(channelsRef.current.map(c =>
      c.username === username ? { ...c, active: !c.active } : c
    ));
  }, [persistChannels]);

  const removeChannel = useCallback((username) => {
    persistChannels(channelsRef.current.filter(c => c.username !== username));
  }, [persistChannels]);

  // ── Scan one post through the standard pipeline ─────────────────────────────
  const scanPost = useCallback(async (channel, post) => {
    const apiKey = getActiveApiKey();
    if (!apiKey) throw Object.assign(new Error('Gemini API key missing — configure it before monitoring.'), { fatal: true });
    const modelName = profile?.gemini_model || localStorage.getItem('gemini_model');

    // Same duplicate guard as the CSV batch: never pay twice for one ad.
    try {
      const { data: dup } = await supabase
        .from('scans').select('id')
        .eq('original_text', post.text)
        .limit(1);
      if (dup && dup.length > 0) return { skipped: true };
    } catch { /* non-fatal — proceed to scan */ }

    const result = await analyzeJobPosting(apiKey, modelName, { text: post.text });
    const activeFlags = result.detected_red_flags || [];
    const scoreResult = calculateRiskScore(activeFlags, {
      parsedSalaryUsd: result.parsed_salary_usd,
      locationCountry: result.location_country,
      detectedLanguage: result.detected_language,
      contactMethod: result.contact_method,
      suspiciousSpans: result.suspicious_spans || [],
      predictedPlaybook: result.predicted_playbook || [],
      obfuscationLevel: null,
      sourcePlatform: 'Telegram',
      employer: result.employer_identity,
    });
    const score = scoreResult.score;
    const level = getRiskLevel(score);

    const record = {
      timestamp: post.date ? new Date(post.date).getTime() || Date.now() : Date.now(),
      jobTitle: result.job_title || `Post #${post.id}`,
      employer: result.employer_identity || 'Unknown Employer',
      riskScore: score,
      riskLevel: level.label,
      extractedData: {
        job_title: result.job_title || '',
        employer_identity: result.employer_identity || '',
        salary_range: result.salary_range || '',
        location: result.location || '',
        industry: result.industry || '',
        contact_method: result.contact_method || '',
        suspicious_spans: result.suspicious_spans || [],
        predicted_playbook: result.predicted_playbook || [],
      },
      activeFlags,
      originalImage: null,
      originalText: post.text,
      ocrText: result.raw_ocr_text || null,
      aiReview: result.ai_review || '',
      parsedSalaryUsd: result.parsed_salary_usd || null,
      locationCountry: result.location_country || null,
      detectedLanguage: result.detected_language || 'English',
      isTranslated: result.is_translated || false,
      translatedText: result.translated_text || null,
      batchId: `tgfeed_${channel}`,
      batchName: `📡 @${channel} — Live Feed`,
      userId: user?.id || null,
      normalizedText: result.normalized_text || '',
      sourcePlatform: 'Telegram',
      sourceUrl: post.link,
      ingestionMethod: 'Telegram Live Feed',
      postDate: post.date || 'unspecified',
    };

    const { error: dbErr } = await supabase.from('scans').insert(mapRecordToDb(record));
    if (dbErr) throw dbErr;
    return { score, level: level.label, flags: activeFlags, title: record.jobTitle };
  }, [user, profile]);

  // ── One polling pass over all active channels ───────────────────────────────
  const tick = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      for (const ch of channelsRef.current.filter(c => c.active)) {
        if (!runningRef.current) break;
        const after = getCursor(ch.username);
        let fetched;
        try {
          fetched = await fetchPosts(ch.username, after);
        } catch (err) {
          addLog('error', `@${ch.username}: feed unreachable (${err.message})`);
          continue;
        }
        if (!fetched.live) addLog('info', `@${ch.username}: live feed unreachable — replaying bundled snapshot.`);
        if (fetched.posts.length === 0) {
          addLog('info', `✔ @${ch.username}: up to date.`);
          continue;
        }

        addLog('info', `@${ch.username}: ${fetched.posts.length} new post${fetched.posts.length > 1 ? 's' : ''} — screening…`);
        const sortedPosts = [...fetched.posts].sort((a, b) => b.id - a.id);
        const batch = sortedPosts.slice(0, MAX_POSTS_PER_TICK);

        for (const post of batch) {
          if (!runningRef.current) break;
          try {
            const res = await scanPost(ch.username, post);
            const currentCursor = getCursor(ch.username);
            if (post.id > currentCursor) {
              setCursor(ch.username, post.id);
            }
            if (res.skipped) {
              addLog('info', `➜ @${ch.username}/#${post.id} already in registry — skipped.`);
            } else {
              const flagged = res.score >= 60;
              setStats(s => ({ screened: s.screened + 1, flagged: s.flagged + (flagged ? 1 : 0) }));
              addLog(flagged ? 'flag' : 'success',
                `${flagged ? '⚠ FLAGGED' : '✔ CLEARED'} — "${(res.title || '').slice(0, 55)}" · ${res.score}%${flagged && res.flags.length ? ' · ' + res.flags.slice(0, 3).join(', ') : ''}`);
              setLatestPost({
                channel: ch.username,
                title: res.title,
                text: post.text,
                score: res.score,
                flagged,
                timestamp: post.date ? new Date(post.date).getTime() : Date.now()
              });
            }
          } catch (err) {
            if (err.fatal) {
              addLog('error', err.message);
              runningRef.current = false;
              setRunning(false);
              return;
            }
            addLog('error', `✘ @${ch.username}/#${post.id}: ${err.message}`);
            const currentCursor = getCursor(ch.username);
            if (post.id > currentCursor) {
              setCursor(ch.username, post.id); // don't wedge the queue on a bad post
            }
          }
          await new Promise(r => setTimeout(r, SCAN_GAP_MS));
        }
      }
      setLastPollAt(Date.now());
    } finally {
      busyRef.current = false;
    }
  }, [addLog, fetchPosts, scanPost]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    addLog('info', 'Monitoring started — polling public channel previews every 45s.');
    tick();
    timerRef.current = setInterval(tick, POLL_MS);
  }, [tick, addLog]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    clearInterval(timerRef.current);
    addLog('info', 'Monitoring paused.');
  }, [addLog]);

  // Rewind cursors so a demo can re-screen the whole feed from the top.
  const resetCursors = useCallback(() => {
    channelsRef.current.forEach(c => localStorage.removeItem(CURSOR_KEY(c.username)));
    setStats({ screened: 0, flagged: 0 });
    setLatestPost(null);
    addLog('info', 'Cursors reset — next poll re-screens from the oldest visible post.');
  }, [addLog]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  return {
    channels, running, logs, stats, lastPollAt, usingSnapshot, latestPost,
    start, stop, addChannel, toggleChannel, removeChannel, resetCursors,
  };
}
