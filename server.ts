/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "study_db.json");

// Define a safe fallback for Gemini API calls to ensure app runs.
const getGenAI = (): GoogleGenAI => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    // If we don't have a key yet, we will log a warning.
    // In actual AI queries, we'll throw a helpful message rather than crashing the server.
    console.warn("WARNING: GEMINI_API_KEY environment variable is not set correctly. AI features will fallback to smart simulated data if no key is supplied.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "dummy_key",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

const ai = getGenAI();
const getValidModel = (requestedModel: string | undefined): string => {
  const model = requestedModel || "gemini-3.5-flash";
  const prohibitedModels = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-pro",
    "gemini-2.0-flash",
    "gemini-2.0-pro",
    "gemini-2.0-flash-thinking"
  ];
  if (prohibitedModels.includes(model)) {
    return "gemini-3.5-flash";
  }
  return model;
};

const GEMINI_MODEL = getValidModel(process.env.GEMINI_MODEL);

// Express JSON middleware
app.use(express.json({ limit: "50mb" }));

// Helper to generate IDs
const generateId = () => crypto.randomUUID();

// Default Prepopulated Database
const DEFAULT_DB = {
  users: [
    {
      id: "user-student",
      email: "student@studymate.ai",
      name: "Alex Learner",
      role: "student",
      subscription: "free",
      createdAt: "2026-05-20T10:00:00Z"
    },
    {
      id: "user-admin",
      email: "admin@studymate.ai",
      name: "Sarah Director",
      role: "admin",
      subscription: "premium",
      createdAt: "2026-05-18T08:30:00Z"
    }
  ],
  documents: [
    {
      id: "doc-mitochondria",
      userId: "user-student",
      title: "Mitochondria: Powerhouse of the Cell.pdf",
      extractedText: `Mitochondria are double-membrane-bound organelles found in most eukaryotic organisms. They generate most of the cell's supply of adenosine triphosphate (ATP), used as a source of chemical energy. Often referred to as the powerhouse of the cell, mitochondria play a key role in cellular respiration. 

STRUCTURE:
Mitochondria contain outer and inner membranes composed of phospholipid bilayers and proteins. The two membranes have different properties.
- Outer membrane: Encloses the organelle. It contains large numbers of integral membrane proteins called porins, which allow molecules to freely diffuse.
- Inner membrane: Folded into numerous invaginations called cristae, increasing the surface area available for chemical reactions.
- Matrix: The space enclosed by the inner membrane. It contains a highly concentrated mixture of hundreds of enzymes, mitochondrial ribosomes, tRNA, and the mitochondrial DNA genome.

FUNCTION:
The most prominent roles of mitochondria are to produce ATP through oxidative phosphorylation, and to regulate cellular metabolism.
1. Energy Conversion: Food molecules (glycolysis products) are imported and oxidized in the citric acid cycle (Krebs cycle) to produce NADH and FADH2. These feed the electron transport chain (ETC) in the inner membrane, pumping protons into the intermembrane space. This creates an electrochemical gradient that drives ATP synthase to produce ATP.
2. Calcium Storage: Mitochondria store calcium, contributing to the cell's calcium homeostasis.
3. Apoptosis: Programmed cell death is initiated through the release of Cytochrome c from mitochondria into the cytoplasm.
4. Heat Production: Brown adipose tissue utilizes uncoupling proteins (UCP1) to generate heat directly from proton gradients rather than synthesizing ATP.`,
      fileType: "pdf",
      fileSize: 45200,
      createdAt: "2026-05-28T09:15:00Z"
    },
    {
      id: "doc-react-hooks",
      userId: "user-student",
      title: "Modern React Hooks & State Management.docx",
      extractedText: `React Hooks are functions that let you 'hook into' React state and lifecycle features from function components. They were introduced in React 16.8 to enable developers to write stateless components that still manage local state and side effects.

PRIMARY HOOKS:
1. useState: Declares a state variable that React preserves between renders.
   Syntax: const [state, setState] = useState(initialState);
2. useEffect: Performs side effects in function components. It serves the purpose of componentDidMount, componentDidUpdate, and componentWillUnmount combined.
   Key rule: Always return a cleanup function to prevent memory leaks (e.g. clearing event listeners or timers). Always define simple dependency arrays to avoid infinite render loops.
3. useContext: Subscribes to React context, enabling clean data sharing across nested component hierarchies without prop-drilling.

ADVANCED HOOKS:
- useMemo: Memoizes a computed value, recalculating it only when dependencies change. Useful for intense numeric calculations.
- useCallback: Returns a memoized version of a callback function, preventing unnecessary subcomponent renders.
- useRef: Returns a mutable ref object whose .current property is persistent across renders without triggering a re-render. Perfect for holding DOM elements or timer IDs.

RULES OF HOOKS:
1. Only call Hooks at the top level. Don't call them inside loops, conditions, or nested functions.
2. Only call Hooks from React Function Components or Custom Hooks.`,
      fileType: "docx",
      fileSize: 28400,
      createdAt: "2026-05-29T11:00:00Z"
    }
  ],
  summaries: [
    {
      id: "sum-mitochondria",
      documentId: "doc-mitochondria",
      overview: "Mitochondria are the primary power-producing organelles of eukaryotic cells, converting biochemical inputs into adenosine triphosphate (ATP) while regulating calcium, heat, and cell death.",
      keyPoints: [
        "Double-membrane structure featuring a smooth outer membrane and highly folded inner cristae.",
        "ATP is produced via the electron transport chain (ETC) and ATP synthase inside the inner membrane.",
        "Stores calcium ions to maintain intracellular homeostasis.",
        "Triggers apoptosis (programmed cell death) via cytochrome c release.",
        "Generates heat through uncoupling proteins (UCP1) in brown fat tissues."
      ],
      summaryText: "### Mitochondria Summary\n\nMitochondria function as the cellular energizer, producing chemical fuel (ATP). They are recognizable by their unique double-membrane boundary where the **inner cristae** house proteins for cellular respiration. During the Krebs cycle and oxidative phosphorylation, electrons move through membranes to pump protons, forming a membrane potential used by ATP synthase. In addition to powering cells, they are active in safety mechanisms like apoptosis and heat homeostasis.",
      createdAt: "2026-05-28T09:16:00Z"
    },
    {
      id: "sum-react-hooks",
      documentId: "doc-react-hooks",
      overview: "React Hooks empower functional components to maintain state, capture lifecycles, consume context, and reference DOM tags cleanly without implementing traditional class notation.",
      keyPoints: [
        "useState preserves reactive variables between browser renders.",
        "useEffect captures operations like subscriptions and demands careful attention to cleanup to prevent leaks.",
        "useContext eliminates nested parameter drilling through global style providers.",
        "useRef holds non-rendering constants and directly interfaces with physical document nodes.",
        "Hooks must only be activated at the root level, specifically bypassing conditional branches."
      ],
      summaryText: "### React Hooks Summary\n\nHooks solved major challenges in modular design, making stateful logic shareable without altering component hierarchies. By adopting `useState` and `useEffect`, functions do everything classes did but in a functional design. Always keep dependency chains tight to avoid rendering loops.",
      createdAt: "2026-05-29T11:01:00Z"
    }
  ],
  quizzes: [
    {
      id: "quiz-mitochondria",
      documentId: "doc-mitochondria",
      title: "Mitochondria Comprehensive Quiz",
      questions: [
        {
          id: "q-m1",
          text: "What major chemical energy compound do mitochondria generate?",
          options: ["NADH", "Adenosine Triphosphate (ATP)", "Glucose", "Cytochrome c"],
          correctAnswerIndex: 1,
          explanation: "Mitochondria are famously known as the powerhouses of the cell because they synthesize most of the cell's Adenosine Triphosphate (ATP) which serves as standard cellular fuel."
        },
        {
          id: "q-m2",
          text: "Which membrane structural detail serves to increase the surface area available for cellular respiration?",
          options: ["Outer membrane porins", "Infolded cristae of the inner membrane", "Mitochondrial matrix mix", "Ribosomes"],
          correctAnswerIndex: 1,
          explanation: "The inner membrane is folded into deep folds called cristae, which immensely expands the surface area available for oxidative phosphorylation assemblies."
        },
        {
          id: "q-m3",
          text: "What protein is released from mitochondria into the cytoplasm to initiate programmed cell death (apoptosis)?",
          options: ["Porin", "ATP Synthase", "Cytochrome c", "Hemoglobin"],
          correctAnswerIndex: 2,
          explanation: "The release of Cytochrome c from the mitochondrial intermembrane space into the cytosol triggers caspase activation, leading directly to apoptosis."
        }
      ],
      createdAt: "2026-05-28T09:16:30Z"
    }
  ],
  flashcards: [
    {
      id: "flash-mit1",
      documentId: "doc-mitochondria",
      front: "Why are mitochondria called the 'powerhouse of the cell'?",
      back: "Because they generate adenosine triphosphate (ATP), the primary biochemical energy currency used by cells.",
      isLearned: false,
      boxIndex: 0,
      createdAt: "2026-05-28T09:17:00Z"
    },
    {
      id: "flash-mit2",
      documentId: "doc-mitochondria",
      front: "What are cristae?",
      back: "Cristae are the deep, folded invaginations of the mitochondrial inner membrane that maximize surface area for respiration reactions.",
      isLearned: false,
      boxIndex: 0,
      createdAt: "2026-05-28T09:17:02Z"
    },
    {
      id: "flash-react1",
      documentId: "doc-react-hooks",
      front: "What is the primary rule regarding where hooks can be declared?",
      back: "Hooks can ONLY be called at the very top level of a Functional Component. They cannot be placed inside conditional blocks, loops, or nested callbacks.",
      isLearned: false,
      boxIndex: 1,
      createdAt: "2026-05-29T11:02:00Z"
    }
  ],
  studyPlans: [
    {
      id: "plan-mitochondria",
      documentId: "doc-mitochondria",
      title: "3-Day Master Plan: Mitochondrial Biology",
      durationDays: 3,
      tasks: [
        { id: "t-m1", title: "Membrane Structure Review", description: "Study outer and inner phospholipid double-layers, specifically mapping cristae and porin functions.", dayNumber: 1, isCompleted: true },
        { id: "t-m2", title: "Oxidative Phosphorylation Mechanics", description: "Trace NADH/FADH2 oxidation and understand the proton pump mechanism driving the ATP Synthase rotor.", dayNumber: 2, isCompleted: false },
        { id: "t-m3", title: "Secondary Functions & Apoptosis", description: "Understand how mitochondria maintain calcium homeostasis and release Cytochrome c to trigger program cell death.", dayNumber: 3, isCompleted: false }
      ],
      createdAt: "2026-05-28T09:17:30Z"
    }
  ],
  progress: [
    {
      userId: "user-student",
      quizzes: [
        {
          quizId: "quiz-mitochondria",
          title: "Mitochondria Comprehensive Quiz",
          score: 2,
          maxScore: 3,
          wrongQuestions: [
            {
              questionText: "What protein is released from mitochondria into the cytoplasm to initiate programmed cell death (apoptosis)?",
              options: ["Porin", "ATP Synthase", "Cytochrome c", "Hemoglobin"],
              userAnswerIndex: 0,
              correctAnswerIndex: 2,
              explanation: "The release of Cytochrome c from the mitochondrial intermembrane space into the cytosol triggers caspase activation, leading directly to apoptosis."
            }
          ],
          date: "2026-05-28T09:20:00Z"
        }
      ],
      flashcardProgress: {
        "flash-react1": { cardId: "flash-react1", boxIndex: 1, lastReviewed: "2026-05-29T11:30:00Z" }
      } as Record<string, any>,
      totalAIUsage: 5,
      lastActive: "2026-05-29T14:40:00Z"
    }
  ],
  reportedContent: [
    {
      id: "report-dummy",
      documentId: "doc-mitochondria",
      documentTitle: "Mitochondria: Powerhouse of the Cell.pdf",
      reporterEmail: "tester@studymate.ai",
      reason: "Contains duplicate paragraphs under structure.",
      status: "pending",
      createdAt: "2026-05-29T12:00:00Z"
    }
  ],
  usageLogs: [
    { id: "ul-1", userId: "user-student", operationType: "summary", createdAt: "2026-05-28T09:16:00Z" },
    { id: "ul-2", userId: "user-student", operationType: "quiz", createdAt: "2026-05-28T09:16:30Z" },
    { id: "ul-3", userId: "user-student", operationType: "flashcard", createdAt: "2026-05-28T09:17:02Z" },
    { id: "ul-4", userId: "user-student", operationType: "chat", createdAt: "2026-05-28T09:19:00Z" },
    { id: "ul-5", userId: "user-student", operationType: "studyplan", createdAt: "2026-05-28T11:22:00Z" }
  ]
};

