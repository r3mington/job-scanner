import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('supabase_url') || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('supabase_anon_key') || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials are not fully configured. Please configure them in Settings.");
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co', 
  supabaseAnonKey || 'placeholder-key'
);

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
    user_id: record.userId || record.user_id || null
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
    userId: dbRecord.user_id
  };
}

// Upload a Base64 data URL to Supabase Storage and return its public URL
export async function uploadBase64Image(base64Data) {
  if (!base64Data || !base64Data.startsWith('data:image/')) {
    return base64Data; // Already a URL or empty
  }

  const bucketName = localStorage.getItem('supabase_bucket') || 'scans-images';
  
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
