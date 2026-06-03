/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { BookOpenCheck, ShieldAlert, Sparkles, User as UserIcon, GraduationCap, CheckCircle2, DollarSign } from "lucide-react";
import { User } from "../types";

interface NavbarProps {
  currentUser: User | null;
  onLogout: () => void;
  onSelectRole: (role: "student" | "admin") => void;
  onUpgradeTier: (tier: "free" | "premium" | "payos") => void;
  onNavigate: (view: string) => void;
  currentView: string;
}

export function Navbar({
  currentUser,
  onLogout,
  onSelectRole,
  onUpgradeTier,
  onNavigate,
  currentView
}: NavbarProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleUpgrade = (tier: "free" | "premium" | "payos") => {
    onUpgradeTier(tier);
    setShowUpgradeModal(false);
  };

  return (
    <nav className="sticky top-0 z-40 bg-[#fdfcfb]/45 backdrop-blur-xl border-b border-slate-200/40 shadow-xs" id="main-navigation-bar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center flex-1">
            <button
              onClick={() => onNavigate("home")}
              className="flex items-center space-x-2.5 text-left focus:outline-none group"
              id="logo-button"
            >
              <div className="p-2 mr-0.5 bg-blue-50/80 text-blue-650 rounded-xl group-hover:bg-blue-100/80 backdrop-blur-xs transition-colors border border-white/40">
                <BookOpenCheck className="h-6 w-6" />
              </div>
              <div>
                <span className="font-extrabold text-xl tracking-tight text-gray-900 group-hover:text-blue-600 transition-colors">
                  StudyMate<span className="text-blue-600">AI</span>
                </span>
                <span className="block text-[10px] font-semibold text-gray-400 tracking-wider uppercase -mt-1 font-mono">
                  Learning Copilot
                </span>
              </div>
            </button>

            {/* Main Links */}
            {currentUser && (
              <div className="hidden md:ml-10 md:flex md:space-x-4">
                <button
                  onClick={() => onNavigate("dashboard")}
                  className={`px-3.5 py-2 text-sm font-semibold rounded-xl transition-all ${
                    currentView === "dashboard" || currentView === "document-detail" || currentView === "quiz" || currentView === "flashcards"
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/10"
                      : "text-gray-650 hover:text-gray-900 hover:bg-white/60 backdrop-blur-xs"
                  }`}
                  id="nav-dashboard-button"
                >
                  My Workspace
                </button>
                {currentUser.role === "admin" && (
                  <button
                    onClick={() => onNavigate("admin")}
                    className={`px-3.5 py-2 text-sm font-semibold rounded-xl transition-all flex items-center space-x-1 ${
                      currentView === "admin"
                        ? "bg-amber-600 text-white shadow-md shadow-amber-650/10"
                        : "text-amber-700 hover:text-amber-900 hover:bg-amber-50/60 backdrop-blur-xs"
                    }`}
                    id="nav-admin-button"
                  >
                    <ShieldAlert className="h-4 w-4 mr-1 text-inherit" />
                    Admin Control
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quick Info & User menu */}
          <div className="flex items-center space-x-4">
            {currentUser ? (
              <>
                {/* Subscription Tier badge */}
                <div id="tier-badge-container">
                  {currentUser.subscription === "premium" ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50/70 text-indigo-700 border border-indigo-100/50 backdrop-blur-md ring-2 ring-indigo-50/50">
                      <Sparkles className="h-3 w-3 mr-1 text-indigo-600 animate-pulse" />
                      Premium Account
                    </span>
                  ) : (
                    <button
                      onClick={() => setShowUpgradeModal(true)}
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/70 text-gray-700 hover:bg-white/90 border border-slate-200/50 backdrop-blur-md transition-colors shadow-xs cursor-pointer"
                      id="upgrade-button"
                    >
                      <Sparkles className="h-3 w-3 mr-1 text-indigo-500 animate-pulse" />
                      Free Account (Upgrade)
                    </button>
                  )}
                </div>

                {/* Role Switcher Selector */}
                {currentUser.role === "admin" && (import.meta as any).env?.DEV === true && (
                  <div className="hidden lg:flex items-center bg-white/50 p-1 rounded-xl border border-white/85 text-xs font-mono shadow-xs backdrop-blur-md">
                    <span className="px-2 text-gray-500 font-sans">Simulate Role:</span>
                    <button
                      onClick={() => onSelectRole("student")}
                      className={`px-2 py-1 rounded-lg font-medium transition-colors ${
                        (currentUser.role as string) === "student" ? "bg-white text-blue-600 shadow-xs border border-gray-200/40" : "text-gray-650 hover:text-gray-900"
                      }`}
                    >
                      Student
                    </button>
                    <button
                      onClick={() => onSelectRole("admin")}
                      className={`px-2 py-1 rounded-lg font-medium transition-colors ${
                        (currentUser.role as string) === "admin" ? "bg-white text-amber-600 shadow-xs border border-gray-200/40" : "text-gray-650 hover:text-gray-900"
                      }`}
                    >
                      Admin
                    </button>
                  </div>
                )}

                {/* Profile Widget */}
                <div className="flex items-center space-x-2">
                  <div className="flex flex-col text-right hidden sm:flex">
                    <span className="text-xs font-bold text-gray-800 leading-none">{currentUser.name}</span>
                    <span className="text-[10px] text-gray-400 mt-1 capitalize font-mono leading-none">{currentUser.role}</span>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-white/60 backdrop-blur-md flex items-center justify-center text-slate-700 border border-white/80 shadow-xs">
                    <GraduationCap className="h-4.5 w-4.5 text-slate-600" />
                  </div>
                  <button
                    onClick={onLogout}
                    className="p-1 px-2.5 text-xs font-semibold text-gray-500 hover:text-red-500 border border-gray-200 hover:border-red-100 hover:bg-red-55/60 backdrop-blur-xs rounded-lg transition-colors"
                  >
                    Leave
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => {
                  onNavigate("home");
                  setTimeout(() => {
                    const el = document.getElementById("auth-form-card");
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                      const emailInput = el.querySelector("input[type='email']") as HTMLInputElement;
                      if (emailInput) {
                        emailInput.focus();
                      }
                    }
                  }, 120);
                }}
                className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all focus:ring-4 focus:ring-blue-100 cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Premium Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white/75 backdrop-blur-2xl rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-white/60 overflow-hidden relative">
            <div className="absolute top-0 right-0 h-2 bg-gradient-to-r from-blue-500 to-indigo-500 w-full" />
            <span className="inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-full mb-4">
              <Sparkles className="h-6 w-6 animate-spin" style={{ animationDuration: "3s" }} />
            </span>
            <h3 className="text-lg font-extrabold text-gray-900 mb-1">Upgrade to StudyMate Premium</h3>
            <p className="text-gray-500 text-sm mb-4">
              Free accounts are limited to <span className="font-bold text-gray-900">15 AI operations</span> (summaries, quizzes, flashcards, etc). Unlock infinite power today!
            </p>
            
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6 font-sans">
              <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider font-mono">Premium Inclusions</label>
              <ul className="space-y-2 mt-2">
                <li className="flex items-start text-xs text-slate-600">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500 flex-shrink-0" />
                  Unlimited AI summary & quiz creation
                </li>
                <li className="flex items-start text-xs text-slate-600">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500 flex-shrink-0" />
                  Ask any question to documents without limits
                </li>
                <li className="flex items-start text-xs text-slate-600">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500 flex-shrink-0" />
                  Support for PowerPoint pptx, PDF & Docx notes
                </li>
                <li className="flex items-start text-xs text-slate-600">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500 flex-shrink-0" />
                  3D flipping active recall cards with tracker
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleUpgrade("payos")}
                className="w-full py-3 px-4 text-xs font-bold text-white bg-indigo-650 hover:bg-indigo-750 hover:scale-[1.01] shadow-md shadow-indigo-500/20 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                id="upgrade-payos-button"
              >
                <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
                Upgrade with VietQR / Bank Transfer
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="w-full py-2 px-3 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all border border-gray-200 cursor-pointer text-center"
                >
                  Stay Free
                </button>


              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
