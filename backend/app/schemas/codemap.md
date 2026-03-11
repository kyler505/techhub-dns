# backend/app/schemas/

This package holds all of the Pydantic-based API/data-contract models that sit between Flask route handlers and the service layer. The schema files describe the shapes of incoming payloads (`CheckoutRequest`, `OrderStatusUpdate`, etc.), the normalized responses (`OrderResponse`, `DeliveryRunResponse`, `WebhookResponse`, etc.), and the structured errors that the middleware emits. They stay deliberately agnostic of persistence details (ORM sessions live in `app.services` and `app.models`); their job is to validate/clean request data and to serialize SQLAlchemy-backed objects for JSON responses.

## Responsibility

- Define clear, documented contracts for every piece of JSON that crosses the `/api` boundary: orders, delivery runs, analytics dashboards, inflow sync/webhook plumbing, vehicle checkouts, audit logs, and error payloads.
- Capture domain preferences such as order status enums, vehicle types, and workflow states so that request/response validation stays centralized and consistent across multiple routes (`orders.py`, `delivery_runs.py`, `analytics.py`, `inflow.py`, `vehicle_checkouts.py`).
- Shape error responses via `ErrorDetail`/`ErrorResponse` so every handler (middleware, auth, controllers) reuses the same `code`/`message`/`details` fields and attaches a `request_id`.

## Design

- All schemas extend `BaseModel` and lean on `model_config = {"from_attributes": True}` when wrapping SQLAlchemy objects. This keeps the serialization layer close to `app.services.*` while still yielding idiomatic Python data structures (dicts, lists, primitives) for `Flask.jsonify`.
- Input models (`OrderUpdate`, `CreateDeliveryRunRequest`, `CheckoutRequest`, etc.) declare typed fields, use `Field` defaults, and rely on `field_validator`/`model_validator` hooks to normalize/guard vehicle names, required `purpose` text, picklist timestamps, and other edge cases before the service layer runs.
- Output models use `field_serializer` to normalize datetimes (always UTC ISO strings) and to pass through enums (order status, workflow status, delivery run status). `PickStatus`, `PrintJobSummary`, `OrderSummary`, and `VehicleStatusItem` provide focused children that live inside larger responses rather than re-implementing nested serialization logic in every route.
- `ErrorResponse`/`ErrorDetail` bundles always emit `code`, `message`, optional `field`, and `details`; they are shared by `app.api.middleware` for global HTTP error handlers and by `auth_middleware` when rate-limiting admin requests.

## Flow

1. A Flask route (`orders`, `delivery_runs`, `analytics`, `inflow`, etc.) reads `request.get_json()` or query params, instantiates the appropriate schema (e.g., `OrderUpdate(**data)`, `CheckoutRequest(**data)`), and lets Pydantic raise `ValidationError` if the payload deviates from the declared contract.
2. Validated data is handed to a service (`OrderService`, `DeliveryRunService`, `VehicleCheckoutService`, etc.) which performs the business logic and ORM work. Services may return SQLAlchemy objects or simple dicts.
3. Routes call `.model_validate(...).model_dump(mode="json")` (or `model_dump()` for plain dicts) on response models such as `OrderResponse`, `DeliveryRunResponse`, `RecentActivityResponse`, and `WebhookResponse`. These models apply custom serializers so every `datetime` lands in `YYYY-MM-DDTHH:MM:SSZ`, enums remain stable strings, and optional nested lists (e.g., `PickStatus.missing_items`) default to `[]`.
4. When something goes wrong, `app.api.middleware.register_error_handlers` translates `DNSApiError`, HTTP 4xx/5xx, or unexpected exceptions into `ErrorResponse` payloads, ensuring every request gets `error.code`, `error.message`, and a generated `request_id`.

## Integration

- `orders.py` relies on every major schema in this folder: `OrderResponse`/`OrderDetailResponse` for GET/list/detail JSON, `OrderUpdate`, `AssetTagUpdate`, `PicklistGenerationRequest`, `QASubmission`, `SignatureData`, `ShippingWorkflowUpdateRequest`, `ShippingWorkflowResponse`, `BulkStatusUpdate`, and `PickStatus` for validating POST/PATCH bodies and infusing status metadata. `AuditLogResponse` streams audit entries when `/orders/<id>/audit` is hit.
- `delivery_runs.py` drives `CreateDeliveryRunRequest`, `DeliveryRunResponse`, `FinishDeliveryRunRequest`, `RecallDeliveryRunOrderRequest`, `ReorderDeliveryRunOrdersRequest`, `DeliveryRunDetailResponse`, and `OrderSummary` for its CRUD-ish and administration endpoints; the same models feed the SocketIO broadcaster that joins `orders`/`fleet` rooms.
- `analytics.py` converts service results into `StatusCountsResponse`, `DeliveryPerformanceResponse`, `RecentActivityResponse`, `TimeTrendsResponse`, `WorkflowDailyTrendsResponse`, and `FulfilledTotalsResponse` so the dashboard routes can enforce 200-level responses with typed data points (`ActivityItem`, `TimeTrendDataPoint`, `WorkflowDailyTrendDataPoint`, `FulfilledTotalDataPoint`).
- `inflow.py` builds admin/control-plane routes around `InflowSyncResponse`, `InflowSyncStatusResponse`, `WebhookRegisterRequest`, `WebhookResponse`, and `WebhookListResponse`, while webhook callbacks skip schema validation when processing raw HTTP payloads but still reuse `ErrorResponse` for consistent error signaling.
- `vehicle_checkouts.py` and `app.api.vehicle_status_events` depend on `CheckoutRequest`, `CheckinRequest`, `VehicleCheckoutResponse`, `VehicleStatusItem`, and `VehicleStatusResponse` to validate telemetry and broadcast fleet status updates; serializers keep vehicle names normalized and ensure `checked_out_at`/`checked_in_at` stay convertible to JSON.
- `app.api.middleware` and `app.api.auth_middleware` both create `ErrorResponse` objects for HTTP 400/404/429/500, rate-limits, and any caught `DNSApiError`, which keeps the operator-facing API shape uniform regardless of where the failure originates.
