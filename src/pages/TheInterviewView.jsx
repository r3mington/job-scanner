import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, DoorOpen, Phone, Info, X, Globe2, ShieldCheck, Eye, Sparkles } from 'lucide-react';
import { translateInterviewLines } from '../services/geminiService';
import { getActiveApiKey } from '../utils/apiKey';

// ─── Do No Harm note ──────────────────────────────────────────────────────────
// This piece depicts NO real person. Recruiter lines are composites of documented
// recruitment patterns. The viewer chooses among ordinary, reasonable replies —
// there is no "wrong" answer and no path depicts harm. Every reasonable choice
// leads toward the doorway; the only real exit is "leave the conversation," which
// is offered at every step and always honored. Nothing beyond the threshold is
// ever shown.
//
// The ambient multilingual layer renders the SAME lure the viewer is reading, in
// the languages of the Southeast Asia corridor — the message has no home tongue;
// it runs everywhere at once. Translations are generated live by the same model
// that powers the scanner, with a curated fallback so the piece never breaks and
// never renders these languages as meaningless ornament.

// ─── Technique tags (muted, calm colors — color-codes the decode captions) ────
const TAGS = {
  rapport:   { label: 'Building trust', color: '#5DCAA5', bg: 'rgba(93,202,165,0.12)',  border: 'rgba(93,202,165,0.40)' },
  offer:     { label: 'The offer',      color: '#EF9F27', bg: 'rgba(239,159,39,0.12)',  border: 'rgba(239,159,39,0.40)' },
  control:   { label: 'Who holds what', color: '#AFA9EC', bg: 'rgba(175,169,236,0.14)', border: 'rgba(175,169,236,0.45)' },
  urgency:   { label: 'Urgency',        color: '#F0997B', bg: 'rgba(240,153,123,0.12)', border: 'rgba(240,153,123,0.40)' },
  isolation: { label: 'Moving private', color: '#85B7EB', bg: 'rgba(133,183,235,0.12)', border: 'rgba(133,183,235,0.40)' },
};

// ─── Corridor languages for the ambient layer ─────────────────────────────────
const LANGS = [
  { code: 'km', name: 'Khmer',      font: "'Noto Sans Khmer', sans-serif" },
  { code: 'my', name: 'Burmese',    font: "'Noto Sans Myanmar', sans-serif" },
  { code: 'th', name: 'Thai',       font: "'Noto Sans Thai', sans-serif" },
  { code: 'vi', name: 'Vietnamese', font: "inherit" },
  { code: 'zh', name: 'Chinese',    font: "'Noto Sans SC', sans-serif" },
  { code: 'en', name: 'English',    font: "inherit" },
];

// The lure lines (index-aligned across every language). These plain English
// versions are also what gets sent to the model for live translation.
const LURES = [
  "I saw you might be open to new work. We're hiring right now.",
  "Online customer support. Nothing complicated — no experience needed.",
  "Pay is $2,500 a month. Accommodation and meals included.",
  "The office is abroad. Don't worry — we arrange your flight and visa.",
  "Spots are filling quickly. Could you confirm today?",
  "Let's continue on Telegram — it's easier. I'll send a link.",
  "You've made a great choice. Talk soon.",
];

