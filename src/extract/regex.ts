/**
 * Local Fallback RegEx / Heuristic Extractors
 * Operates offline with zero network and no API key required.
 * Comprehensively extracts standard Indian statutory identity and form credentials.
 */

export interface RegexExtractionResult {
  key: string;
  value: string;
  confidence: number;
  source: 'regex';
}

export function extractFromTextWithRegex(rawText: string): RegexExtractionResult[] {
  const results: RegexExtractionResult[] = [];
  if (!rawText) return results;

  const pushResult = (key: string, value: string, confidence: number) => {
    // Avoid duplicate keys
    if (!results.some((r) => r.key === key)) {
      results.push({ key, value: value.trim(), confidence, source: 'regex' });
    }
  };

  // 1. Aadhaar Number: 12 digits (with optional spaces or dashes)
  // Formats: 9876 5432 1012, 9876-5432-1012, 987654321012
  const aadhaarMatch = rawText.match(/(?:^|[^0-9])([2-9]\d{3}[-\s]?\d{4}[-\s]?\d{4})(?:[^0-9]|$)/);
  if (aadhaarMatch) {
    const cleanAadhaar = aadhaarMatch[1].replace(/[-\s]/g, '');
    if (cleanAadhaar.length === 12) {
      pushResult('aadhaarNumber', cleanAadhaar, 0.9);
    }
  }

  // 2. Permanent Account Number (PAN): 5 letters + 4 digits + 1 letter
  // Format: [A-Z]{5}[0-9]{4}[A-Z]{1}
  const panMatch = rawText.match(/(?:^|[^A-Z0-9])([A-Z]{5}[0-9]{4}[A-Z]{1})(?:[^A-Z0-9]|$)/);
  if (panMatch) {
    pushResult('panNumber', panMatch[1], 0.95);
  }

  // 3. Date of Birth (DOB): DD/MM/YYYY or YYYY-MM-DD
  const dobMatch = rawText.match(
    /(?:DOB|Date of Birth|जन्म तिथि)[\s:/|–-]*\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](19\d{2}|20\d{2})\b/i
  ) || rawText.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](19\d{2}|20\d{2})\b/);

  if (dobMatch) {
    const day = dobMatch[1].padStart(2, '0');
    const month = dobMatch[2].padStart(2, '0');
    const year = dobMatch[3];
    pushResult('dob', `${year}-${month}-${day}`, 0.85);
  }

  // 4. IFSC Code: 4 letters + 0 + 6 alphanumeric
  const ifscMatch = rawText.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/);
  if (ifscMatch) {
    pushResult('ifsc', ifscMatch[1], 0.9);
  }

  // 5. Mobile Phone Number: 10-digit Indian numbers starting with 6,7,8,9
  const mobileMatch = rawText.match(
    /(?:Mobile|Phone|Tel|Mo)[\s:/|–-]*(?:(?:\+91|91|0)?[-\s]?)?([6-9]\d{9})\b/i
  ) || rawText.match(/(?:^|[^0-9])(?:(?:\+91|91|0)?[-\s]?)?([6-9]\d{9})(?:[^0-9]|$)/);

  if (mobileMatch) {
    pushResult('mobile', mobileMatch[1], 0.85);
  }

  // 6. Indian Pincode: 6 digits starting with 1-9
  const pincodeMatch = rawText.match(/(?:Pincode|Pin|Postal)[\s:/|–-]*\b([1-9]\d{5})\b/i) ||
    rawText.match(/\b([1-9]\d{5})\b/);
  if (pincodeMatch) {
    pushResult('pincode', pincodeMatch[1], 0.8);
  }

  // 7. Email Address
  const emailMatch = rawText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (emailMatch) {
    pushResult('email', emailMatch[0].toLowerCase(), 0.95);
  }

  // 8. Full Legal Name
  const nameMatch = rawText.match(
    /(?:Account Holder(?: Name)?|Candidate Name|Applicant Name|Full Name|Student Name|Resident Name|Name|नाम)[^\S\r\n]*[:/|–-]+[^\S\r\n]*([A-Za-z\s.]{3,45})/i
  );
  if (nameMatch) {
    const cleanName = nameMatch[1].replace(/\r?\n.*$/g, '').trim();
    if (!cleanName.toLowerCase().includes('authority') && !cleanName.toLowerCase().includes('department')) {
      pushResult('fullName', cleanName, 0.9);
    }
  }

  // 9. Father's Name
  const fatherMatch = rawText.match(
    /(?:Father(?:'s)? Name|Care of|C\/o|S\/o|D\/o|W\/o|पिता का नाम)[^\S\r\n]*[:/|–-]+[^\S\r\n]*([A-Za-z\s.]{3,45})/i
  );
  if (fatherMatch) {
    const cleanFather = fatherMatch[1].replace(/\r?\n.*$/g, '').trim();
    pushResult('fatherName', cleanFather, 0.85);
  }

  // 10. Gender
  const genderMatch = rawText.match(/(?:Gender|Sex|लिंग)[^\S\r\n]*[:/|–-]+[^\S\r\n]*(Male|Female|Transgender|Other)/i) ||
    rawText.match(/\b(Female|Male)\b/i);
  if (genderMatch) {
    pushResult('gender', genderMatch[1].toLowerCase(), 0.85);
  }

  // 11. Bank Account Number (9 to 18 digits)
  const bankAccMatch = rawText.match(
    /(?:Account Number|Account No\.?|A\/c No\.?|Bank Account|खाता संख्या)[^\S\r\n]*[:/|–-]+[^\S\r\n]*([0-9]{9,18})\b/i
  );
  if (bankAccMatch) {
    pushResult('bankAccount', bankAccMatch[1], 0.9);
  }

  // 12. Bank Account Type
  const accTypeMatch = rawText.match(
    /(?:Account Type|A\/c Type)[^\S\r\n]*[:/|–-]+[^\S\r\n]*(Savings|Current|Salary|Fixed)/i
  ) || rawText.match(/\b(Savings Bank|Savings|Current)\b/i);
  if (accTypeMatch) {
    pushResult('bankAccountType', accTypeMatch[1].toLowerCase().includes('save') || accTypeMatch[1].toLowerCase().includes('savings') ? 'savings' : 'current', 0.85);
  }

  // 13. Marks Percentage / Score
  const marksMatch = rawText.match(
    /(?:Marks Percentage|Percentage|Percent|Marks Obtained|Overall Percentage)[^\S\r\n]*[:/|–-]+[^\S\r\n]*([0-9]{1,2}(?:\.[0-9]{1,2})?)\s*%?/i
  ) || rawText.match(/\b([0-9]{2}(?:\.[0-9]{1,2})?)\s*%/);
  if (marksMatch) {
    pushResult('marksPercent', marksMatch[1], 0.85);
  }

  // 14. Academic Institution
  const instMatch = rawText.match(
    /(?:Institution|College|University|School|Board|विश्वविद्यालय)[^\S\r\n]*[:/|–-]+[^\S\r\n]*([A-Za-z0-9\s,.-]{4,55})/i
  ) || rawText.match(/([A-Za-z\s]+(?:University|Institute of Technology|College))[^\r\n]*/i);
  if (instMatch) {
    const cleanInst = instMatch[1].replace(/\r?\n.*$/g, '').trim();
    pushResult('institution', cleanInst, 0.85);
  }

  // 15. Degree / Course
  const courseMatch = rawText.match(
    /(?:Course|Degree|Program|Stream|Branch)[^\S\r\n]*[:/|–-]+[^\S\r\n]*([A-Za-z0-9\s,.-]{3,50})/i
  ) || rawText.match(/\b(Bachelor of [A-Za-z\s]+|B\.Tech[A-Za-z\s()]*|B\.Sc|M\.Tech|MBA|MCA)\b/i);
  if (courseMatch) {
    const cleanCourse = courseMatch[1].replace(/\r?\n.*$/g, '').trim();
    pushResult('course', cleanCourse, 0.85);
  }

  // 16. Residential Address
  const addrMatch = rawText.match(
    /(?:Address|Residential Address|Communication Address|पता)[^\S\r\n]*[:/|–-]+[^\S\r\n]*([^\n\r]+(?:\n[^\n\r]+)?)/i
  );
  if (addrMatch) {
    const cleanAddr = addrMatch[1].trim();
    pushResult('address', cleanAddr, 0.8);
  }

  // 17. Annual Family Income
  const incomeMatch = rawText.match(
    /(?:Annual Income|Family Income|Gross Income|Income)[^\S\r\n]*[:/|–-]+[^\S\r\n]*(?:Rs\.?|INR)?[^\S\r\n]*([0-9,]+)/i
  );
  if (incomeMatch) {
    pushResult('annualIncome', incomeMatch[1].replace(/,/g, ''), 0.85);
  }

  // 18. Social Category / Caste
  const catMatch = rawText.match(
    /(?:Category|Social Category|Caste|वर्ग)[^\S\r\n]*[:/|–-]+[^\S\r\n]*(General|OBC|SC|ST|EWS|SEBC)/i
  );
  if (catMatch) {
    pushResult('category', catMatch[1].toUpperCase(), 0.85);
  }

  return results;
}