// Database state
let db = { ...DEFAULT_DB };

// Initialize database
const initDB = () => {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      db = JSON.parse(content);
      // Validate structure matches
      if (!db.users || !db.documents || !db.summaries || !db.quizzes || !db.flashcards || !db.studyPlans || !db.progress) {
        db = { ...DEFAULT_DB };
        saveToDisk();
      }
    } else {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
    }
  } catch (error) {
    console.error("Failed to read study database, initializing default list:", error);
    db = { ...DEFAULT_DB };
  }
};

const saveToDisk = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error("Failed to persist study database:", err);
  }
};

initDB();

// AI log usage count helper
const logAIUsage = (userId: string, opType: any) => {
  // Ensure progress entry exist for user
  let prog = db.progress.find((p) => p.userId === userId);
  if (!prog) {
    prog = {
      userId,
      quizzes: [],
      flashcardProgress: {},
      totalAIUsage: 0,
      lastActive: new Date().toISOString()
    };
    db.progress.push(prog);
  }
  prog.totalAIUsage++;
  prog.lastActive = new Date().toISOString();

  const isFree = db.users.find((u) => u.id === userId)?.subscription !== "premium";
  
  // Create usage log
  const newLog = {
    id: "log-" + generateId(),
    userId,
    operationType: opType,
    createdAt: new Date().toISOString()
  };
  db.usageLogs.push(newLog);
  saveToDisk();

  return { totalUsage: prog.totalAIUsage, isLimitExceeded: isFree && prog.totalAIUsage > 15 };
};

