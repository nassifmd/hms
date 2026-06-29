# ASL Hospital Management System (HMS)

A full-stack web application for Ghanaian district hospitals, covering General OPD, Dental, Eye, Lab, Insurance, Pharmacy, Inventory, and more. Built with **GHS/DHIMS-2/IDSR** regulatory compliance and **NHIA claimsIT v3.4** billing integration.

For full system installation steps, including database setup, see [SETUP.md](SETUP.md).

## Repository Layout

```
HMS/
├── HMS_Backend/          # Node.js + Express REST API
│   ├── DB/               # Raw SQL migration files (run in order)
│   ├── src/
│   │   ├── app.js        # Entry point
│   │   ├── config/       # DB, Redis shim, logger, email, SMS, storage
│   │   ├── controllers/  # Route handlers
│   │   ├── middleware/   # Auth, RBAC, module access, audit, cache, validation
│   │   ├── models/       # Sequelize-style model helpers
│   │   ├── routes/v1/    # All API route definitions
│   │   ├── services/     # Business logic (backup, claims, email, NHIS…)
│   │   └── jobs/         # Cron jobs (reminders, backup, inventory alerts…)
│   └── uploads/          # Uploaded files (dental xrays, lab results, etc.)
├── HMS_Frontend/         # React 18 + TypeScript + Vite SPA
│   └── src/
│       ├── components/   # Layout, UI primitives (Button, DataTable, Modal…)
│       ├── contexts/     # AuthContext, ModulesContext
│       ├── lib/          # Axios API client, utilities
│       ├── pages/        # One folder per module
│       └── types/        # TypeScript interfaces
└── license_generator/    # Offline CLI tool — generate & verify license keys
```

## Features

### Core Modules
- **Patient Registration** — Ghana Card validation, temp ID generation, NHIS status tracking
- **OPD / Clinical** — Triage → Consultation → Diagnosis → Prescriptions → Investigations workflow
- **Appointments** — Scheduling and reminders
- **Pharmacy** — Formulary, dispensing (FEFO), stock management, GRN, alerts
- **Laboratory** — Test catalog, request tracking, result entry
- **Billing & Claims** — NHIA claimsIT JSON generation, claim validation, submission tracking
- **Insurance** — NHIS & private insurer management
- **Inventory** — Item catalogue, stock levels, purchase orders
- **Reports** — DHIMS-2 OPD/Admissions indicators, IDSR weekly surveillance, top diagnoses, revenue
- **Dashboard** — Real-time facility KPIs
- **Branches** — Multi-branch support
- **Admin** — User management, system configuration

### Licensed / Premium Modules
- **Dental Clinic** — Dental charts, procedures, treatment plans, dental formulary/tariffs
- **Eye Clinic** — Visual acuity (Snellen), IOP, slit-lamp findings, refraction, spectacle prescriptions
- **Lab** — Extended lab module features
- **Clinical** — Extended clinical features
- **Insurance** — Advanced insurance workflows

### System Features
- JWT authentication with refresh tokens & account lockout
- Role-Based Access Control
- Database-driven module subscriptions (`module_subscriptions` table) with in-memory cache
- Real-time updates via Socket.io
- Comprehensive audit logging
- Background jobs (appointment reminders, data backup, inventory alerts, report generation)
- PDF export (PDFKit), Excel export (ExcelJS), CSV export
- File uploads with Sharp image processing

## Prerequisites

- **Node.js** 18+
- **PostgreSQL** 14+
- **pnpm** (or npm/yarn)

> No external Redis required — the backend includes a built-in in-memory Redis shim.

## Quick Start

### 1. Install Dependencies

```bash
# Backend
cd HMS_Backend
cp .env.example .env
pnpm install   # or: npm install

# Frontend
cd ../HMS_Frontend
pnpm install
```

### 2. Configure Environment

Edit `HMS_Backend/.env` (key variables):

```env
NODE_ENV=development
PORT=5000

# Database (individual fields — not a URL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hospital_management
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d

# Facility
FACILITY_CODE=GH-123-456
FACILITY_NAME=Koforidua District Hospital
FACILITY_REGION=Eastern
FACILITY_DISTRICT=New Juaben South
FACILITY_ID=your_facility_uuid_here

# CORS
CORS_ORIGIN=http://localhost:5173
```

See `HMS_Backend/.env.example` for the full list.

### 3. Database Setup

Run the SQL migration files in `HMS_Backend/DB/` **in order** against your PostgreSQL database:

```bash
psql -U postgres -d hospital_management -f DB/01_create_database.sql
psql -U postgres -d hospital_management -f DB/02_create_tables.sql
psql -U postgres -d hospital_management -f DB/03_insert_standard_values.sql
# apply any additional migration files as needed
```

### 4. Start Development Servers

```bash
# Terminal 1 — Backend API (port 5000)
cd HMS_Backend
pnpm dev          # or: npm run dev

# Terminal 2 — Frontend (port 5173)
cd HMS_Frontend
pnpm dev
```

