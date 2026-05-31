/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, Users, FileSpreadsheet, BarChart3, AlertOctagon, 
  Trash2, ShieldAlert, Sparkles, TrendingUp, CheckCircle, XCircle
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie } from "recharts";
import { User, Document, ReportedContent } from "../types";

interface AdminViewProps {
  currentUser: User;
  onNavigate: (view: string) => void;
}

export function AdminView({
  currentUser,
  onNavigate
}: AdminViewProps) {
  
  const [stats, setStats] = useState<any | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [reports, setReports] = useState<ReportedContent[]>([]);
  
  const [activeSubTab, setActiveSubTab] = useState<"stats" | "users" | "documents" | "reports">("stats");
  const [loading, setLoading] = useState(true);
  const [mgmtSuccess, setMgmtSuccess] = useState<string | null>(null);

  // Fetch complete admin state payloads
  const fetchAdminData = async () => {
    setLoading(true);
    const token = localStorage.getItem("studymate_token") || "";
    try {
      // Parallelize admin GET routes
      const [statsRes, usersRes, docsRes, reportsRes] = await Promise.all([
        fetch("/api/admin/stats", { headers: { "Authorization": token } }),
        fetch("/api/admin/users", { headers: { "Authorization": token } }),
        fetch("/api/documents", { headers: { "Authorization": token } }), // Already scoped in server
        fetch("/api/admin/reports", { headers: { "Authorization": token } })
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (docsRes.ok) setDocuments(await docsRes.json());
      if (reportsRes.ok) setReports(await reportsRes.json());
    } catch (err) {
      console.error("Failed fetching administration assets: ", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleUpdateRole = async (userId: string, newRole: "student" | "admin") => {
    setMgmtSuccess(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": localStorage.getItem("studymate_token") || "" },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setMgmtSuccess("User role updated successfully!");
        fetchAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateSubscription = async (userId: string, newTier: "free" | "premium") => {
    setMgmtSuccess(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": localStorage.getItem("studymate_token") || "" },
        body: JSON.stringify({ subscription: newTier })
      });
      if (res.ok) {
        setMgmtSuccess("User subscription level updated!");
        fetchAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolveReport = async (reportId: string, action: "deleteDoc" | "dismiss") => {
    setMgmtSuccess(null);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": localStorage.getItem("studymate_token") || "" },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        setMgmtSuccess(action === "deleteDoc" ? "Flagged document deleted!" : "Inappropriate report dismissed.");
        fetchAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    setMgmtSuccess(null);
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
        headers: { "Authorization": localStorage.getItem("studymate_token") || "" }
      });
      if (res.ok) {
        setMgmtSuccess("Material deleted by admin executive order.");
        fetchAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Mapped stats payload for Recharts visualizers
  const chartData = stats ? [
    { name: "Summaries", count: stats.operationStats.summary, fill: "#3b82f6" },
    { name: "Quizzes", count: stats.operationStats.quiz, fill: "#10b981" },
    { name: "Flashcards", count: stats.operationStats.flashcard, fill: "#6366f1" },
    { name: "Chats", count: stats.operationStats.chat, fill: "#e11d48" },
    { name: "Schedules", count: stats.operationStats.studyplan, fill: "#8b5cf6" }
  ] : [];

  const pieData = stats ? [
    { name: "Premium Tier", value: stats.premiumUsersCount, fill: "#6366f1" },
    { name: "Free Tier", value: stats.freeUsersCount, fill: "#94a3b8" }
  ] : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8" id="admin-executive-panel">
      
      {/* Admin header banner */}
      <div className="bg-gradient-to-r from-teal-950 to-emerald-950 border border-teal-800 rounded-2xl p-6 sm:p-8 text-white flex flex-col md:flex-row md:justify-between md:items-center gap-6">
        <div className="space-y-1 text-left">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-teal-900 border border-teal-700 rounded-full text-xs font-semibold text-teal-300">
            <ShieldCheck className="h-4 w-4" />
            <span>Admin Executive Room</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">StudyMate Administration Center</h2>
          <p className="text-teal-200 text-xs sm:text-sm">Manage users, moderate contents shelf, track plans distribution and review AI telemetry metrics.</p>
        </div>

        <button
          onClick={() => onNavigate("dashboard")}
          className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-md shadow-emerald-950/20 w-fit cursor-pointer"
        >
          Enter Student Dashboard
        </button>
      </div>

      {/* Admin alert panel */}
      {mgmtSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-250 text-emerald-800 text-xs rounded-xl font-bold animate-pulse flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <span>{mgmtSuccess}</span>
        </div>
      )}

      {/* Tabs list to route section views */}
      <div className="flex border-b border-gray-150 space-x-1 p-1 bg-white border border-gray-100 rounded-xl max-w-lg font-sans">
        <button
          onClick={() => setActiveSubTab("stats")}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-colors duration-150 flex items-center justify-center gap-1.5 ${
            activeSubTab === "stats" ? "bg-slate-900 text-white" : "text-gray-500 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          AI Statistics
        </button>

        <button
          onClick={() => setActiveSubTab("users")}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-colors duration-150 flex items-center justify-center gap-1.5 ${
            activeSubTab === "users" ? "bg-slate-900 text-white" : "text-gray-500 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <Users className="h-4 w-4" />
          Users
        </button>

        <button
          onClick={() => setActiveSubTab("documents")}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-colors duration-150 flex items-center justify-center gap-1.5 ${
            activeSubTab === "documents" ? "bg-slate-900 text-white" : "text-gray-500 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Books Shelf
        </button>

        <button
          onClick={() => setActiveSubTab("reports")}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-colors duration-150 flex items-center justify-center gap-1.5 relative ${
            activeSubTab === "reports" ? "bg-slate-900 text-white" : "text-gray-500 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          Moderation
          {reports.filter(r => r.status === "pending").length > 0 && (
            <span className="absolute -top-1.5 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white font-mono">
              {reports.filter(r => r.status === "pending").length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-xs text-gray-400 font-mono animate-pulse">Loading administration database...</div>
      ) : (
        <div className="space-y-8 font-sans">
          
          {/* 1. OPERATIONS STATISTICS TAB, satisfying Paragraph 3 ("Admin") */}
          {activeSubTab === "stats" && stats && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Side: Recharts graphics */}
              <div className="lg:col-span-8 bg-white border border-gray-100 p-6 rounded-2xl shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-black text-gray-900">AI Operation Demands</h3>
                  <p className="text-gray-400 text-xs">Total volume of requests processed across each generative AI study service.</p>
                </div>

                <div className="h-80 w-full" id="stats-histogram-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <Tooltip formatter={(value) => [`${value} operations`, "Usage Count"]} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right Side: subscription distribution pie chart & table details */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* Billing Pie chart mapping */}
                <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-black text-gray-900">Tier Distribution</h3>
                    <p className="text-gray-400 text-[10px]">Ratio of Free student tiers versus premium memberships.</p>
                  </div>

                  <div className="h-44 w-full flex items-center justify-center font-mono">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-2.5 bg-indigo-50/50 rounded-xl border border-indigo-100">
                      <span className="text-[9px] font-mono font-bold text-indigo-700 block uppercase">Premium accounts</span>
                      <span className="text-xl font-black text-indigo-900 block mt-0.5">{stats.premiumUsersCount}</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-gray-100">
                      <span className="text-[9px] font-mono font-bold text-gray-500 block uppercase">Free level users</span>
                      <span className="text-xl font-black text-gray-900 block mt-0.5">{stats.freeUsersCount}</span>
                    </div>
                  </div>
                </div>

                {/* Free Users Usage Alerts details */}
                <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm space-y-4 text-left">
                  <div>
                    <h4 className="text-sm font-black text-gray-900 flex items-center gap-1">
                      <AlertOctagon className="h-4.5 w-4.5 text-amber-500" />
                      Free Tier Usage Caps
                    </h4>
                    <p className="text-gray-400 text-[10px]">Students listed are nearing or have met the 15 queries sandbox threshold.</p>
                  </div>

                  <div className="space-y-2.5 max-h-[150px] overflow-y-auto pr-1">
                    {stats.freeUsageStats.map((item: any, i: number) => {
                      const limitPrc = Math.min((item.usage / 15) * 100, 100);
                      return (
                        <div key={i} className="text-xs space-y-1.5 pb-2 border-b border-gray-50">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-bold text-gray-800 truncate max-w-[150px]">{item.name}</span>
                            <span className="font-mono text-gray-500 font-semibold">{item.usage} / 15</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${item.usage >= 12 ? "bg-red-500" : "bg-teal-500"}`} 
                              style={{ width: `${limitPrc}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. USER DIRECTORY MANAGEMENT TAB, satisfying Paragraph 3 ("Admin") */}
          {activeSubTab === "users" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden text-left">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-black text-gray-900">System Users ({users.length})</h3>
                <p className="text-gray-400 text-xs">Verify credentials, configure permissions, and allocate subscription membership levels.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-gray-500 font-sans" id="users-admin-table">
                  <thead className="text-[10px] text-gray-400 uppercase bg-slate-50 border-b border-gray-100 font-mono tracking-widest">
                    <tr>
                      <th scope="col" className="px-6 py-4">Name / Student Email</th>
                      <th scope="col" className="px-6 py-4 text-center">Subscription Plan</th>
                      <th scope="col" className="px-6 py-4 text-center">System Authorization Role</th>
                      <th scope="col" className="px-6 py-4 text-center">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((user) => {
                      const isSelf = user.id === currentUser.id;
                      return (
                        <tr key={user.id} className="hover:bg-slate-50/50">
                          <th scope="row" className="px-6 py-4 text-slate-900">
                            <span className="font-bold block text-sm">{user.name}</span>
                            <span className="text-[10px] text-gray-400 mt-0.5 block font-mono">{user.email}</span>
                          </th>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] capitalize ${
                                user.subscription === "premium" ? "bg-indigo-50 text-indigo-700 border border-indigo-100" : "bg-gray-100 text-gray-600"
                              }`}>
                                {user.subscription} tier
                              </span>
                              
                              <button
                                onClick={() => handleUpdateSubscription(user.id, user.subscription === "premium" ? "free" : "premium")}
                                className="text-[9px] text-blue-600 hover:underline font-bold"
                              >
                                Toggle Tier Plan
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] capitalize ${
                                user.role === "admin" ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-teal-50 text-teal-700"
                              }`}>
                                {user.role} role
                              </span>
                              {/* Swapping capabilities */}
                              {!isSelf && (
                                <button
                                  onClick={() => handleUpdateRole(user.id, user.role === "admin" ? "student" : "admin")}
                                  className="text-[9px] text-amber-600 hover:underline font-bold"
                                >
                                  Swap Role
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center text-gray-400 font-mono">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. DOCUMENTS DIRECTORY MANAGEMENT TAB */}
          {activeSubTab === "documents" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden text-left">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-black text-gray-900">System Document Repository ({documents.length})</h3>
                <p className="text-gray-400 text-xs">Verify total database resources, review metadata sizes and moderate elements.</p>
              </div>

              {documents.length === 0 ? (
                <p className="p-12 text-center text-gray-400 italic text-xs">The file repository is completely empty.</p>
              ) : (
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left text-gray-500 font-sans" id="documents-admin-table">
                    <thead className="text-[10px] text-gray-400 uppercase bg-slate-50 border-b border-gray-100 font-mono tracking-widest">
                      <tr>
                        <th scope="col" className="px-6 py-4">Syllabus Document Details</th>
                        <th scope="col" className="px-6 py-4 text-center">Owner Account ID</th>
                        <th scope="col" className="px-6 py-4 text-center">File Format</th>
                        <th scope="col" className="px-6 py-4 text-center">Characters Tally</th>
                        <th scope="col" className="px-6 py-4 text-center">Operations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {documents.map((doc) => (
                        <tr key={doc.id} className="hover:bg-slate-50/50">
                          <th scope="row" className="px-6 py-4 text-slate-800">
                            <span className="font-bold text-sm block">{doc.title}</span>
                            <span className="text-[10px] text-gray-400 block font-mono mt-0.5">Reference ID: {doc.id}</span>
                          </th>
                          <td className="px-6 py-4 text-center text-gray-400 font-mono">
                            {doc.userId}
                          </td>
                          <td className="px-6 py-4 text-center font-mono">
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-bold uppercase text-[9px] border border-blue-100">
                              {doc.fileType}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-bold text-slate-700">
                            {doc.extractedText.length}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-red-600 hover:bg-red-50 hover:text-red-800 border border-transparent hover:border-red-100 transition-colors rounded-lg font-bold"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Wipe File
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 4. CONTENT MODERATION QUEUE, satisfying Paragraph 3 ("Admin") */}
          {activeSubTab === "reports" && (
            <div className="bg-white rounded-2xl border border-gray-150 shadow-sm overflow-hidden text-left">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-gray-900">Flagged Incidents Queue ({reports.filter(r => r.status === "pending").length})</h3>
                  <p className="text-gray-400 text-xs">Review student moderating comments and proceed to dismiss or delete inappropriate textbook blocks.</p>
                </div>
                <span className="px-2.5 py-1 text-xs bg-red-50 text-red-700 font-bold rounded-lg border border-red-100 animate-pulse">
                  Flagged Incidents Queue
                </span>
              </div>

              {reports.length === 0 ? (
                <p className="p-12 text-center text-gray-400 italic text-xs">No documents reported currently. Complete safety status exists across the system shelf.</p>
              ) : (
                <div className="divide-y divide-gray-150">
                  {reports.map((rep) => {
                    const isPending = rep.status === "pending";
                    return (
                      <div key={rep.id} className={`p-6 space-y-4 ${isPending ? "bg-red-50/10" : "bg-white opacity-60"}`}>
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1">
                            <span className="font-extrabold text-sm text-slate-800 block leading-tight">{rep.documentTitle}</span>
                            <span className="block text-[10px] text-gray-400 font-mono">
                              Report ID: {rep.id} • Submitted by {rep.reporterEmail}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider font-mono ${
                            isPending ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-slate-100 text-gray-400"
                          }`}>
                            {rep.status}
                          </span>
                        </div>

                        {/* Reported Reason content box */}
                        <div className="p-3 bg-slate-50 border border-gray-150 rounded-xl">
                          <label className="text-[8px] font-bold uppercase tracking-wider text-slate-400 font-mono block mb-1">Student Infraction Context</label>
                          <p className="text-xs text-slate-700 font-medium font-sans italic">"{rep.reason}"</p>
                        </div>

                        {/* Action controllers */}
                        {isPending && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleResolveReport(rep.id, "deleteDoc")}
                              className="px-3.5 py-1.5 bg-red-650 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer"
                            >
                              Confirm Rules and Delete Textbook
                            </button>
                            <button
                              onClick={() => handleResolveReport(rep.id, "dismiss")}
                              className="px-3.5 py-1.5 bg-white border border-gray-250 text-gray-600 hover:text-gray-900 rounded-lg text-xs font-bold cursor-pointer"
                            >
                              Dismiss Report Warning
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
