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
  "College of Accountancy",
  "College of Agriculture",
  "College of Arts and Sciences",
  "College of Business Administration",
  "College of Communication",
  "College of Informatics and Computing Studies",
  "College of Criminology",
  "College of Education",
  "College of Engineering & Architecture",
  "College of Law",
  "College of Medical Technology",
  "College of Medicine",
  "College of Midwifery",
  "College of Music",
  "College of Nursing",
  "College of Physical Therapy",
  "College of Respiratory Therapy",
  "School of International Relations",
  "School of Graduate Studies",
  "Integrated School"
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
