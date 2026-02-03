# System Architecture

## Overview

The TechHub Delivery Workflow is a full-stack application with a Flask backend serving a React frontend, integrated with multiple external services.

```
[Frontend (React)]
  Orders | QA | Delivery | Shipping | Admin
          | HTTP/REST + WebSocket (Socket.IO)
[Backend (Flask)]
  Routes: orders.py, inflow.py, delivery_runs.py, auth.py, system.py
  Services: order_service, inflow_service, delivery_run_service, pdf_service
            graph_service, email_service, teams_recipient_service
            saml_auth_service, sharepoint_service, audit_service
  Utils: building_mapper.py
          |
[MySQL Database] [Inflow API] [Graph API] [ArcGIS Service] [SharePoint Storage]
```

## Backend Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── orders.py          # Order CRUD and status management
│   │   │   ├── inflow.py          # Inflow sync and webhooks
│   │   │   ├── delivery_runs.py   # Delivery run management
│   │   │   ├── auth.py            # SAML authentication
│   │   │   ├── system.py          # Admin and system endpoints
│   │   │   ├── audit.py           # Audit log queries
│   │   │   └── sharepoint.py      # SharePoint operations
│   │   └── middleware/            # Auth middleware, error handlers
│   ├── models/
│   │   ├── order.py               # Order model
│   │   ├── delivery_run.py        # Delivery run model
│   │   ├── audit_log.py           # Audit log model
│   │   ├── inflow_webhook.py      # Webhook tracking
│   │   ├── user.py                # User model
│   │   └── session.py             # Session model
│   ├── services/
│   │   ├── order_service.py       # Order business logic
│   │   ├── inflow_service.py      # Inflow API integration
│   │   ├── delivery_run_service.py # Delivery run logic
│   │   ├── graph_service.py       # Microsoft Graph API
│   │   ├── email_service.py       # Email via Graph
│   │   ├── teams_recipient_service.py # Teams notifications
│   │   ├── pdf_service.py         # PDF generation
│   │   ├── saml_auth_service.py   # SAML authentication
│   │   ├── sharepoint_service.py  # SharePoint storage
│   │   └── audit_service.py       # Audit logging
│   ├── utils/
│   │   └── building_mapper.py     # ArcGIS building code extraction
│   ├── schemas/                   # Pydantic schemas
│   ├── config.py                  # Configuration management
│   ├── database.py                # Database connection
│   ├── main.py                    # Flask application
│   └── scheduler.py               # APScheduler background tasks
├── scripts/
│   ├── database_manager.py        # Database management tool
│   └── manage_inflow_webhook.py   # Webhook management
└── alembic/                       # Database migrations
```

## Frontend Structure

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts              # Axios configuration
│   │   ├── orders.ts              # Order API calls
│   │   ├── inflow.ts              # Inflow sync API
│   │   ├── deliveryRuns.ts        # Delivery run API
│   │   ├── settings.ts            # System settings API
│   │   └── sharepoint.ts          # SharePoint API
│   ├── components/
│   │   ├── OrderTable.tsx         # Order listing table
│   │   ├── OrderDetail.tsx        # Order detail view
│   │   ├── StatusBadge.tsx        # Status display
│   │   ├── StatusTransition.tsx   # Status change dialog
│   │   ├── Filters.tsx            # Filter controls
│   │   ├── LiveDeliveryDashboard.tsx # Real-time dashboard
│   │   ├── CreateDeliveryDialog.tsx  # Delivery run creation
│   │   └── ProtectedRoute.tsx     # Auth route wrapper
│   ├── pages/
│   │   ├── Orders.tsx             # Orders dashboard
│   │   ├── OrderDetailPage.tsx    # Order detail page
│   │   ├── OrderQAChecklist.tsx   # QA checklist page
│   │   ├── DeliveryDashboard.tsx  # Delivery overview
│   │   ├── DeliveryRunDetailPage.tsx # Delivery run detail
│   │   ├── PreDeliveryQueue.tsx   # Pre-delivery queue
│   │   ├── InDelivery.tsx         # In-delivery tracking
│   │   ├── Shipping.tsx           # Shipping workflow
│   │   ├── DocumentSigningPage.tsx # Document signing
│   │   ├── Admin.tsx              # Admin panel
│   │   ├── Sessions.tsx           # Session management
│   │   └── Login.tsx              # Login page
│   ├── hooks/
│   │   ├── useOrders.ts           # Order data hook
│   │   ├── useOrdersWebSocket.ts  # WebSocket hook
│   │   ├── useDeliveryRuns.ts     # Delivery runs hook
│   │   └── useStatusTransition.ts # Status transition hook
│   ├── contexts/
│   │   └── AuthContext.tsx        # Authentication context
│   └── types/
│       ├── order.ts               # TypeScript types
│       └── websocket.ts           # WebSocket types
└── public/
```
