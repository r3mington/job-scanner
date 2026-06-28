import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// ─── Fallback data ─────────────────────────────────────────────────────────────
const FALLBACK_TAGS = [
  { id:'f1',  salary:'$3,000 / month',        jobTitle:'Customer Service Agent',  riskScore:88, riskLevel:'CRITICAL', flags:['Excessive Enticements','Suspect Location Hub','Encrypted App Migration'], country:'Cambodia',    platform:'Telegram'  },
  { id:'f2',  salary:'$1,100 – $2,000',       jobTitle:'Admin & Sales Support',   riskScore:74, riskLevel:'HIGH',     flags:['Vague Description','Minimal Qualifications','Labor Abuse'],              country:'Myanmar',     platform:'Facebook'  },
  { id:'f3',  salary:'USD 2,500 + Commission',jobTitle:'Online Marketing Staff',  riskScore:82, riskLevel:'CRITICAL', flags:['Immediate Travel Pressure','Passport/ID Control'],                       country:'Thailand',    platform:'Telegram'  },
  { id:'f4',  salary:'$800 / week',            jobTitle:'Data Entry Specialist',   riskScore:65, riskLevel:'HIGH',     flags:['Employer Anonymity','Wage Disparity'],                                   country:'Philippines', platform:'WhatsApp'  },
  { id:'f5',  salary:'RM 6,000 / month',       jobTitle:'PR & Media Manager',      riskScore:79, riskLevel:'HIGH',     flags:['Vague Description','Excessive Enticements','Urgent Timeline'],           country:'Malaysia',    platform:'Instagram' },
  { id:'f6',  salary:'$2,000 + Allowance',     jobTitle:'Agent Recruiter',         riskScore:91, riskLevel:'CRITICAL', flags:['Labor Abuse / High Pressure','Suspect Location Hub'],                    country:'Myanmar',     platform:'Telegram'  },
  { id:'f7',  salary:'3,000 USDT / month',     jobTitle:'Translation Support',     riskScore:87, riskLevel:'CRITICAL', flags:['Excessive Enticements','Employer Anonymity','Encrypted App Migration'],  country:'Cambodia',    platform:'Telegram'  },
  { id:'f8',  salary:'$500 – $1,500',          jobTitle:'Call Center Staff',       riskScore:58, riskLevel:'HIGH',     flags:['Vague Description','Minimal Qualifications'],                            country:'Vietnam',     platform:'Facebook'  },
  { id:'f9',  salary:'$4,000 guaranteed',      jobTitle:'Remote Work Specialist',  riskScore:93, riskLevel:'CRITICAL', flags:['Excessive Enticements','Salary Too Good','Employer Anonymity'],          country:'Cambodia',    platform:'Telegram'  },
  { id:'f10', salary:'SGD 3,500 / month',      jobTitle:'Operations Coordinator',  riskScore:70, riskLevel:'HIGH',     flags:['Suspect Location Hub','Vague Description'],                              country:'Singapore',   platform:'LinkedIn'  },
  { id:'f11', salary:'$1,200 + Bonus',         jobTitle:'Sales Representative',    riskScore:61, riskLevel:'HIGH',     flags:['Minimal Qualifications','Urgent Timeline'],                              country:'Thailand',    platform:'Facebook'  },
  { id:'f12', salary:'AED 5,000 / month',      jobTitle:'Hotel & Hospitality',     riskScore:55, riskLevel:'MEDIUM',   flags:['Vague Description','Employer Anonymity'],                                country:'UAE',         platform:'Indeed'    },
];

// ─── Tag dimensions — 30% bigger than before ──────────────────────────────────
function tagDimensions(score) {
  if (score >= 70) return { w: 198, h: 258 };
  if (score >= 40) return { w: 169, h: 221 };
  return { w: 146, h: 193 };
}

// ─── Stable per-tag random meta ───────────────────────────────────────────────
function makeTagMeta(n) {
  return Array.from({ length: n }, () => ({
    stringLength: 55 + Math.floor(Math.random() * 65),
    swayDuration: 3.0 + Math.random() * 3.8,
    swayDelay:    Math.random() * 5,
  }));
}