// Curated fallback translations (index-aligned to LURES). Used when no API key
// is configured or a live translation call fails — so the piece always renders.
const CURATED = {
  en: LURES,
  km: [
    "ខ្ញុំឃើញថាអ្នកប្រហែលកំពុងរកការងារថ្មី។ យើងកំពុងជ្រើសរើសបុគ្គលិកឥឡូវនេះ។",
    "សេវាបម្រើអតិថិជនតាមអ៊ីនធឺណិត។ ងាយស្រួល មិនត្រូវការបទពិសោធន៍ទេ។",
    "ប្រាក់ខែ ២,៥០០ ដុល្លារក្នុងមួយខែ។ មានកន្លែងស្នាក់នៅ និងអាហារ។",
    "ការិយាល័យនៅបរទេស។ កុំបារម្ភ យើងរៀបចំសំបុត្រយន្តហោះ និងទិដ្ឋាការឱ្យ។",
    "កន្លែងទំនេរជិតអស់ហើយ។ តើអ្នកអាចបញ្ជាក់ថ្ងៃនេះបានទេ?",
    "តោះបន្តនៅលើ Telegram វាងាយស្រួលជាង។ ខ្ញុំនឹងផ្ញើតំណ។",
    "អ្នកបានធ្វើការសម្រេចចិត្តល្អ។ ជួបគ្នាឆាប់ៗ។",
  ],
  my: [
    "သင်အလုပ်အသစ်ရှာနေတာ တွေ့လိုက်တယ်။ ကျွန်တော်တို့ အခုပဲ ဝန်ထမ်းခေါ်နေပါတယ်။",
    "အွန်လိုင်း ဖောက်သည်ဝန်ဆောင်မှု။ လွယ်ကူတယ်၊ အတွေ့အကြုံ မလိုပါဘူး။",
    "လစာ တစ်လ ၂,၅၀၀ ဒေါ်လာ။ နေစရာနဲ့ အစားအစာ ပါဝင်ပါတယ်။",
    "ရုံးက ပြည်ပမှာ ရှိတယ်။ စိတ်မပူပါနဲ့၊ လေယာဉ်လက်မှတ်နဲ့ ဗီဇာ စီစဉ်ပေးပါမယ်။",
    "နေရာတွေ မြန်မြန် ပြည့်နေပြီ။ ဒီနေ့ အတည်ပြုနိုင်မလား?",
    "Telegram မှာ ဆက်ပြောရအောင်၊ ပိုလွယ်တယ်။ လင့်ခ် ပို့ပေးမယ်။",
    "ကောင်းတဲ့ ဆုံးဖြတ်ချက် ချလိုက်တာ။ မကြာခင် ပြန်ဆုံမယ်။",
  ],
  th: [
    "เห็นว่าคุณอาจกำลังหางานใหม่ เรากำลังรับสมัครอยู่ตอนนี้",
    "งานบริการลูกค้าออนไลน์ ง่ายมาก ไม่ต้องมีประสบการณ์",
    "เงินเดือน 2,500 ดอลลาร์ต่อเดือน มีที่พักและอาหารให้",
    "ออฟฟิศอยู่ต่างประเทศ ไม่ต้องห่วง เราจัดการตั๋วเครื่องบินและวีซ่าให้",
    "ตำแหน่งกำลังจะเต็ม ยืนยันวันนี้ได้ไหม?",
    "คุยต่อทาง Telegram ดีกว่า สะดวกกว่า เดี๋ยวส่งลิงก์ให้",
    "คุณตัดสินใจได้ดีมาก แล้วเจอกันเร็ว ๆ นี้",
  ],
  vi: [
    "Tôi thấy bạn có thể đang tìm việc mới. Chúng tôi đang tuyển ngay bây giờ.",
    "Hỗ trợ khách hàng trực tuyến. Rất dễ, không cần kinh nghiệm.",
    "Lương 2.500 đô một tháng. Bao ăn ở.",
    "Văn phòng ở nước ngoài. Đừng lo, chúng tôi lo vé máy bay và visa.",
    "Chỗ đang đầy nhanh lắm. Bạn xác nhận hôm nay được không?",
    "Nhắn tiếp qua Telegram cho tiện. Tôi sẽ gửi liên kết.",
    "Bạn đã có lựa chọn đúng đắn. Sớm gặp lại nhé.",
  ],
  zh: [
    "看到你可能在找新工作。我们现在正在招人。",
    "在线客服。很简单，不需要经验。",
    "月薪2500美元。包吃包住。",
    "办公室在国外。别担心，机票和签证我们都安排。",
    "名额很快就满了。今天能确认吗？",
    "我们转到Telegram聊吧，比较方便。我发链接给你。",
    "你做了很好的选择。很快见。",
  ],
};

