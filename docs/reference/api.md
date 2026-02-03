# API Reference

## Orders API (`/api/orders`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders (filter by status, search) |
| GET | `/api/orders/{id}` | Get order details with audit logs |
| PATCH | `/api/orders/{id}` | Update order fields |
| PATCH | `/api/orders/{id}/status` | Transition order status |
| POST | `/api/orders/{id}/tag` | Record asset tagging |
| POST | `/api/orders/{id}/picklist` | Generate picklist PDF |
| GET | `/api/orders/{id}/picklist` | Download picklist |
| GET | `/api/orders/{id}/order-details.pdf` | Generate Order Details PDF |
| POST | `/api/orders/{id}/send-order-details` | Email Order Details |
| POST | `/api/orders/{id}/qa` | Submit QA checklist |
| POST | `/api/orders/{id}/fulfill` | Mark fulfilled in Inflow |
| POST | `/api/orders/bulk-transition` | Bulk status transition |
| GET | `/api/orders/{id}/audit` | Get audit logs |

## Inflow API (`/api/inflow`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/inflow/sync` | Trigger manual sync |
| GET | `/api/inflow/sync-status` | Get sync status |
| POST | `/api/inflow/webhook` | Webhook receiver |
| GET | `/api/inflow/webhooks` | List webhooks |
| POST | `/api/inflow/webhooks/register` | Register webhook |
| DELETE | `/api/inflow/webhooks/{id}` | Delete webhook |

## Delivery Runs API (`/api/delivery-runs`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/delivery-runs` | Create delivery run |
| GET | `/api/delivery-runs/active` | Get active runs |
| GET | `/api/delivery-runs/{id}` | Get run details |
| PUT | `/api/delivery-runs/{id}/finish` | Complete run |
| GET | `/api/delivery-runs/vehicles/available` | Vehicle availability |

## Auth API (`/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/me` | Get current user |
| GET | `/auth/saml/login` | Initiate SAML login |
| POST | `/auth/saml/callback` | SAML assertion consumer |
| POST | `/auth/logout` | Logout |
| GET | `/auth/sessions` | List user sessions |
| DELETE | `/auth/sessions/{id}` | Revoke session |

## System API (`/api/system`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system/status` | System health status |
| GET | `/api/system/settings` | Get settings |
| POST | `/api/system/test-sharepoint` | Test SharePoint |
| POST | `/api/system/test-email` | Test email |
| POST | `/api/system/test-teams` | Test Teams notification |
| POST | `/api/system/deploy` | GitHub webhook deploy |
