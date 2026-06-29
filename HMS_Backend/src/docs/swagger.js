/**
 * Swagger API Documentation Configuration
 * This file configures Swagger/OpenAPI documentation for the Hospital Management System
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Hospital Management System API',
      version: '1.0.0',
      description: `
        RESTful API for Hospital Management System compliant with Ghana Health Service standards.
        
        ## Features
        - Patient Management
        - Appointment Scheduling
        - Clinical Documentation
        - Pharmacy Management
        - Laboratory Management
        - Billing & Payments
        - Insurance Claims (ClaimsIT Integration)
        - Dental Clinic Module
        - Eye Clinic Module
        - Reporting & Analytics
        - User Management
        - Audit Logging
        
        ## Compliance
        - Ghana Health Service (GHS) Standards
        - NHIS Integration
        - ClaimsIT Integration
        - GDPR Data Protection
        - Local Data Sovereignty
      `,
      contact: {
        name: 'Hospital Management System Support',
        email: process.env.SUPPORT_EMAIL || 'support@hospital.gov.gh',
        url: 'https://hospital.gov.gh/support'
      },
      license: {
        name: 'Proprietary',
        url: 'https://hospital.gov.gh/license'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000/api/v1',
        description: 'Production Server'
      },
      {
        url: 'http://staging-api.hospital.gov.gh/api/v1',
        description: 'Staging Server'
      },
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Development Server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token obtained from login endpoint'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for service-to-service authentication'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR'
                },
                message: {
                  type: 'string',
                  example: 'Validation failed'
                },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: {
                        type: 'string',
                        example: 'email'
                      },
                      message: {
                        type: 'string',
                        example: 'Invalid email format'
                      }
                    }
                  }
                }
              }
            },
            requestId: {
              type: 'string',
              example: 'req_123456789'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2024-02-18T10:30:00Z'
            }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              example: 1
            },
            limit: {
              type: 'integer',
              example: 50
            },
            total: {
              type: 'integer',
              example: 1000
            },
            totalPages: {
              type: 'integer',
              example: 20
            },
            hasNext: {
              type: 'boolean',
              example: true
            },
            hasPrev: {
              type: 'boolean',
              example: false
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            employee_id: {
              type: 'string',
              example: 'EMP-2024-00001'
            },
            first_name: {
              type: 'string',
              example: 'John'
            },
            last_name: {
              type: 'string',
              example: 'Doe'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@hospital.gov.gh'
            },
            phone_number: {
              type: 'string',
              example: '0244123456'
            },
            roles: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['DOCTOR', 'MED_OFFICER']
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['VIEW_PATIENTS', 'CREATE_PRESCRIPTIONS']
            }
          }
        },
        Patient: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            patient_number: {
              type: 'string',
              example: 'PAT-2024-00001'
            },
            ghs_unique_identifier: {
              type: 'string',
              example: 'GHS-123456'
            },
            nhis_number: {
              type: 'string',
              example: 'NHIS/12345678'
            },
            title: {
              type: 'string',
              example: 'Mr.'
            },
            first_name: {
              type: 'string',
              example: 'Kwame'
            },
            last_name: {
              type: 'string',
              example: 'Mensah'
            },
            date_of_birth: {
              type: 'string',
              format: 'date',
              example: '1985-06-15'
            },
            gender: {
              type: 'string',
              enum: ['Male', 'Female', 'Other'],
              example: 'Male'
            },
            blood_group: {
              type: 'string',
              enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
              example: 'O+'
            },
            phone_number: {
              type: 'string',
              example: '0244123456'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'kwame.mensah@email.com'
            },
            address: {
              type: 'object',
              properties: {
                line1: { type: 'string', example: '15 Independence Avenue' },
                city: { type: 'string', example: 'Accra' },
                region: { type: 'string', example: 'Greater Accra' },
                digital: { type: 'string', example: 'GA-123-4567' }
              }
            }
          }
        },
        Appointment: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            appointment_number: {
              type: 'string',
              example: 'APT-2024-00001'
            },
            appointment_date: {
              type: 'string',
              format: 'date',
              example: '2024-02-20'
            },
            start_time: {
              type: 'string',
              example: '10:00'
            },
            end_time: {
              type: 'string',
              example: '10:30'
            },
            type: {
              type: 'string',
              example: 'Consultation'
            },
            status: {
              type: 'string',
              enum: ['Scheduled', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'No Show'],
              example: 'Scheduled'
            },
            reason: {
              type: 'string',
              example: 'Routine checkup'
            }
          }
        },
        Visit: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            visit_number: {
              type: 'string',
              example: 'VIS-2024-00001'
            },
            visit_date: {
              type: 'string',
              format: 'date',
              example: '2024-02-18'
            },
            visit_type: {
              type: 'string',
              enum: ['Outpatient', 'Inpatient', 'Emergency', 'Review'],
              example: 'Outpatient'
            },
            chief_complaint: {
              type: 'string',
              example: 'Headache and fever'
            },
            diagnosis: {
              type: 'string',
              example: 'Malaria'
            },
            status: {
              type: 'string',
              enum: ['Active', 'In Progress', 'Completed', 'Discharged'],
              example: 'Active'
            }
          }
        },
        Diagnosis: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            diagnosis_code: {
              type: 'string',
              example: 'B50.0'
            },
            diagnosis_name: {
              type: 'string',
              example: 'Plasmodium falciparum malaria'
            },
            diagnosis_type: {
              type: 'string',
              enum: ['Primary', 'Secondary', 'Differential'],
              example: 'Primary'
            },
            is_confirmed: {
              type: 'boolean',
              example: true
            }
          }
        },
        Prescription: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            prescription_number: {
              type: 'string',
              example: 'PRESC-2024-00001'
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  medication_name: { type: 'string', example: 'Artemether/Lumefantrine' },
                  dosage: { type: 'string', example: '80mg/480mg' },
                  frequency: { type: 'string', example: 'Twice daily' },
                  duration: { type: 'string', example: '3 days' },
                  quantity: { type: 'integer', example: 6 }
                }
              }
            }
          }
        },
        LabOrder: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            order_number: {
              type: 'string',
              example: 'LAB-2024-00001'
            },
            tests: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  test_name: { type: 'string', example: 'Malaria RDT' },
                  result: { type: 'string', example: 'Positive' },
                  status: { type: 'string', example: 'Completed' }
                }
              }
            }
          }
        },
        Invoice: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            invoice_number: {
              type: 'string',
              example: 'INV-2024-00001'
            },
            subtotal: {
              type: 'number',
              example: 450.00
            },
            discount: {
              type: 'number',
              example: 0
            },
            tax: {
              type: 'number',
              example: 22.50
            },
            total: {
              type: 'number',
              example: 472.50
            },
            paid: {
              type: 'number',
              example: 472.50
            },
            status: {
              type: 'string',
              enum: ['Paid', 'Pending', 'Partially Paid', 'Overdue'],
              example: 'Paid'
            }
          }
        },
        InsuranceClaim: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            claim_number: {
              type: 'string',
              example: 'CLM-2024-00001'
            },
            claimsit_claim_id: {
              type: 'string',
              example: 'CLM123456'
            },
            total_amount: {
              type: 'number',
              example: 472.50
            },
            status: {
              type: 'string',
              enum: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Paid'],
              example: 'Submitted'
            }
          }
        },
        DentalChart: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            chart_type: {
              type: 'string',
              enum: ['Adult', 'Child'],
              example: 'Adult'
            },
            teeth: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  number: { type: 'integer', example: 11 },
                  status: { type: 'string', example: 'Present' },
                  condition: { type: 'string', example: 'Caries' }
                }
              }
            }
          }
        },
        EyeExamination: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            visual_acuity: {
              type: 'object',
              properties: {
                right: { type: 'string', example: '6/6' },
                left: { type: 'string', example: '6/9' }
              }
            },
            refraction: {
              type: 'object',
              properties: {
                sphere_right: { type: 'number', example: -1.50 },
                sphere_left: { type: 'number', example: -1.75 }
              }
            },
            iop: {
              type: 'object',
              properties: {
                right: { type: 'number', example: 16 },
                left: { type: 'number', example: 15 }
              }
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                error: {
                  code: 'UNAUTHORIZED',
                  message: 'Access token required'
                },
                requestId: 'req_123456789',
                timestamp: '2024-02-18T10:30:00Z'
              }
            }
          }
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                error: {
                  code: 'FORBIDDEN',
                  message: 'Insufficient permissions'
                },
                requestId: 'req_123456789',
                timestamp: '2024-02-18T10:30:00Z'
              }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                error: {
                  code: 'NOT_FOUND',
                  message: 'Patient not found'
                },
                requestId: 'req_123456789',
                timestamp: '2024-02-18T10:30:00Z'
              }
            }
          }
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Validation failed',
                  details: [
                    {
                      field: 'email',
                      message: 'Valid email is required'
                    }
                  ]
                },
                requestId: 'req_123456789',
                timestamp: '2024-02-18T10:30:00Z'
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'Authentication endpoints'
      },
      {
        name: 'Users',
        description: 'User management endpoints'
      },
      {
        name: 'Patients',
        description: 'Patient management endpoints'
      },
      {
        name: 'Appointments',
        description: 'Appointment scheduling endpoints'
      },
      {
        name: 'Clinical',
        description: 'Clinical documentation endpoints'
      },
      {
        name: 'Pharmacy',
        description: 'Pharmacy management endpoints'
      },
      {
        name: 'Laboratory',
        description: 'Laboratory management endpoints'
      },
      {
        name: 'Billing',
        description: 'Billing and payment endpoints'
      },
      {
        name: 'Insurance',
        description: 'Insurance and claims endpoints'
      },
      {
        name: 'Dental',
        description: 'Dental clinic endpoints'
      },
      {
        name: 'Eye Clinic',
        description: 'Eye clinic endpoints'
      },
      {
        name: 'Reports',
        description: 'Reporting endpoints'
      },
      {
        name: 'Inventory',
        description: 'Inventory management endpoints'
      },
      {
        name: 'Dashboard',
        description: 'Dashboard endpoints'
      },
      {
        name: 'Admin',
        description: 'Administrative endpoints'
      }
    ]
  },
  apis: [
    './routes/v1/*.js',
    './models/*.js',
    './controllers/*.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;