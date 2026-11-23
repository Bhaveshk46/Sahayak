/**
 * Hardcoded sample profile strictly for M3 testing.
 * The production profile storage, encryption, and extraction arrives in M4.
 */
export const M3_TEST_PROFILE: Record<string, string> = {
  // Common / Personal Identity
  fullName: 'Aditi Sharma',
  legalName: 'Aditi Ramesh Sharma',
  email: 'aditi.sharma@example.com',
  phone: '9876543210',
  dob: '2001-08-15',
  gender: 'female',
  fatherName: 'Ramesh Sharma',
  address: 'Flat 402, Sunshine Heights, MG Road, Mumbai',
  pincode: '400001',
  state: 'Maharashtra',
  panNumber: 'ABCDE1234F',
  aadhaarNumber: '987654321012',

  // Scholarship Specific
  category: 'OBC',
  collegeName: 'Indian Institute of Technology, Bombay',
  scheme: 'merit',
  annualIncome: '250000',

  // Job Specific
  candidateName: 'Rahul Verma',
  applicantEmail: 'rahul.verma@example.com',
  applicantPhone: '9823012345',
  experienceYears: '3.5',
  qualification: 'B.Tech / B.E.',
  currentCompany: 'Infosys Technologies Ltd',
  preferredLocation: 'Bengaluru',
  noticePeriod: '30_days',
  declaration: 'true',

  // Bank Frame (KYC)
  bankAccountHolder: 'Aditi Ramesh Sharma',
  bankAccountNumber: '123456789012',
  bankIfscCode: 'SBIN0001234',
  bankAccountType: 'savings',
};
