# Draft: Home Dashboard Implementation

## Requirements (confirmed)
- **Route Configuration**: Replace home route (/) with new dashboard, move Orders page to /orders
- **Key Metrics**:
  - Order status counts (Picked, QA, Pre-delivery, In-delivery, Shipping, Delivered)
  - Delivery performance metrics (Active runs, completed today, ready for delivery)
  - Recent activity feed (Latest orders, status changes from audit logs)
  - Time-based trends (Orders per day/week, peak times - REQUIRES CHARTS)
- **Visualizations**: YES - install recharts library
- **Access Control**: All authenticated users (existing ProtectedRoute pattern)

## Tech Stack Confirmed
- Frontend: React 18 + TypeScript, Vite, TailwindCSS 3.3.6, React Router DOM 6.20.1
- UI: Radix UI primitives (shadcn/ui), Lucide icons
- Backend: Flask 3.0, SQLAlchemy 2.0.23, MySQL 8.0+
- Real-time: Socket.IO (client 4.8.3, flask-socketio 5.3.6)
- ⚠️ NO CHART LIBRARY - must install recharts

## Data Sources Available
- Orders table (status, timestamps, pick status)
- Delivery runs table (status, runner, vehicle, times)
- Audit logs table (status changes, timestamps)
- Existing API endpoints (orders, delivery-runs, system/status)
- ⚠️ NO ANALYTICS ENDPOINTS - must create

## Patterns to Follow

### Backend (CONFIRMED)
**Service Layer Pattern** (from order_service.py, delivery_run_service.py):
- Services accept DB session in `__init__(self, db: Session)`
- Methods use `with_for_update()` for atomic updates
- Raise domain exceptions: `NotFoundError`, `ValidationError`, `StatusTransitionError`
- Return SQLAlchemy models (routes format responses)
- Use `AuditService(self.db)` for audit logging
- Background tasks kicked from routes, not services

**Route Pattern** (from orders.py, delivery_runs.py):
- Blueprint: `bp = Blueprint('name', __name__)`
- DB session: `with get_db() as db:`
- Input validation: Pydantic schemas (`OrderStatusUpdate(**data)`)
- Service call: `service = OrderService(db); result = service.method(...)`
- Output: `jsonify(OrderResponse.model_validate(result).model_dump())`
- Background: `threading.Thread(target=_broadcast).start()`

**Blueprint Registration** (from main.py):
- `app.register_blueprint(bp, url_prefix="/api/prefix")`

**Models** (from models/order.py):
- OrderStatus enum: PICKED, QA, PRE_DELIVERY, IN_DELIVERY, SHIPPING, DELIVERED, ISSUE
- Order fields: id, status, recipient_name, delivery_location, timestamps, etc.

**Schemas** (from schemas/order.py):
- Pydantic v2: `model_config = {"from_attributes": True}`
- Input/Output: OrderResponse, OrderDetailResponse, OrderStatusUpdate, etc.

**⚠️ NO ANALYTICS SERVICE EXISTS** - Must create new service + routes

### Frontend (CONFIRMED)
**Layout Pattern** (from DeliveryDashboard.tsx):
- Container: `<div className="container mx-auto py-6 space-y-6">`
- Grid: `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">`
- Card structure:
  ```tsx
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium">Metric Name</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
  ```

**Socket.IO Pattern** (from useDeliveryRuns.ts, useOrdersWebSocket.ts):
- Initialize: `io(baseUrl, { path: "/socket.io", transports: ["websocket", "polling"], reconnection: true })`
- Join room: `socket.on("connect", () => socket.emit("join", { room: "orders" }))`
- Listen: `socket.on("orders_update", (payload) => setOrders(payload.data || []))`
- Cleanup: `socket.disconnect()` in useEffect return

