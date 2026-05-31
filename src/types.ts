/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'admin';
  subscription: 'free' | 'premium';
  createdAt: string;
}

export interface Document {
  id: string;
  userId: string;
  title: string;
  extractedText: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  filePath?: string;
}

export interface Summary {
  id: string;
  documentId: string;
  overview: string;
  keyPoints: string[];
  summaryText: string;
  createdAt: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface Quiz {
  id: string;
  documentId: string;
  title: string;
  questions: QuizQuestion[];
  createdAt: string;
}

export interface Flashcard {
  id: string;
  documentId: string;
  front: string;
  back: string;
  isLearned: boolean;
  boxIndex: number; // For Leitner system if desired, basic: 0..4
  createdAt: string;
}

export interface StudyTask {
  id: string;
  title: string;
  description: string;
  dayNumber: number;
  isCompleted: boolean;
  completed?: boolean;
  day?: number;
  estimated_minutes?: number;
}

export interface StudyPlan {
  id: string;
  documentId: string;
  title: string;
  durationDays: number;
  tasks: StudyTask[];
  createdAt: string;
}

export interface QuizProgress {
  quizId: string;
  title: string;
  score: number;
  maxScore: number;
  wrongQuestions: {
    questionText: string;
    options: string[];
    userAnswerIndex: number;
    correctAnswerIndex: number;
    explanation: string;
  }[];
  date: string;
}

export interface FlashcardProgress {
  cardId: string;
  boxIndex: number;
  lastReviewed: string;
}

export interface UserProgress {
  userId: string;
  quizzes: QuizProgress[];
  flashcardProgress: Record<string, FlashcardProgress>; // cardId -> progress
  totalAIUsage: number;
  lastActive: string;
}

export interface AIUsageLog {
  id: string;
  userId: string;
  operationType: 'summary' | 'quiz' | 'flashcard' | 'chat' | 'studyplan';
  createdAt: string;
}

export interface ReportedContent {
  id: string;
  documentId: string;
  documentTitle: string;
  reporterEmail: string;
  reason: string;
  status: 'pending' | 'reviewed';
  createdAt: string;
}
