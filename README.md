# GrowEasy CRM Importer — AI-Powered CSV Data Mapper

GrowEasy CRM Importer is a production-grade monorepo application designed to allow users to upload arbitrary CSV lead-exports (Facebook Lead Ads, Google Ads, real-estate spreadsheets, etc.) and automatically map the fields to a strict CRM database schema using LLM parsing. 

This project utilizes Next.js for the frontend, Node.js + Express for the backend, and a shared TypeScript package for schema contracts.

## 🚀 Architecture Diagram & Details

```
+------------------+             +-----------------------+
|  apps/web        |             |  apps/server          |
|  (Next.js App)   |             |  (Node.js + Express)  |
|                  |             |                       |
|  - CsvParser     |             |  - Rate Limiter       |
|  - Table Preview |             |  - Parse Controller   |
|  - SSE Listener  +------------>+  - Extract Controller |
|  - Results view  | (POST &     |  - CsvService         |
|                  |  SSE Stream)|  - JobService (Batches|
+--------+---------+             |    & Concurrency cap) |
         |                       |  - AiService          |
         |                       +-----------+-----------+
         |                                   |
         v                                   v
+--------+-----------------------------------+-----------+
|               packages/shared (Zod schemas)            |
+--------------------------------------------------------+
```

### Flow description:
1. **Upload**: User uploads a `.csv` file. It is validated and parsed on the client side using `papaparse`.
2. **Preview**: User views a responsive table displaying all records.
3. **Confirm & Import**: Client POSTs rows to the backend. The backend issues a unique `jobId` and runs batch mapping in the background.
4. **SSE Progress Stream**: The client opens an EventSource connection to stream progress (`"Processing batch 3 of 7..."`).
5. **LLM Extraction**: The backend chunks rows into batches (size 25), processes with a concurrency cap of 3 using `p-limit`, and queries Google Gemini.
6. **Result View**: Successful mappings are shown in one table and skipped entries (e.g. no phone or email) in another.

---

## 🛠️ Setup Instructions

### Prerequisites
- Node.js (v20+)
- pnpm (v10+)
- A Gemini API Key (`GEMINI_API_KEY`)

### Env Variables

Create `.env` file in `apps/server/`:
```env
PORT=4000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
BATCH_SIZE=25
CONCURRENCY=3
```

Create `.env` or `.env.local` in `apps/web/`:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

### Installation

Install workspace dependencies and link modules:
```bash
pnpm install
```

Build the packages:
```bash
pnpm build
```

Run in development mode:
```bash
pnpm dev
```
The frontend will start on [http://localhost:3000](http://localhost:3000) and backend on [http://localhost:4000](http://localhost:4000).

---

## 🧪 Testing

Run vitest unit tests across workspace projects:
```bash
pnpm test
```

## 🐳 Docker Deployment

Run the entire monorepo locally with docker-compose:
```bash
# Set your API Key in your host environment or docker-compose.yml first
docker-compose up --build
```
This spawns:
- Backend: [http://localhost:4000](http://localhost:4000)
- Frontend: [http://localhost:3000](http://localhost:3000)

## 📋 Folder Structure

- `/packages/shared` - Common TypeScript types & Zod verification schemas.
- `/apps/server` - Node.js Express server backend with Claude AI processing layer.
- `/apps/web` - React / Next.js web application frontend.
- `/samples` - Ready-made test CSV templates for quick imports.

---

**Position Applied For:** Full-Time Senior Full-Stack Engineer / Intern