**API Client Pattern** (from orders.ts, deliveryRuns.ts):
- Use apiClient (axios with baseURL from VITE_API_URL or "/api")
- Type-safe wrappers: `const response = await apiClient.get<Order[]>("/orders", { params }); return response.data;`
- Auth: withCredentials: true, 401 → redirect to /login

**Routing** (from App.tsx):
- App.tsx acts as Layout (header nav + routes)
- Current nav: Orders (/), QA (/order-qa), Delivery (/delivery), Admin (/admin)
- Protected routes use ProtectedRoute wrapper

**UI Components Available**:
- Card: Card, CardHeader, CardContent, CardTitle (from components/ui/card.tsx)
- Badge: 6 variants (default, secondary, destructive, outline, success, warning) (from components/ui/badge.tsx)
- Table: Table, TableHeader, TableBody, TableRow, TableHead, TableCell (from components/ui/table.tsx)
- StatusBadge: Pre-configured for OrderStatus (from components/StatusBadge.tsx)

**TypeScript Types** (from types/order.ts):
- OrderStatus enum: PICKED, QA, PRE_DELIVERY, IN_DELIVERY, SHIPPING, DELIVERED, ISSUE
- Order interface: id, status, recipient_name, delivery_location, timestamps, etc.

### Recharts Integration (CONFIRMED)
- Install: `npm install recharts` (TypeScript types included in v3+)
- Line charts: Use ResponsiveContainer + LineChart with tickFormatter for dates
- Bar charts: Use BarChart with custom tooltips and radius for rounded bars
- Pie/Donut charts: Use Pie with Cell for colors, innerRadius for donut effect
- Responsive: ResponsiveContainer width="100%" height={400} with TailwindCSS containers

## Open Questions
(None - requirements are clear)

## Metis Gap Analysis (Self-Review)

### 1. Questions I Should Have Asked But Didn't

**NONE CRITICAL** - All key decisions confirmed:
- ✅ API structure (separate endpoints vs single)
- ✅ Chart types (line, bar, stacked)
- ✅ Activity feed composition (both orders + audit logs)
- ✅ Real-time update scope (all metrics on any change)

**MINOR CLARIFICATIONS** (can apply sensible defaults):
- Time window for "Recent Activity" feed (default: last 20 items)
- Chart color scheme (default: use TailwindCSS/TAMU maroon branding)
- Default time range for trends (default: 7 days)
- Error handling for failed API calls (default: show error state in cards)

### 2. Guardrails to Set

**Backend Guardrails**:
- ❌ NO complex joins across 3+ tables in single query (performance risk)
- ❌ NO raw SQL queries (use SQLAlchemy ORM for maintainability)
- ❌ NO caching layer in v1 (add only if performance issues arise)
- ❌ NO pagination on time-trends endpoint (limit query to max 90 days)
- ❌ NO user-specific filtering (all users see same system-wide metrics)

**Frontend Guardrails**:
- ❌ NO custom chart library (use recharts only, no mixing with chart.js/d3)
- ❌ NO inline styles (use TailwindCSS classes only)
- ❌ NO duplicate Socket.IO connections (reuse existing hooks)
- ❌ NO hardcoded colors (use CSS variables or Tailwind theme colors)
- ❌ NO dashboard customization UI (fixed layout in v1)

**Scope Creep Prevention**:
- ❌ NO drill-down modals (clicking metrics just shows static data, no navigation to filtered views)
- ❌ NO date range pickers (use predefined ranges: 7/30 days)
- ❌ NO export functionality (no CSV/PDF download)
- ❌ NO comparison mode (no "compare to last week" features)

### 3. Assumptions Requiring Validation

**ASSUMPTION 1**: Orders table has sufficient indexes for date-based aggregations
- **Risk**: Time-trends queries (GROUP BY date) may be slow without index on created_at
- **Mitigation**: First implementation will measure query performance; add index if >500ms

**ASSUMPTION 2**: Existing Socket.IO events ('orders_update', 'active_runs') fire frequently enough
- **Risk**: Dashboard may show stale data if events don't fire on all order/run changes
- **Mitigation**: Verify event emissions in backend (orders.py, delivery_runs.py routes)

