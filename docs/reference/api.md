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

### POST `/api/delivery-runs`

Notes:
- `runner` is derived from the authenticated session user and is not provided in the request.

Request:
```json
{
  "order_ids": [
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222"
  ],
  "vehicle": "van"
}
```

## Vehicle Checkouts API (`/api/vehicle-checkouts`)

Tracks who has physically checked out a shared vehicle (independent of delivery runs).

Allowed `vehicle` values: `van`, `golf_cart`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/vehicle-checkouts/checkout` | Check out a vehicle |
| POST | `/api/vehicle-checkouts/checkin` | Check in a vehicle |
| GET | `/api/vehicle-checkouts/active` | List active (not checked in) vehicle checkouts |

### POST `/api/vehicle-checkouts/checkout`

Notes:
- `checked_out_by` is derived from the authenticated session user and is not provided in the request.

Request:
```json
{
  "vehicle": "van",
  "purpose": "Delivery",
  "notes": "Morning run"
}
```

Response:
```json
{
  "id": "6e2d0fd4-3d98-4f92-b0c3-8a3a54a9f8a8",
  "vehicle": "van",
  "checked_out_by": "Alice",
  "purpose": "Delivery",
  "checked_out_at": "2026-02-10T15:04:05.123456",
  "checked_in_at": null
}
```

### POST `/api/vehicle-checkouts/checkin`

Notes:
- Check-in identity is derived from the authenticated session user and is not provided in the request.

Request:
```json
{
  "vehicle": "van",
  "notes": "Returned"
}
```

Response:
```json
{
  "id": "6e2d0fd4-3d98-4f92-b0c3-8a3a54a9f8a8",
  "vehicle": "van",
  "checked_out_by": "Alice",
  "purpose": "Delivery",
  "checked_out_at": "2026-02-10T15:04:05.123456",
  "checked_in_at": "2026-02-10T17:22:01.654321"
}
```

### GET `/api/vehicle-checkouts/active`

Response:
```json
[
  {
    "id": "6e2d0fd4-3d98-4f92-b0c3-8a3a54a9f8a8",
    "vehicle": "van",
    "checked_out_by": "Alice",
    "purpose": "Delivery",
    "checked_out_at": "2026-02-10T15:04:05.123456",
    "checked_in_at": null
  }
]
```

## Vehicles API (`/api/vehicles`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/vehicles/status` | Get per-vehicle checkout + delivery run status |

### GET `/api/vehicles/status`

Response:
```json
{
  "vehicles": [
    {
      "vehicle": "van",
      "checked_out": true,
      "checked_out_by": "Alice",
      "delivery_run_active": false
    },
    {
      "vehicle": "golf_cart",
      "checked_out": false,
      "checked_out_by": null,
      "delivery_run_active": false
    }
  ]
}
```

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
