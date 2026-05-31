# StudyMate AI

**StudyMate AI** is an AI-powered study companion web application that helps students learn faster and smarter by transforming uploaded study materials into summaries, quizzes, flashcards, study plans, and progress insights.

Users can upload TXT or PDF learning materials, and the system will use AI to generate structured learning resources automatically.

## Live Demo

Production URL:

```txt
https://study-mate-ai.vercel.app
```

## Main Idea

```txt
Upload study material
→ AI extracts and analyzes content
→ Generate summary, quiz, flashcards, and study plan
→ Student practices and tracks progress
```

## Features

### Authentication

* Sign up and sign in with Supabase Auth
* Supabase Active Mode for real accounts
* Sandbox Mode fallback for local testing

### Document Upload

* Upload TXT files
* Upload text-based PDF files
* Extract readable text from PDF using PDF.js
* Store uploaded files in Supabase Storage
* Save document metadata and extracted text in Supabase PostgreSQL

### AI Summary

* Generate structured AI summaries from uploaded documents
* Save summary data into Supabase
* Display overview, key points, and detailed study notes

### AI Quiz Generation

* Generate multiple-choice quizzes from document content
* Save quizzes and questions into Supabase
* Support answer checking, score calculation, and explanation display

### AI Flashcards

* Generate flashcards from uploaded materials
* Support front/back flashcard learning
* Track Got It / Still Learning responses
* Leitner box support for active recall

### Flashcard Progress Saving

* Show completion screen after reviewing all flashcards
* Display total cards, Got It count, Still Learning count, and mastery rate
* Save flashcard progress into Supabase

### AI Study Plan

* Generate a 7-day study plan from uploaded document content
* Display checklist tasks by day
* Allow users to mark tasks as completed
* Persist completed tasks in Supabase

### Dashboard Progress

* Show real uploaded documents
* Display learning progress from Supabase
* Show flashcard sessions, mastery rate, and recent study activity
* Display last studied document and upcoming tasks

## Tech Stack

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* Frosted Glass UI / Glassmorphism design

### Backend / BaaS

* Supabase Auth
* Supabase PostgreSQL
* Supabase Storage
* Supabase Row Level Security
* Supabase Edge Functions

### AI

* Gemini API
* AI calls are handled only inside Supabase Edge Functions
* Gemini API key is never exposed to the frontend

### Deployment

* Vercel
* Supabase Edge Functions

## Project Structure

```txt
StudyMateAI/
├── src/
│   ├── components/
│   │   ├── HomeView.tsx
│   │   ├── DashboardView.tsx
│   │   ├── DocumentDetailView.tsx
│   │   ├── QuizView.tsx
│   │   ├── FlashcardView.tsx
│   │   ├── AdminView.tsx
│   │   └── Navbar.tsx
│   ├── lib/
│   │   └── supabase.ts
│   ├── App.tsx
│   └── types.ts
│
├── supabase/
│   └── functions/
│       ├── generate-summary/
│       │   └── index.ts
│       ├── generate-quiz/
│       │   └── index.ts
│       ├── generate-flashcards/
│       │   └── index.ts
│       └── generate-studyplan/
│           └── index.ts
│
├── package.json
├── vite.config.ts
└── README.md
```

## Environment Variables

### Frontend Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

These variables are safe for frontend usage.

### Supabase Edge Function Secrets

These secrets must be configured in Supabase, not in Vercel frontend environment variables.

```bash
supabase secrets set GEMINI_API_KEY="your_google_ai_studio_api_key"
supabase secrets set GEMINI_MODEL="gemini-2.5-flash"
```

Do not expose `GEMINI_API_KEY` in the frontend.

## Supabase Database Tables

The project uses the following Supabase tables:

```txt
profiles
documents
summaries
quizzes
questions
flashcards
study_plans
user_progress
```

### documents

Stores uploaded study materials and extracted text.

```sql
create table public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  file_url text,
  file_path text,
  file_type text,
  file_size bigint,
  extracted_text text,
  created_at timestamptz default now()
);
```

### summaries

Stores AI-generated summaries.

```sql
create table public.summaries (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references public.documents(id) on delete cascade,
  overview text,
  key_points jsonb not null default '[]'::jsonb,
  summary_text text not null,
  created_at timestamptz default now()
);
```

### quizzes

Stores quiz metadata.

```sql
create table public.quizzes (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references public.documents(id) on delete cascade,
  title text not null,
  created_at timestamptz default now()
);
```

### questions

Stores multiple-choice quiz questions.

```sql
create table public.questions (
  id uuid default gen_random_uuid() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_answer char(1) not null,
  explanation text,
  created_at timestamptz default now()
);
```

### flashcards

Stores AI-generated flashcards.

```sql
create table public.flashcards (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references public.documents(id) on delete cascade,
  front text not null,
  back text not null,
  leitner_box int default 1,
  created_at timestamptz default now()
);
```

### study_plans

Stores AI-generated study plans.

```sql
create table public.study_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  title text not null,
  tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);
```

### user_progress

Stores quiz and flashcard learning progress.

```sql
create table public.user_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  activity_type text not null,
  total_items int not null default 0,
  correct_items int not null default 0,
  mastery_rate double precision not null default 0,
  score int not null default 0,
  max_score int not null default 0,
  completed_at timestamptz default now()
);
```

## Supabase Storage

Create a storage bucket:

```txt
study-documents
```

Recommended setting:

```txt
Private bucket
```

This bucket stores uploaded TXT and PDF study materials.

## Supabase Edge Functions

The project uses 4 Edge Functions:

```txt
generate-summary
generate-quiz
generate-flashcards
generate-studyplan
```

Deploy them using Supabase CLI:

```bash
supabase functions deploy generate-summary
supabase functions deploy generate-quiz
supabase functions deploy generate-flashcards
supabase functions deploy generate-studyplan
```

## Local Development

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Build production version:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Deployment

### Vercel Settings

Use these settings when deploying to Vercel:

```txt
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

### Vercel Environment Variables

Only add these frontend-safe variables:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Do not add `GEMINI_API_KEY` to Vercel.

## Production Test Flow

After deployment, test the full workflow:

```txt
1. Sign up / Login
2. Upload TXT or text-based PDF
3. Generate Summary
4. Generate Quiz
5. Complete Quiz
6. Generate Flashcards
7. Review Flashcards
8. Save Progress
9. Generate Study Plan
10. Tick study tasks
11. Refresh page and verify data persists
```

## Notes

* PDF extraction currently supports text-based PDFs.
* Scanned image-only PDFs may not work without OCR.
* Gemini API calls are handled securely through Supabase Edge Functions.
* Row Level Security should be enabled so users can only access their own data.
* Sandbox Mode is available for local fallback testing.

## Future Improvements

* Admin dashboard for managing users and documents
* OCR support for scanned PDFs
* AI usage limits for free users
* Export quizzes and flashcards to PDF or CSV
* Premium subscription plan
* Study streak and daily reminder system
* Collaborative study groups

## Author

Developed by **ITduow / StudyMate AI Team**.