// ─── Branching script — all paths converge toward the doorway ─────────────────
// `lure` indexes into LURES / CURATED for the ambient multilingual echo.
const NODES = {
  start: {
    recruiter: [
      { text: "Hi there 😊 I saw you might be open to new work. We're hiring right now.", tag: 'rapport', lure: 0,
        subtext: 'An unexpected, friendly opener. Warmth arrives before any request — it lowers the guard.' },
    ],
    choices: [
      { text: "Hello — what's the job?", next: 'offer' },
      { text: "How did you find me?", ack: "A colleague shared your profile 😊 Hope that's alright!", next: 'offer' },
    ],
  },
  offer: {
    recruiter: [
      { text: "Online customer support. Nothing complicated — no experience needed.", tag: 'offer', lure: 1,
        subtext: 'A broad, easy-sounding role. "No experience needed" removes reasons to hesitate and widens who says yes.' },
      { text: "Pay is $2,500 a month. Accommodation and meals included 😊", tag: 'offer', lure: 2,
        subtext: 'The pay sits well above the local norm — high enough to be exciting. "Housing included" quietly links where you live to who employs you.' },
    ],
    choices: [
      { text: "That's a good offer.", next: 'logistics' },
      { text: "That seems high for simple work.", ack: "You're sharp 😊 We just value reliable people — many are already earning this.", next: 'logistics' },
    ],
  },
  logistics: {
    recruiter: [
      { text: "The office is abroad. Don't worry — we arrange your flight and visa. All taken care of.", tag: 'control', lure: 3,
        subtext: '"We arrange everything" sounds like a kindness. It also means the tickets and documents sit in someone else\'s hands from the start.' },
    ],
    choices: [
      { text: "Which country is it in?", ack: "I'll walk you through all the details on the next step 😊", next: 'urgency' },
      { text: "I'd want to talk to my family first.", ack: "Of course — family matters 🙏", next: 'urgency' },
    ],
  },
  urgency: {
    recruiter: [
      { text: "Just so you know, spots are filling quickly. Could you confirm today?", tag: 'urgency', lure: 4,
        subtext: 'Gentle pressure to decide now. The less time to check details or sleep on it, the less chance the pattern is noticed.' },
    ],
    choices: [
      { text: "Okay, I'm interested.", next: 'private' },
      { text: "That feels a little fast for me.", ack: "I understand 😊 I just don't want you to miss it.", next: 'private' },
    ],
  },
  private: {
    recruiter: [
      { text: "Let's continue on Telegram — it's easier for me. I'll send a link 👍", tag: 'isolation', lure: 5,
        subtext: 'Moving the chat somewhere private. The conversation leaves anywhere it could be seen — the quiet first step toward isolation.' },
    ],
    choices: [
      { text: "Sure, send it.", next: 'threshold' },
      { text: "Can we keep talking here?", ack: "Telegram is just simpler for me 😊", next: 'threshold' },
    ],
  },
  threshold: {
    isEnding: true,
    recruiter: [
      { text: "Wonderful — you've made a great choice. Talk soon 🙏", tag: 'rapport', lure: 6,
        subtext: 'Reassurance, and the sense that a door has opened. These threads usually end here — on a yes. So does this one.' },
    ],
  },
};

const TYPING_MS = 1000;
const READ_MS = 2500;

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '4px 2px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#64748b',
          animation: `interview-blink 1.2s ${i * 0.18}s infinite ease-in-out`,
        }} />
      ))}
    </div>
  );
}

