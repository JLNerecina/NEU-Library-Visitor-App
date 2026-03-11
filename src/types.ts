export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  college: string;
  studentId?: string;
  isBlocked: boolean;
  role?: 'admin' | 'user' | 'library officer';
}

export interface VisitLog {
  id?: string;
  uid: string;
  userName: string;
  college: string;
  reason: string;
  timestamp: any; // Firestore Timestamp
  exitTimestamp?: any; // Firestore Timestamp
}

export const COLLEGES = [
  "College of Arts and Sciences",
  "College of Business Administration",
  "College of Computer Studies",
  "College of Education",
  "College of Engineering and Architecture",
  "College of Music",
  "College of Nursing",
  "College of Law",
  "School of Graduate Studies",
  "Office / Staff",
  "Visitor / External"
];

export const REASONS = [
  "Research",
  "Study",
  "Borrowing Books",
  "Returning Books",
  "Clearance",
  "Internet Access",
  "Other"
];

export const ADMIN_EMAIL = "johnliannerecina@gmail.com";
export const OFFICER_EMAIL = "johnlian.nerecina@neu.edu.ph";