// Check if user has exceeded free tier limit
const checkAIUsageAllowed = (userId: string): { allowed: boolean; usage: number } => {
  const user = db.users.find((u) => u.id === userId);
  if (!user) return { allowed: true, usage: 0 };
  if (user.subscription === "premium" || user.role === "admin") return { allowed: true, usage: 0 };

  const prog = db.progress.find((p) => p.userId === userId);
  const currentUsage = prog ? prog.totalAIUsage : 0;
  if (currentUsage >= 15) {
    return { allowed: false, usage: currentUsage };
  }
  return { allowed: true, usage: currentUsage };
};

// Find document in local DB or construct a fallback using body options for Supabase users
const findDocumentOrFallback = (id: string, body: any): { id: string; title: string; extractedText: string } | undefined => {
  const doc = db.documents.find((d) => d.id === id);
  if (doc) {
    return {
      id: doc.id,
      title: doc.title,
      extractedText: doc.extractedText
    };
  }
  // Try fallback from request body
  const title = body?.title || body?.documentTitle;
  const extractedText = body?.extractedText || body?.extracted_text || body?.text || body?.content;
  if (title && extractedText) {
    return {
      id,
      title,
      extractedText
    };
  }
  return undefined;
};

const getUserIdFromAuthHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader) return null;
  let token = authHeader;
  if (token.startsWith("Bearer ")) {
    token = token.slice(7);
  }
  token = token.trim();
  if (token === "null" || token === "undefined" || token === "") {
    return null;
  }
  return token;
};

