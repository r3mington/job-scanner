import Dexie from 'dexie';

export const db = new Dexie('VeritasRecruitDB');

db.version(1).stores({
  scans: '++id, timestamp, jobTitle, employer, riskScore, riskLevel'
});

// A scan record will look like this:
// {
//   id: 1, // auto-incremented
//   timestamp: 1678888888888,
//   jobTitle: 'Construction Worker',
//   employer: 'Acme Corp',
//   riskScore: 75,
//   riskLevel: 'High Risk',
//   extractedData: { ... }, // raw JSON data from Gemini/user edits
//   activeFlags: ['Upfront Fees', ...],
//   originalImage: 'data:image/jpeg;base64,...', // Base64 if captured via camera/upload
//   originalText: '...', // if pasted
// }
