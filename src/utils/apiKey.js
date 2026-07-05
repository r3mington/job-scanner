export function getActiveApiKey() {
  const sessionKey = sessionStorage.getItem('gemini_api_key');
  if (sessionKey && sessionKey.trim() && !sessionKey.startsWith('YOUR_')) {
    return sessionKey.trim();
  }
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (envKey && envKey.trim() && envKey !== 'YOUR_GEMINI_API_KEY_HERE' && !envKey.startsWith('YOUR_')) {
    return envKey.trim();
  }
  return '';
}

export function isEnvKeyConfigured() {
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  return !!(envKey && envKey.trim() && envKey !== 'YOUR_GEMINI_API_KEY_HERE' && !envKey.startsWith('YOUR_'));
}