// Auto-sync middleware to map Supabase authenticated users into local Express mock users DB
app.use((req, res, next) => {
  const rawId = getUserIdFromAuthHeader(req.headers.authorization);
  if (rawId) {
    // Check if user is already present in local db
    let user = db.users.find((u) => u.id === rawId);
    if (!user) {
      // Create user entry dynamically so local database operations succeed seamlessly
      user = {
        id: rawId,
        email: rawId.includes("@") ? rawId : `student-${rawId.slice(0, 8)}@studymate.demo`,
        name: "Student",
        role: "student",
        subscription: "free",
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      saveToDisk();
      console.log(`[local-db-sync] Dynamically registered unknown session user globally: ${rawId}`);
    }
  }
  next();
});

/* --- API ROUTES --- */

// 1. AUTH & ROLE MANAGEMENT
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  // Pure convenience logic: simple login matching prefix. Password is fake check.
  let user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    // If not exists, dynamically sign them up to keep simple login frictionless!
    const name = email.split("@")[0];
    const isTeacher = email.includes("admin") || email.includes("teacher");
    user = {
      id: "u-" + generateId(),
      email: email.toLowerCase(),
      name: name.charAt(0).toUpperCase() + name.slice(1),
      role: isTeacher ? "admin" : "student",
      subscription: "free",
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    saveToDisk();
  }

  res.json({ token: user.id, user });
});

app.post("/api/auth/signup", (req, res) => {
  const { email, name, role } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: "Email and Name are required" });
  }

  const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: "User already exists with this email" });
  }

  const normalizedRole = role === "admin" ? "admin" : "student";
  const user = {
    id: "u-" + generateId(),
    email: email.toLowerCase(),
    name,
    role: normalizedRole,
    subscription: "free",
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  saveToDisk();
  res.json({ token: user.id, user });
});

app.get("/api/auth/me", (req, res) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = db.users.find((u) => u.id === token);
  if (!user) {
    return res.status(401).json({ error: "Session expired" });
  }
  res.json(user);
});

app.post("/api/users/upgrade", (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const user = db.users.find((u) => u.id === token);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.role !== "admin") {
    return res.status(403).json({ error: "Access denied - Only administrators can modify subscription status" });
  }

  user.subscription = req.body.tier === "premium" ? "premium" : "free";
  saveToDisk();
  res.json({ success: true, user });
});

app.post("/api/users/upgrade-premium", (req, res) => {
  const userId = getUserIdFromAuthHeader(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: "Unauthorized user", details: "Please login again." });

  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "User not found", details: "Please register or login again." });

  user.subscription = "premium";
  saveToDisk();
  console.log(`[local-admin-sync] Upgraded local mock user subscription to premium for: ${user.id}`);
  res.json({ success: true, is_premium: true, user });
});

// 2. DOCUMENT UPLOADS & TEXT EXTRACTION
app.get("/api/documents", (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  // Student list shows only theirs, Admin sees all
  const user = db.users.find((u) => u.id === token);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (user.role === "admin") {
    res.json(db.documents);
  } else {
    res.json(db.documents.filter((d) => d.userId === token));
  }
});

app.post("/api/documents", (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { title, text, fileType, fileSize } = req.body;
  if (!title || !text) {
    return res.status(400).json({ error: "Document Title and content text are required" });
  }

  const newDoc = {
    id: "doc-" + generateId(),
    userId: token,
    title,
    extractedText: text,
    fileType: fileType || "txt",
    fileSize: fileSize || text.length,
    createdAt: new Date().toISOString()
  };

  db.documents.push(newDoc);
  saveToDisk();
  res.json(newDoc);
});

app.get("/api/documents/:id", (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const doc = db.documents.find((d) => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: "Document not found" });
  }

  // Ensure owned by user OR role is admin
  const user = db.users.find((u) => u.id === token);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (doc.userId !== token && user.role !== "admin") {
    return res.status(403).json({ error: "Permission denied to view this document" });
  }

  res.json(doc);
});

app.delete("/api/documents/:id", (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const docIndex = db.documents.findIndex((d) => d.id === req.params.id);
  if (docIndex === -1) return res.status(404).json({ error: "Document not found" });

  const user = db.users.find((u) => u.id === token);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const doc = db.documents[docIndex];
  if (doc.userId !== token && user.role !== "admin") {
    return res.status(403).json({ error: "Permission denied to delete this structure" });
  }

  // Delete document plus linked AI items
  db.documents.splice(docIndex, 1);
  db.summaries = db.summaries.filter((s) => s.documentId !== req.params.id);
  db.quizzes = db.quizzes.filter((q) => q.documentId !== req.params.id);
  db.flashcards = db.flashcards.filter((f) => f.documentId !== req.params.id);
  db.studyPlans = db.studyPlans.filter((p) => p.documentId !== req.params.id);
  db.reportedContent = db.reportedContent.filter((r) => r.documentId !== req.params.id);

  saveToDisk();
  res.json({ success: true, message: "Document deleted alongside its summaries, quizzes, flashcards and schedules." });
});

app.post("/api/documents/:id/report", (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const doc = db.documents.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const user = db.users.find((u) => u.id === token);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const newReport = {
    id: "report-" + generateId(),
    documentId: doc.id,
    documentTitle: doc.title,
    reporterEmail: user.email,
    reason: req.body.reason || "Inappropriate elements / errors in transcription",
    status: "pending" as const,
    createdAt: new Date().toISOString()
  };

  db.reportedContent.push(newReport);
  saveToDisk();
  res.json({ success: true, report: newReport });
});

