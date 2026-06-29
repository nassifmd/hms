# HMS License Generator

An offline CLI tool for generating and verifying HMS module activation keys. Keys are signed with HMAC-SHA256 and encode the module, facility, and expiry directly in the key string — no database required.

---

## Requirements

- Node.js >= 18
- The `LICENSE_SECRET` environment variable set to the same signing secret configured in the HMS backend

---

## Installation

```bash
cd HMS/license_generator
npm install   # or: pnpm install
```

You can also link it globally to use the `hms-license` command from anywhere:

```bash
npm link
```

---

## Configuration

The tool requires one environment variable:

| Variable         | Description                                                      |
|------------------|------------------------------------------------------------------|
| `LICENSE_SECRET` | Shared signing secret — must match `LICENSE_SECRET` in the backend |

Set it for your session:

```bash
export LICENSE_SECRET=your-secret-here
```

> **Keep the secret safe.** Anyone with this value can generate valid license keys.

---

## Usage

### Generate a license key

```bash
node index.js generate
# or, if linked globally:
hms-license generate
```

The wizard will prompt for:

| Prompt | Description |
|--------|-------------|
| **Module code** | One of: `CLINICAL`, `DENTAL`, `EYE`, `LAB`, `INSURANCE` |
| **Facility UUID** | The UUID of the facility to lock the key to, or leave blank for a wildcard (`*`) key that works on any facility |
| **Duration in months** | How long the license is valid (e.g. `12` for one year) |
| **Custom license ID** | An optional short identifier; auto-generated if left blank |

**Example session:**

```
HMS License Generator
────────────────────────────────────────
Available modules: CLINICAL, DENTAL, EYE, LAB, INSURANCE

Module code (e.g. DENTAL): DENTAL
Facility UUID  (leave blank for wildcard *): 3f6a1b22-...
Duration in months (e.g. 12): 12
Custom license ID (leave blank to auto-generate):

========================================================================
  LICENSE KEY
========================================================================
  HMS-DENTAL-eyJsaWQiOiJhMWIyYzNkNCIsImZpZCI6IjNmNmExYjIy...
========================================================================
  Module     : DENTAL
  License ID : a1b2c3d4
  Facility   : 3f6a1b22-...
  Issued     : 2026-03-14T00:00:00.000Z
  Expires    : 2027-03-14T00:00:00.000Z
========================================================================
```

---

### Verify a license key

Pass the key directly as an argument:

```bash
node index.js verify HMS-DENTAL-eyJsaWQi...
```

Or run without an argument to be prompted interactively:

```bash
node index.js verify
# Paste license key: <paste here>
```

A valid key prints its decoded payload:

```
========================================================================
  VALID LICENSE KEY
========================================================================
  Module     : DENTAL
  License ID : a1b2c3d4
  Facility   : 3f6a1b22-...
  Issued     : 2026-03-14T00:00:00.000Z
  Expires    : 2027-03-14T00:00:00.000Z
  Days left  : 365
========================================================================
```

An invalid, tampered, or expired key exits with a non-zero code and prints an error.

---

## Key Format

Keys follow this structure:

```
HMS-{MODULE}-{base64url_payload}.{signature}
```

| Part | Description |
|------|-------------|
| `HMS` | Fixed prefix |
| `{MODULE}` | Module code (e.g. `DENTAL`) |
| `{base64url_payload}` | Base64url-encoded JSON containing `lid`, `fid`, `mod`, `iss`, `exp` |
| `{signature}` | First 32 hex characters of HMAC-SHA256(payload, secret) |

The payload fields:

| Field | Description |
|-------|-------------|
| `lid` | License ID |
| `fid` | Facility UUID or `*` for wildcard |
| `mod` | Module code |
| `iss` | Issued-at Unix timestamp |
| `exp` | Expiry Unix timestamp |

---

## Available Modules

| Code | Description |
|------|-------------|
| `CLINICAL` | Clinical module |
| `DENTAL` | Dental module |
| `EYE` | Eye/Ophthalmology module |
| `LAB` | Laboratory module |
| `INSURANCE` | Insurance module |

---

## Security Notes

- Keys are verified using a constant-time comparison to prevent timing attacks.
- The signing secret must be at least 8 characters.
- Wildcard (`*`) facility keys activate on **any** HMS installation — issue them only when necessary.
- This tool is intended for internal/admin use only. Do not expose `LICENSE_SECRET` to end users.
