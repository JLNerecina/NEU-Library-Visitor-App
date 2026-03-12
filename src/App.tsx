/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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
import { auth, db, googleProvider, storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  UserProfile, 
  VisitLog, 
  AppNotification,
  SystemActivity,
  COLLEGES, 
  REASONS, 
  ADMIN_EMAIL,
  OFFICER_EMAIL 
} from './types';
import { cn } from './lib/utils';
import LibraryMap from './components/LibraryMap';
import AdminAnalytics from './components/AdminAnalytics';
import UserManagement from './components/UserManagement';
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
  Info,
  Database,
  UserPlus,
  Edit2,
  X,
  Check,
  BarChart3
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

async function createNotification(recipientUid: string, title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  try {
    await addDoc(collection(db, 'notifications'), {
      recipientUid,
      title,
      message,
      type,
      timestamp: serverTimestamp(),
      isRead: false
    });
  } catch (err) {
    console.error("Error creating notification:", err);
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'admin' | 'management' | 'logs' | 'map' | 'about' | 'settings'>('home');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'verification-sent' | 'complete-profile'>('login');
  const [authError, setAuthError] = useState<string | null>(null);

  const logSystemActivity = async (activity: Omit<SystemActivity, 'id' | 'timestamp' | 'actorId' | 'actorName'>) => {
    if (!profile) return;
    try {
      await addDoc(collection(db, 'system_activities'), {
        ...activity,
        actorId: profile.uid,
        actorName: profile.name,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Error logging system activity:", err);
    }
  };
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
        
        // Sync photoURL if missing and available in auth
        if (!data.photoURL && auth.currentUser?.photoURL) {
          data.photoURL = auth.currentUser.photoURL;
          await updateDoc(docRef, { photoURL: data.photoURL });
        }

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
      console.error("Google Login Error:", err);
      if (err.code === 'auth/popup-blocked') {
        setAuthError("The sign-in popup was blocked by your browser. Please allow popups for this site or try again.");
      } else if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        // Ignore these common user-initiated cancellations
      } else if (err.code === 'auth/internal-error' || err.message.includes('missing initial state')) {
        setAuthError("Sign-in failed due to a browser restriction. Please try: 1. Disabling 'Block third-party cookies'. 2. Using a different browser. 3. Disabling Incognito/Private mode.");
      } else if (err.code === 'auth/web-storage-unsupported') {
        setAuthError("Your browser does not support the storage required for sign-in. Please try a different browser or disable private mode.");
      } else {
        setAuthError(`Sign-in error: ${err.message}`);
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

      await logSystemActivity({
        type: 'add_user',
        targetId: user.uid,
        targetName: data.name,
        details: `New user registered: ${data.name} (${data.studentId})`
      });
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
                  {view === 'admin' && (
                    <motion.div
                      key="admin"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      <AdminAnalytics />
                    </motion.div>
                  )}
                  {view === 'management' && (
                    <motion.div
                      key="management"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      <UserManagement />
                    </motion.div>
                  )}
                  {view === 'home' && (
                    <motion.div
                      key="home"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      {profile.role === 'admin' || profile.role === 'library officer' ? (
                        <LibraryOfficerDashboard profile={profile} logSystemActivity={logSystemActivity} />
                      ) : (
                        <StudentDashboard profile={profile} onAction={fetchOccupancy} onViewAll={() => setView('logs')} logSystemActivity={logSystemActivity} />
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
                  {view === 'settings' && (
                    <motion.div
                      key="settings"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      <SettingsSection profile={profile} onUpdate={() => fetchProfile(profile.uid)} />
                    </motion.div>
                  )}
                  {view === 'map' && (
                    <motion.div
                      key="map"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="h-full"
                    >
                      <LibraryMap />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </main>
          </div>
          <MobileNav activeView={view} setView={setView} profile={profile} />
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
        {profile.role === 'admin' && (
          <>
            <SidebarItem 
              active={activeView === 'admin'} 
              onClick={() => setView('admin')} 
              icon={<FileText className="w-5 h-5" />} 
              label="Admin Analytics" 
            />
            <SidebarItem 
              active={activeView === 'management'} 
              onClick={() => setView('management')} 
              icon={<Users className="w-5 h-5" />} 
              label="User Management" 
            />
          </>
        )}
        <SidebarItem 
          active={activeView === 'logs'} 
          onClick={() => setView('logs')} 
          icon={<History className="w-5 h-5" />} 
          label={profile.role === 'admin' || profile.role === 'library officer' ? "System Activity" : "Visit History"} 
        />
        <SidebarItem 
          active={activeView === 'about'} 
          onClick={() => setView('about')} 
          icon={<Info className="w-5 h-5" />} 
          label="About Library" 
        />
        <SidebarItem 
          active={activeView === 'map'} 
          onClick={() => setView('map')} 
          icon={<Map className="w-5 h-5" />} 
          label="Library Map" 
        />
        <SidebarItem 
          active={activeView === 'settings'} 
          onClick={() => setView('settings')} 
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
  setView,
  profile
}: { 
  activeView: string, 
  setView: (v: any) => void,
  profile: UserProfile
}) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--glass-bg)] backdrop-blur-xl border-t border-[var(--glass-border)] z-50 pb-safe">
      <div className="flex items-center justify-between px-2 py-2 w-full overflow-x-auto no-scrollbar">
        <MobileNavItem 
          active={activeView === 'home'} 
          onClick={() => setView('home')} 
          icon={<LayoutDashboard className="w-5 h-5" />} 
          label="Home" 
        />
        <MobileNavItem 
          active={activeView === 'logs'} 
          onClick={() => setView('logs')} 
          icon={<History className="w-5 h-5" />} 
          label={profile.role === 'admin' || profile.role === 'library officer' ? "Activity" : "History"} 
        />
        {profile.role === 'admin' && (
          <>
            <MobileNavItem 
              active={activeView === 'management'} 
              onClick={() => setView('management')} 
              icon={<Users className="w-5 h-5" />} 
              label="Users" 
            />
            <MobileNavItem 
              active={activeView === 'admin'} 
              onClick={() => setView('admin')} 
              icon={<BarChart3 className="w-5 h-5" />} 
              label="Analytics" 
            />
          </>
        )}
        <MobileNavItem 
          active={activeView === 'about'} 
          onClick={() => setView('about')} 
          icon={<Info className="w-5 h-5" />} 
          label="About" 
        />
        <MobileNavItem 
          active={activeView === 'map'} 
          onClick={() => setView('map')} 
          icon={<Map className="w-5 h-5" />} 
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
        "flex flex-1 flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all min-w-[56px] shrink-0",
        active ? "text-blue-500" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
      )}
    >
      {icon}
      <span className="text-[10px] font-medium truncate w-full text-center">{label}</span>
    </button>
  );
}

function NotificationBell({ profile }: { profile: UserProfile }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      where('recipientUid', '==', profile.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'));

    return unsub;
  }, [profile.uid]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { isRead: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const markAllAsRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.filter(n => !n.isRead).forEach(n => {
        batch.update(doc(db, 'notifications', n.id!), { isRead: true });
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'notifications');
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors relative"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[var(--bg-color)]" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="fixed sm:absolute top-[72px] sm:top-full left-6 right-6 sm:left-auto sm:right-0 sm:mt-2 sm:w-72 bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                <h3 className="text-sm font-bold">Notifications</h3>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest"
                  >
                    Mark all as read
                  </button>
                )}
              </div>
              <div className="max-h-[60vh] sm:max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-[var(--text-muted)] text-xs">
                    No notifications yet
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div 
                      key={n.id}
                      onClick={() => markAsRead(n.id!)}
                      className={cn(
                        "p-3 border-b border-gray-100 dark:border-white/5 last:border-0 cursor-pointer transition-colors",
                        !n.isRead ? "bg-blue-500/10 dark:bg-blue-400/10" : "hover:bg-gray-50 dark:hover:bg-white/5"
                      )}
                    >
                      <div className="flex gap-2">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                          !n.isRead ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-transparent"
                        )} />
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold leading-tight">{n.title}</p>
                          <p className="text-[11px] text-[var(--text-muted)] leading-tight">{n.message}</p>
                          <p className="text-[9px] text-[var(--text-muted)]/50">
                            {n.timestamp?.toDate().toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Header({ profile, theme, toggleTheme, onLogout }: { profile: UserProfile, theme: string, toggleTheme: () => void, onLogout: () => void }) {
  return (
    <header className="w-full bg-[var(--glass-bg)]/50 backdrop-blur-md border-b border-[var(--glass-border)] px-4 md:px-8 py-4 flex items-center justify-between z-40">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <img src="/New Era University Library Logo.png" alt="NEU Logo" className="w-8 h-8 object-contain lg:hidden shrink-0" />
        <h2 className="text-lg md:text-xl font-bold text-[var(--text-main)] truncate">
          {profile.role === 'admin' ? 'Administrator' : profile.role === 'library officer' ? 'Library Officer' : 'Student'} Dashboard
        </h2>
      </div>
      
      <div className="flex items-center gap-2 md:gap-6 shrink-0 ml-2">
        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={toggleTheme}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors shrink-0"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
          <div className="shrink-0">
            <NotificationBell profile={profile} />
          </div>
        </div>

        <div className="h-8 w-px bg-[var(--glass-border)] hidden sm:block shrink-0" />

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block shrink-0">
            <p className="text-sm font-bold leading-none">{profile.name}</p>
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase mt-1">
              {profile.role === 'admin' ? 'Administrator' : profile.role === 'library officer' ? 'Library Officer' : 'Student'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-white/10 flex items-center justify-center text-white font-bold shrink-0 overflow-hidden">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              profile.name.charAt(0)
            )}
          </div>
          <button 
            onClick={onLogout}
            className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors lg:hidden shrink-0"
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

function LibraryOfficerDashboard({ profile, logSystemActivity }: { profile: UserProfile, logSystemActivity: (activity: Omit<SystemActivity, 'id' | 'timestamp' | 'actorId' | 'actorName'>) => Promise<void> }) {
  const [occupancy, setOccupancy] = useState(0);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<VisitLog[]>([]);
  const [systemActivities, setSystemActivities] = useState<SystemActivity[]>([]);
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', college: COLLEGES[0], studentId: '', role: 'user' as UserProfile['role'] });

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    
    try {
      if (isAddingUser) {
        // For manual add, we'd normally need a UID from Auth, but for this app's logic, 
        // we'll just create a doc. In a real app, you'd use Firebase Admin or a cloud function.
        // For this demo, we'll use a random ID.
        const tempUid = `manual-${Date.now()}`;
        const newUser: UserProfile = {
          uid: tempUid,
          email: newUserForm.email,
          name: newUserForm.name,
          college: newUserForm.college,
          studentId: newUserForm.studentId,
          isBlocked: false,
          role: newUserForm.role
        };
        await setDoc(doc(db, 'users', tempUid), newUser);
        await createNotification(profile.uid, 'User Added', `Successfully added user: ${newUser.name}`, 'success');
        await logSystemActivity({
          type: 'add_user',
          targetId: tempUid,
          targetName: newUser.name,
          details: `Manually added user: ${newUser.name}`
        });
      } else if (editingUser) {
        await updateDoc(doc(db, 'users', editingUser.uid), {
          name: newUserForm.name,
          college: newUserForm.college,
          studentId: newUserForm.studentId,
          role: newUserForm.role
        });
        await createNotification(profile.uid, 'User Updated', `Successfully updated user: ${newUserForm.name}`, 'success');
        await logSystemActivity({
          type: 'edit_user',
          targetId: editingUser.uid,
          targetName: newUserForm.name,
          details: `Updated user details for: ${newUserForm.name}`
        });
      }
      setIsAddingUser(false);
      setEditingUser(null);
      setNewUserForm({ name: '', email: '', college: COLLEGES[0], studentId: '', role: 'user' });
    } catch (err) {
      console.error("Error saving user:", err);
    }
  };

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setNewUserForm({
      name: user.name,
      email: user.email,
      college: user.college,
      studentId: user.studentId || '',
      role: user.role || 'user'
    });
    setIsAddingUser(false);
  };

  const openAddModal = () => {
    setIsAddingUser(true);
    setEditingUser(null);
    setNewUserForm({ name: '', email: '', college: COLLEGES[0], studentId: '', role: 'user' });
  };
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    const unsubStats = onSnapshot(doc(db, 'stats', 'library'), (doc) => {
      setOccupancy(doc.data()?.occupancy || 0);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'stats/library'));
    
    // Fetch users and logs, then filter them
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    
    const unsubLogs = onSnapshot(query(collection(db, 'visitLogs'), orderBy('timestamp', 'desc')), (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VisitLog)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'visitLogs'));

    const unsubSystemActivities = onSnapshot(query(collection(db, 'system_activities'), orderBy('timestamp', 'desc'), limit(10)), (snapshot) => {
      setSystemActivities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemActivity)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'system_activities'));

    return () => { unsubStats(); unsubUsers(); unsubLogs(); unsubSystemActivities(); };
  }, []);

  const adminUids = useMemo(() => {
    return new Set(allUsers
      .filter(u => u.role === 'admin' || u.role === 'library officer')
      .map(u => u.uid));
  }, [allUsers]);

  const displayUsers = useMemo(() => {
    return allUsers;
  }, [allUsers]);

  const displayLogs = useMemo(() => {
    return logs.filter(log => !adminUids.has(log.uid));
  }, [logs, adminUids]);


  const handleBlockToggle = async (user: UserProfile) => {
    try {
      const newStatus = !user.isBlocked;
      await updateDoc(doc(db, 'users', user.uid), { isBlocked: newStatus });
      
      await createNotification(
        profile.uid,
        `User ${newStatus ? 'Blocked' : 'Unblocked'}`,
        `Successfully ${newStatus ? 'blocked' : 'unblocked'} ${user.name}.`,
        newStatus ? 'warning' : 'success'
      );

      await logSystemActivity({
        type: newStatus ? 'block_user' : 'unblock_user',
        targetId: user.uid,
        targetName: user.name,
        details: `${newStatus ? 'Blocked' : 'Unblocked'} user account`
      });
    } catch (err) {
      console.error("Error toggling block:", err);
    }
  };

  const handleDelete = async (uid: string) => {
    if (confirmingDelete !== uid) {
      setConfirmingDelete(uid);
      setTimeout(() => setConfirmingDelete(null), 3000);
      return;
    }
    
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', uid));
      
      const q = query(collection(db, 'visitLogs'), where('uid', '==', uid));
      const snap = await getDocs(q);
      let activeVisits = 0;
      snap.docs.forEach(d => {
        if (!d.data().exitTimestamp) activeVisits++;
        batch.delete(d.ref);
      });
      
      if (activeVisits > 0) {
        const statsRef = doc(db, 'stats', 'library');
        batch.update(statsRef, { occupancy: increment(-activeVisits) });
      }
      
      await batch.commit();

      await createNotification(
        profile.uid,
        'User Deleted',
        `Successfully deleted user and their associated logs.`,
        'warning'
      );

      await logSystemActivity({
        type: 'delete_user',
        targetId: uid,
        details: 'Deleted user and all associated visit logs'
      });

      setConfirmingDelete(null);
    } catch (err) {
      console.error("Error deleting user:", err);
    }
  };

  const clearExampleData = async () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      setTimeout(() => setConfirmingClear(false), 3000);
      return;
    }

    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      
      // Delete non-admin users
      displayUsers.forEach(u => {
        if (u.uid !== profile.uid) {
          batch.delete(doc(db, 'users', u.uid));
        }
      });

      // Delete all logs
      displayLogs.forEach(l => {
        batch.delete(doc(db, 'visitLogs', l.id));
      });

      // Reset occupancy
      const statsRef = doc(db, 'stats', 'library');
      batch.set(statsRef, { occupancy: 0 }, { merge: true });

      await batch.commit();
      setConfirmingClear(false);

      await logSystemActivity({
        type: 'delete_user',
        details: 'Cleared all users and visit logs from database'
      });
    } catch (err) {
      console.error("Error clearing data:", err);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      let totalActiveVisitsToRemove = 0;
      
      // We need to delete logs for each user too
      for (const uid of selectedUsers) {
        batch.delete(doc(db, 'users', uid));
        const q = query(collection(db, 'visitLogs'), where('uid', '==', uid));
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          if (!d.data().exitTimestamp) totalActiveVisitsToRemove++;
          batch.delete(d.ref);
        });
      }

      if (totalActiveVisitsToRemove > 0) {
        const statsRef = doc(db, 'stats', 'library');
        batch.update(statsRef, { occupancy: increment(-totalActiveVisitsToRemove) });
      }
      
      await batch.commit();

      await createNotification(
        profile.uid,
        'Bulk Delete Successful',
        `Successfully deleted ${selectedUsers.size} users and their logs.`,
        'warning'
      );

      await logSystemActivity({
        type: 'delete_user',
        details: `Bulk deleted ${selectedUsers.size} users and all their associated visit logs`
      });

      setSelectedUsers(new Set());
      setIsBulkDeleteMode(false);
    } catch (err) {
      console.error("Error in bulk delete:", err);
    } finally {
      setIsSeeding(false);
    }
  };

  const filteredUsers = displayUsers.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.college.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.studentId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLogs = displayLogs.filter(l => 
    l.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.college.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.reason.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const seedExampleData = async () => {
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      
      const sampleUsers = [
        { uid: 'sample-1', name: 'Alice Johnson', email: 'alice@neu.edu.ph', college: 'College of Engineering', studentId: '2021-0001', isBlocked: false, role: 'user' },
        { uid: 'sample-2', name: 'Bob Smith', email: 'bob@neu.edu.ph', college: 'College of Business', studentId: '2021-0002', isBlocked: false, role: 'user' },
        { uid: 'sample-3', name: 'Charlie Brown', email: 'charlie@neu.edu.ph', college: 'College of Arts', studentId: '2021-0003', isBlocked: true, role: 'user' },
        { uid: 'sample-4', name: 'Diana Prince', email: 'diana@neu.edu.ph', college: 'College of Science', studentId: '2021-0004', isBlocked: false, role: 'user' },
      ];

      sampleUsers.forEach(u => {
        batch.set(doc(db, 'users', u.uid), u);
      });

      const sampleLogs = [
        { uid: 'sample-1', userName: 'Alice Johnson', college: 'College of Engineering', reason: 'Research', timestamp: serverTimestamp() },
        { uid: 'sample-2', userName: 'Bob Smith', college: 'College of Business', reason: 'Study', timestamp: serverTimestamp(), exitTimestamp: serverTimestamp() },
        { uid: 'sample-4', userName: 'Diana Prince', college: 'College of Science', reason: 'Group Work', timestamp: serverTimestamp() },
      ];

      sampleLogs.forEach(l => {
        const logRef = doc(collection(db, 'visitLogs'));
        batch.set(logRef, l);
      });

      const activeCount = sampleLogs.filter(l => !l.exitTimestamp).length;
      const statsRef = doc(db, 'stats', 'library');
      batch.set(statsRef, { occupancy: activeCount }, { merge: true });

      await batch.commit();
      console.log('Example data seeded successfully!');

      await logSystemActivity({
        type: 'add_user',
        details: 'Seeded example data (Users and Visit Logs)'
      });
    } catch (err) {
      console.error("Error seeding data:", err);
    } finally {
      setIsSeeding(false);
    }
  };

  const recalculateOccupancy = async () => {
    setIsSeeding(true);
    try {
      const q = query(collection(db, 'visitLogs'), where('exitTimestamp', '==', null));
      const snap = await getDocs(q);
      const actualOccupancy = snap.size;
      
      const statsRef = doc(db, 'stats', 'library');
      await updateDoc(statsRef, { occupancy: actualOccupancy });
    } catch (err) {
      console.error("Error recalculating occupancy:", err);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Search Bar & Actions */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)] shrink-0" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search visitors, records, or logs..."
            className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all min-w-0 text-ellipsis"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:pb-0 md:overflow-visible no-scrollbar">
          <button 
            onClick={openAddModal}
            className="px-4 md:px-6 py-3 md:py-4 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-2xl font-bold text-sm hover:bg-emerald-600/20 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" /> 
            Add User
          </button>
          <button 
            onClick={recalculateOccupancy}
            disabled={isSeeding}
            title="Sync Occupancy"
            className="p-3 md:p-4 border border-white/10 rounded-2xl hover:bg-white/5 transition-all text-[var(--text-muted)] shrink-0"
          >
            <RefreshCw className={cn("w-5 h-5", isSeeding && "animate-spin")} />
          </button>
          <button 
            onClick={seedExampleData}
            disabled={isSeeding}
            className={cn(
              "px-4 md:px-6 py-3 md:py-4 border rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              isSeeding 
                ? "bg-gray-500/10 text-gray-400 border-gray-500/20 cursor-not-allowed" 
                : "bg-blue-600/10 text-blue-400 border-blue-500/20 hover:bg-blue-600/20"
            )}
          >
            <Zap className={cn("w-4 h-4", isSeeding && "animate-pulse")} /> 
            {isSeeding ? 'Processing...' : 'Seed Data'}
          </button>
          <button 
            onClick={clearExampleData}
            disabled={isSeeding}
            className={cn(
              "px-4 md:px-6 py-3 md:py-4 border rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              isSeeding 
                ? "bg-gray-500/10 text-gray-400 border-gray-500/20 cursor-not-allowed" 
                : confirmingClear
                  ? "bg-red-600 text-white border-red-600 animate-pulse"
                  : "bg-red-600/10 text-red-400 border-red-500/20 hover:bg-red-600/20"
            )}
          >
            <Trash2 className="w-4 h-4" /> 
            {confirmingClear ? 'Click again to confirm' : 'Clear Data'}
          </button>
        </div>
      </div>

      {displayUsers.length === 0 && !isSeeding && (
        <div className="glass-card p-12 text-center space-y-4 border-dashed border-2 border-blue-500/30">
          <Database className="w-12 h-12 text-blue-500 mx-auto opacity-50" />
          <div className="space-y-2">
            <h3 className="text-xl font-bold">Database is Empty</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
              It looks like you don't have any visitors yet. Click the button above or below to populate the system with sample data for testing.
            </p>
          </div>
          <button 
            onClick={seedExampleData}
            className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"
          >
            Populate Sample Data
          </button>
        </div>
      )}

      <h2 className="text-xl md:text-2xl font-bold mb-4">{profile.role === 'admin' ? 'Administrator' : 'Library Officer'} Dashboard</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard 
          icon={<Users className="w-6 h-6" />} 
          label="Today's Visitors" 
          value={displayLogs.filter(l => {
            const date = l.timestamp?.toDate();
            return date && date.toDateString() === new Date().toDateString();
          }).length} 
        />
        <StatCard icon={<DoorOpen className="w-6 h-6" />} label="Current Occupancy" value={occupancy} />
        <StatCard icon={<Calendar className="w-6 h-6" />} label="Weekly Total" value={displayLogs.length} />
        <StatCard icon={<Zap className="w-6 h-6" />} label="Active Users" value={displayUsers.filter(u => !u.isBlocked).length} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 md:gap-8">
        {/* User Management */}
        <div className="lg:col-span-2 glass-card p-4 md:p-6 space-y-4 md:space-y-6 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-lg md:text-xl font-bold">User Management</h3>
            <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
              {isBulkDeleteMode ? (
                <>
                  <button onClick={() => setIsBulkDeleteMode(false)} className="px-3 md:px-4 py-2 bg-gray-500/10 text-gray-400 rounded-xl text-xs md:text-sm font-bold hover:bg-gray-500/20 whitespace-nowrap">Cancel</button>
                  <button onClick={handleBulkDelete} className="px-3 md:px-4 py-2 bg-red-600 text-white rounded-xl text-xs md:text-sm font-bold hover:bg-red-500 whitespace-nowrap">Confirm Delete ({selectedUsers.size})</button>
                </>
              ) : (
                <button onClick={() => setIsBulkDeleteMode(true)} className="px-3 md:px-4 py-2 bg-red-500/10 text-red-400 rounded-xl text-xs md:text-sm font-bold flex items-center gap-2 hover:bg-red-500/20 whitespace-nowrap">
                  <Trash2 className="w-4 h-4" /> Bulk Delete
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <table className="w-full text-[10px] md:text-sm">
              <thead>
                <tr className="text-[var(--text-muted)] border-b border-white/10">
                  {isBulkDeleteMode && <th className="py-2 md:py-4 px-1 md:px-2"><input type="checkbox" checked={selectedUsers.size === displayUsers.length} onChange={(e) => setSelectedUsers(e.target.checked ? new Set(displayUsers.map(u => u.uid)) : new Set())} /></th>}
                  <th className="text-left py-2 md:py-4 px-1 md:px-2">USER NAME</th>
                  <th className="text-left py-2 md:py-4 px-1 md:px-2">COLLEGE</th>
                  <th className="text-left py-2 md:py-4 px-1 md:px-2">ROLE</th>
                  <th className="text-left py-2 md:py-4 px-1 md:px-2">STATUS</th>
                  <th className="text-left py-2 md:py-4 px-1 md:px-2">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.uid} className="border-b border-white/5 hover:bg-white/5">
                    {isBulkDeleteMode && <td className="py-2 md:py-4 px-1 md:px-2"><input type="checkbox" checked={selectedUsers.has(user.uid)} onChange={(e) => { const next = new Set(selectedUsers); e.target.checked ? next.add(user.uid) : next.delete(user.uid); setSelectedUsers(next); }} /></td>}
                    <td className="py-2 md:py-4 px-1 md:px-2 font-bold flex items-center gap-2 md:gap-3">
                      <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 text-[10px] md:text-xs">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="truncate max-w-[80px] md:max-w-[150px]">{user.name}</span>
                    </td>
                    <td className="py-2 md:py-4 px-1 md:px-2 text-[var(--text-muted)] truncate max-w-[80px] md:max-w-none">{user.college}</td>
                    <td className="py-2 md:py-4 px-1 md:px-2">
                      <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-blue-500/10 text-blue-400 rounded-full text-[8px] md:text-xs font-bold capitalize whitespace-nowrap">
                        {user.role || 'user'}
                      </span>
                    </td>
                    <td className="py-2 md:py-4 px-1 md:px-2">
                      <span className={cn("px-1.5 md:px-2 py-0.5 md:py-1 rounded-full text-[8px] md:text-xs font-bold whitespace-nowrap", !user.isBlocked ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                        ● {user.isBlocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="py-2 md:py-4 px-1 md:px-2 text-blue-400 font-bold cursor-pointer hover:underline">
                      <div className="flex gap-1 md:gap-2 text-[10px] md:text-sm">
                        <button 
                          onClick={() => openEditModal(user)}
                          className="p-1 md:p-2 hover:bg-white/10 rounded-lg text-[var(--text-muted)] hover:text-blue-400 transition-colors"
                          title="Edit User"
                        >
                          <Edit2 className="w-3 h-3 md:w-4 md:h-4" />
                        </button>
                        <button onClick={() => handleBlockToggle(user)} className="px-1 md:px-2">{user.isBlocked ? 'Unblock' : 'Block'}</button>
                        <button 
                          onClick={() => handleDelete(user.uid)} 
                          className={cn("transition-colors px-1 md:px-2", confirmingDelete === user.uid ? "text-white bg-red-600 rounded" : "text-red-400")}
                        >
                          {confirmingDelete === user.uid ? 'Confirm?' : 'Delete'}
                        </button>
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
            {(profile.role === 'admin' || profile.role === 'library officer') ? (
              systemActivities.slice(0, 5).map((activity, i) => (
                <div key={i} className="flex gap-4">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    activity.type === 'entry' ? "bg-blue-500/10 text-blue-400" : 
                    activity.type === 'exit' ? "bg-emerald-500/10 text-emerald-400" : 
                    "bg-purple-500/10 text-purple-400"
                  )}>
                    {activity.type === 'entry' ? <Users className="w-4 h-4" /> : 
                     activity.type === 'exit' ? <ArrowRight className="w-4 h-4" /> : 
                     <Zap className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold">
                      {activity.type === 'entry' ? `${activity.actorName} entered the library` :
                       activity.type === 'exit' ? `${activity.actorName} exited the library` :
                       activity.details || activity.type}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {activity.timestamp?.toDate().toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              filteredLogs.slice(0, 5).map((log, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[var(--input-bg)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                    {log.exitTimestamp ? <ArrowRight className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{log.userName} {log.exitTimestamp ? 'exited' : 'entered'} the library</p>
                    <p className="text-xs text-[var(--text-muted)]">{log.timestamp?.toDate().toLocaleString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {(isAddingUser || editingUser) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card w-full max-w-md p-8 space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold">{isAddingUser ? 'Add New User' : 'Edit User'}</h3>
              <button onClick={() => { setIsAddingUser(false); setEditingUser(null); }} className="p-2 hover:bg-white/10 rounded-full">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Full Name</label>
                <input 
                  required
                  type="text"
                  value={newUserForm.name}
                  onChange={e => setNewUserForm({...newUserForm, name: e.target.value})}
                  className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Email Address</label>
                <input 
                  required
                  disabled={!!editingUser}
                  type="email"
                  value={newUserForm.email}
                  onChange={e => setNewUserForm({...newUserForm, email: e.target.value})}
                  className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">College</label>
                  <select 
                    value={newUserForm.college}
                    onChange={e => setNewUserForm({...newUserForm, college: e.target.value})}
                    className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-[var(--text-main)]"
                  >
                    {COLLEGES.map(c => <option key={c} value={c} className="text-black">{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Role</label>
                  <select 
                    value={newUserForm.role}
                    onChange={e => setNewUserForm({...newUserForm, role: e.target.value as any})}
                    className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-[var(--text-main)]"
                    disabled={profile.role === 'library officer'}
                  >
                    <option value="user" className="text-black">Student</option>
                    {profile.role === 'admin' && (
                      <>
                        <option value="library officer" className="text-black">Library Officer</option>
                        <option value="admin" className="text-black">Admin</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Student ID (Optional)</label>
                <input 
                  type="text"
                  value={newUserForm.studentId}
                  onChange={e => setNewUserForm({...newUserForm, studentId: e.target.value})}
                  className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
              >
                {isAddingUser ? 'Create User' : 'Save Changes'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function StudentDashboard({ profile, onAction, onViewAll, logSystemActivity }: { profile: UserProfile, onAction: () => void, onViewAll: () => void, logSystemActivity: (activity: Omit<SystemActivity, 'id' | 'timestamp' | 'actorId' | 'actorName'>) => Promise<void> }) {
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

      await createNotification(
        profile.uid, 
        'Exit Logged', 
        'You have successfully logged your exit. Thank you for visiting!', 
        'success'
      );

      await logSystemActivity({
        type: 'exit',
        targetId: profile.uid,
        targetName: profile.name,
        details: 'Logged out from library'
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
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <PurposeCard icon={<Search className="w-6 h-6" />} label="Research" reason="Research" profile={profile} onSuccess={fetchData} logSystemActivity={logSystemActivity} />
            <PurposeCard icon={<BookOpen className="w-6 h-6" />} label="Self-Study" reason="Study" profile={profile} onSuccess={fetchData} logSystemActivity={logSystemActivity} />
            <PurposeCard icon={<Users className="w-6 h-6" />} label="Group Work" reason="Group Work" profile={profile} onSuccess={fetchData} logSystemActivity={logSystemActivity} />
            <PurposeCard icon={<Truck className="w-6 h-6" />} label="Book Pickup" reason="Borrowing Books" profile={profile} onSuccess={fetchData} logSystemActivity={logSystemActivity} />
            <PurposeCard icon={<Coffee className="w-6 h-6" />} label="Social" reason="Other" profile={profile} onSuccess={fetchData} logSystemActivity={logSystemActivity} />
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

function PurposeCard({ icon, label, reason, profile, onSuccess, logSystemActivity }: { 
  icon: React.ReactNode, 
  label: string, 
  reason: string, 
  profile: UserProfile, 
  onSuccess: () => void,
  logSystemActivity: (activity: Omit<SystemActivity, 'id' | 'timestamp' | 'actorId' | 'actorName'>) => Promise<void>
}) {
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

      await createNotification(
        profile.uid, 
        'Visit Logged', 
        `You have successfully entered the library for: ${reason}.`, 
        'success'
      );

      await logSystemActivity({
        type: 'entry',
        targetId: profile.uid,
        targetName: profile.name,
        details: `Entered for: ${reason}`
      });
      
      // Increment global occupancy, ensuring it starts from at least 0
      const statsRef = doc(db, 'stats', 'library');
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(statsRef);
        if (!sfDoc.exists()) {
          transaction.set(statsRef, { occupancy: 1 });
        } else {
          const currentOccupancy = Math.max(0, sfDoc.data().occupancy || 0);
          transaction.update(statsRef, { occupancy: Math.max(0, currentOccupancy + 1) });
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

        {error && error.includes("browser restriction") && (
          <div className="text-[10px] text-[var(--text-muted)] text-center px-4 leading-relaxed">
            Tip: If you see "missing initial state", try opening this app in a 
            <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ml-1">
              new tab
            </a> or disabling "Block third-party cookies" in your browser settings.
          </div>
        )}

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
        photoURL: user.photoURL || undefined,
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
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isDirector = profile.role === 'admin';
  const isOfficer = profile.role === 'library officer';
  const isStaff = isDirector || isOfficer;

  useEffect(() => {
    const q = isStaff 
      ? query(collection(db, 'system_activities'), orderBy('timestamp', 'desc'), limit(100))
      : query(collection(db, 'visitLogs'), where('uid', '==', profile.uid), orderBy('timestamp', 'desc'), limit(100));

    const unsubscribe = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, isStaff ? 'system_activities' : 'visitLogs');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile.uid, isStaff]);

  const activities = useMemo(() => {
    if (!isStaff) {
      return logs.map(log => ({
        id: log.id,
        userName: log.userName,
        type: 'entry',
        time: log.timestamp,
        reason: log.reason,
        college: log.college,
        isCompleted: !!log.exitTimestamp
      }));
    }

    return logs.map(activity => ({
      id: activity.id,
      userName: activity.targetName || activity.actorName,
      type: activity.type,
      time: activity.timestamp,
      reason: activity.details || activity.type.replace('_', ' '),
      college: activity.details?.includes('College') ? activity.details : 'System',
      actorName: activity.actorName
    }));
  }, [logs, isStaff]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{isDirector ? 'System Activity' : 'Visit History'}</h2>
        <div className="px-3 py-1 bg-[var(--input-bg)] rounded-full text-xs font-bold text-[var(--text-muted)]">
          {isDirector ? 'Last 100 activities' : 'Last 100 entries'}
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-[var(--text-muted)]">Loading history...</div>
        ) : activities.length === 0 ? (
          <div className="glass-card p-12 text-center text-[var(--text-muted)]">
            No activities logged yet.
          </div>
        ) : (
          activities.map((activity, idx) => (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={activity.id} 
              className="glass-card p-4 flex items-center justify-between group hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  activity.type === 'entry' ? "bg-blue-500/10 text-blue-400" : 
                  activity.type === 'exit' ? "bg-emerald-500/10 text-emerald-400" : 
                  activity.type.includes('delete') ? "bg-red-500/10 text-red-400" :
                  activity.type.includes('block') ? "bg-orange-500/10 text-orange-400" :
                  "bg-purple-500/10 text-purple-400"
                )}>
                  {activity.type === 'entry' ? <DoorOpen className="w-5 h-5" /> : 
                   activity.type === 'exit' ? <DoorClosed className="w-5 h-5" /> : 
                   activity.type.includes('delete') ? <Trash2 className="w-5 h-5" /> :
                   activity.type.includes('block') ? <ShieldAlert className="w-5 h-5" /> :
                   <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-bold">
                    {isStaff ? (activity.targetName || activity.userName) : activity.reason}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {isStaff ? (
                      <>
                        <span className={cn(
                          "font-semibold",
                          activity.type === 'entry' ? "text-blue-400" : 
                          activity.type === 'exit' ? "text-emerald-400" : 
                          "text-purple-400"
                        )}>
                          {activity.type.replace('_', ' ').toUpperCase()}
                        </span>
                        {" • "}
                        {activity.reason}
                        {" • "}
                        {activity.time?.toDate().toLocaleString() || 'Just now'}
                        {activity.actorName && ` • By: ${activity.actorName}`}
                      </>
                    ) : (
                      <>
                        {activity.time?.toDate().toLocaleString() || 'Just now'}
                        {activity.exitTime && ` - Exit: ${activity.exitTime.toDate().toLocaleTimeString()}`}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                    {isStaff ? 'Category' : 'Status'}
                  </p>
                  <p className={cn(
                    "text-sm font-semibold",
                    isStaff ? "text-[var(--text-main)]" : (activity.isCompleted ? "text-emerald-500" : "text-blue-500")
                  )}>
                    {isStaff ? (activity.type.includes('user') ? 'Admin' : 'Visit') : (activity.isCompleted ? 'Completed' : 'Inside')}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--text-muted)]/20 group-hover:text-[var(--text-muted)]/50 transition-colors" />
              </div>            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: number }) {
  return (
    <div className="glass-card p-4 md:p-6 flex items-center gap-4 md:gap-6">
      <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-[var(--input-bg)] flex items-center justify-center text-xl md:text-2xl border border-white/10 shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] md:text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider md:tracking-widest truncate">{label}</p>
        <p className="text-2xl md:text-3xl font-bold truncate">{value}</p>
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

function SettingsSection({ profile, onUpdate }: { profile: UserProfile, onUpdate: () => void }) {
  const [name, setName] = useState(profile.name);
  const [college, setCollege] = useState(profile.college);
  const [photoURL, setPhotoURL] = useState(profile.photoURL || '');
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains('dark'));
  const [notificationSounds, setNotificationSounds] = useState(true);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(profile.name);
    setCollege(profile.college);
    setPhotoURL(profile.photoURL || '');
  }, [profile]);

  const handleSave = async () => {
    try {
      await setDoc(doc(db, 'users', profile.uid), {
        name,
        college,
        photoURL
      }, { merge: true });
      alert('Profile updated successfully!');
      onUpdate();
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile.');
    }
  };

  const [isUploading, setIsUploading] = useState(false);

  const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height;
              height = maxHeight;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas is empty'));
          }, 'image/jpeg', 0.8);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsUploading(true);
      try {
        // Resize image before upload
        const resizedBlob = await resizeImage(file, 400, 400);
        
        const storageRef = ref(storage, `profiles/${profile.uid}`);
        await uploadBytes(storageRef, resizedBlob);
        const url = await getDownloadURL(storageRef);
        
        // Update Firestore immediately
        await setDoc(doc(db, 'users', profile.uid), {
          photoURL: url
        }, { merge: true });
        
        setPhotoURL(url);
        onUpdate(); // Refresh profile
        alert('Photo updated successfully!');
      } catch (error) {
        console.error('Error uploading photo:', error);
        alert('Failed to upload photo.');
      } finally {
        setIsUploading(false);
      }
    }
  };

  const isGoogleUser = auth.currentUser?.providerData.some(p => p.providerId === 'google.com');

  const handleResetPhoto = async () => {
    if (auth.currentUser?.photoURL) {
      try {
        await setDoc(doc(db, 'users', profile.uid), {
          photoURL: auth.currentUser.photoURL
        }, { merge: true });
        setPhotoURL(auth.currentUser.photoURL);
        onUpdate();
        alert('Photo reset to Google account photo!');
      } catch (error) {
        console.error('Error resetting photo:', error);
        alert('Failed to reset photo.');
      }
    }
  };

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    setDarkMode(!darkMode);
  };

  const handleDeleteAccount = async () => {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'users', profile.uid));
        if (auth.currentUser) {
          await auth.currentUser.delete();
        }
        await signOut(auth);
        window.location.reload();
      } catch (error: any) {
        console.error('Error deleting account:', error);
        if (error.code === 'auth/requires-recent-login') {
          alert('For security reasons, please sign out and sign in again before deleting your account.');
        } else {
          alert(`Failed to delete account: ${error.message}`);
        }
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold">Settings</h2>
        <p className="text-[var(--text-muted)]">Manage your profile, security, and app preferences.</p>
      </div>

      <div className="glass-card p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-500 overflow-hidden">
            {photoURL ? <img src={photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <UserIcon className="w-8 h-8" />}
          </div>
          <div>
            <h3 className="font-bold text-lg">Edit Profile</h3>
            <p className="text-sm text-[var(--text-muted)]">Update your library visitor avatar</p>
            <input type="file" ref={fileInputRef} onChange={handlePhotoChange} className="hidden" accept="image/*" />
            <button onClick={() => fileInputRef.current?.click()} className="text-sm text-blue-500 font-semibold hover:underline mt-1 block sm:inline" disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Change Photo'}
            </button>
            {isGoogleUser && auth.currentUser?.photoURL && photoURL !== auth.currentUser.photoURL && (
              <button onClick={handleResetPhoto} className="text-sm text-gray-500 font-semibold hover:underline mt-1 sm:ml-4 block sm:inline">
                Reset to Google Photo
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Full Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">College / Office</label>
            <input 
              type="text" 
              value={college} 
              onChange={e => setCollege(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-6">
        <h3 className="font-bold text-lg flex items-center gap-2"><Zap className="w-5 h-5" /> Preferences</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Dark Mode</p>
            <p className="text-sm text-[var(--text-muted)]">Switch between dark and light themes</p>
          </div>
          <button 
            onClick={toggleDarkMode}
            className={`w-12 h-6 rounded-full transition-colors ${darkMode ? 'bg-blue-500' : 'bg-gray-300'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${darkMode ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Notification Sounds</p>
            <p className="text-sm text-[var(--text-muted)]">Play sound for new alerts and updates</p>
          </div>
          <button 
            onClick={() => setNotificationSounds(!notificationSounds)}
            className={`w-12 h-6 rounded-full transition-colors ${notificationSounds ? 'bg-blue-500' : 'bg-gray-300'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${notificationSounds ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      <div className="glass-card p-6 space-y-6 border-red-500/20">
        <h3 className="font-bold text-lg flex items-center gap-2 text-red-500"><ShieldAlert className="w-5 h-5" /> Account Security</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Deactivate Account</p>
            <p className="text-sm text-[var(--text-muted)]">Permanently delete your visitor profile and all associated browsing history.</p>
          </div>
          <button 
            onClick={handleDeleteAccount}
            className="px-4 py-2 bg-red-500/10 text-red-500 rounded-xl font-bold hover:bg-red-500/20 transition-colors"
          >
            Delete My Account
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <button className="px-6 py-3 rounded-xl font-bold hover:bg-white/5 transition-colors">Cancel</button>
        <button onClick={handleSave} className="px-6 py-3 bg-[#006d6d] text-white rounded-xl font-bold hover:bg-[#005a5a] transition-colors">Save Changes</button>
      </div>
    </div>
  );
}