// 3. AI SERVICES (SUMMARY, QUIZ, FLASHCARD, SCHEDULER, CHAT)

// AI Summary Generation
app.post("/api/documents/:id/generate-summary", async (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  // 1. Check free usage restrictions
  const usageCheck = checkAIUsageAllowed(token);
  if (!usageCheck.allowed) {
    return res.status(403).json({
      error: "AI usage limit reached for free tier (15 queries). Please upgrade to Premium in the top navigation!",
      limitReached: true
    });
  }

  const doc = findDocumentOrFallback(req.params.id, req.body);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  try {
    const isMock = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";

    let overview = "";
    let keyPoints: string[] = [];
    let summaryText = "";

    if (isMock) {
      // High fidelity smart fallback summary
      overview = `Comprehensive AI overview of '${doc.title}'. This document discusses the core components, structural characteristics, and relevant practical frameworks of the topic.`;
      keyPoints = [
        "Primary foundational thesis detailing standard definitions and historical origins.",
        "Crucial structural and procedural mechanics involved in executing this methodology.",
        "Key challenges, optimization strategies, and common pitfalls to guard against.",
        "Strategic real-world application workflows and implementation examples."
      ];
      summaryText = `### High-Level AI Core Review\n\nThis material introduces key concepts related to **${doc.title.split('.')[0]}**. It focuses on standard structures, secondary mechanisms, and optimal pathways. Students should focus efforts on structural constraints and memorizing vocabulary coordinates for interactive tests.`;
    } else {
      // CALL GEMINI
      const systemInstruction = `You are an expert study assistant. Generate a highly useful Study Summary JSON matching this exact typescript schema:
      {
        overview: string,
        keyPoints: string[],
        summaryText: string
      }
      Do not include any wrapping markup except raw JSON. Ensure summaryText uses elegant markdown formatting with bold terms.`;

      const prompt = `Analyze this education textbook text and output the summary structure:
      "${doc.extractedText.slice(0, 5000)}"`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overview: { type: Type.STRING, description: "One elegant paragraph summarizing the core material." },
              keyPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of 4-5 key concepts or facts."
              },
              summaryText: { type: Type.STRING, description: "A detailed review of 200 words with rich markdown layout." }
            },
            required: ["overview", "keyPoints", "summaryText"]
          }
        }
      });

      const text = response.text || "";
      const parsed = JSON.parse(text.trim());
      overview = parsed.overview || "";
      keyPoints = parsed.keyPoints || [];
      summaryText = parsed.summaryText || "";
    }

    // Save summary
    const newSummary = {
      id: "sum-" + generateId(),
      documentId: doc.id,
      overview,
      keyPoints,
      summaryText,
      createdAt: new Date().toISOString()
    };

    // Replace if exists
    db.summaries = db.summaries.filter(s => s.documentId !== doc.id);
    db.summaries.push(newSummary);

    logAIUsage(token, "summary");
    res.json(newSummary);
  } catch (error: any) {
    console.error("Gemini Summary generation failed: ", error);
    res.status(500).json({ error: "Failed to generate AI summary: " + error.message });
  }
});

// AI Quiz Generation
app.post("/api/documents/:id/generate-quiz", async (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const usageCheck = checkAIUsageAllowed(token);
  if (!usageCheck.allowed) {
    return res.status(403).json({
      error: "AI usage limit reached for free tier (15 queries). Please upgrade to Premium!",
      limitReached: true
    });
  }

  const doc = findDocumentOrFallback(req.params.id, req.body);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  try {
    const isMock = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";
    let questions: any[] = [];

    if (isMock) {
      questions = [
        {
          id: "q-" + generateId(),
          text: `Which core concept is central to the discussion in '${doc.title}'?`,
          options: [
            "Advanced numerical parallel processing frameworks",
            "The essential structured attributes and processes defined in the syllabus text",
            "Relational visual telemetry graphing systems",
            "Dynamic hardware cooling coordinates"
          ],
          correctAnswerIndex: 1,
          explanation: "In accordance with the presented text, focusing on essential structure and execution paths represents the main learning outcome."
        },
        {
          id: "q-" + generateId(),
          text: `What represents a primary challenge or limitation identified in the ${doc.title.split('.')[0]} document?`,
          options: [
            "Excessive rendering latency under massive multi-threaded loops",
            "Maintaining integrity, avoiding dependency cycles, and addressing structural complexity",
            "Compatibility with legacy 16-bit physical assembly platforms",
            "Over-heating of database engine cache tables"
          ],
          correctAnswerIndex: 1,
          explanation: "The text elaborates on rules and structural requirements, explicitly warning against broken dependency loops and incorrect rules mapping."
        },
        {
          id: "q-" + generateId(),
          text: `What is the recommended next step or main optimization mechanism outlined for students studying this matter?`,
          options: [
            "Migrate completely to cloud-based binary storage nodes",
            "Deconstruct larger functional modules into isolated individual entities",
            "Convert resources into raw vector coordinate structures",
            "Optimize graphic assets using external compressor engines"
          ],
          correctAnswerIndex: 1,
          explanation: "The outline advocates for modularity, cautioning against assembling everything as a single monolith and promoting smart separated structures."
        }
      ];
    } else {
      const systemInstruction = `You are a professional educational assessor. Generate 4 high-quality Multiple-Choice questions based strictly on the provided document text. 
      Output a clean JSON list matching this array format:
      [
        {
          "text": string,
          "options": string[], // must be exactly 4 choices
          "correctAnswerIndex": number, // integer 0 to 3
          "explanation": string // why it's correct
        }
      ]
      Do not include any prose outside the JSON.`;

      const prompt = `Create a rigorous quiz with 4 questions from study text:
      "${doc.extractedText.slice(0, 5000)}"`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: "Formidable multiple choice student question." },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Exactly 4 unique choices."
                },
                correctAnswerIndex: { type: Type.INTEGER, description: "Correct answer zero-based index (0-3)." },
                explanation: { type: Type.STRING, description: "Detailed explanation of why the choice is correct, citing text facts." }
              },
              required: ["text", "options", "correctAnswerIndex", "explanation"]
            }
          }
        }
      });

      const text = response.text || "";
      questions = JSON.parse(text.trim()).map((q: any) => ({
        ...q,
        id: "q-" + generateId()
      }));
    }

    const newQuiz = {
      id: "quiz-" + generateId(),
      documentId: doc.id,
      title: doc.title.replace(/\.[^/.]+$/, "") + " Practice Quiz",
      questions,
      createdAt: new Date().toISOString()
    };

    // Replace if exists
    db.quizzes = db.quizzes.filter(q => q.documentId !== doc.id);
    db.quizzes.push(newQuiz);

    logAIUsage(token, "quiz");
    res.json(newQuiz);
  } catch (error: any) {
    console.error("Gemini Quiz generation failed: ", error);
    res.status(500).json({ error: "Failed to generate AI quiz: " + error.message });
  }
});