**ASSUMPTION 3**: Audit logs table has complete status transition history
- **Risk**: Recent activity feed may have gaps if audit logging incomplete
- **Mitigation**: Review AuditService usage in order_service.py; ensure all transitions logged

**ASSUMPTION 4**: No timezone conversion needed (all timestamps UTC)
- **Risk**: Time-based charts may show incorrect "peak hours" if users in different timezones
- **Mitigation**: Confirm all timestamps are UTC; display in UTC or add timezone handling later

**ASSUMPTION 5**: MySQL date/time functions available for aggregation
- **Risk**: Time-series queries need DATE() or DATE_TRUNC() functions
- **Mitigation**: Use SQLAlchemy func.date() which translates to MySQL DATE()

### 4. Missing Acceptance Criteria

**Need to Add**:
- **API Response Time**: Each analytics endpoint should respond in <500ms (99th percentile)
- **Chart Loading State**: Charts should show skeleton/loading spinner while fetching
- **Error Recovery**: Failed API calls should retry once, then show error message
- **Empty State**: Dashboard should handle zero orders/runs gracefully (show "No data" message)
- **Real-time Update Verification**: After Socket.IO event, metrics should update within 2 seconds
- **Responsive Breakpoints**: Dashboard should work on tablet (768px) and desktop (1024px+)

### 5. Edge Cases Not Addressed

**Edge Case 1**: What if an order has no status transitions in audit log?
- **Resolution**: Show order in activity feed with "Created" as implicit first event

**Edge Case 2**: What if there are no active delivery runs?
- **Resolution**: Show "0 Active Runs" metric, hide/gray-out related performance metrics

**Edge Case 3**: What if time-trends query returns empty data (no orders in range)?
- **Resolution**: Show empty chart with "No data for selected period" message

**Edge Case 4**: What if recharts fails to load (CDN/network issue)?
- **Resolution**: Show fallback text-based metrics (no charts), don't break page

**Edge Case 5**: What if user navigates directly to /orders after dashboard becomes home?
- **Resolution**: Ensure /orders route works (already confirmed in plan)

### 6. Implementation Risks

**RISK 1: Database Performance**
- **Issue**: Aggregation queries on large orders table (10k+ rows) may be slow
- **Mitigation**: Limit time-trends to 90 days max; add database indexes if needed
- **Severity**: MEDIUM

**RISK 2: Socket.IO Event Storms**
- **Issue**: Frequent order updates may cause dashboard to re-fetch too often
- **Mitigation**: Debounce API calls (500ms) in frontend
- **Severity**: LOW

**RISK 3: Recharts Bundle Size**
- **Issue**: Recharts is ~500KB, may increase frontend load time
- **Mitigation**: Use tree-shaking (import specific components only)
- **Severity**: LOW

**RISK 4: Inconsistent Timestamps**
- **Issue**: Orders created before audit logging may lack transition timestamps
- **Mitigation**: Handle null timestamps gracefully in time-series queries
- **Severity**: LOW

**RISK 5: Browser Compatibility**
- **Issue**: Recharts uses SVG which may have issues in older browsers
- **Mitigation**: Target modern browsers only (Chrome 90+, Firefox 88+, Safari 14+)
- **Severity**: LOW

### 7. Test Strategy Decision REQUIRED

**Backend Testing**:
- No test infrastructure found
- **Options**:
  1. Setup pytest + fixtures (add to plan)
  2. Manual testing only (faster but risky)
  
**Frontend Testing**:
- No test infrastructure found
- **Options**:
  1. Setup Vitest + React Testing Library (add to plan)
  2. Manual testing only (faster but risky)

**DECISION NEEDED**: Should plan include test infrastructure setup?
- If YES: Add test setup tasks + TDD workflow
- If NO: Use manual verification procedures only
