# HMS System Setup Guide

This guide explains how to set up the full Hospital Management System locally, including the PostgreSQL database, backend API, frontend app, and the offline license generator.

## 1. Prerequisites

Install the following before starting:

- Node.js 18 or newer
- pnpm or npm
- PostgreSQL 14 or newer
- A PostgreSQL client such as `psql`

Optional but recommended:

- VS Code
- MAMP or another local development stack if you prefer to host the project under Apache/Nginx

## 2. Project Structure

The workspace contains three main applications:

- `HMS_Backend` - Node.js + Express REST API
- `HMS_Frontend` - React + TypeScript + Vite frontend
- `license_generator` - Offline Node.js CLI for module license keys

## 3. Database Setup

The HMS backend uses PostgreSQL and raw SQL files stored in `HMS_Backend/DB/`.

### 3.1 Create the database

Create a PostgreSQL database for HMS:

```sql
CREATE DATABASE hospital_management;
```

Then connect to it:

```bash
psql -U postgres -d hospital_management
```

### 3.2 Run the schema files in order

Execute the SQL files in this order:

```bash
psql -U postgres -d hospital_management -f HMS_Backend/DB/01_create_database.sql
psql -U postgres -d hospital_management -f HMS_Backend/DB/02_create_tables.sql
psql -U postgres -d hospital_management -f HMS_Backend/DB/03_insert_standard_values.sql
```

If the installation already exists, also apply the migration files in sequence:

```bash
psql -U postgres -d hospital_management -f HMS_Backend/DB/04_rename_tables.sql
psql -U postgres -d hospital_management -f HMS_Backend/DB/05_update_tables.sql
psql -U postgres -d hospital_management -f HMS_Backend/DB/06_delete_old_tables.sql
psql -U postgres -d hospital_management -f HMS_Backend/DB/07_create_dental_bpe.sql
psql -U postgres -d hospital_management -f HMS_Backend/DB/08_inventory_stock_location.sql
```

### 3.3 What the database files do

- `01_create_database.sql` creates PostgreSQL extensions, enum types, and trigger functions.
- `02_create_tables.sql` creates the full application schema, indexes, and triggers.
- `03_insert_standard_values.sql` seeds default roles, permissions, facility data, and system users.
- `04_rename_tables.sql` and `06_delete_old_tables.sql` are used only when migrating older databases.
- `05_update_tables.sql` contains idempotent ALTER TABLE migrations.
- `07_create_dental_bpe.sql` adds the dental BPE examination table.
- `08_inventory_stock_location.sql` adds inventory stock-location support and transfer tracking.

### 3.4 Database configuration

The backend reads its database settings from `HMS_Backend/.env`.

Use values similar to these:

```env
NODE_ENV=development
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=hospital_management
DB_USER=postgres
DB_PASSWORD=your_password
```

If you are using the Prisma schema at `HMS_Backend/prisma/schema.prisma`, set a PostgreSQL connection URL as well:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/hospital_management?schema=public
```

## 4. Backend Setup

### 4.1 Install dependencies

```bash
cd HMS_Backend
cp .env.example .env
pnpm install
```

If you prefer npm:

```bash
cd HMS_Backend
npm install
```

### 4.2 Configure environment variables

Update `HMS_Backend/.env` with your database credentials and application secrets.

Key values to review:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `CORS_ORIGIN`
- Facility defaults such as `FACILITY_CODE` and `FACILITY_NAME`
- SMS/email credentials if you plan to use those integrations

### 4.3 Start the backend

```bash
pnpm dev
```

The backend typically runs on `http://localhost:5000`.

## 5. Frontend Setup

### 5.1 Install dependencies

```bash
cd HMS_Frontend
pnpm install
```

If you prefer npm:

```bash
cd HMS_Frontend
npm install
```

### 5.2 Configure the frontend API base URL

Check the frontend environment files if present and ensure the API points to the backend server.

Typical local values are:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

### 5.3 Start the frontend

```bash
pnpm dev
```

The frontend usually runs on `http://localhost:5173`.

## 6. License Generator Setup

The license generator is a standalone CLI used to generate and verify HMS module license keys.

### 6.1 Install dependencies

```bash
cd license_generator
pnpm install
```

Or with npm:

```bash
cd license_generator
npm install
```

### 6.2 Configure the signing secret

Set the same secret in both the backend and the license generator:

```bash
export LICENSE_SECRET=your-shared-secret
```

### 6.3 Run the CLI

Generate a key:

```bash
node index.js generate
```

Verify a key:

```bash
node index.js verify <license-key>
```

## 7. Default Login Data

After seeding the database, the project includes standard system users such as admin, doctor, nurse, pharmacist, lab, billing, dental, and eye users.

Login uses **email address** (not employee ID). All seeded users share the password `Admin@HMS2026!`.

| Email | Role |
|---|---|
| `superadmin@hospital.local` | Super Administrator |
| `sysadmin@hospital.local` | System Administrator |
| `doctor@hospital.local` | Doctor |
| `nurse@hospital.local` | Nurse / Triage |
| `pharmacist@hospital.local` | Pharmacist |
| `lab@hospital.local` | Lab Technician |
| `records@hospital.local` | Records Officer |
| `billing@hospital.local` | Accounts / Billing |
| `dentist@hospital.local` | Dentist |
| `optometrist@hospital.local` | Optometrist |

See `HMS_Backend/DB/03_insert_standard_values.sql` for the full list of seeded data and role mappings.

## 8. Suggested Startup Order

Start the system in this order:

1. PostgreSQL server
2. Run the database SQL files
3. Start `HMS_Backend`
4. Start `HMS_Frontend`
5. Run `license_generator` only when you need to issue or verify module licenses

## 9. Verification Checklist

Before handing the system to users, confirm the following:

- The database was created successfully and all seed data loaded
- The backend connects to PostgreSQL without errors
- The frontend can reach the backend API
- Authentication works with the seeded accounts
- The active module list reflects the contents of `module_subscriptions`
- The license generator can sign and verify a sample module key

## 10. Notes

- The backend currently uses raw SQL and `pg` rather than Prisma at runtime.
- The file `HMS_Backend/prisma/schema.prisma` is provided as a structured schema reference for future ORM use and tooling.
- If you are upgrading an existing installation, re-run the idempotent SQL files first, then apply any remaining migration scripts.