// AI Flashcard Generation
app.post("/api/documents/:id/generate-flashcards", async (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const usageCheck = checkAIUsageAllowed(token);
  if (!usageCheck.allowed) {
    return res.status(403).json({
      error: "AI usage limit reached for free tier (15 queries). Please upgrade to Premium!",
      limitReached: true
    });
  }

  const doc = findDocumentOrFallback(req.params.id, req.body);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  try {
    const isMock = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";
    let cards: any[] = [];

    if (isMock) {
      cards = [
        {
          front: `What is the primary theme of ${doc.title.split('.')[0]}?`,
          back: `It reviews key terminology, technical specifications, and procedural instructions necessary for master-level topic understanding.`
        },
        {
          front: `Define structural modularity as elaborated in this document.`,
          back: `The rule of splitting a giant, complicated architecture down into self-contained files or chapters to make them robust and prevent token failures.`
        },
        {
          front: `Name one mistake students frequently commit when navigating these concepts.`,
          back: `Treating everything as one singular file, leading to overlapping configurations and missing functional contexts.`
        }
      ];
    } else {
      const systemInstruction = `You are a high-fidelity learning expert. Create 4 comprehensive flashcards for active recall study. 
      Output JSON list format exactly:
      [
        {
          "front": string, // Question or keyword
          "back": string // Precise definitions or answers
        }
      ]`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Create 4 high-retention flashcards from: "${doc.extractedText.slice(0, 4000)}"`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                front: { type: Type.STRING, description: "A high-retention prompt or core query." },
                back: { type: Type.STRING, description: "Clear, micro-explanation for prompt verification." }
              },
              required: ["front", "back"]
            }
          }
        }
      });

      const text = response.text || "";
      cards = JSON.parse(text.trim());
    }

    const newCards = cards.map((c) => ({
      id: "flash-" + generateId(),
      documentId: doc.id,
      front: c.front,
      back: c.back,
      isLearned: false,
      boxIndex: 0,
      createdAt: new Date().toISOString()
    }));

    // Append flashcards (remove existing for document first if requested, or just merge. Let's replace to keep it neat)
    db.flashcards = db.flashcards.filter((f) => f.documentId !== doc.id);
    db.flashcards.push(...newCards);

    logAIUsage(token, "flashcard");
    res.json(newCards);
  } catch (error: any) {
    console.error("Gemini Flashcard generation failed: ", error);
    res.status(500).json({ error: "Failed to generate AI flashcards: " + error.message });
  }
});

// AI Study Plan Generation
app.post("/api/documents/:id/generate-studyplan", async (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const usageCheck = checkAIUsageAllowed(token);
  if (!usageCheck.allowed) {
    return res.status(403).json({
      error: "AI usage limit reached for free tier (15 queries). Please upgrade to Premium!",
      limitReached: true
    });
  }

  const doc = findDocumentOrFallback(req.params.id, req.body);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  try {
    const isMock = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";
    let tasks: any[] = [];

    if (isMock) {
      tasks = [
        { title: "Terminology Bootcamp", description: "Establish semantic anchors by reviewing the main terms and writing simple definitions.", dayNumber: 1, isCompleted: false },
        { title: "Structural Analysis", description: "Deconstruct the document's core layout, tracking sub-structures and rules schemas.", dayNumber: 2, isCompleted: false },
        { title: "Interactive Quiz Verification", description: "Take the generated practice test and review wrong answers to solidify understanding.", dayNumber: 3, isCompleted: false }
      ];
    } else {
      const systemInstruction = `You are a learning coach. Map out a 3-Day structured daily Study Plan based on the text. 
      Output JSON matching this list format:
      [
        {
          "title": string,
          "description": string,
          "dayNumber": number // 1, 2, or 3
        }
      ]`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Create a 3-day step-by-step study schedule from: "${doc.extractedText.slice(0, 4500)}"`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                dayNumber: { type: Type.INTEGER }
              },
              required: ["title", "description", "dayNumber"]
            }
          }
        }
      });

      const text = response.text || "";
      tasks = JSON.parse(text.trim());
    }

    const newPlan = {
      id: "plan-" + generateId(),
      documentId: doc.id,
      title: `3-Day Master Plan: ${doc.title.replace(/\.[^/.]+$/, "")}`,
      durationDays: 3,
      tasks: tasks.map((t, index) => ({
        id: "task-" + generateId(),
        title: t.title,
        description: t.description,
        dayNumber: t.dayNumber || (index + 1),
        isCompleted: false
      })),
      createdAt: new Date().toISOString()
    };

    // Replace if exists
    db.studyPlans = db.studyPlans.filter(p => p.documentId !== doc.id);
    db.studyPlans.push(newPlan);

    logAIUsage(token, "studyplan");
    res.json(newPlan);
  } catch (error: any) {
    console.error("Gemini Study Plan generation failed: ", error);
    res.status(500).json({ error: "Failed to generate AI study plan: " + error.message });
  }
});

