// ── Core Entities ──────────────────────────────────────────────

export interface Department {
  id: string;
  facilityId: string;
  departmentCode: string;
  departmentName: string;
  departmentType: "Clinical" | "Ancillary" | "Administrative";
  isActive: boolean;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  /** Full roles array returned by the backend — use as fallback when `role` is absent. */
  roles?: Array<{ id: string; code: string; name: string }>;
  department?: string;
  departmentId?: string;
  facilityId: string;
  branchId?: string;
  phone?: string;
  gender?: string;
  employmentStatus?: string;
  profilePhoto?: string;
  isActive: boolean;
  accountLocked?: boolean;
  loginAttempts?: number;
  lastLogin?: string;
  createdAt: string;
}

export type UserRole =
  | "SUPER_ADMIN"
  | "SYS_ADMIN"
  | "MED_SUPT"
  | "DISTRICT_HD"
  | "DOCTOR"
  | "NURSE"
  | "MED_OFFICER"
  | "RECORDS"
  | "RECEPTION"
  | "PHARMACIST"
  | "LAB_TECH"
  | "ACCOUNTS"
  | "CASHIER"
  | "DENTIST"
  | "DENTAL_TECH"
  | "DENTAL_SURGEON"
  | "OPTOMETRIST"
  | "OPHTHALMOLOGIST"
  | "TECHNICIAN"
  | "INSURANCE"
  | "INVENTORY"
  | "REGISTRAR";

export interface Patient {
  id: string;
  patientNumber: string;
  // Name
  title?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  // Demographics
  dateOfBirth: string;
  gender: "Male" | "Female" | "Other";
  maritalStatus?: string;
  genotype?: string;
  nationality?: string;
  religion?: string;
  tribe?: string;
  hometown?: string;
  regionOfOrigin?: string;
  districtOfOrigin?: string;
  // Contact
  phone?: string;
  alternatePhone?: string;
  email?: string;
  // Address
  addressLine1?: string;
  addressLine2?: string;
  /** Compat alias → addressLine1 */
  address?: string;
  city?: string;
  district?: string;
  region?: string;
  postalCode?: string;
  digitalAddress?: string;
  // Identity
  idType?: string;
  idNumber?: string;
  // Insurance
  nhisNumber?: string;
  nhisExpiryDate?: string;
  ghsUniqueIdentifier?: string;
  insuranceProvider?: string;
  insuranceType?: string;
  policyNumber?: string;
  planName?: string;
  insuranceStartDate?: string;
  insuranceEndDate?: string;
  // Medical
  bloodGroup?: string;
  allergies?: string;
  chronicConditions?: string;
  currentMedications?: string;
  surgicalHistory?: string;
  familyHistory?: string;
  socialHistory?: string;
  // Social / Employment
  occupation?: string;
  employerName?: string;
  // Emergency contact
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  emergencyContactAddress?: string;
  // Meta
  facilityId: string;
  createdAt: string;
  age?: number;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName?: string;
  patientNumber?: string;
  doctorId: string;
  doctorName?: string;
  appointmentDate: string;
  appointmentTime: string;
  type: string;
  status: "Scheduled" | "Confirmed" | "Cancelled" | "Completed" | "No-Show";
  reason?: string;
  notes?: string;
  facilityId: string;
  createdAt: string;
}

export interface Visit {
  id: string;
  patientId: string;
  visitDate: string;
  checkInTime: string;
  checkOutTime?: string;
  departmentId: string;
  isEmergency: boolean;
  chiefComplaint?: string;
  status: string;
}

