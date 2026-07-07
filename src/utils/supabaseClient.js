import { createClient } from '@supabase/supabase-js';

const getSupabaseCreds = () => {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  
  const isEnvValid = 
    envUrl && envUrl.trim() && 
    !envUrl.includes('placeholder') && 
    !envUrl.includes('your-project');
    
  if (isEnvValid) {
    return { url: envUrl.trim(), key: envKey.trim(), isConfigured: true };
  }
  
  return { url: '', key: '', isConfigured: false };
};

const creds = getSupabaseCreds();
const supabaseUrl = creds.url;
const supabaseAnonKey = creds.key;
const isConfigured = creds.isConfigured;

class MockSupabaseClient {
  constructor() {
    this.auth = {
      getSession: async () => {
        const sessionStr = localStorage.getItem('mock_supabase_session');
        const session = sessionStr ? JSON.parse(sessionStr) : null;
        return { data: { session }, error: null };
      },
      onAuthStateChange: (callback) => {
        const sessionStr = localStorage.getItem('mock_supabase_session');
        const session = sessionStr ? JSON.parse(sessionStr) : null;
        setTimeout(() => callback('SIGNED_IN', session), 50);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signUp: async ({ email, password }) => {
        const users = JSON.parse(localStorage.getItem('mock_supabase_users') || '[]');
        if (users.find(u => u.email === email)) {
          throw new Error('User already exists');
        }
        const newUser = { id: `mock-user-${Date.now()}`, email };
        users.push({ ...newUser, password });
        localStorage.setItem('mock_supabase_users', JSON.stringify(users));
        return { data: { user: newUser, session: null }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        const users = JSON.parse(localStorage.getItem('mock_supabase_users') || '[]');
        let user = users.find(u => u.email === email && u.password === password);
        if (!user) {
          user = { id: `mock-user-${Date.now()}`, email };
          users.push({ ...user, password });
          localStorage.setItem('mock_supabase_users', JSON.stringify(users));
        }
        const session = {
          user: { id: user.id, email: user.email },
          expires_at: Date.now() + 3600 * 1000
        };
        localStorage.setItem('mock_supabase_session', JSON.stringify(session));
        setTimeout(() => window.location.reload(), 200);
        return { data: { session }, error: null };
      },
      signOut: async () => {
        localStorage.removeItem('mock_supabase_session');
        setTimeout(() => window.location.reload(), 200);
        return { error: null };
      }
    };
    
    this.storage = {
      from: () => ({
        upload: async (fileName, blob) => {
          return { data: { path: fileName }, error: null };
        },
        getPublicUrl: (fileName) => {
          return { data: { publicUrl: 'https://images.unsplash.com/photo-1521737711867-e3b904737d88?w=500' } };
        }
      })
    };
  }

  from(tableName) {
    return {
      select: (cols) => {
        const data = JSON.parse(localStorage.getItem(`mock_db_${tableName}`) || '[]');
        return {
          order: (col, opts) => {
            const sorted = [...data].sort((a,b) => {
              if (opts?.ascending) return a[col] > b[col] ? 1 : -1;
              return a[col] < b[col] ? 1 : -1;
            });
            return {
              then: (resolve) => resolve({ data: sorted, error: null })
            };
          },
          eq: (col, val) => {
            const filtered = data.filter(d => d[col] === val);
            return {
              maybeSingle: async () => {
                return { data: filtered[0] || null, error: null };
              },
              single: async () => {
                return { data: filtered[0] || null, error: null };
              },
              then: (resolve) => resolve({ data: filtered, error: null })
            };
          },
          then: (resolve) => resolve({ data, error: null })
        };
      },
      upsert: (record) => {
        const data = JSON.parse(localStorage.getItem(`mock_db_${tableName}`) || '[]');
        const existingIdx = data.findIndex(d => d.id === record.id);
        if (existingIdx !== -1) {
          data[existingIdx] = { ...data[existingIdx], ...record };
        } else {
          data.push(record);
        }
        localStorage.setItem(`mock_db_${tableName}`, JSON.stringify(data));
        return {
          select: () => ({
            single: async () => {
              return { data: record, error: null };
            }
          })
        };
      },
      insert: (record) => {
        const data = JSON.parse(localStorage.getItem(`mock_db_${tableName}`) || '[]');
        const newRecord = { ...record, id: record.id || `mock-${Date.now()}` };
        data.push(newRecord);
        localStorage.setItem(`mock_db_${tableName}`, JSON.stringify(data));
        return {
          select: () => ({
            single: async () => {
              return { data: newRecord, error: null };
            }
          })
        };
      },
      update: (record) => ({
        eq: (col, val) => ({
          then: async (resolve) => {
            const data = JSON.parse(localStorage.getItem(`mock_db_${tableName}`) || '[]');
            const updated = data.map(d => d[col] === val ? { ...d, ...record } : d);
            localStorage.setItem(`mock_db_${tableName}`, JSON.stringify(updated));
            resolve({ data: updated.filter(d => d[col] === val), error: null });
          }
        })
      }),
      delete: () => ({
        eq: (col, val) => ({
          then: async (resolve) => {
            const data = JSON.parse(localStorage.getItem(`mock_db_${tableName}`) || '[]');
            const remaining = data.filter(d => d[col] !== val);
            localStorage.setItem(`mock_db_${tableName}`, JSON.stringify(remaining));
            resolve({ error: null });
          }
        })
      })
    };
  }
}

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : new MockSupabaseClient();

// True when a real Supabase backend is configured; false in local sandbox mode
export const isSupabaseConfigured = !!isConfigured;

// Map frontend camelCase record to Supabase snake_case schema
export function mapRecordToDb(record) {
  return {
    timestamp: record.timestamp,
    job_title: record.jobTitle,
    employer: record.employer,
    risk_score: record.riskScore,
    risk_level: record.riskLevel,
    extracted_data: record.extractedData,
    active_flags: record.activeFlags,
    original_image_url: record.originalImage || record.originalImageUrl || null,
    original_text: record.originalText,
    ocr_text: record.ocrText,
    ai_review: record.aiReview,
    parsed_salary_usd: record.parsedSalaryUsd,
    location_country: record.locationCountry,
    detected_language: record.detectedLanguage,
    is_translated: record.isTranslated,
    translated_text: record.translatedText,
    batch_id: record.batchId,
    batch_name: record.batchName,
    user_id: record.userId || record.user_id || null,
    normalized_text: record.normalizedText || null,
    notes: record.notes || null,
    source_platform: record.sourcePlatform || 'unspecified',
    source_url: record.sourceUrl || 'unspecified',
    ingestion_method: record.ingestionMethod || 'Analyst Upload',
    post_date: record.postDate || 'unspecified'
  };
}

// Map Supabase snake_case record to frontend camelCase schema
export function mapDbToRecord(dbRecord) {
  if (!dbRecord) return null;
  return {
    id: dbRecord.id,
    timestamp: dbRecord.timestamp,
    jobTitle: dbRecord.job_title,
    employer: dbRecord.employer,
    riskScore: dbRecord.risk_score,
    riskLevel: dbRecord.risk_level,
    extractedData: dbRecord.extracted_data,
    activeFlags: dbRecord.active_flags || [],
    originalImage: dbRecord.original_image_url,
    originalImageUrl: dbRecord.original_image_url,
    originalText: dbRecord.original_text,
    ocrText: dbRecord.ocr_text,
    aiReview: dbRecord.ai_review,
    parsedSalaryUsd: dbRecord.parsed_salary_usd ? parseFloat(dbRecord.parsed_salary_usd) : null,
    locationCountry: dbRecord.location_country,
    detectedLanguage: dbRecord.detected_language,
    isTranslated: dbRecord.is_translated,
    translatedText: dbRecord.translated_text,
    batchId: dbRecord.batch_id,
    batchName: dbRecord.batch_name,
    userId: dbRecord.user_id,
    normalizedText: dbRecord.normalized_text,
    notes: dbRecord.notes || '',
    sourcePlatform: dbRecord.source_platform || 'unspecified',
    sourceUrl: dbRecord.source_url || 'unspecified',
    ingestionMethod: dbRecord.ingestion_method || 'Analyst Upload',
    postDate: dbRecord.post_date || 'unspecified'
  };
}

// Upload a Base64 data URL to Supabase Storage and return its public URL
export async function uploadBase64Image(base64Data) {
  if (!base64Data || !base64Data.startsWith('data:image/')) {
    return base64Data; // Already a URL or empty
  }

  const bucketName = import.meta.env.VITE_SUPABASE_BUCKET || 'scans-images';
  
  // Extract content type and raw base64 data
  const parts = base64Data.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const rawBase64 = parts[1];
  
  // Decode base64 to binary
  const binaryStr = atob(rawBase64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  
  const blob = new Blob([bytes], { type: contentType });
  const fileName = `${Date.now()}_scan.${contentType.split('/')[1] || 'jpg'}`;
  
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, blob, { contentType });
    
  if (error) {
    console.error("Supabase Storage upload error:", error);
    throw error;
  }
  
  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);
    
  return publicUrl;
}