// Chat with Document Endpoint
app.post("/api/documents/:id/chat", async (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { message, chatHistory } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  const doc = findDocumentOrFallback(req.params.id, req.body);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  try {
    const isMock = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";
    let reply = "";

    if (isMock) {
      const lower = message.toLowerCase();
      if (lower.includes("hello") || lower.includes("hi")) {
        reply = `Hello! I am your study buddy for **${doc.title}**. What concept would you like me to clarify from your notes?`;
      } else if (lower.includes("summary") || lower.includes("summarize")) {
        reply = `The uploaded document focuses on foundational definitions, structural rules, and procedural metrics. Would you like me to break down specific key points into summaries?`;
      } else {
        reply = `That is a fantastic question regarding **${doc.title}**! Based on the uploaded notes, this aspect is a core concept. It provides critical context to understand the structural layout. Let me know if you would like me to generate a practice quiz about this to assess your grasp!`;
      }
    } else {
      // Chat session with system instruction embedding the document text!
      const systemInstruction = `You are StudyMate AI, a wise and friendly document-grounded tutor. Answer the student's question based strictly on this source text. If the answer cannot be confidently deduced from the source, explain that gently but provide general guidance.
      --- SOURCE STUDY MATERIAL ---
      ${doc.extractedText.slice(0, 8000)}
      --- END SOURCE ---
      Be encouraging, speak clearly, and structure your responses with markdown.`;

      // Translate chatHistory to contents list if applicable
      const contentsList: any[] = [];
      if (chatHistory && Array.isArray(chatHistory)) {
        chatHistory.slice(-6).forEach((item: any) => {
          contentsList.push({
            role: item.role === "user" ? "user" : "model",
            parts: [{ text: item.content }]
          });
        });
      }
      contentsList.push({
        role: "user",
        parts: [{ text: message }]
      });

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: contentsList,
        config: {
          systemInstruction,
          temperature: 0.7
        }
      });

      reply = response.text || "I was unable to structure a response. Please ask again.";
    }

    logAIUsage(token, "chat");
    res.json({ reply });
  } catch (error: any) {
    console.error("Gemini Chat failed: ", error);
    res.status(500).json({ error: "Failed to query Gemini: " + error.message });
  }
});

// 4. PROGRESS TRACKING APIs
app.get("/api/progress/me", (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  let prog = db.progress.find((p) => p.userId === token);
  if (!prog) {
    prog = {
      userId: token,
      quizzes: [],
      flashcardProgress: {},
      totalAIUsage: 0,
      lastActive: new Date().toISOString()
    };
    db.progress.push(prog);
    saveToDisk();
  }
  res.json(prog);
});

app.post("/api/progress/quiz/save", (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { quizId, title, score, maxScore, wrongQuestions } = req.body;
  if (!quizId) return res.status(400).json({ error: "quizId is required" });

  let userProg = db.progress.find((p) => p.userId === token);
  if (!userProg) {
    userProg = {
      userId: token,
      quizzes: [],
      flashcardProgress: {},
      totalAIUsage: 0,
      lastActive: new Date().toISOString()
    };
    db.progress.push(userProg);
  }

  const record = {
    quizId,
    title: title || "Practice Quiz",
    score: Number(score),
    maxScore: Number(maxScore),
    wrongQuestions: wrongQuestions || [],
    date: new Date().toISOString()
  };

  userProg.quizzes.push(record);
  userProg.lastActive = new Date().toISOString();
  saveToDisk();

  res.json({ success: true, progress: userProg });
});

