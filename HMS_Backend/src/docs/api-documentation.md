# Hospital Management System API Documentation

## Overview

The Hospital Management System API provides a comprehensive RESTful interface for managing all aspects of hospital operations, compliant with Ghana Health Service (GHS) standards and integrated with ClaimsIT for insurance claims processing.

**Base URL:** `https://api.hospital.gov.gh/api/v1` (Production)  
**Staging:** `https://staging-api.hospital.gov.gh/api/v1`  
**Documentation:** `https://api.hospital.gov.gh/docs`

## Table of Contents

1. [Authentication](#authentication)
2. [Core Concepts](#core-concepts)
3. [Endpoints](#endpoints)
   - [Authentication](#authentication-endpoints)
   - [Users](#users-endpoints)
   - [Patients](#patients-endpoints)
   - [Appointments](#appointments-endpoints)
   - [Clinical](#clinical-endpoints)
   - [Pharmacy](#pharmacy-endpoints)
   - [Laboratory](#laboratory-endpoints)
   - [Billing](#billing-endpoints)
   - [Insurance](#insurance-endpoints)
   - [Dental](#dental-endpoints)
   - [Eye Clinic](#eye-clinic-endpoints)
   - [Reports](#reports-endpoints)
   - [Inventory](#inventory-endpoints)
   - [Dashboard](#dashboard-endpoints)
   - [Admin](#admin-endpoints)
4. [Webhooks](#webhooks)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Pagination](#pagination)
8. [Filtering & Sorting](#filtering--sorting)
9. [Versioning](#versioning)
10. [Compliance](#compliance)

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. All authenticated endpoints require a valid access token in the Authorization header.

### Obtaining Tokens

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@hospital.gov.gh",
  "password": "your_password"
}