export default function TheInterviewView() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('intro'); // intro | playing | choices | ended
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(null);
  const [choices, setChoices] = useState(null);
  const [seenTags, setSeenTags] = useState([]);
  const [endType, setEndType] = useState(null); // 'left' | 'door'
  const [ambient, setAmbient] = useState([]);   // drifting multilingual fragments
  const [translations, setTranslations] = useState(CURATED);
  const [showAbout, setShowAbout] = useState(false);

  const runToken = useRef(0);
  const timer = useRef(null);
  const scrollRef = useRef(null);
  const ambientId = useRef(0);

  const wait = (ms) => new Promise(res => { timer.current = setTimeout(res, ms); });

  // ── Live translation on mount (falls back silently to curated set) ──────────
  useEffect(() => {
    // Client key optional — translateInterviewLines routes through the
    // gemini-proxy edge function; on any failure it falls back to CURATED.
    const apiKey = getActiveApiKey();
    const modelName = localStorage.getItem('gemini_model');
    let cancelled = false;
    (async () => {
      try {
        const targetLangs = LANGS.filter(l => l.code !== 'en');
        const result = await translateInterviewLines(apiKey, modelName, { lines: LURES, langs: targetLangs });
        if (cancelled || !result) return;
        // Validate: keep only language arrays that match the lure count.
        const merged = { ...CURATED };
        targetLangs.forEach(l => {
          const arr = result[l.code];
          if (Array.isArray(arr) && arr.length === LURES.length && arr.every(s => typeof s === 'string' && s.trim())) {
            merged[l.code] = arr;
          }
        });
        setTranslations(merged);
      } catch {
        /* keep curated fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Spawn ambient fragments of a lure across the corridor languages ─────────
  const spawnAmbient = useCallback((lureIdx) => {
    LANGS.forEach((lang, i) => {
      const text = (translations[lang.code] || CURATED[lang.code] || [])[lureIdx];
      if (!text) return;
      const onLeft = Math.random() < 0.5;
      const id = ++ambientId.current;
      const item = {
        id,
        text,
        font: lang.font,
        top: 8 + Math.random() * 78,               // vh band
        left: onLeft ? 1 + Math.random() * 23 : 73 + Math.random() * 23, // side bands
        size: 14 + Math.random() * 8,
        dur: 9 + Math.random() * 5,
        delay: i * 0.45 + Math.random() * 0.4,
      };
      setAmbient(a => [...a.slice(-22), item]);
      // Remove after its drift completes to avoid unbounded growth.
      setTimeout(() => setAmbient(a => a.filter(x => x.id !== id)), (item.dur + item.delay + 0.5) * 1000);
    });
  }, [translations]);

  const loadNode = useCallback(async (nodeId, ackText) => {
    const myToken = ++runToken.current;
    const node = NODES[nodeId];
    const seq = [];
    if (ackText) seq.push({ from: 'recruiter', text: ackText });
    node.recruiter.forEach(m => seq.push({ from: 'recruiter', ...m }));

    for (const m of seq) {
      setTyping('recruiter');
      await wait(TYPING_MS);
      if (runToken.current !== myToken) return;
      setTyping(null);
      setMessages(v => [...v, m]);
      if (m.tag) setSeenTags(s => (s.includes(m.tag) ? s : [...s, m.tag]));
      if (typeof m.lure === 'number') spawnAmbient(m.lure);
      await wait(m.subtext ? READ_MS : 650);
      if (runToken.current !== myToken) return;
    }

    if (node.isEnding) {
      await wait(600);
      if (runToken.current !== myToken) return;
      setEndType('door');
      setPhase('ended');
      return;
    }
    setChoices(node.choices);
    setPhase('choices');
  }, [spawnAmbient]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  useEffect(() => () => { runToken.current++; clearTimeout(timer.current); }, []);

  const begin = () => { setPhase('playing'); loadNode('start'); };

  const choose = (choice) => {
    setChoices(null);
    setMessages(v => [...v, { from: 'applicant', text: choice.text }]);
    setPhase('playing');
    loadNode(choice.next, choice.ack);
  };

  const leave = () => {
    runToken.current++;
    clearTimeout(timer.current);
    setTyping(null);
    setChoices(null);
    setEndType('left');
    setPhase('ended');
  };

  const restart = () => {
    runToken.current++;
    clearTimeout(timer.current);
    setMessages([]); setTyping(null); setChoices(null);
    setSeenTags([]); setEndType(null); setAmbient([]); setPhase('intro');
  };

  const inConversation = phase === 'playing' || phase === 'choices';

  return (
    <div className="min-h-screen bg-[#07090d] text-slate-200 flex flex-col relative overflow-hidden">
      <style>{`
        @keyframes interview-blink { 0%,100%{opacity:.3;transform:translateY(0)} 50%{opacity:1;transform:translateY(-2px)} }
        @keyframes interview-fade { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes interview-drift { 0%{opacity:0;transform:translateY(16px)} 20%{opacity:.42} 80%{opacity:.42} 100%{opacity:0;transform:translateY(-26px)} }
      `}</style>

      <button
        onClick={() => navigate('/')}
        className="absolute top-5 left-5 z-30 flex items-center gap-2 text-slate-500 hover:text-slate-300 text-xs font-mono uppercase tracking-widest transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Exit exhibition
      </button>

      {/* About this piece — designed button */}
      <button
        onClick={() => setShowAbout(true)}
        className="group absolute top-5 right-5 z-30 flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full border border-amber-500/30 bg-amber-500/[0.06] hover:bg-amber-500/[0.12] hover:border-amber-500/50 transition-all"
      >
        <span className="relative flex items-center justify-center">
          <span className="absolute inline-flex h-4 w-4 rounded-full bg-amber-500/40 opacity-70 group-hover:animate-ping" />
          <Info className="w-4 h-4 text-amber-400 relative" />
        </span>
        <span className="text-[11px] font-mono uppercase tracking-widest text-amber-300/90">About this piece</span>
      </button>

      {/* About modal */}
      {showAbout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-sm"
          style={{ animation: 'interview-fade .3s ease-out' }}
          onClick={() => setShowAbout(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-700/70 bg-[#0b0e14] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 sm:px-8 pt-6 pb-4 bg-gradient-to-b from-[#0b0e14] via-[#0b0e14] to-transparent">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-amber-500/70 mb-1.5">Arts exhibition · About</p>
                <h2 className="text-2xl font-bold tracking-tight text-slate-100">The Interview</h2>
                <p className="text-[13px] text-slate-500 mt-1">A recruitment conversation, and the exit you always had.</p>
              </div>
              <button
                onClick={() => setShowAbout(false)}
                className="flex-shrink-0 p-2 rounded-full border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 sm:px-8 pb-8 space-y-6">
              {/* The work */}
              <div className="space-y-3 text-[14px] leading-relaxed text-slate-300">
                <p>
                  <span className="text-slate-100 font-semibold">The Interview</span> is an interactive
                  reconstruction of a deceptive job-recruitment chat. You read in English and choose how
                  to reply. Every option is ordinary and reasonable — there is no wrong answer — yet each
                  reasonable choice draws the conversation one step closer to a door held open. The only
                  true exit is the button that is present at every step: <span className="text-amber-300">leave the conversation.</span>
                </p>
                <p className="text-slate-400">
                  Around the chat, the same message drifts past in Khmer, Burmese, Thai, Vietnamese,
                  Chinese and English — the languages this single script travels in. The lure has no home
                  tongue. It runs everywhere at once.
                </p>
              </div>

              {/* How it meets the guidelines */}
              <div>
                <p className="text-[11px] font-mono uppercase tracking-widest text-slate-500 mb-3">How this piece meets the guidelines</p>
                <div className="space-y-3">
                  {[
                    {
                      icon: <Eye className="w-4 h-4" />, color: '#EF9F27',
                      title: 'Emotional impact & storytelling',
                      body: 'Interactivity turns a passive warning into a lived realization: the trap is not one lie but the slow removal of an exit. The viewer feels the mechanism from the inside without ever seeing harm.'
                    },
                    {
                      icon: <Sparkles className="w-4 h-4" />, color: '#AFA9EC',
                      title: 'Innovation & creative use of AI',
                      body: 'The same model that powers the platform\'s scanner translates the lure live into the languages of the trafficking corridor, rendering it as an ambient field. AI is a creative collaborator — decoding manipulation and voicing the piece — not a background tool.'
                    },
                    {
                      icon: <Globe2 className="w-4 h-4" />, color: '#85B7EB',
                      title: 'Impact & relevance',
                      body: 'It dramatizes exactly what keyword filters miss: coercive recruitment that adapts across platforms and languages. The color-coded decoder teaches the real signals — wage anchoring, manufactured urgency, the move to private channels.'
                    },
                    {
                      icon: <ShieldCheck className="w-4 h-4" />, color: '#5DCAA5',
                      title: 'Human rights & ethical alignment (Do No Harm)',
                      body: 'No real person is depicted, quoted, or represented; all lines are composites of documented patterns. There is no victim persona and no graphic content — the story ends at the threshold. No choice is ever framed as the viewer\'s fault, and support resources are always one step away.'
                    },
                  ].map(item => (
                    <div key={item.title} className="flex gap-3 rounded-xl border border-slate-800 bg-[#0d1117] p-3.5">
                      <div
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ color: item.color, background: `${item.color}1f`, border: `1px solid ${item.color}55` }}
                      >
                        {item.icon}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-slate-200">{item.title}</p>
                        <p className="text-[12px] text-slate-400 leading-relaxed mt-0.5">{item.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div className="border-l-2 border-amber-500/40 pl-4 text-[12px] text-slate-400 italic leading-relaxed">
                Built with and for the communities it serves, under UN Do No Harm principles. The
                translations shown are illustrative composites; the piece contains no live data and
                depicts no operation — only what deception looks like, and where the door is.
              </div>

              <button
                onClick={() => setShowAbout(false)}
                className="w-full py-2.5 rounded-full border border-slate-700 hover:border-slate-500 text-slate-300 text-xs font-mono uppercase tracking-widest transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ambient multilingual layer (behind everything) ── */}
      {inConversation && (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {ambient.map(item => (
            <span
              key={item.id}
              style={{
                position: 'absolute',
                top: `${item.top}vh`,
                left: `${item.left}%`,
                maxWidth: '22%',
                fontFamily: item.font,
                fontSize: `${item.size}px`,
                lineHeight: 1.5,
                color: '#9fb0cc',
                opacity: 0,
                animation: `interview-drift ${item.dur}s ${item.delay}s ease-in-out both`,
              }}
            >
              {item.text}
            </span>
          ))}
        </div>
      )}

      {/* ── Intro ── */}
      {phase === 'intro' && (
        <div className="flex-1 flex items-center justify-center p-6 relative z-10">
          <div className="max-w-lg text-center space-y-8" style={{ animation: 'interview-fade .8s ease-out' }}>
            <div className="space-y-3">
              <p className="text-[11px] font-mono uppercase tracking-[0.35em] text-amber-500/70">Arts exhibition</p>
              <h1 className="text-4xl font-bold tracking-tight text-slate-100">The Interview</h1>
            </div>
            <div className="space-y-4 text-sm text-slate-400 leading-relaxed">
              <p>
                A recruitment conversation. You'll choose how to reply — and at every step, you can
                leave. There is no wrong answer, and nothing here is a test.
              </p>
              <p>
                You read in English. The same message drifts past in the languages it also travels in —
                Khmer, Burmese, Thai, Vietnamese, Chinese. This script has no home tongue.
              </p>
              <p>
                No real person is depicted. The messages are composites of documented recruitment
                patterns. Nothing beyond the doorway is shown.
              </p>
              <p className="text-slate-500 text-[13px]">
                You can step away at any point. In the U.S., the National Human Trafficking Hotline
                is 1-888-373-7888.
              </p>
            </div>
            <button
              onClick={begin}
              className="px-7 py-3 rounded-full border border-slate-700 hover:border-slate-500 text-slate-200 text-sm font-mono uppercase tracking-widest transition-all hover:bg-slate-900/40"
            >
              Begin
            </button>
          </div>
        </div>
      )}

      {/* ── Conversation ── */}
      {inConversation && (
        <div className="flex-1 flex flex-col items-center justify-start p-4 pt-16 relative z-10">
          <div className="w-full max-w-sm h-[64vh] max-h-[600px] rounded-[2rem] border border-slate-800 bg-[#0b0e14] shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/80 bg-[#0d1117] flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center">
                <Phone className="w-4 h-4 text-slate-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-200 truncate">Recruiter</p>
                <p className="text-[10px] font-mono text-emerald-500/80">online now</p>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m, i) => {
                const isYou = m.from === 'applicant';
                const tag = m.tag ? TAGS[m.tag] : null;
                return (
                  <div key={i} style={{ animation: 'interview-fade .4s ease-out' }}>
                    <div className={`flex ${isYou ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[80%]">
                        <p className={`text-[9px] font-mono uppercase tracking-wider mb-0.5 ${isYou ? 'text-right text-sky-500/70' : 'text-slate-600'}`}>
                          {isYou ? 'You' : 'Recruiter'}
                        </p>
                        <div className={`px-3.5 py-2 text-[13px] leading-relaxed rounded-2xl ${
                          isYou
                            ? 'bg-sky-800/50 text-sky-50 rounded-br-sm border border-sky-700/40'
                            : 'bg-slate-800/80 text-slate-100 rounded-bl-sm border border-slate-700/40'
                        }`}>
                          {m.text}
                        </div>
                      </div>
                    </div>
                    {m.subtext && tag && (
                      <div
                        className="mt-1.5 mb-1 ml-1 pl-3 max-w-[90%]"
                        style={{ borderLeft: `2px solid ${tag.border}`, animation: 'interview-fade .6s .2s ease-out both' }}
                      >
                        <span
                          className="inline-block text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded mb-1"
                          style={{ color: tag.color, background: tag.bg, border: `1px solid ${tag.border}` }}
                        >
                          {tag.label}
                        </span>
                        <p className="text-[11px] leading-relaxed font-sans italic" style={{ color: 'rgba(203,213,225,0.62)' }}>
                          {m.subtext}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}

              {typing && (
                <div className="flex justify-start">
                  <div className="px-3 py-1.5 rounded-2xl bg-slate-800/70 rounded-bl-sm">
                    <TypingDots />
                  </div>
                </div>
              )}
            </div>

            {/* Choices as the "input" */}
            <div className="border-t border-slate-800/80 bg-[#0d1117] flex-shrink-0 p-3 space-y-2">
              {phase === 'choices' && choices ? (
                choices.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => choose(c)}
                    className="w-full text-left px-3.5 py-2.5 rounded-xl bg-sky-950/40 hover:bg-sky-900/50 border border-sky-800/40 hover:border-sky-600/60 text-[13px] text-sky-100 transition-all"
                    style={{ animation: `interview-fade .35s ${i * 0.08}s ease-out both` }}
                  >
                    {c.text}
                  </button>
                ))
              ) : (
                <div className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-[12px] text-slate-600 select-none">
                  …
                </div>
              )}
            </div>
          </div>

          {/* Legend — builds up as techniques appear */}
          {seenTags.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-sm" style={{ animation: 'interview-fade .5s ease-out' }}>
              {seenTags.map(t => (
                <span key={t} className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded"
                  style={{ color: TAGS[t].color, background: TAGS[t].bg, border: `1px solid ${TAGS[t].border}` }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: TAGS[t].color }} />
                  {TAGS[t].label}
                </span>
              ))}
            </div>
          )}

          {/* Leave — always available */}
          <button
            onClick={leave}
            className="mt-6 flex items-center gap-2 px-6 py-2.5 rounded-full border border-slate-700 hover:border-amber-500/50 text-slate-300 hover:text-amber-300 text-xs font-mono uppercase tracking-widest transition-all"
          >
            <DoorOpen className="w-4 h-4" /> Leave the conversation
          </button>
          <p className="mt-2.5 text-[11px] text-slate-600 font-mono">This is always okay, at any step.</p>
        </div>
      )}

      {/* ── Ending ── */}
      {phase === 'ended' && (
        <div className="flex-1 flex items-center justify-center p-6 relative z-10">
          <div className="max-w-xl space-y-8" style={{ animation: 'interview-fade 1s ease-out' }}>
            <div className="space-y-5 text-center">
              <DoorOpen className="w-10 h-10 text-amber-500/60 mx-auto" />
              <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
                {endType === 'left' ? 'You left.' : 'You reached the door.'}
              </h2>
            </div>

            <div className="space-y-4 text-[15px] text-slate-300 leading-relaxed">
              {endType === 'left' ? (
                <>
                  <p>You closed a conversation you were free to close. That freedom was the whole exhibit.</p>
                  <p className="text-slate-400">
                    Every choice you were offered was reasonable. So were the ones that would have kept
                    you talking. Recruitment like this works precisely because there is no obviously
                    wrong answer — only a series of ordinary yeses, and an exit that slowly becomes
                    harder to reach.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Every reply you chose was reasonable. That is exactly the point — these
                    conversations are built so that sensible choices still lead here, to a door held
                    open and an arrangement already made.
                  </p>
                  <p className="text-slate-400">
                    The option to leave was there at every single step. In a real version of this, it
                    would have grown quieter with each yes — the wage already promised to family, the
                    flight already booked, the chat already moved somewhere private. The trap is not a
                    single lie. It is the slow removal of the exit.
                  </p>
                </>
              )}
              <p className="text-slate-500 text-sm">
                Every line above — in every language — is a composite of documented recruitment
                patterns. No real person is depicted, quoted, or represented.
              </p>
            </div>

            {/* Resources */}
            <div className="border-t border-slate-800 pt-6 space-y-3">
              <p className="text-[11px] font-mono uppercase tracking-widest text-slate-500">If you need support</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="bg-[#0d1117] border border-slate-800 rounded-lg p-3">
                  <p className="text-[13px] font-semibold text-slate-200">National Human Trafficking Hotline (U.S.)</p>
                  <p className="text-[12px] font-mono text-amber-400 mt-1">1-888-373-7888</p>
                  <p className="text-[11px] text-slate-500 mt-1">Confidential, 24/7. Text 233733.</p>
                </div>
                <div className="bg-[#0d1117] border border-slate-800 rounded-lg p-3">
                  <p className="text-[13px] font-semibold text-slate-200">CHAB DAI Coalition</p>
                  <p className="text-[12px] font-mono text-amber-400 mt-1">chabdai.org</p>
                  <p className="text-[11px] text-slate-500 mt-1">Survivor-led support and prevention, Cambodia.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={restart}
                className="px-6 py-2.5 rounded-full border border-slate-700 hover:border-slate-500 text-slate-300 text-xs font-mono uppercase tracking-widest transition-all"
              >
                Return to the start
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-2.5 rounded-full text-slate-500 hover:text-slate-300 text-xs font-mono uppercase tracking-widest transition-all"
              >
                Exit exhibition
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
