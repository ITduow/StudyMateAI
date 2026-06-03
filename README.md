# StudyMate AI — Project Documentation & Engineering Ledger

StudyMate AI is a highly immersive, production-ready, full-stack textbook companion and educational booster. Built with a responsive **Frosted Glass UI** using React, Vite, and Tailwind CSS, and backed by a robust, multi-tenant Supabase database and Edge Functions runtime, this application streamlines scanned document digestion, lightning-fast quiz gen, flashcard spaced-repetition, automated study roadmaps, and instant premium tier access via real VietQR/payOS checkout webhooks.

---

## 1. Feature Checklist

### 🔓 Authentication & Multi-Tenancy
- [x] **Supabase Auth Integration**: Full sign-up, session preservation, secure sign-in, and instant logout.
- [x] **Multi-Tenant Partitioning**: User datasets, uploaded textbooks, generated items (quizzes, flashcards, study plans), and custom notes remain isolated via secure Row Level Security (RLS) policies.

### 📂 Intelligent Ingestion Engine
- [x] **High-Contrast Drag & Drop**: Visual file uploader capable of accepting raw standard text (`.txt`) and PDF files (`.pdf`).
- [x] **Client-Side/Server-Side Extraction**: Advanced textual PDF stream processing and optical character recognition (OCR) fallbacks for scanned images or non-selectable graphical documents.

### 🧠 Generative AI Study Suite
- [x] **Automated Summaries**: Advanced text summaries outlining primary concepts, core terminology, and learning outcomes in dynamic layouts.
- [x] **AI Quizzes**: Multiple-choice exams tailored incrementally based on the length, target language, and complexity of ingested textbook chapters.
- [x] **AI Flashcards**: Single-term prompt-and-flip virtual cards featuring active study logging and performance tracking.
- [x] **AI Study Plans**: Fully structured learning roadmaps organized systematically with progress trackers.

### 💳 Tier Gates & VietQR / payOS Payments
- [x] **Tier Entitlements Guard**: Standard accounts are subject to structured daily AI execution limits.
- [x] **Instant Real-Time Upgrades**: Interactive purchase system leveraging custom Vietnamese Bank QR Codes (VietQR) powered by the official high-availability payOS SDK.
- [x] **Direct Hook Callbacks**: Fully functional Edge Function endpoint `/upgrade-premium` mapping incoming webhooks to instantly transition `profiles.is_premium` records to `true`.

### 🛡️ Admin Suite & Revenue Ledgers
- [x] **Live Administrative Panel**: Isolated administrator console featuring platform metrics, content queues, and active student databases.
- [x] **Payment Orders Ledger**: Secure tracking of each generated transaction code, customer email address, requested amount, provider data, and explicit execution outcomes (`PAID`, `PENDING`, `CANCELLED`).
- [x] **Revenue Metrics Dash**: Live tracking of overall gross revenue in Vietnamese Dong (VND), and absolute metrics of successful versus initiated checkouts.

---

## 2. Technical Stack

| Category | Technology | Purpose & Integration Model |
| :--- | :--- | :--- |
| **Frontend UI** | React 18 & Vite | Extreme Hot-Module replacement speed, modular tree-shaking, and state isolation. |
| **Styling** | Tailwind CSS | Utility-first micro-styling backing a beautiful semi-transparent **Frosted Glass** aesthetic with high readability. |
| **Motion** | `motion/react` | High-accuracy spring-physics layout transitions, menu sliding, and flashcard flip states. |
| **Database** | PostgreSQL + Supabase | Native row lock policies, triggers, and managed high-performance schema. |
| **API Runtime** | Supabase Edge Functions | Deno-backed edge runtime with auto-scaled routing, CORS headers natively attached. |
| **AI Processing** | OpenAI & Gemini API | Core logical parsing engines backing content summarization, dynamic plan structuring, and flashcard generation. |
| **Payment Gateway**| VietQR / payOS | Official payment orchestration API for direct VN banking transfers with zero transaction overhead. |
| **Charts** | Recharts | Fluent, lightweight canvas rendering for admin platform telemetry. |

---

## 3. Database Schema Blueprint

```sql
-- 1. PROFILE TABLE: System Accounts & Tiers
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  is_premium boolean default false not null,
  daily_ai_usage int default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for Profiles
alter table public.profiles enable row level security;

create policy "Users can view their own profiles."
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can view all profiles."
  on public.profiles for select
  using (exists (select 1 from public.profiles where id = auth.uid() and email = 'duongroberto528@gmail.com'));

-- 2. TEXTBOOKS / DOCUMENTS TABLE
create table public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. PAYMENT ORDERS TABLE
create table public.payment_orders (
  id uuid default gen_random_uuid() primary key,
  order_code bigint unique not null,
  user_id uuid references public.profiles(id) on delete set null,
  amount numeric not null,
  currency text default 'VND' not null,
  provider text default 'payOS' not null,
  status text default 'PENDING' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  paid_at timestamp with time zone
);

alter table public.payment_orders enable row level security;

create policy "Users can check their own payment orders."
  on public.payment_orders for select
  using (auth.uid() = user_id);

create policy "Admins have unrestricted ledger read approvals."
  on public.payment_orders for select
  using (exists (select 1 from public.profiles where id = auth.uid() and email = 'duongroberto528@gmail.com'));
```

---

## 4. Supabase Edge Functions Architecture

StudyMate AI registers five modular server-side Edge endpoints matching the Deno server layout:

1. **`generate-summary`**: Consumes chunked text vectors to produce comprehensive abstracts, syntax blocks, and terminology listings.
2. **`generate-quiz`**: Isolates chapters mapping selected difficulty levels (`easy`, `medium`, `hard`) to output standard JSON structures formatted with choices, questions, and accurate keys.
3. **`generate-studyplan`**: Analyzes calendar spans to build target milestones.
4. **`generate-flashcards`**: Maps conceptual nodes into brief question/answer cards.
5. **`upgrade-premium` (Webhook Interface)**: High-security webhook that listens to payloads originating from VietQR / payOS servers. It validates signatures, locates the corresponding `payment_orders` by `orderCode`, and executes atomic PostgreSQL mutations updating `profiles.is_premium = true`.

---

## 5. End-to-End Payment Flow & Webhook Security

The diagram below outlines how checking out guarantees safe tier upgrades with absolute transactional integrity:

```
[Student Node] === 1. Request Premium Upgrade ==> [StudyMate Client]
                                                          ||
                                              2. Request Payment Checkout Link
                                                          ||
                                                          \/
[VietQR / payOS Code] <=== 3. Respond Link ======= [Edge: create-payos-payment]
       ||
  4. Client Scan 
  & Transfer Done
       ||
       \/
[payOS Hook Core] === 5. Direct Webhook Event (Signed) ===> [Edge: upgrade-premium]
                                                                  ||
                                                      6. Validate Checksum & Signatures
                                                      7. Update public.payment_orders
                                                      8. Mutate public.profiles.is_premium
                                                                  ||
                                                                  \/
[Student Premium Screen] <======= 9. Real-time Subscription Sync === [Success Screen]
```

---

## 6. Known Limitations

- **Browser-Level Environment Configuration**: If the `SITE_URL` secret is missing in the Supabase Edge Function context, payment links default to a safety fallback, alerting local workspace administrators to define `SITE_URL` during runtime.
- **Client-Side Processing Thresholds**: High-resolution scanned multi-page graphical textbooks exceeding 25MB might experience minor processing delays depending on local network upload speeds for client-side OCR extraction.
- **Multi-lingual Translation Anchoring**: While English and Vietnamese processing is deeply reinforced, highly specialized technical formats (such as complex chemical diagrams or raw binary assembly lists) inside books require standard text format sanitization before uploading.

---

## 7. Future Horizon Upgrades

- **Multiplayer Challenge Arenas**: Integration of peer-to-peer real-time review quizzes using WebSockets, allowing students in the same study plan to challenge each other in live interactive sessions.
- **Voice Study Buddies**: Introducing realistic Text-to-Speech (TTS) capabilities based on Gemini 2.5 flash audio streams, allowing students to listen to summaries and flashcards during active commutes.
- **Anki Deck Formatted Exports**: Enable quick file downloads in standard `.apkg` formats, allowing rapid syncs to personal external mobile applications.
- **Automated Grade Calculators**: Syncing school progress tracks and score weights to project dynamic target milestones based on active examination performance.

---

## 8. Presentation Demo Script (Presenter's Guide)

*Use this step-by-step master checklist to drive an impactful, polished 3-minute executive demo of StudyMate AI.*

### 🎭 Setup & Introductory Pitch (Duration: 30 Seconds)
1. **The Hook**: "Welcome to StudyMate AI, the elite interactive Textbook companion that helps students turn long, complex textbooks into rich, summarized study hubs instantly."
2. **First Look**: Show the clean, polished **Frosted Glass UI** on the main dashboard. Mention the lightweight layout grid.

### 📁 Step 1: Textbook Ingestion & OCR Processing (Duration: 45 Seconds)
1. Drag a multi-page lecture PDF or textbook chapter into the high-contrast upload zone.
2. Point out the instantaneous client-side stream digestion. Emphasize that formatting and structured code syntax tables remain completely intact.
3. Show the dynamic summary panel updating in real-time, displaying highlighted terms and instant summary blocks.

### ⚡ Step 2: The Interactive Study Suite (Duration: 45 Seconds)
1. **Interactive Quizzes**: Generate a new custom assessment. Toggle a few incorrect options, submit, and display the detailed color-coded feedback and scoring keys.
2. **Spaced-Repetition Flashcards**: Transition to the Flashcard dashboard. Keep the audience engaged by interactive flipping (space-deck mechanics) and mark terms as mastered or skipped to track real-time study progress.
3. **Structured Study Roadmaps**: Click the study planner to reveal an automatically calculated day-by-day learning layout personalized to the user's upcoming exams.

### 💎 Step 3: Upgrading to Premium with VietQR/payOS (Duration: 30 Seconds)
1. Click the "Upgrade to Premium" button inside the user settings or top navigation bar.
2. Showcase the payOS checkout page generating a customized **VietQR Code**, demonstrating a direct transaction pipeline to standard Vietnamese Banking apps.
3. **The Webhook Magic**: Explain that once paid, the payOS webhook instantly fires, validating digital signatures securely to upgrade the user profile status without requiring page reloads or token expirations.

### 👑 Step 4: Admin Telemetry & Payments Ledger (Duration: 30 Seconds)
1. Log in with admin credentials (`duongroberto528@gmail.com`) to view the administrative control portal.
2. Guide the audience through the brand new **Payment Orders Ledger** tab. Highlight the key administrative metrics:
   - **Total Payment Orders**: Quick visual audits of total invoices generated.
   - **Total Paid Orders**: Tracking conversion rate of premium upgrades.
   - **Total Revenue**: Live calculation showing cumulative gross VND transaction amounts.
3. Review the secure database table layout below, proving audit logs of every payment lifecycle status (`PAID`, `PENDING`, `CANCELLED`).
4. Conclude the presentation: "StudyMate AI represents a powerful, secure, and cohesive educational ecosystem built with uncompromising architectural integrity."

---