export interface Invoice {
  id: string;
  // camelCase (normalised by axios interceptor if present)
  invoiceNumber?: string;
  patientId?: string;
  patientName?: string;
  patientNumber?: string;
  visitId?: string;
  totalAmount?: number;
  paidAmount?: number;
  balanceDue?: number;
  subtotal?: number;
  discountAmount?: number;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  voided: boolean;
  items?: InvoiceItem[];
  payments?: InvoicePayment[];
  invoiceDate?: string;
  dueDate?: string;
  createdAt?: string;
  // snake_case (raw backend fields)
  invoice_number?: string;
  patient_id?: string;
  patient_name?: string;
  patient_number?: string;
  phone_number?: string;
  visit_id?: string;
  total_amount?: number;
  amount_paid?: number;
  balance_due?: number;
  payment_status?: string;
  invoice_date?: string;
  due_date?: string;
  created_at?: string;
  // nested objects returned by findInvoiceById
  patient?: {
    id?: string;
    name?: string;
    patient_number?: string;
    phone?: string;
  };
  visit?: { id?: string; visit_number?: string; visit_date?: string };
}

export interface InvoiceItem {
  id: string;
  // camelCase
  itemType?: string;
  itemName?: string;
  description?: string;
  quantity: number;
  unitPrice?: number;
  discountAmount?: number;
  taxAmount?: number;
  totalPrice?: number;
  isInsuranceCovered?: boolean;
  // snake_case (raw backend)
  item_type?: string;
  item_name?: string;
  unit_price?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_price?: number;
}

export interface InvoicePayment {
  id: string;
  paymentNumber?: string;
  paymentDate?: string;
  paymentMethod?: string;
  amount: number;
  reference?: string;
  // snake_case
  payment_number?: string;
  payment_date?: string;
  payment_method?: string;
}

export interface ServicePrice {
  id: string;
  priceListId?: string;
  priceListName?: string;
  priceListCode?: string;
  priceListActive?: boolean;
  serviceType?: string;
  serviceId?: string;
  serviceCode?: string;
  serviceName?: string;
  price: number;
  nhisTariff?: number;
  discountAllowed?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // snake_case (raw backend)
  price_list_id?: string;
  price_list_name?: string;
  price_list_code?: string;
  price_list_active?: boolean;
  service_type?: string;
  service_id?: string;
  service_code?: string;
  service_name?: string;
  nhis_tariff?: number;
  discount_allowed?: boolean;
}

export interface PriceList {
  id: string;
  facilityId?: string;
  priceListCode?: string;
  priceListName?: string;
  priceListType?: string;
  validFrom?: string;
  validTo?: string;
  isActive?: boolean;
  priceCount?: number;
  // snake_case
  facility_id?: string;
  price_list_code?: string;
  price_list_name?: string;
  price_list_type?: string;
  is_active?: boolean;
  price_count?: number;
}

export interface LabOrder {
  id: string;
  patientId: string;
  patientName?: string;
  requestedBy: string;
  testName: string;
  status: "Pending" | "Processing" | "Completed" | "Cancelled";
  priority: "Routine" | "Urgent" | "STAT";
  result?: string;
  resultDate?: string;
  createdAt: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  patientName?: string;
  patientNumber?: string;
  doctorId: string;
  doctorName?: string;
  visitId?: string;
  medications: PrescriptionItem[];
  status: "Pending" | "Dispensed" | "Cancelled";
  notes?: string;
  createdAt: string;
  prescriptionNumber?: string;
  source?: "Clinical" | "Dental";
}

export interface PrescriptionItem {
  id: string;
  medicationId: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  dispensedQuantity?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  item_type?: string;
  sku?: string;
  currentStock: number;
  minimumStock: number;
  unit: string;
  unitPrice: number;
  expiryDate?: string;
  supplier?: string;
  status: "In Stock" | "Low Stock" | "Out of Stock" | "Expired";
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  facilityId: string;
  isActive: boolean;
}

// ── Dashboard ──────────────────────────────────────────────────

export interface DashboardStats {
  totalPatients: number;
  newPatients30d: number;
  maleCount: number;
  femaleCount: number;
  totalVisits: number;
  todayVisits: number;
  emergencyVisits: number;
  todayAppointments: number;
  pendingToday: number;
  revenue30d: number;
  revenueToday: number;
  outstandingRevenue: number;
}

// ── API ────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: Pagination;
  fromCache?: boolean;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ── Auth ───────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}
