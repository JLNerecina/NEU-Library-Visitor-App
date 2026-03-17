import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, COLLEGES } from '../types';
import { Search, ShieldBan, ShieldCheck, Users, Edit2, Trash2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

import PreAuthorizedEmails from './PreAuthorizedEmails';

export default function UserManagement({ currentUserRole }: { currentUserRole?: string }) {
  const [activeTab, setActiveTab] = useState<'users' | 'preauth'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<UserProfile>>({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      let fetchedUsers = snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
      
      // Filter out admins if the current user is a library officer
      if (currentUserRole === 'library officer') {
        fetchedUsers = fetchedUsers.filter(u => u.role !== 'admin');
      }
      
      setUsers(fetchedUsers);
      setLoading(false);
    }, (err) => {
      // If we get a permission error, it's likely because the user is not an admin yet
      // or their role hasn't been synced to the database.
      if (err.code === 'permission-denied') {
        console.warn("UserManagement: Access denied. User may not have admin privileges yet.");
      } else {
        console.error("UserManagement Error:", err);
      }
      setLoading(false);
    });
    return unsub;
  }, [currentUserRole]);

  const toggleBlock = async (userProfile: UserProfile) => {
    try {
      const userRef = doc(db, 'users', userProfile.uid);
      await updateDoc(userRef, { isBlocked: !userProfile.isBlocked });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (uid: string) => {
    if (confirmingDelete === uid) {
      try {
        await deleteDoc(doc(db, 'users', uid));
        setConfirmingDelete(null);
      } catch (err) {
        console.error("Error deleting user:", err);
      }
    } else {
      setConfirmingDelete(uid);
      setTimeout(() => setConfirmingDelete(null), 3000);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const userRef = doc(db, 'users', editingUser.uid);
      await updateDoc(userRef, editForm);
      setEditingUser(null);
    } catch (err) {
      console.error("Error updating user:", err);
    }
  };

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      college: user.college,
      role: user.role || 'user',
      studentId: user.studentId || ''
    });
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.college.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-2 p-1 bg-[var(--input-bg)] rounded-2xl w-fit border border-white/5">
        <button 
          onClick={() => setActiveTab('users')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
            activeTab === 'users' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
          )}
        >
          User Directory
        </button>
        <button 
          onClick={() => setActiveTab('preauth')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
            activeTab === 'preauth' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
          )}
        >
          Pre-authorized Roles
        </button>
      </div>

      {activeTab === 'preauth' ? (
        <div className="glass-card p-8">
          <PreAuthorizedEmails />
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
          <thead className="bg-[var(--input-bg)] text-left text-[10px] md:text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-3 md:px-6 md:py-4">User</th>
              <th className="px-3 py-3 md:px-6 md:py-4">College</th>
              <th className="px-3 py-3 md:px-6 md:py-4">Role</th>
              <th className="px-3 py-3 md:px-6 md:py-4">Status</th>
              <th className="px-3 py-3 md:px-6 md:py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-8 md:px-6 md:py-12 text-center text-[var(--text-muted)]">Loading users...</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 md:px-6 md:py-12 text-center text-[var(--text-muted)]">No users found.</td></tr>
            ) : (
              filteredUsers.map(u => (
                <tr key={u.uid} className="hover:bg-white/5 transition-colors">
                  <td className="px-3 py-3 md:px-6 md:py-4">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          u.name.charAt(0)
                        )}
                      </div>
                      <div className="min-w-0 max-w-[120px] md:max-w-none">
                        <p className="font-bold text-xs md:text-sm truncate">{u.name}</p>
                        <p className="text-[10px] md:text-xs text-[var(--text-muted)] truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4 text-xs md:text-sm text-[var(--text-muted)] truncate max-w-[100px] md:max-w-none">{u.college}</td>
                  <td className="px-3 py-3 md:px-6 md:py-4">
                    <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-full text-[10px] md:text-xs font-bold capitalize whitespace-nowrap">
                      {u.role || 'user'}
                    </span>
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4">
                    {u.isBlocked ? (
                      <span className="px-2 py-1 bg-red-500/20 text-red-400 text-[8px] md:text-[10px] font-bold uppercase rounded-md border border-red-500/20 whitespace-nowrap">Blocked</span>
                    ) : (
                      <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[8px] md:text-[10px] font-bold uppercase rounded-md border border-emerald-500/20 whitespace-nowrap">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                    <div className="flex items-center justify-end gap-1 md:gap-2">
                      <button 
                        onClick={() => openEditModal(u)}
                        className="p-1.5 md:p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-all"
                        title="Edit User"
                      >
                        <Edit2 className="w-4 h-4 md:w-5 md:h-5" />
                      </button>
                      <button 
                        onClick={() => toggleBlock(u)}
                        className={cn(
                          "p-1.5 md:p-2 rounded-lg transition-all",
                          u.isBlocked 
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" 
                            : "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                        )}
                        title={u.isBlocked ? "Unblock User" : "Block User"}
                      >
                        {u.isBlocked ? <ShieldCheck className="w-4 h-4 md:w-5 md:h-5" /> : <ShieldBan className="w-4 h-4 md:w-5 md:h-5" />}
                      </button>
                      <button 
                        onClick={() => handleDelete(u.uid)}
                        className={cn(
                          "p-1.5 md:p-2 rounded-lg transition-all",
                          confirmingDelete === u.uid 
                            ? "bg-red-600 text-white" 
                            : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        )}
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card w-full max-w-md p-8 space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold">Edit User</h3>
              <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-white/10 rounded-full">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleEditSave} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Full Name</label>
                <input 
                  required
                  type="text"
                  value={editForm.name || ''}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Email Address</label>
                <input 
                  required
                  disabled
                  type="email"
                  value={editForm.email || ''}
                  className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">College</label>
                  <select 
                    value={editForm.college || ''}
                    onChange={e => setEditForm({...editForm, college: e.target.value})}
                    className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-[var(--text-main)]"
                  >
                    {COLLEGES.map(c => <option key={c} value={c} className="text-black">{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Role</label>
                  <select 
                    value={editForm.role || 'user'}
                    onChange={e => setEditForm({...editForm, role: e.target.value as any})}
                    className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-[var(--text-main)]"
                  >
                    <option value="user" className="text-black">Student</option>
                    <option value="library officer" className="text-black">Library Officer</option>
                    {currentUserRole === 'admin' && <option value="admin" className="text-black">Admin</option>}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Student ID (Optional)</label>
                <input 
                  type="text"
                  value={editForm.studentId || ''}
                  onChange={e => setEditForm({...editForm, studentId: e.target.value})}
                  className="w-full bg-[var(--input-bg)] border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
              >
                Save Changes
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
