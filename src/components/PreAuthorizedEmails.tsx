import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Mail, Plus, Trash2, X, ShieldCheck, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function PreAuthorizedEmails() {
  const [emails, setEmails] = useState<{ id: string, email: string, role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newEmails, setNewEmails] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'library officer'>('admin');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pre_authorized_roles'), (snapshot) => {
      const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as { id: string, email: string, role: string }));
      setEmails(fetched);
      setLoading(false);
    }, (err) => {
      if (err.code === 'permission-denied') {
        console.warn("PreAuthorizedEmails: Access denied. User may not have admin privileges yet.");
      } else {
        console.error("PreAuthorizedEmails Error:", err);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailList = newEmails
      .split(/[\n,]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e.endsWith('@neu.edu.ph'));

    if (emailList.length === 0) return;

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      for (const email of emailList) {
        // Use email as ID to prevent duplicates and allow easy lookup
        const docRef = doc(db, 'pre_authorized_roles', email);
        batch.set(docRef, { email, role: newRole });
      }
      await batch.commit();
      setNewEmails('');
      setIsAdding(false);
    } catch (err) {
      console.error("Error bulk adding emails:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const removeEmail = async (email: string) => {
    try {
      await deleteDoc(doc(db, 'pre_authorized_roles', email));
    } catch (err) {
      console.error("Error removing email:", err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            Pre-authorized Roles
          </h3>
          <p className="text-sm text-[var(--text-muted)]">Emails in this list will automatically receive their assigned role upon first login.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Emails
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : emails.length === 0 ? (
          <div className="col-span-full py-12 text-center glass-card">
            <Mail className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3 opacity-20" />
            <p className="text-[var(--text-muted)]">No pre-authorized emails yet.</p>
          </div>
        ) : (
          emails.map((item) => (
            <motion.div 
              layout
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-4 flex items-center justify-between group"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{item.email}</p>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                  item.role === 'admin' ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"
                )}>
                  {item.role}
                </span>
              </div>
              <button 
                onClick={() => removeEmail(item.id)}
                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-card w-full max-w-lg p-8 space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold">Add Pre-authorized Emails</h3>
                <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-white/10 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleBulkAdd} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Role to Assign</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setNewRole('admin')}
                      className={cn(
                        "flex-1 py-2 rounded-xl border font-bold transition-all",
                        newRole === 'admin' ? "bg-purple-600 border-purple-500 text-white" : "bg-white/5 border-white/10 text-[var(--text-muted)]"
                      )}
                    >
                      Admin
                    </button>
                    <button 
                      type="button"
                      onClick={() => setNewRole('library officer')}
                      className={cn(
                        "flex-1 py-2 rounded-xl border font-bold transition-all",
                        newRole === 'library officer' ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-[var(--text-muted)]"
                      )}
                    >
                      Library Officer
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Email List</label>
                  <textarea 
                    required
                    placeholder="Enter emails separated by commas or new lines..."
                    value={newEmails}
                    onChange={(e) => setNewEmails(e.target.value)}
                    rows={6}
                    className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  />
                  <p className="text-[10px] text-[var(--text-muted)]">Only @neu.edu.ph emails will be added.</p>
                </div>

                <button 
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  Authorize Emails
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
