/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  increment,
  onSnapshot,
  runTransaction
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { 
  UserProfile, 
  VisitLog, 
  COLLEGES, 
  REASONS, 
  ADMIN_EMAIL,
  OFFICER_EMAIL 
} from './types';
import { cn } from './lib/utils';
import { 
  LogOut, 
  LayoutDashboard, 
  History, 
  UserCircle, 
  ShieldAlert, 
  CheckCircle2, 
  Users, 
  Calendar,
  Search,
  ChevronRight,
  ShieldBan,
  ShieldCheck,
  Library,
  Mail,
  Lock,
  Sun,
  Moon,
  Zap,
  RefreshCw,
  User as UserIcon,
  IdCard,
  GraduationCap,
  ArrowRight,
  Bell,
  QrCode,
  Map,
  Settings,
  BookOpen,
  Coffee,
  Truck,
  Monitor,
  MoreHorizontal,
  FileText,
  Trash2,
  Plus,
  BookMarked,
  DoorOpen,
  DoorClosed,
  Clock,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'admin' | 'logs'>('home');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'verification-sent' | 'complete-profile'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') as 'light' | 'dark' || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const [occupancy, setOccupancy] = useState(0);

  useEffect(() => {
    if (profile?.role === 'admin' || profile?.role === 'library officer') {
      const syncOccupancy = async () => {
        try {
          const q = query(collection(db, 'visitLogs'), where('exitTimestamp', '==', null));
          const snap = await getDocs(q);
          setOccupancy(snap.size);
          await setDoc(doc(db, 'stats', 'library'), { occupancy: snap.size }, { merge: true });
        } catch (err: any) {
          if (err.code !== 'permission-denied') {
            console.error("Admin occupancy sync failed:", err);
          }
        }
      };
      syncOccupancy();
    }
  }, [profile]);

  useEffect(() => {
    if (!user || !profile) return;

    // Use onSnapshot for real-time occupancy updates from a public stats document
    const statsRef = doc(db, 'stats', 'library');
    const unsubscribe = onSnapshot(statsRef, (docSnap) => {
      if (docSnap.exists()) {
        setOccupancy(docSnap.data().occupancy || 0);
      } else {
        // Initialize if it doesn't exist
        setDoc(statsRef, { occupancy: 0 }, { merge: true }).catch(err => {
          if (err.code !== 'permission-denied') {
            console.error("Error initializing occupancy:", err);
          }
        });
      }
    }, (err) => {
      console.error("Error listening to stats/library:", err);
    });

    return () => unsubscribe();
  }, [user, profile]);

  const fetchOccupancy = () => {
    // No-op now as we use onSnapshot, but kept for compatibility with StudentDashboard's onAction
  };

  useEffect(() => {
    // Test connection to Firestore
    const testConnection = async () => {
      try {
        const { getDocFromServer } = await import('firebase/firestore');
        await getDocFromServer(doc(db, 'stats', 'library'));
      } catch (error: any) {
        if (error.message?.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (!firebaseUser.email?.endsWith('@neu.edu.ph')) {
          setAuthError("Access restricted to @neu.edu.ph emails only.");
          await signOut(auth);
          setUser(null);
          setProfile(null);
        } else {
          setUser(firebaseUser);
          const userProfile = await fetchProfile(firebaseUser.uid);
          if (!userProfile) {
            setAuthMode('complete-profile');
          }
          setAuthError(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        let data = docSnap.data() as UserProfile;
        
        // Auto-upgrade role for specific emails if needed
        if (data.email === ADMIN_EMAIL && data.role !== 'admin') {
          data.role = 'admin';
          await updateDoc(docRef, { role: 'admin' });
        } else if (data.email === OFFICER_EMAIL && data.role !== 'library officer') {
          data.role = 'library officer';
          await updateDoc(docRef, { role: 'library officer' });
        }
        setProfile(data);
        return data;
      } else {
        setProfile(null);
        return null;
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      return null;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = (e.target as any).email.value;
    const password = (e.target as any).password.value;
    setAuthError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (!userCredential.user.emailVerified) {
        setAuthMode('verification-sent');
      }
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked') {
        setAuthError("The sign-in popup was blocked by your browser. Please allow popups for this site or try again.");
      } else if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        // Ignore these common user-initiated cancellations
      } else {
        setAuthError(err.message);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleRegister = async (data: any) => {
    setAuthError(null);
    if (!data.email.endsWith('@neu.edu.ph')) {
      setAuthError("Only @neu.edu.ph emails are accepted.");
      return;
    }
    try {
      const { email, password, fullName, studentId, college } = data;
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create profile immediately
      const newProfile: UserProfile = {
        uid: userCredential.user.uid,
        email: email,
        name: fullName,
        college: college,
        studentId: studentId,
        isBlocked: false,
        role: email === ADMIN_EMAIL ? 'admin' : (email === OFFICER_EMAIL ? 'library officer' : 'user')
      };
      
      await setDoc(doc(db, 'users', userCredential.user.uid), newProfile);
      setProfile(newProfile);

      await sendEmailVerification(userCredential.user);
      setAuthMode('verification-sent');
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleCompleteProfile = async (data: any) => {
    if (!user) return;
    setAuthError(null);
    try {
      const { studentId, college } = data;
      const newProfile: UserProfile = {
        uid: user.uid,
        email: user.email!,
        name: user.displayName || 'Unknown User',
        college: college,
        studentId: studentId,
        isBlocked: false,
        role: user.email === ADMIN_EMAIL ? 'admin' : (user.email === OFFICER_EMAIL ? 'library officer' : 'user')
      };
      
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      setAuthMode('login');
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('home');
    setAuthMode('login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full flex bg-[var(--bg-color)] overflow-hidden">
      {/* Decorative Orbs */}
      <div className="orb w-[500px] h-[500px] bg-blue-600 top-[-10%] right-[-10%] animate-float" />
      <div className="orb w-[400px] h-[400px] bg-purple-600 bottom-[10%] left-[-5%] animate-float" style={{ animationDelay: '-5s' }} />

      {!user ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-4 md:p-8">
          <header className="w-full max-w-md flex items-center justify-between mb-8 z-50">
            <div className="flex items-center gap-2">
              <img src="/New Era University Library Logo.png" alt="NEU Logo" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
              <span className="text-lg font-bold tracking-tight text-[var(--text-main)]">NEU Library</span>
            </div>
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-[var(--input-bg)] border border-white/10 hover:bg-white/10 transition-all text-[var(--text-main)]"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </header>
          {authMode === 'login' && (
            <LoginScreen 
              onGoogleLogin={handleGoogleLogin} 
              onEmailLogin={handleLogin}
              onToggleRegister={() => setAuthMode('register')}
              error={authError} 
              isAuthenticating={isAuthenticating}
            />
          )}
          {authMode === 'register' && (
            <RegisterScreen 
              onRegister={handleRegister}
              onToggleLogin={() => setAuthMode('login')}
              error={authError}
            />
          )}
          {authMode === 'verification-sent' && (
            <VerificationSentScreen onBackToLogin={() => {
              signOut(auth);
              setAuthMode('login');
            }} />
          )}
        </div>
      ) : user && !user.emailVerified && authMode !== 'verification-sent' ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-4 md:p-8">
           <VerificationSentScreen onBackToLogin={() => {
              signOut(auth);
              setAuthMode('login');
            }} />
        </div>
      ) : !profile || !profile.studentId ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-4 md:p-8">
          <ProfileSetup user={user} profile={profile} onComplete={() => fetchProfile(user.uid)} />
        </div>
      ) : (
        <>
          <Sidebar 
            profile={profile} 
            activeView={view} 
            setView={setView} 
            onLogout={handleLogout} 
            occupancy={occupancy}
          />
          <div className="flex-1 flex flex-col h-screen overflow-hidden">
            <Header 
              profile={profile} 
              theme={theme} 
              toggleTheme={toggleTheme} 
              onLogout={handleLogout}
            />
            <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 lg:pb-8">
              <div className="max-w-6xl mx-auto">
                <AnimatePresence mode="wait">
                  {view === 'home' && (
                    <motion.div
                      key="home"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      {profile.role === 'admin' || profile.role === 'library officer' ? (
                        <LibraryOfficerDashboard profile={profile} />
                      ) : (
                        <StudentDashboard profile={profile} onAction={fetchOccupancy} onViewAll={() => setView('logs')} />
                      )}
                    </motion.div>
                  )}
                  {view === 'logs' && (
                    <motion.div
                      key="logs"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      <UserLogs profile={profile} />
                    </motion.div>
                  )}
                  {view === 'about' && (
                    <motion.div
                      key="about"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      <AboutSection />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </main>
          </div>
          <MobileNav activeView={view} setView={setView} />
        </>
      )}
    </div>
  );
}

function Sidebar({ 
  profile, 
  activeView, 
  setView, 
  onLogout,
  occupancy
}: { 
  profile: UserProfile, 
  activeView: string, 
  setView: (v: any) => void,
  onLogout: () => void,
  occupancy: number
}) {
  const capacity = 1000;
  const displayOccupancy = Math.max(0, occupancy);
  const percentage = Math.min((displayOccupancy / capacity) * 100, 100);

  return (
    <aside className="w-64 hidden lg:flex flex-col bg-[var(--glass-bg)] backdrop-blur-xl border-r border-[var(--glass-border)] h-screen p-6 z-50">
      <div className="flex items-center gap-3 mb-10">
        <img src="/New Era University Library Logo.png" alt="NEU Logo" className="w-10 h-10 object-contain" />
        <div>
          <h1 className="text-lg font-bold leading-tight">NEU Library</h1>
          <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Visitor Portal</p>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        <SidebarItem 
          active={activeView === 'home'} 
          onClick={() => setView('home')} 
          icon={<LayoutDashboard className="w-5 h-5" />} 
          label="Dashboard" 
        />
        <SidebarItem 
          active={activeView === 'logs'} 
          onClick={() => setView('logs')} 
          icon={<History className="w-5 h-5" />} 
          label="Visit History" 
        />
        <SidebarItem 
          active={activeView === 'about'} 
          onClick={() => setView('about')} 
          icon={<Info className="w-5 h-5" />} 
          label="About Library" 
        />
        <SidebarItem 
          active={activeView === 'map'} 
          onClick={() => {}} 
          icon={<Map className="w-5 h-5" />} 
          label="Library Map" 
        />
        <SidebarItem 
          active={activeView === 'settings'} 
          onClick={() => {}} 
          icon={<Settings className="w-5 h-5" />} 
          label="Settings" 
        />
      </nav>

      <div className="mt-auto space-y-6">
        <div className="p-4 bg-[var(--input-bg)] rounded-2xl border border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Library Capacity</span>
            <span className="text-[10px] font-bold">{displayOccupancy} / {capacity}</span>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-500" 
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors font-medium text-sm"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

function SidebarItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
        active 
          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
          : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-white/5"
      )}
    >
      {icon}
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}

function MobileNav({ 
  activeView, 
  setView 
}: { 
  activeView: string, 
  setView: (v: any) => void 
}) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--glass-bg)] backdrop-blur-xl border-t border-[var(--glass-border)] z-50 pb-safe">
      <div className="flex items-center justify-around p-2">
        <MobileNavItem 
          active={activeView === 'home'} 
          onClick={() => setView('home')} 
          icon={<LayoutDashboard className="w-6 h-6" />} 
          label="Home" 
        />
        <MobileNavItem 
          active={activeView === 'logs'} 
          onClick={() => setView('logs')} 
          icon={<History className="w-6 h-6" />} 
          label="History" 
        />
        <MobileNavItem 
          active={activeView === 'about'} 
          onClick={() => setView('about')} 
          icon={<Info className="w-6 h-6" />} 
          label="About" 
        />
        <MobileNavItem 
          active={activeView === 'map'} 
          onClick={() => {}} 
          icon={<Map className="w-6 h-6" />} 
          label="Map" 
        />
      </div>
    </nav>
  );
}

function MobileNavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 p-2 rounded-xl transition-all",
        active ? "text-blue-500" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function Header({ profile, theme, toggleTheme, onLogout }: { profile: UserProfile, theme: string, toggleTheme: () => void, onLogout: () => void }) {
  return (
    <header className="w-full bg-[var(--glass-bg)]/50 backdrop-blur-md border-b border-[var(--glass-border)] px-4 md:px-8 py-4 flex items-center justify-between z-40">
      <div className="flex items-center gap-3">
        <img src="/New Era University Library Logo.png" alt="NEU Logo" className="w-8 h-8 object-contain lg:hidden" />
        <h2 className="text-xl font-bold text-[var(--text-main)] truncate">
          {profile.role === 'admin' ? 'Administrator' : profile.role === 'library officer' ? 'Library Officer' : 'Student'} Dashboard
        </h2>
      </div>
      
      <div className="flex items-center gap-4 md:gap-6">
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
          <button className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors relative hidden sm:block">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[var(--bg-color)]" />
          </button>
        </div>

        <div className="h-8 w-px bg-[var(--glass-border)] hidden sm:block" />

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold leading-none">{profile.name}</p>
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase mt-1">
              {profile.role === 'admin' ? 'Administrator' : profile.role === 'library officer' ? 'Library Officer' : 'Student'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-white/10 flex items-center justify-center text-white font-bold shrink-0">
            {profile.name.charAt(0)}
          </div>
          <button 
            onClick={onLogout}
            className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors lg:hidden"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function LibraryCapacity({ occupancy, capacity }: { occupancy: number, capacity: number }) {
  const displayOccupancy = Math.max(0, occupancy);
  const percentage = Math.min((displayOccupancy / capacity) * 100, 100);
  
  return (
    <div className="p-4 bg-[var(--input-bg)] rounded-2xl border border-white/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Library Capacity</span>
        <span className="text-[10px] font-bold">{displayOccupancy} / {capacity}</span>
      </div>
      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-500 rounded-full transition-all duration-500" 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function LibraryOfficerDashboard({ profile }: { profile: UserProfile }) {
  const [occupancy, setOccupancy] = useState(0);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<VisitLog[]>([]);
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'stats', 'library')).then(doc => {
      console.log("Stats doc:", doc.data());
    }).catch(err => {
      console.error("Error fetching stats:", err);
    });

    const unsubStats = onSnapshot(doc(db, 'stats', 'library'), (doc) => {
      setOccupancy(doc.data()?.occupancy || 0);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'stats/library'));
    
    // Fetch users and logs, then filter them
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const allUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setUsers(allUsers.filter(u => u.role !== 'admin' && u.role !== 'library officer'));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    
    const unsubLogs = onSnapshot(collection(db, 'visitLogs'), async (snapshot) => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const adminUids = usersSnap.docs
          .filter(doc => doc.data().role === 'admin' || doc.data().role === 'library officer')
          .map(doc => doc.id);
        
        setLogs(snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as VisitLog))
          .filter(log => !adminUids.includes(log.uid)));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'users');
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'visitLogs'));
    return () => { unsubStats(); unsubUsers(); unsubLogs(); };
  }, []);

  const handleBlockToggle = async (user: UserProfile) => {
    await updateDoc(doc(db, 'users', user.uid), { isBlocked: !user.isBlocked });
  };

  const handleDelete = async (uid: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      await deleteDoc(doc(db, 'users', uid));
    }
  };

  const handleBulkDelete = async () => {
    if (confirm(`Are you sure you want to delete ${selectedUsers.size} users?`)) {
      const batch = writeBatch(db);
      selectedUsers.forEach(uid => batch.delete(doc(db, 'users', uid)));
      await batch.commit();
      setSelectedUsers(new Set());
      setIsBulkDeleteMode(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.college.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.studentId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLogs = logs.filter(l => 
    l.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.college.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.reason.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
        <input 
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search visitors, records, or logs..."
          className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
        />
      </div>

      <h2 className="text-2xl font-bold mb-4">{profile.role === 'admin' ? 'Library Director' : 'Library Officer'} Dashboard</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={<Users className="w-6 h-6" />} label="Today's Visitors" value={logs.filter(l => l.timestamp?.toDate().toDateString() === new Date().toDateString()).length} />
        <StatCard icon={<Calendar className="w-6 h-6" />} label="Weekly Total" value={logs.length} />
        <StatCard icon={<Zap className="w-6 h-6" />} label="Active Users" value={users.filter(u => !u.isBlocked).length} />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* User Management */}
        <div className="lg:col-span-2 glass-card p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">User Management</h3>
            <div className="flex gap-2">
              {isBulkDeleteMode ? (
                <>
                  <button onClick={() => setIsBulkDeleteMode(false)} className="px-4 py-2 bg-gray-500/10 text-gray-400 rounded-xl text-sm font-bold hover:bg-gray-500/20">Cancel</button>
                  <button onClick={handleBulkDelete} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-500">Confirm Delete ({selectedUsers.size})</button>
                </>
              ) : (
                <button onClick={() => setIsBulkDeleteMode(true)} className="px-4 py-2 bg-red-500/10 text-red-400 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-red-500/20">
                  <Trash2 className="w-4 h-4" /> Bulk Delete
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-muted)] border-b border-white/10">
                  {isBulkDeleteMode && <th className="py-4 px-2"><input type="checkbox" checked={selectedUsers.size === users.length} onChange={(e) => setSelectedUsers(e.target.checked ? new Set(users.map(u => u.uid)) : new Set())} /></th>}
                  <th className="text-left py-4 px-2">USER NAME</th>
                  <th className="text-left py-4 px-2">COLLEGE</th>
                  <th className="text-left py-4 px-2">STATUS</th>
                  <th className="text-left py-4 px-2">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.uid} className="border-b border-white/5 hover:bg-white/5">
                    {isBulkDeleteMode && <td className="py-4 px-2"><input type="checkbox" checked={selectedUsers.has(user.uid)} onChange={(e) => { const next = new Set(selectedUsers); e.target.checked ? next.add(user.uid) : next.delete(user.uid); setSelectedUsers(next); }} /></td>}
                    <td className="py-4 px-2 font-bold flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      {user.name}
                    </td>
                    <td className="py-4 px-2 text-[var(--text-muted)]">{user.college}</td>
                    <td className="py-4 px-2">
                      <span className={cn("px-2 py-1 rounded-full text-xs font-bold", !user.isBlocked ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                        ● {user.isBlocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="py-4 px-2 text-blue-400 font-bold cursor-pointer hover:underline">
                      <div className="flex gap-2">
                        <button onClick={() => handleBlockToggle(user)}>{user.isBlocked ? 'Unblock' : 'Block'}</button>
                        <button onClick={() => handleDelete(user.uid)} className="text-red-400">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Activity */}
        <div className="glass-card p-6 space-y-6">
          <h3 className="text-xl font-bold">System Activity</h3>
          <div className="space-y-6">
            {filteredLogs.slice(0, 5).map((log, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-[var(--input-bg)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                  {log.exitTimestamp ? <ArrowRight className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm font-bold">{log.userName} {log.exitTimestamp ? 'exited' : 'entered'} the library</p>
                  <p className="text-xs text-[var(--text-muted)]">{log.timestamp?.toDate().toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentDashboard({ profile, onAction, onViewAll }: { profile: UserProfile, onAction: () => void, onViewAll: () => void }) {
  const [logs, setLogs] = useState<VisitLog[]>([]);
  const [stats, setStats] = useState({ total: 0 });
  const [activeVisit, setActiveVisit] = useState<VisitLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch recent logs
      const q = query(
        collection(db, 'visitLogs'), 
        where('uid', '==', profile.uid),
        limit(20)
      );
      const querySnapshot = await getDocs(q);
      const logsData = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .sort((a: any, b: any) => b.timestamp?.toMillis() - a.timestamp?.toMillis()) as VisitLog[];
      
      setLogs(logsData);

      // Fetch total visits
      const totalQ = query(collection(db, 'visitLogs'), where('uid', '==', profile.uid));
      const totalSnap = await getDocs(totalQ);
      setStats({ total: totalSnap.size });

      // Check for any active visit (latest log without an exit timestamp)
      if (logsData.length > 0) {
        const latestLog = logsData[0];
        if (!latestLog.exitTimestamp) {
          setActiveVisit(latestLog);
        } else {
          setActiveVisit(null);
        }
      } else {
        setActiveVisit(null);
      }
      
      // Notify parent to refresh global occupancy
      onAction();
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [profile.uid]);

  const handleExit = async () => {
    if (!activeVisit?.id) return;
    try {
      await updateDoc(doc(db, 'visitLogs', activeVisit.id), {
        exitTimestamp: serverTimestamp()
      });

      // Decrement global occupancy, ensuring it doesn't go below 0
      const statsRef = doc(db, 'stats', 'library');
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(statsRef);
        if (!sfDoc.exists()) {
          transaction.set(statsRef, { occupancy: 0 });
        } else {
          const newOccupancy = Math.max(0, (sfDoc.data().occupancy || 0) - 1);
          transaction.update(statsRef, { occupancy: newOccupancy });
        }
      });

      // Refresh data locally instead of reloading the whole page
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 border-red-500/20 bg-red-500/5 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
        <h3 className="text-xl font-bold">Permission Error</h3>
        <p className="text-sm text-[var(--text-muted)]">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-8 bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-blue-500/20 relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-sm font-medium text-blue-400 mb-1">Welcome back,</p>
            <h1 className="text-4xl font-bold mb-8">{profile.name}</h1>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">College</p>
                <p className="text-sm font-bold truncate">{profile.college}</p>
              </div>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Student ID</p>
                <p className="text-sm font-bold">{profile.studentId || 'N/A'}</p>
              </div>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Total Visits</p>
                <p className="text-sm font-bold">{stats.total} Visits</p>
              </div>
            </div>
          </div>
          <BookMarked className="absolute right-[-20px] bottom-[-20px] w-64 h-64 text-white/5 -rotate-12 group-hover:rotate-0 transition-transform duration-700" />
        </div>

        <div className="glass-card p-8 flex flex-col items-center justify-center text-center space-y-4">
          {activeVisit ? (
            <>
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500">
                <DoorOpen className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Currently Inside</h3>
                <p className="text-xs text-[var(--text-muted)]">You logged in for {activeVisit.reason}</p>
              </div>
              <button 
                onClick={handleExit}
                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-600/20"
              >
                Log Your Exit
              </button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500">
                <Library className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Not Inside</h3>
                <p className="text-xs text-[var(--text-muted)]">Log your visit below to enter</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Log Visit Section */}
      {!activeVisit && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Log Your Visit</h3>
            <button className="text-xs font-bold text-blue-500 hover:underline">Choose a purpose</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            <PurposeCard icon={<Search className="w-6 h-6" />} label="Research" reason="Research" profile={profile} onSuccess={fetchData} />
            <PurposeCard icon={<BookOpen className="w-6 h-6" />} label="Self-Study" reason="Study" profile={profile} onSuccess={fetchData} />
            <PurposeCard icon={<Users className="w-6 h-6" />} label="Group Work" reason="Group Work" profile={profile} onSuccess={fetchData} />
            <PurposeCard icon={<Truck className="w-6 h-6" />} label="Book Pickup" reason="Borrowing Books" profile={profile} onSuccess={fetchData} />
            <PurposeCard icon={<Coffee className="w-6 h-6" />} label="Social" reason="Other" profile={profile} onSuccess={fetchData} />
          </div>
        </section>
      )}

      {/* Recent Visits Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">Recent Visits</h3>
          <button onClick={onViewAll} className="text-xs font-bold text-blue-500 hover:underline">View All</button>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--input-bg)] border border-white/5 rounded-xl text-xs font-bold text-[var(--text-muted)]">
            FROM <span className="text-[var(--text-main)]">10/01/2023</span> <Calendar className="w-3 h-3" />
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--input-bg)] border border-white/5 rounded-xl text-xs font-bold text-[var(--text-muted)]">
            TO <span className="text-[var(--text-main)]">10/31/2023</span> <Calendar className="w-3 h-3" />
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/10 rounded-xl text-xs font-bold text-blue-400 ml-auto">
            <FileText className="w-3 h-3" />
            Print History
          </button>
        </div>

        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="glass-card p-12 text-center text-[var(--text-muted)]">No recent visits.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="glass-card p-4 flex items-center gap-4 hover:bg-white/5 transition-colors group">
                <div className="w-12 h-12 rounded-2xl bg-[var(--input-bg)] flex items-center justify-center text-blue-400">
                  {log.reason === 'Research' ? <Search className="w-6 h-6" /> : 
                   log.reason === 'Study' ? <BookOpen className="w-6 h-6" /> : 
                   log.reason === 'Borrowing Books' ? <Truck className="w-6 h-6" /> : 
                   <Library className="w-6 h-6" />}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-sm">Library Main Hall</h4>
                  <p className="text-xs text-[var(--text-muted)]">
                    {log.reason} {log.exitTimestamp ? '• Exited' : '• Inside'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{log.timestamp?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase">
                    {log.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {log.exitTimestamp && ` - ${log.exitTimestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
                <button className="p-2 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Footer Info */}
      <div className="pt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-t border-white/5">
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-blue-400">Library Updates</h4>
          <p className="text-xs text-[var(--text-muted)] max-w-md">
            The 4th floor Quiet Zone is currently under renovation. Study rooms are available by reservation.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Visitor System v2.4</p>
          <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase">© 2024 NEU Library</p>
        </div>
      </div>
    </div>
  );
}

function PurposeCard({ icon, label, reason, profile, onSuccess }: { icon: React.ReactNode, label: string, reason: string, profile: UserProfile, onSuccess: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  
  const handleLog = async () => {
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'visitLogs'), {
        uid: profile.uid,
        userName: profile.name,
        college: profile.college,
        reason: reason,
        timestamp: serverTimestamp(),
        exitTimestamp: null
      });
      
      // Increment global occupancy, ensuring it starts from at least 0
      const statsRef = doc(db, 'stats', 'library');
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(statsRef);
        if (!sfDoc.exists()) {
          transaction.set(statsRef, { occupancy: 1 });
        } else {
          const currentOccupancy = Math.max(0, sfDoc.data().occupancy || 0);
          transaction.update(statsRef, { occupancy: currentOccupancy + 1 });
        }
      });

      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <button 
      onClick={handleLog}
      disabled={submitting}
      className="glass-card p-6 flex flex-col items-center justify-center gap-4 hover:bg-blue-600/10 hover:border-blue-500/30 transition-all group active:scale-95 disabled:opacity-50"
    >
      <div className="w-12 h-12 rounded-2xl bg-[var(--input-bg)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-blue-400 transition-colors">
        {icon}
      </div>
      <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function LoginScreen({ onGoogleLogin, onEmailLogin, onToggleRegister, error, isAuthenticating }: { 
  onGoogleLogin: () => void, 
  onEmailLogin: (e: React.FormEvent) => void,
  onToggleRegister: () => void,
  error: string | null,
  isAuthenticating: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8 md:p-10 w-full space-y-8"
      >
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Welcome Back</h1>
          <p className="text-[var(--text-muted)]">Visitor Management System</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={onEmailLogin} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text-muted)] ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
              <input 
                name="email"
                type="email" 
                placeholder="username@neu.edu.ph"
                required
                className="w-full bg-[var(--input-bg)] border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <label className="text-sm font-medium text-[var(--text-muted)]">Password</label>
              <button type="button" className="text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors">Forgot password?</button>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
              <input 
                name="password"
                type="password" 
                placeholder="••••••••"
                required
                className="w-full bg-[var(--input-bg)] border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isAuthenticating}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-600/20 disabled:opacity-50"
          >
            {isAuthenticating ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-transparent px-2 text-[var(--text-muted)] font-bold tracking-widest">Or continue with</span>
          </div>
        </div>

        <button
          onClick={onGoogleLogin}
          disabled={isAuthenticating}
          className="w-full py-4 px-6 bg-white/5 border border-white/10 text-[var(--text-main)] font-semibold rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {isAuthenticating ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          )}
          {isAuthenticating ? 'Connecting...' : 'Sign in with Google'}
        </button>

        <p className="text-center text-sm text-[var(--text-muted)]">
          Don't have an account? <button onClick={onToggleRegister} className="text-blue-500 font-semibold hover:underline">Register your visit</button>
        </p>
      </motion.div>

      <footer className="mt-12 text-center">
        <p className="text-xs text-[var(--text-muted)] font-medium tracking-wide">
          © 2024 NEU Library. All Rights Reserved.
        </p>
      </footer>
    </div>
  );
}

function RegisterScreen({ onRegister, onToggleLogin, error }: { 
  onRegister: (data: any) => void, 
  onToggleLogin: () => void,
  error: string | null 
}) {
  const [formData, setFormData] = useState({
    fullName: '',
    studentId: '',
    college: '',
    email: '',
    password: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRegister(formData);
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 w-full max-md py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8 md:p-10 w-full space-y-6"
      >
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto border border-white/10 mb-4">
            <img src="/New Era University Library Logo.png" alt="NEU Logo" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Create Account</h1>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1">Full Name</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input 
                value={formData.fullName}
                onChange={e => setFormData({...formData, fullName: e.target.value})}
                placeholder="Enter your full name"
                required
                className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1">Student/Employee ID</label>
            <div className="relative">
              <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input 
                value={formData.studentId}
                onChange={e => setFormData({...formData, studentId: e.target.value})}
                placeholder="e.g. 23-12558-550"
                pattern="\d{2}-\d{5}-\d{3}"
                title="Student ID must be in the format **-*****-*** (e.g., 23-12558-550)"
                required
                className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
              />
            </div>
            <p className="text-[10px] text-[var(--text-muted)] ml-1">Format: **-*****-*** (e.g., 23-12558-550)</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1">College/Department</label>
            <div className="relative">
              <GraduationCap className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <select 
                value={formData.college}
                onChange={e => setFormData({...formData, college: e.target.value})}
                required
                className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm appearance-none"
              >
                <option value="" disabled>Select your college</option>
                {COLLEGES.map(c => <option key={c} value={c} className="bg-[var(--bg-color)]">{c}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1">University Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input 
                type="email"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                placeholder="username@neu.edu.ph"
                required
                className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
              />
            </div>
            <p className="text-[10px] text-[var(--text-muted)] ml-1">Must be a valid @neu.edu.ph address</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input 
                type="password"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                placeholder="••••••••"
                required
                className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-[#006d6d] hover:bg-[#005a5a] text-white font-bold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
          >
            Sign Up <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-sm text-[var(--text-muted)]">
          Already have an account? <button onClick={onToggleLogin} className="text-blue-500 font-semibold hover:underline">Sign In</button>
        </p>
      </motion.div>
    </div>
  );
}

function VerificationSentScreen({ onBackToLogin }: { onBackToLogin: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md py-12">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card p-10 w-full text-center space-y-6"
      >
        <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto">
          <Mail className="w-10 h-10 text-blue-500" />
        </div>
        <h2 className="text-2xl font-bold">Verify Your Email</h2>
        <p className="text-[var(--text-muted)]">
          We've sent an activation link to your university email. 
          Please check your inbox and click the link to activate your account.
        </p>
        <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-500/10 text-xs text-blue-400">
          Didn't receive the email? Check your spam folder or try logging in again to resend.
        </div>
        <button
          onClick={onBackToLogin}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all"
        >
          Back to Sign In
        </button>
      </motion.div>
    </div>
  );
}

function BlockedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md">
      <div className="glass-card p-8 w-full text-center space-y-6">
        <ShieldAlert className="w-20 h-20 text-red-500 mx-auto" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-[var(--text-muted)]">
          Your account has been blocked from the library visitor system. 
          Please contact the Library Administration for more details.
        </p>
        <button
          onClick={onLogout}
          className="w-full py-3 px-6 bg-[var(--input-bg)] hover:bg-white/10 rounded-xl transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

function ProfileSetup({ user, profile, onComplete }: { user: User, profile: UserProfile | null, onComplete: () => void }) {
  const [college, setCollege] = useState('');
  const [studentId, setStudentId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!college || !studentId) return;
    setSubmitting(true);
    try {
      const newProfile: Partial<UserProfile> = {
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || 'Anonymous',
        college: college,
        studentId: studentId,
      };
      
      if (!profile) {
        newProfile.isBlocked = false;
        if (user.email === ADMIN_EMAIL) {
          newProfile.role = 'admin';
        } else if (user.email === OFFICER_EMAIL) {
          newProfile.role = 'library officer';
        } else {
          newProfile.role = 'user';
        }
      }
      
      await setDoc(doc(db, 'users', user.uid), newProfile, { merge: true });
      await onComplete();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md">
      <div className="glass-card p-8 w-full space-y-6">
        <div className="text-center">
          <UserCircle className="w-16 h-16 text-blue-400 mx-auto mb-2" />
          <h2 className="text-2xl font-bold">Profile Setup</h2>
          <p className="text-[var(--text-muted)]">Welcome, {user.displayName}!</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text-main)]/80">Student/Employee ID</label>
            <div className="relative">
              <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input 
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                placeholder="e.g. 23-12558-550"
                pattern="\d{2}-\d{5}-\d{3}"
                title="Student ID must be in the format **-*****-*** (e.g., 23-12558-550)"
                required
                className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
              />
            </div>
            <p className="text-[10px] text-[var(--text-muted)] ml-1">Format: **-*****-*** (e.g., 23-12558-550)</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text-main)]/80">Select College / Office</label>
            <select
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              required
            >
              <option value="" disabled className="bg-[var(--bg-color)]">Choose one...</option>
              {COLLEGES.map(c => (
                <option key={c} value={c} className="bg-[var(--bg-color)]">{c}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting || !college || !studentId}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20"
          >
            {submitting ? 'Saving...' : 'Complete Setup'}
          </button>
        </form>
      </div>
    </div>
  );
}

function UserLogs({ profile }: { profile: UserProfile }) {
  const [logs, setLogs] = useState<VisitLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const q = query(
        collection(db, 'visitLogs'), 
        where('uid', '==', profile.uid),
        limit(50)
      );
      const querySnapshot = await getDocs(q);
      const logsData = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .sort((a: any, b: any) => b.timestamp?.toMillis() - a.timestamp?.toMillis()) as VisitLog[];
      setLogs(logsData);
      setLoading(false);
    };
    fetchLogs();
  }, [profile.uid]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Visit History</h2>
        <div className="px-3 py-1 bg-[var(--input-bg)] rounded-full text-xs font-bold text-[var(--text-muted)]">
          Last 50 entries
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-[var(--text-muted)]">Loading history...</div>
        ) : logs.length === 0 ? (
          <div className="glass-card p-12 text-center text-[var(--text-muted)]">
            No visits logged yet.
          </div>
        ) : (
          logs.map((log, idx) => (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={log.id} 
              className="glass-card p-4 flex items-center justify-between group hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                  {log.reason === 'Research' ? <Search className="w-5 h-5" /> : 
                   log.reason === 'Study' ? <BookOpen className="w-5 h-5" /> : 
                   log.reason === 'Borrowing Books' ? <Truck className="w-5 h-5" /> : 
                   <Library className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-bold">{log.reason}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {log.timestamp?.toDate().toLocaleString() || 'Just now'}
                    {log.exitTimestamp && ` - Exit: ${log.exitTimestamp.toDate().toLocaleTimeString()}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Status</p>
                  <p className={cn(
                    "text-sm font-semibold",
                    log.exitTimestamp ? "text-emerald-500" : "text-blue-500"
                  )}>
                    {log.exitTimestamp ? 'Completed' : 'Inside'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--text-muted)]/20 group-hover:text-[var(--text-muted)]/50 transition-colors" />
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState({ today: 0, week: 0, month: 0, currentlyIn: 0 });
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentVisitors, setCurrentVisitors] = useState<VisitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [adminView, setAdminView] = useState<'users' | 'current'>('current');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch users
        const usersSnap = await getDocs(collection(db, 'users'));
        setUsers(usersSnap.docs.map(d => d.data() as UserProfile));

        // Stats
        const now = new Date();
        const startOfDay = new Date(now.setHours(0,0,0,0));
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const logsRef = collection(db, 'visitLogs');
        
        // 1. Fetch all active logs (no exit timestamp)
        const activeQ = query(logsRef, where('exitTimestamp', '==', null));
        const activeSnap = await getDocs(activeQ);
        const activeLogs = activeSnap.docs.map(d => ({ id: d.id, ...d.data() } as VisitLog));

        // 2. Fetch logs for stats (month)
        const monthQ = query(logsRef, where('timestamp', '>=', Timestamp.fromDate(startOfMonth)));
        const monthSnap = await getDocs(monthQ);
        const monthLogs = monthSnap.docs.map(d => ({ id: d.id, ...d.data() } as VisitLog));

        const todayLogs = monthLogs.filter(log => log.timestamp?.toDate() >= startOfDay);
        const weekLogs = monthLogs.filter(log => log.timestamp?.toDate() >= startOfWeek);

        setStats({
          today: todayLogs.length,
          week: weekLogs.length,
          month: monthLogs.length,
          currentlyIn: activeLogs.length
        });

        setCurrentVisitors(activeLogs);
      } catch (err: any) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const toggleBlock = async (userProfile: UserProfile) => {
    try {
      const userRef = doc(db, 'users', userProfile.uid);
      await updateDoc(userRef, { isBlocked: !userProfile.isBlocked });
      setUsers(users.map(u => u.uid === userProfile.uid ? { ...u, isBlocked: !u.isBlocked } : u));
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.college.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (error) {
    return (
      <div className="glass-card p-12 border-red-500/20 bg-red-500/5 text-center space-y-6">
        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto" />
        <div className="space-y-2">
          <h3 className="text-2xl font-bold">Access Denied</h3>
          <p className="text-[var(--text-muted)] max-w-md mx-auto">
            We encountered a permission error while fetching dashboard data. 
            This usually happens if your account doesn't have admin privileges in Firestore.
          </p>
          <div className="p-4 bg-black/20 rounded-xl text-xs font-mono text-red-400 mt-4 break-all">
            {error}
          </div>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-600/20"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={<DoorOpen className="text-blue-400" />} label="Currently In" value={stats.currentlyIn} />
        <StatCard icon={<Users className="text-emerald-400" />} label="Today's Total" value={stats.today} />
        <StatCard icon={<Calendar className="text-purple-400" />} label="This Week" value={stats.week} />
        <StatCard icon={<History className="text-orange-400" />} label="This Month" value={stats.month} />
      </div>

      <div className="flex items-center gap-2 p-1 bg-[var(--input-bg)] rounded-xl w-fit">
        <button 
          onClick={() => setAdminView('current')}
          className={cn(
            "px-6 py-2 rounded-lg text-sm font-bold transition-all",
            adminView === 'current' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
          )}
        >
          Live Monitoring
        </button>
        <button 
          onClick={() => setAdminView('users')}
          className={cn(
            "px-6 py-2 rounded-lg text-sm font-bold transition-all",
            adminView === 'users' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
          )}
        >
          User Management
        </button>
      </div>

      {adminView === 'current' ? (
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <DoorOpen className="w-6 h-6 text-blue-400" />
              Currently in Library
            </h3>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
            ) : currentVisitors.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-muted)]">No students currently in the library.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentVisitors.map(visitor => (
                  <div key={visitor.id} className="p-4 bg-[var(--input-bg)] border border-white/5 rounded-2xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold">
                      {visitor.userName.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm">{visitor.userName}</p>
                      <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase">{visitor.college}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-blue-400">{visitor.reason}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Since {visitor.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-400" />
              User Management
            </h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input 
                type="text" 
                placeholder="Search users..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-[var(--input-bg)] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-full sm:w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--input-bg)] text-left text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">College</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-[var(--text-muted)]">Loading users...</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-[var(--text-muted)]">No users found.</td></tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u.uid} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
                            {u.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-sm">{u.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--text-muted)]">{u.college}</td>
                      <td className="px-6 py-4">
                        {u.isBlocked ? (
                          <span className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] font-bold uppercase rounded-md border border-red-500/20">Blocked</span>
                        ) : (
                          <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase rounded-md border border-emerald-500/20">Active</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => toggleBlock(u)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            u.isBlocked 
                              ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" 
                              : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          )}
                          title={u.isBlocked ? "Unblock User" : "Block User"}
                        >
                          {u.isBlocked ? <ShieldCheck className="w-5 h-5" /> : <ShieldBan className="w-5 h-5" />}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: number }) {
  return (
    <div className="glass-card p-6 flex items-center gap-6">
      <div className="w-14 h-14 rounded-2xl bg-[var(--input-bg)] flex items-center justify-center text-2xl border border-white/10">
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{label}</p>
        <p className="text-3xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="space-y-12 pb-12">
      {/* Header & Welcome */}
      <section className="relative rounded-3xl overflow-hidden glass-card border-none">
        <div className="absolute inset-0">
          <img src="/New Era University Library.jpg" alt="NEU Library" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-color)] via-[var(--bg-color)]/80 to-transparent" />
        </div>
        <div className="relative z-10 p-8 md:p-16 text-center max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">The Intellectual Heart of New Era University</h1>
          <p className="text-lg text-[var(--text-muted)] leading-relaxed">
            Welcome to the New Era University Library. We serve as the gateway to global information, dedicated to supporting the academic, research, and spiritual growth of the NEU community. Our library is more than a collection of books; it is a space for discovery, innovation, and lifelong learning.
          </p>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="glass-card p-8 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-6">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold">Our Vision</h3>
          <p className="text-[var(--text-muted)] leading-relaxed">
            To be a premier center of information and knowledge, recognized for excellence in providing resources that foster academic success and Christian values in a rapidly changing global environment.
          </p>
        </div>
        <div className="glass-card p-8 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-6">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold">Our Mission</h3>
          <p className="text-[var(--text-muted)] leading-relaxed mb-4">The NEU Library is committed to:</p>
          <ul className="space-y-3 text-[var(--text-muted)]">
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
              <span>Providing a diverse and high-quality collection of print and digital resources.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
              <span>Offering innovative library services that meet the evolving needs of students and faculty.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
              <span>Creating a conducive environment for quiet study, collaborative research, and intellectual inquiry.</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Library Sections & Collections */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-center mb-10">Library Sections & Collections</h2>
        <p className="text-center text-[var(--text-muted)] max-w-2xl mx-auto mb-8">
          Our library manages a wide array of specialized collections to cater to every discipline:
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { title: "Circulation Section", desc: "The primary collection for general education, sciences, and humanities.", icon: <Library className="w-5 h-5" /> },
            { title: "Filipiniana Section", desc: "A curated collection of works by Filipino authors and materials relating to the history and culture of the Philippines.", icon: <Map className="w-5 h-5" /> },
            { title: "Reference & Periodicals", desc: "Access to encyclopedias, dictionaries, and the latest local and international journals/newspapers.", icon: <FileText className="w-5 h-5" /> },
            { title: "Graduate Studies Library", desc: "Specialized resources for advanced research and postgraduate degrees.", icon: <GraduationCap className="w-5 h-5" /> },
            { title: "Electronic Resource Center (ERC)", desc: "Our digital hub providing access to e-books, online databases, and computer workstations.", icon: <Monitor className="w-5 h-5" /> },
            { title: "Religious Education Section", desc: "Materials dedicated to spiritual growth and the university's core values.", icon: <BookMarked className="w-5 h-5" /> }
          ].map((section, idx) => (
            <div key={idx} className="glass-card p-6 hover:bg-white/5 transition-colors group">
              <div className="w-10 h-10 rounded-xl bg-[var(--input-bg)] flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                {section.icon}
              </div>
              <h4 className="font-bold mb-2">{section.title}</h4>
              <p className="text-sm text-[var(--text-muted)]">{section.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Image Gallery */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <img src="/NEU Library Pic1.jpg" alt="Library Interior 1" className="w-full h-48 object-cover rounded-2xl glass-card" />
        <img src="/NEU Library Pic2.jpg" alt="Library Interior 2" className="w-full h-48 object-cover rounded-2xl glass-card" />
        <img src="/NEU Library Pic3.jpg" alt="Library Interior 3" className="w-full h-48 object-cover rounded-2xl glass-card" />
      </section>

      {/* Guidelines & Contact */}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="glass-card p-8">
          <h3 className="text-2xl font-bold mb-6">Library Guidelines</h3>
          <p className="text-[var(--text-muted)] mb-6">To maintain a productive environment, we uphold the following principles:</p>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                <ShieldBan className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Silence and Focus</h4>
                <p className="text-sm text-[var(--text-muted)]">We observe strict silence to respect the study needs of others.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Integrity</h4>
                <p className="text-sm text-[var(--text-muted)]">Users are expected to handle all library materials with care and honesty.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Service</h4>
                <p className="text-sm text-[var(--text-muted)]">Our professional librarians are always available to assist with your research inquiries.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-8 bg-gradient-to-br from-blue-600/10 to-purple-600/10">
          <h3 className="text-2xl font-bold mb-6">Contact & Location</h3>
          <div className="space-y-6">
            <div>
              <h4 className="font-bold text-blue-400 mb-1">New Era University Main Library</h4>
              <p className="text-sm text-[var(--text-muted)] flex items-start gap-2">
                <Map className="w-4 h-4 mt-0.5 shrink-0" />
                No. 9 Central Avenue, New Era, Quezon City, Philippines
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)] flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0" />
                Operating Hours: Monday – Friday | 8:00 AM – 5:00 PM
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)] flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0" />
                Email: library@neu.edu.ph
              </p>
            </div>
            <div className="pt-4 border-t border-white/10">
              <p className="text-sm font-bold italic text-center text-[var(--text-main)]">
                "Service Excellence in the Pursuit of Knowledge."
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