// ─── Barcode derived from scan id + risk score ────────────────────────────────
function generateBarcode(id, riskScore) {
  const seed = String(id) + String(riskScore ?? 50);
  return Array.from({ length: 24 }, (_, i) => {
    const c = seed.charCodeAt(i % seed.length) || 65;
    return 1 + (c % 5);
  });
}

function FrontBarcode({ id, riskScore }) {
  const bars = useMemo(() => generateBarcode(id, riskScore), [id, riskScore]);
  return (
    <div style={{ display:'flex', gap:'1.5px', alignItems:'flex-end', height:'22px' }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: i % 6 === 0 ? '3px' : '1.5px',
          height: `${h * 4 + 2}px`,
          background: 'rgba(44,31,14,0.35)',
          borderRadius: '0.5px',
        }} />
      ))}
    </div>
  );
}

// ─── Two-strand twisted string ─────────────────────────────────────────────────
function TagString({ length }) {
  const sl = length;
  return (
    <svg width="16" height={sl} viewBox={`0 0 16 ${sl}`} style={{ display:'block', flexShrink:0 }} xmlns="http://www.w3.org/2000/svg">
      <path d={`M 5 0 C 4 ${sl*0.33} 9 ${sl*0.66} 8 ${sl}`} stroke="#9b8060" strokeWidth="1.2" fill="none" opacity="0.6" />
      <path d={`M 11 0 C 12 ${sl*0.33} 7 ${sl*0.66} 8 ${sl}`} stroke="#7a6040" strokeWidth="1.2" fill="none" opacity="0.45" />
      <circle cx="8" cy="7" r="2.8" fill="#8b7050" opacity="0.5" />
    </svg>
  );
}

// ─── Gold stripe + punched eyelet (front) ─────────────────────────────────────
function FrontHeader() {
  return (
    <div style={{
      width: '100%',
      height: '26px',
      background: 'linear-gradient(135deg, #92700a 0%, #d4a017 35%, #f5c842 55%, #c8880e 80%, #8a6308 100%)',
      borderRadius: '6px 6px 0 0',
      position: 'relative',
      flexShrink: 0,
      boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.2)',
    }}>
      <div style={{
        position: 'absolute', top:'50%', left:'50%',
        transform: 'translate(-50%,-50%)',
        width: '15px', height: '15px', borderRadius: '50%',
        background: '#0d0905',
        border: '1.5px solid rgba(0,0,0,0.6)',
        boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.9)',
      }} />
    </div>
  );
}

// ─── Red stripe + punched eyelet (back) ───────────────────────────────────────
function BackHeader() {
  return (
    <div style={{
      width: '100%',
      height: '26px',
      background: 'linear-gradient(135deg, #6b0000 0%, #b91c1c 40%, #dc2626 55%, #991b1b 100%)',
      borderRadius: '6px 6px 0 0',
      position: 'relative',
      flexShrink: 0,
      boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.3)',
    }}>
      <div style={{
        position: 'absolute', top:'50%', left:'50%',
        transform: 'translate(-50%,-50%)',
        width: '15px', height: '15px', borderRadius: '50%',
        background: '#0d0905',
        border: '1.5px solid rgba(0,0,0,0.6)',
        boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.9)',
      }} />
    </div>
  );
}

