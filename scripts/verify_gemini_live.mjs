const apiKey = process.env.GEMINI_API_KEY || process.argv[2] || '';
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

if (!apiKey) {
  console.log('Usage: node scripts/verify_gemini_live.mjs <API_KEY>');
  process.exit(0);
}

const sampleFields = [
  { id: 'fullName', name: 'fullName', label: 'Full Legal Name', type: 'text' },
  { id: 'email', name: 'email', label: 'Candidate Email ID', type: 'email' },
  { id: 'phone', name: 'phone', label: 'Mobile Number', type: 'tel' },
  { id: 'dob', name: 'dob', label: 'Date of Birth', type: 'date' },
  { id: 'gender', name: 'gender', label: 'Gender', type: 'select', options: ['Female', 'Male', 'Other'] },
  { id: 'category', name: 'category', label: 'Social Category', type: 'select', options: ['General', 'OBC', 'SC', 'ST'] },
  { id: 'collegeName', name: 'collegeName', label: 'Institution / College Name', type: 'text' },
  { id: 'annualIncome', name: 'annualIncome', label: 'Annual Family Income (INR)', type: 'number' },
  { id: 'captcha', name: 'captcha', label: 'Security Code', type: 'text', hint: 'Enter code shown above' }
];

const profileKeys = [
  'fullName', 'dob', 'gender', 'fatherName', 'motherName', 'address', 'pincode',
  'mobile', 'email', 'aadhaarNumber', 'panNumber', 'category', 'annualIncome',
  'institution', 'course', 'marksPercent', 'bankAccount', 'ifsc', 'bankAccountType'
];

async function run() {
  console.log(`Pinging Gemini endpoint (${model}) with provided key...`);

  const prompt = `You are FormPilot's AI Decision Engine for Indian web forms.
TASK: Match each web form field to the single most appropriate profile key name from AVAILABLE_PROFILE_KEYS.
CRITICAL RULES:
1. Only field names and key names are provided. Never guess values.
2. If a field is CAPTCHA or OTP, set profileKey to null and confidence to 0.0 with explanation "Preserved for user (Rule 2: CAPTCHA / OTP guard)".
3. If no key matches, set profileKey to null.

AVAILABLE_PROFILE_KEYS:
${JSON.stringify(profileKeys, null, 2)}

FORM_FIELDS_TO_MATCH:
${JSON.stringify(sampleFields, null, 2)}

OUTPUT FORMAT: Strict JSON object:
{
  "matches": [
    {
      "fieldId": "exact_field_id",
      "profileKey": "matched_key_or_null",
      "confidence": 0.95,
      "explanation": "Brief reasoning"
    }
  ]
}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    })
  });

  if (!res.ok) {
    console.error('Error response:', res.status, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log('Gemini Live Response:');
  console.log(text);

  const parsed = JSON.parse(text);
  console.log(`\nSuccessfully received ${parsed.matches.length} field decisions!`);
}

run().catch(console.error);
