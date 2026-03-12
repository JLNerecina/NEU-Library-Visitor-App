export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  college: string;
  studentId?: string;
  isBlocked: boolean;
  role?: 'admin' | 'user' | 'library officer';
  photoURL?: string;
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

export interface AppNotification {
  id?: string;
  recipientUid: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: any;
  isRead: boolean;
}

export interface SystemActivity {
  id?: string;
  type: 'entry' | 'exit' | 'add_user' | 'delete_user' | 'block_user' | 'unblock_user' | 'edit_user';
  actorId: string;
  actorName: string;
  targetId?: string;
  targetName?: string;
  details?: string;
  timestamp: any;
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

export const ADMIN_EMAIL = "johnlian.nerecina@neu.edu.ph";
export const OFFICER_EMAIL = "some-other-officer@neu.edu.ph";