// Update Flashcard Status
app.post("/api/progress/flashcard/review", (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { cardId, isLearned, easyIncrement } = req.body;
  if (!cardId) return res.status(400).json({ error: "cardId is required" });

  let userProg = db.progress.find((p) => p.userId === token);
  if (!userProg) {
    userProg = {
      userId: token,
      quizzes: [],
      flashcardProgress: {},
      totalAIUsage: 0,
      lastActive: new Date().toISOString()
    };
    db.progress.push(userProg);
  }

  const cardProgress = userProg.flashcardProgress[cardId] || {
    cardId,
    boxIndex: 0,
    lastReviewed: new Date().toISOString()
  };

  if (isLearned) {
    cardProgress.boxIndex = Math.min(cardProgress.boxIndex + 1, 4);
  } else {
    cardProgress.boxIndex = Math.max(cardProgress.boxIndex - 1, 0);
  }

  cardProgress.lastReviewed = new Date().toISOString();
  userProg.flashcardProgress[cardId] = cardProgress;
  userProg.lastActive = new Date().toISOString();

  // Find card in global flashcards to synchronize
  const globalCard = db.flashcards.find(f => f.id === cardId);
  if (globalCard) {
    globalCard.isLearned = cardProgress.boxIndex >= 3;
    globalCard.boxIndex = cardProgress.boxIndex;
  }

  saveToDisk();
  res.json({ success: true, cardProgress });
});

// Update Study Task completion Status
app.post("/api/studyplan/task/:taskId/toggle", (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  let found = false;
  for (const plan of db.studyPlans) {
    const task = plan.tasks.find((t) => t.id === req.params.taskId);
    if (task) {
      task.isCompleted = req.body.isCompleted ?? !task.isCompleted;
      found = true;
      break;
    }
  }

  if (!found) {
    return res.status(404).json({ error: "Task not found" });
  }

  saveToDisk();
  res.json({ success: true });
});

// Fetch complete materials for single document
app.get("/api/documents/:id/materials", (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const docId = req.params.id;
  const doc = db.documents.find((d) => d.id === docId);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const summary = db.summaries.find((s) => s.documentId === docId) || null;
  const quiz = db.quizzes.find((q) => q.documentId === docId) || null;
  const flashcards = db.flashcards.filter((f) => f.documentId === docId);
  const studyPlan = db.studyPlans.find((p) => p.documentId === docId) || null;

  res.json({
    document: doc,
    summary,
    quiz,
    flashcards,
    studyPlan
  });
});


// 5. ADMIN MANAGEMENT APIs
const checkIsAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized - missing authorization header" });

  const user = db.users.find((u) => u.id === token);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Permission Denied: Admin authorization required." });
  }
  next();
};

app.get("/api/admin/stats", checkIsAdmin, (req, res) => {
  // Aggregate stats
  const totalUsersIdx = db.users.length;
  const totalDocsIdx = db.documents.length;
  const premiumUsersIdx = db.users.filter((u) => u.subscription === "premium").length;
  const freeUsersIdx = totalUsersIdx - premiumUsersIdx;

  // Usage logs aggregated by operationType
  const operationStats = {
    summary: db.usageLogs.filter((l) => l.operationType === "summary").length,
    quiz: db.usageLogs.filter((l) => l.operationType === "quiz").length,
    flashcard: db.usageLogs.filter((l) => l.operationType === "flashcard").length,
    chat: db.usageLogs.filter((l) => l.operationType === "chat").length,
    studyplan: db.usageLogs.filter((l) => l.operationType === "studyplan").length
  };

  // Usage limits of free students
  const freeLimitsInfo = db.users
    .filter((u) => u.role === "student")
    .map((u) => {
      const prog = db.progress.find((p) => p.userId === u.id);
      return {
        name: u.name,
        email: u.email,
        usage: prog ? prog.totalAIUsage : 0,
        subscription: u.subscription
      };
    });

  res.json({
    totalUsers: totalUsersIdx,
    totalDocuments: totalDocsIdx,
    premiumUsersCount: premiumUsersIdx,
    freeUsersCount: freeUsersIdx,
    operationStats,
    freeUsageStats: freeLimitsInfo,
    reportsCount: db.reportedContent.filter((r) => r.status === "pending").length
  });
});

app.get("/api/admin/users", checkIsAdmin, (req, res) => {
  res.json(db.users);
});

app.post("/api/admin/users/:userId/role", checkIsAdmin, (req, res) => {
  const user = db.users.find((u) => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.role = req.body.role === "admin" ? "admin" : "student";
  saveToDisk();
  res.json({ success: true, user });
});

app.post("/api/admin/users/:userId/subscription", checkIsAdmin, (req, res) => {
  const user = db.users.find((u) => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.subscription = req.body.subscription === "premium" ? "premium" : "free";
  saveToDisk();
  res.json({ success: true, user });
});

// Admin reviews and manages reviews
app.get("/api/admin/reports", checkIsAdmin, (req, res) => {
  res.json(db.reportedContent);
});

app.post("/api/admin/reports/:reportId/resolve", checkIsAdmin, (req, res) => {
  const report = db.reportedContent.find((r) => r.id === req.params.reportId);
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (req.body.action === "deleteDoc") {
    // Delete target document entirely
    db.documents = db.documents.filter((d) => d.id !== report.documentId);
    db.summaries = db.summaries.filter((s) => s.documentId !== report.documentId);
    db.quizzes = db.quizzes.filter((q) => q.documentId !== report.documentId);
    db.flashcards = db.flashcards.filter((f) => f.documentId !== report.documentId);
    db.studyPlans = db.studyPlans.filter((p) => p.documentId !== report.documentId);
    // Mark report resolved
    report.status = "reviewed";
  } else {
    // Just dismiss the warning
    report.status = "reviewed";
  }

  saveToDisk();
  res.json({ success: true, reports: db.reportedContent });
});

/* --- VITE MIDDLEWARE SETUP --- */

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`StudyMate AI Full-Stack Server running on http://localhost:${PORT}`);
  });
}

startServer();