### 5. Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API base | http://localhost:3000/api/v1 |
| API docs (JSON) | http://localhost:3000/api/v1/docs |
| Swagger UI | http://localhost:3000/api-docs |

> **Note**: The default backend port is `3000`. If port 3000 is in use, set `PORT` in `.env`. Port `5000` is commonly reserved by macOS AirPlay — if the backend fails to start on 5000, change it in `.env`.

### Default Login Credentials

Login uses **email address**, not employee ID. All seeded users share the same password.

| Email | Role | Password |
|---|---|---|
| `superadmin@hospital.local` | Super Administrator | `Admin@HMS2026!` |
| `sysadmin@hospital.local` | System Administrator | `Admin@HMS2026!` |
| `doctor@hospital.local` | Doctor | `Admin@HMS2026!` |
| `nurse@hospital.local` | Nurse / Triage | `Admin@HMS2026!` |
| `pharmacist@hospital.local` | Pharmacist | `Admin@HMS2026!` |
| `lab@hospital.local` | Lab Technician | `Admin@HMS2026!` |
| `records@hospital.local` | Records Officer | `Admin@HMS2026!` |
| `billing@hospital.local` | Accounts / Billing | `Admin@HMS2026!` |
| `dentist@hospital.local` | Dentist | `Admin@HMS2026!` |
| `optometrist@hospital.local` | Optometrist | `Admin@HMS2026!` |

See `HMS_Backend/DB/03_insert_standard_values.sql` for the full list.

## API Endpoints

All routes are prefixed with `/api/v1`.

| Route | Description |
|-------|-------------|
| `/auth` | Login, refresh tokens, logout |
| `/users` | User management |
| `/patients` | Patient CRUD & search |
| `/appointments` | Appointment scheduling |
| `/clinical` | OPD visits, triage, consultations, diagnoses, prescriptions |
| `/dental` | Dental charts, procedures, treatment plans |
| `/eye` | Eye examinations, spectacle Rx, procedures |
| `/pharmacy` | Formulary, dispensing, stock, GRN, alerts |
| `/lab` | Lab test catalog, requests, results |
| `/billing` | Claims, tariffs, claimsIT submission |
| `/insurance` | Insurer management, NHIS |
| `/inventory` | Items, stock, purchase orders |
| `/reports` | DHIMS-2, IDSR, revenue, diagnoses |
| `/dashboard` | Facility KPIs |
| `/branches` | Branch management |
| `/admin` | System admin actions |
| `/modules` | Module subscription status |

## Module Licensing

Module access is stored in the `module_subscriptions` database table and checked at the API middleware level. The frontend reads active modules via the `ModulesContext` and hides unlicensed sections automatically.

### Generating a License Key

Use the included CLI tool:

```bash
cd license_generator
npm install
export LICENSE_SECRET=<same-secret-as-backend>
node index.js generate
```

The wizard will prompt for module, facility UUID, duration, and an optional custom ID. The resulting key is then activated through the Admin panel or inserted directly into `module_subscriptions`.

See [`license_generator/README.md`](license_generator/README.md) for full details.

## Tech Stack

### Backend
- **Runtime**: Node.js 18+ with Express 4
- **Language**: JavaScript (CommonJS)
- **Database**: PostgreSQL 14+ via `pg` (node-postgres), raw SQL
- **Caching**: In-memory Redis shim (no external Redis required)
- **Auth**: JWT (`jsonwebtoken`), `bcrypt`, RBAC middleware
- **Validation**: `express-validator`, `joi`
- **File uploads**: `multer` + `sharp`
- **PDF / Excel**: `pdfkit`, `exceljs`, `csv-writer`
- **Real-time**: `socket.io`
- **Jobs**: `bull`, `node-cron`
- **Logging**: `winston` + `winston-daily-rotate-file`
- **Security**: `helmet`, CORS, rate limiting (`express-rate-limit`), compression

### Frontend
- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS
- **Server state**: React Query (`@tanstack/react-query`)
- **Forms**: React Hook Form
- **HTTP**: Axios
- **Icons**: Lucide React
- **Charts**: Recharts

## Ghana-Specific Compliance

- **Ghana Card** validation (GHA-XXXXXXXXX-X format)
- **NHIS** membership verification & status tracking
- **claimsIT v3.4** JSON structure for NHIA claims submission
- **DHIMS-2** indicators (OPD attendance, admissions, maternal, child health)
- **IDSR** weekly surveillance auto-detection for notifiable diseases
- All **16 Ghana regions** and districts

## Production Deployment

```bash
# Backend
cd HMS_Backend
pnpm install --prod
NODE_ENV=production node src/app.js
# or with PM2:
pm2 start ecosystem.config.js

# Frontend
cd HMS_Frontend
pnpm build
# Serve the dist/ folder with nginx or any static host
```

### Critical Production Environment Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Set to `production` |
| `DB_HOST` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | PostgreSQL connection |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Strong random strings (32+ chars) |
| `FACILITY_ID` | UUID of the facility row in the database |
| `CORS_ORIGIN` | Frontend domain (e.g. `https://hms.yourhospital.gov.gh`) |

## License

Proprietary — Ghana Health Service