// ─── Single price tag ─────────────────────────────────────────────────────────
function PriceTag({ tag, meta }) {
  const [flipped, setFlipped] = useState(false);
  const { stringLength, swayDuration, swayDelay } = meta;
  const { w, h } = tagDimensions(tag.riskScore);

  const salaryFontSize = tag.salary.length > 18 ? '16px'
    : tag.salary.length > 13 ? '20px'
    : tag.salary.length > 9  ? '26px'
    : '32px';

  // Ivory/cream kraft front body
  const frontBody = {
    background: '#fdf6e3',
    backgroundImage: [
      'repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(139,115,85,0.03) 4px, rgba(139,115,85,0.03) 5px)',
      'repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(139,115,85,0.015) 6px, rgba(139,115,85,0.015) 7px)',
    ].join(', '),
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      animation: `priceSway ${swayDuration}s ease-in-out infinite`,
      animationDelay: `-${swayDelay}s`,
      transformOrigin: 'top center',
      willChange: 'transform',
    }}>
      <TagString length={stringLength} />

      <div style={{ perspective: '1000px', cursor: 'pointer' }} onClick={() => setFlipped(f => !f)}>
        <div style={{
          position: 'relative',
          width: `${w}px`,
          height: `${h}px`,
          transformStyle: 'preserve-3d',
          transition: 'transform 0.75s cubic-bezier(0.4,0,0.2,1)',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}>

          {/* ── FRONT — enticing & promotional ── */}
          <div style={{
            position:'absolute', inset:0,
            backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden',
            borderRadius:'6px',
            border:'1px solid #c8a96a',
            boxShadow:'0 6px 24px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,220,100,0.08)',
            display:'flex', flexDirection:'column', overflow:'hidden',
          }}>
            <FrontHeader />

            <div style={{
              flex:1, display:'flex', flexDirection:'column',
              alignItems:'center',
              padding:'16px 16px 14px',
              gap:'12px',
              ...frontBody,
            }}>
              {/* Urgency stamp */}
              <div style={{
                fontFamily:'"Courier New", Courier, monospace',
                fontSize:'10px',
                fontWeight:700,
                color:'#b8860b',
                textTransform:'uppercase',
                letterSpacing:'0.18em',
                border:'1px solid rgba(212,160,23,0.4)',
                padding:'4px 12px',
                borderRadius:'2px',
                whiteSpace:'nowrap',
              }}>
                ✦ Job Vacancy ✦
              </div>

              {/* Job title */}
              <div style={{
                fontFamily:'"Courier New", Courier, monospace',
                fontSize: w >= 198 ? '13px' : '11px',
                color:'#3d2810',
                textAlign:'center',
                textTransform:'uppercase',
                letterSpacing:'0.1em',
                lineHeight:1.5,
                fontWeight:700,
              }}>
                {(tag.jobTitle || 'Unknown Position').substring(0, 36)}
              </div>

              {/* Divider */}
              <div style={{ width:'70%', height:'1px', background:'rgba(44,31,14,0.12)', flexShrink:0 }} />

              {/* Salary — the "promise" */}
              <div style={{
                fontFamily:'Georgia, "Times New Roman", serif',
                fontSize: salaryFontSize,
                fontWeight:700,
                color:'#1a0f05',
                textAlign:'center',
                lineHeight:1.15,
                letterSpacing:'-0.01em',
              }}>
                {tag.salary}
              </div>

              {/* Divider */}
              <div style={{ width:'70%', height:'1px', background:'rgba(44,31,14,0.12)', flexShrink:0 }} />

              {/* Benefits — vertical stacked list */}
              <div style={{
                display:'flex', flexDirection:'column', gap:'5px',
                alignSelf:'stretch', padding:'0 4px',
              }}>
                {['Flight Covered', 'Housing Included', 'Visa Sponsored', 'No Experience Needed'].map(b => (
                  <div key={b} style={{
                    fontFamily:'"Courier New", Courier, monospace',
                    fontSize:'10px',
                    color:'#7a5c2a',
                    letterSpacing:'0.04em',
                    display:'flex', alignItems:'center', gap:'7px',
                  }}>
                    <span style={{ color:'#b8860b', fontSize:'11px', lineHeight:1 }}>✓</span>
                    {b}
                  </div>
                ))}
              </div>

              {/* Flip hint */}
              <div style={{
                fontFamily:'"Courier New", Courier, monospace',
                fontSize:'8px',
                color:'rgba(44,31,14,0.2)',
                textTransform:'uppercase',
                letterSpacing:'0.14em',
                marginTop:'auto',
              }}>
                click to reveal
              </div>
            </div>
          </div>

          {/* ── BACK — dangerous & red ── */}
          <div style={{
            position:'absolute', inset:0,
            backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden',
            transform:'rotateY(180deg)',
            borderRadius:'6px',
            border:'1px solid #7f1d1d',
            boxShadow:'0 6px 24px rgba(139,0,0,0.5), 0 1px 4px rgba(0,0,0,0.6)',
            display:'flex', flexDirection:'column', overflow:'hidden',
            background:'#0f0000',
          }}>
            <BackHeader />

            <div style={{
              flex:1, display:'flex', flexDirection:'column',
              padding:'14px 14px 12px', gap:'8px',
              background: 'linear-gradient(180deg, #160000 0%, #0f0000 60%, #120000 100%)',
            }}>
              {/* Risk level — large & alarming */}
              <div style={{
                fontFamily:'Georgia, "Times New Roman", serif',
                fontSize: w >= 198 ? '30px' : '24px',
                fontWeight:700,
                color:'#ef4444',
                letterSpacing:'-0.01em',
                lineHeight:1,
                textShadow:'0 0 28px rgba(239,68,68,0.55)',
              }}>
                {tag.riskLevel}
              </div>

              <div style={{
                fontFamily:'"Courier New", Courier, monospace',
                fontSize:'13px',
                color:'rgba(252,165,165,0.9)',
                letterSpacing:'0.08em',
                textTransform:'uppercase',
                marginTop:'-2px',
              }}>
                Risk Score: {tag.riskScore}/100
              </div>

              {/* Divider */}
              <div style={{ width:'100%', height:'1px', background:'rgba(239,68,68,0.15)' }} />

              {/* Flags */}
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'6px' }}>
                {(tag.flags || []).slice(0, 4).map((flag, i) => (
                  <div key={i} style={{
                    fontFamily:'"Courier New", Courier, monospace',
                    fontSize: w >= 198 ? '12px' : '11px',
                    color:'rgba(252,165,165,0.8)',
                    lineHeight:1.4,
                    display:'flex', gap:'8px',
                  }}>
                    <span style={{ color:'#ef4444', flexShrink:0 }}>▲</span>
                    {flag}
                  </div>
                ))}
              </div>

              {/* Footer */}
              {(tag.country || tag.platform) && (
                <div style={{
                  fontFamily:'"Courier New", Courier, monospace',
                  fontSize:'11px',
                  color:'rgba(239,68,68,0.35)',
                  textTransform:'uppercase',
                  letterSpacing:'0.08em',
                  borderTop:'1px solid rgba(239,68,68,0.12)',
                  paddingTop:'8px',
                }}>
                  {[tag.country, tag.platform].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Dark ceiling with hooks ───────────────────────────────────────────────────
function Ceiling() {
  const hooks = [6, 14, 23, 32, 41, 50, 59, 68, 77, 86, 94];
  return (
    <div style={{ position:'sticky', top:0, zIndex:100, pointerEvents:'none' }}>
      <div style={{
        height: '32px',
        background: 'linear-gradient(180deg, #030405 0%, #060709 100%)',
        position: 'relative',
        boxShadow: '0 2px 24px rgba(0,0,0,0.9)',
      }}>
        {/* Subtle concrete texture */}
        <div style={{
          position:'absolute', inset:0,
          backgroundImage:'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.008) 40px, rgba(255,255,255,0.008) 41px)',
        }} />
        {/* Hooks */}
        {hooks.map((pct, i) => (
          <svg
            key={i}
            width="10" height="18"
            viewBox="0 0 10 18"
            style={{ position:'absolute', left:`${pct}%`, bottom:'-1px', transform:'translateX(-50%)' }}
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Screw eye into ceiling */}
            <circle cx="5" cy="4" r="3" fill="none" stroke="#2a2d32" strokeWidth="1.5" />
            {/* Hook drop */}
            <path d="M 5 7 L 5 14 Q 5 18 9 18" fill="none" stroke="#2a2d32" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ))}
      </div>
      {/* Ceiling shadow bleeding downward */}
      <div style={{ height:'20px', background:'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)', pointerEvents:'none' }} />
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function PriceTagView() {
  const [tags, setTags]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [shown, setShown]     = useState(false);
  const navigate = useNavigate();

  const tagMeta = useMemo(() => makeTagMeta(300), []);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data, error } = await supabase
          .from('scans')
          .select('id, extracted_data, risk_score, risk_level, active_flags, source_platform, location_country')
          .order('risk_score', { ascending: false })
          .limit(250);

        if (!error && data && data.length > 0) {
          const processed = data.map(s => {
            const salary = s.extracted_data?.salary_range;
            if (!salary) return null;
            const low = salary.toLowerCase().trim();
            if (['unspecified','not mentioned','not specified','n/a','na','unknown',''].includes(low)) return null;
            if (salary.trim().length < 3) return null;
            return {
              id: s.id,
              salary: salary.substring(0, 40),
              jobTitle: s.extracted_data?.job_title || 'Unknown Position',
              riskScore: s.risk_score ?? 0,
              riskLevel: s.risk_level ?? 'UNKNOWN',
              flags: s.active_flags || [],
              country: s.location_country && s.location_country !== 'unspecified' ? s.location_country : null,
              platform: s.source_platform && s.source_platform !== 'unspecified' ? s.source_platform : null,
            };
          }).filter(Boolean);

          setTags(processed.length >= 6 ? processed : [...processed, ...FALLBACK_TAGS]);
        } else {
          setTags(FALLBACK_TAGS);
        }
      } catch {
        setTags(FALLBACK_TAGS);
      } finally {
        setLoading(false);
        setTimeout(() => setShown(true), 400);
      }
    }
    fetchData();
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      // Cork board surface
      backgroundColor: '#0a0b0e',
      backgroundImage: [
        // Single dim overhead light source
        'radial-gradient(ellipse at 50% 0%, rgba(255,220,160,0.06) 0%, transparent 55%)',
        // Subtle wall texture
        'repeating-linear-gradient(90deg, transparent, transparent 80px, rgba(255,255,255,0.007) 80px, rgba(255,255,255,0.007) 81px)',
        'repeating-linear-gradient(0deg,  transparent, transparent 60px, rgba(255,255,255,0.005) 60px, rgba(255,255,255,0.005) 61px)',
      ].join(', '),
      overflowX: 'hidden',
      position: 'relative',
    }}>
      <style>{`
        @keyframes priceSway {
          0%,100% { transform: rotate(-2deg); }
          50%      { transform: rotate(2deg);  }
        }
        @keyframes fadeUpIn {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0);   }
        }
      `}</style>

      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        style={{
          position:'fixed', top:'20px', left:'20px', zIndex:200,
          display:'flex', alignItems:'center', gap:'6px',
          background:'none', border:'none', cursor:'pointer',
          fontFamily:'monospace', fontSize:'10px',
          color:'rgba(71,85,105,0.55)',
          textTransform:'uppercase', letterSpacing:'0.15em',
          padding:'6px 8px', transition:'color 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.color='rgba(180,160,100,0.8)'}
        onMouseLeave={e => e.currentTarget.style.color='rgba(71,85,105,0.65)'}
      >
        <ArrowLeft size={12} /> Back
      </button>

      <Ceiling />

      {loading && (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'center', height:'80vh',
          fontFamily:'monospace', fontSize:'10px',
          color:'rgba(100,110,130,0.5)',
          textTransform:'uppercase', letterSpacing:'0.18em',
        }}>
          Loading…
        </div>
      )}

      {!loading && (
        <div style={{
          padding: '0 48px 140px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '40px 32px',
          justifyContent: 'center',
          alignItems: 'flex-start',
          opacity: shown ? 1 : 0,
          transition: 'opacity 0.8s ease',
        }}>
          {tags.map((tag, i) => (
            <PriceTag key={tag.id || i} tag={tag} meta={tagMeta[i % tagMeta.length]} />
          ))}
        </div>
      )}

      {!loading && (
        <div style={{
          position:'fixed', bottom:0, left:0, right:0,
          padding:'28px 24px 20px',
          background:'linear-gradient(transparent, rgba(6,7,10,0.97) 40%)',
          display:'flex', flexDirection:'column', alignItems:'center',
          pointerEvents:'none',
          animation:'fadeUpIn 1.5s ease 1s both',
        }}>
          <div style={{ width:'40px', height:'1px', background:'rgba(180,130,50,0.2)', marginBottom:'10px' }} />
          <p style={{
            fontFamily:'monospace', fontSize:'10px',
            color:'rgba(160,150,130,0.6)',
            textTransform:'uppercase', letterSpacing:'0.18em',
            textAlign:'center', lineHeight:1.8,
          }}>
            Every promise has a price no one told them about.
            <br />
            <span style={{ color:'rgba(120,115,105,0.5)', fontSize:'9px' }}>
              {tags.length} recorded · Click a tag to reveal the real cost
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
