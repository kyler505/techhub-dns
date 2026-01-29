# Dashboard Testing Checklist

## Overview
This document provides a comprehensive testing checklist for the new TechHub DNS Dashboard feature. The dashboard replaces the Orders page as the landing page and displays real-time analytics and metrics.

---

## Prerequisites

### Environment Setup
- [ ] Backend running: `cd backend && python -m app.main`
- [ ] Frontend running: `cd frontend && npm run dev`
- [ ] Database accessible and populated with test data
- [ ] SAML authentication configured (required for API access)

### Test User Requirements
- [ ] Valid TAMU credentials for SAML login
- [ ] User exists in database after first login
- [ ] User has appropriate permissions

---

## Backend Verification

### 1. Server Startup
- [ ] Backend starts without import errors
- [ ] No Python exceptions in console
- [ ] Flask server accessible at `http://localhost:8000`
- [ ] Health check responds: `curl http://localhost:8000/health`

### 2. Analytics API Endpoints (Requires Authentication)

**Test via Browser (after login):**
Navigate to these URLs in browser after authenticating:

- [ ] Order Status Counts: `http://localhost:8000/api/analytics/order-status-counts`
  - Returns JSON with counts for: picked, qa, pre_delivery, in_delivery, shipping, delivered
  - HTTP 200 status
  - Valid JSON structure

- [ ] Delivery Performance: `http://localhost:8000/api/analytics/delivery-performance`
  - Returns: active_runs, completed_today, ready_for_delivery
  - HTTP 200 status
  - Numeric values (0 or positive integers)

- [ ] Recent Activity: `http://localhost:8000/api/analytics/recent-activity`
  - Returns array of recent orders and status changes
  - Each item has: id, type, title, description, timestamp
  - HTTP 200 status

- [ ] Time Trends: `http://localhost:8000/api/analytics/time-trends?period=day&days=7`
  - Returns: orders_per_day, peak_hours, status_trends arrays
  - Each data point has proper structure
  - HTTP 200 status

**Expected Behavior with Empty Database:**
- [ ] All endpoints return HTTP 200 (not 500)
- [ ] Counts return 0
- [ ] Arrays return empty `[]`
- [ ] No server errors in Flask logs

### 3. Database Queries
Check Flask logs for SQL queries:
- [ ] No N+1 query issues
- [ ] Queries use proper aggregations (COUNT, DATE functions)
- [ ] No full table scans on large tables

---

## Frontend Verification

### 1. Build & Compilation
- [ ] TypeScript compilation succeeds: `cd frontend && npm run build`
- [ ] No TypeScript errors
- [ ] Build output shows `dist/` folder created
- [ ] Bundle size warnings (expected, but note if >2MB)

### 2. Routing
- [ ] Navigate to `http://localhost:5173/`
  - **Expected:** Dashboard page loads (NOT Orders page)
  - [ ] URL stays at `/` (no redirect)
  - [ ] Page title shows "Dashboard" or similar

- [ ] Navigate to `http://localhost:5173/orders`
  - **Expected:** Orders page loads
  - [ ] URL stays at `/orders`
  - [ ] Page title shows "Orders" or similar

- [ ] Click navigation links
  - [ ] "Dashboard" link navigates to `/`
  - [ ] "Orders" link navigates to `/orders`
  - [ ] No console errors during navigation

### 3. Dashboard Layout & Components

**On Load:**
- [ ] Dashboard renders without crashing
- [ ] No console errors in browser DevTools
- [ ] No React warnings in console
- [ ] Loading states show while fetching data

**Visual Elements:**
- [ ] Page header displays "Dashboard" title
- [ ] Four main sections visible:
  1. Order Status Counts (6 cards)
  2. Delivery Performance (3 cards)
  3. Time Trends (3 charts)
  4. Recent Activity (table)

### 4. Order Status Counts Section
- [ ] 6 status cards displayed in grid:
  - Picked
  - QA
  - Pre-Delivery
  - In Delivery
  - Shipping
  - Delivered
- [ ] Each card shows:
  - [ ] Status label
  - [ ] Numeric count (or loading spinner)
  - [ ] Appropriate styling
- [ ] Cards arranged responsively (grid adjusts on resize)

### 5. Delivery Performance Section
- [ ] 3 metric cards displayed:
  - Active Runs
  - Completed Today
  - Ready for Delivery
- [ ] Each card shows:
  - [ ] Metric label
  - [ ] Numeric value (or loading spinner)
  - [ ] Appropriate icon/styling

### 6. Time Trends Section
- [ ] 3 charts displayed in responsive grid:

**Orders Per Day (Line Chart):**
- [ ] Chart renders without errors
- [ ] X-axis shows dates
- [ ] Y-axis shows order counts
- [ ] Line uses TAMU maroon color (#500000)
- [ ] Tooltip appears on hover
- [ ] Shows "No data available" if empty

**Peak Hours (Bar Chart):**
- [ ] Chart renders without errors
- [ ] X-axis shows hours (0-23)
- [ ] Y-axis shows order counts
- [ ] Bars use TAMU maroon color
- [ ] Tooltip appears on hover
- [ ] Shows "No data available" if empty

**Status Trends (Stacked Bar Chart):**
- [ ] Chart renders without errors
- [ ] X-axis shows dates
- [ ] Y-axis shows counts
- [ ] Multiple status bars stacked
- [ ] Legend shows all statuses
- [ ] Different colors per status
- [ ] Tooltip appears on hover
- [ ] Shows "No data available" if empty

### 7. Recent Activity Section
- [ ] Table renders without errors
- [ ] Columns visible:
  - Type
  - Title
  - Description
  - Time
- [ ] Rows display recent activity (if data exists)
- [ ] Shows "No recent activity" if empty
- [ ] Time formatting is human-readable
- [ ] Table is scrollable if many items

### 8. Real-Time Updates (Socket.IO)

**Connection Status:**
- [ ] Open browser DevTools → Network tab → WS (WebSocket)
- [ ] Socket.IO connection established
- [ ] Connection shows "connected" status
- [ ] No repeated connection attempts (reconnect loop)

**Live Updates Test:**
1. Open dashboard in Browser Tab 1
2. Open another tab/window with the app
3. Change an order status (e.g., Picked → QA)
4. Return to Dashboard tab
- [ ] Status counts update automatically (no page refresh)
- [ ] Recent activity shows new status change
- [ ] No page flicker or full reload

**Fallback Behavior:**
- [ ] If backend stops, connection shows "disconnected"
- [ ] Dashboard still displays last-loaded data
- [ ] No infinite error loops

---

## Responsive Design Testing

### Tablet View (768px)
- [ ] Resize browser to ~768px width
- [ ] Status cards stack appropriately
- [ ] Charts remain readable
- [ ] Table scrolls horizontally if needed
- [ ] Navigation remains accessible

### Desktop View (1024px)
- [ ] Resize browser to ~1024px width
- [ ] Metrics display in optimal grid
- [ ] Charts side-by-side
- [ ] No excessive whitespace

### Large Desktop (1440px+)
- [ ] Resize browser to 1440px+ width
- [ ] Layout utilizes space effectively
- [ ] Charts not stretched awkwardly
- [ ] Text remains readable

---

## Error Handling

### 1. API Error Scenarios
**Test:** Stop backend while frontend is running
- [ ] Dashboard shows error state (not blank page)
- [ ] Error message displayed: "Failed to load data"
- [ ] Retry button visible and functional
- [ ] Click retry → data loads when backend restarted

**Test:** Simulate 500 error from API
- [ ] Error handled gracefully
- [ ] User sees friendly error message
- [ ] No React crash/blank page

### 2. Empty State Scenarios
**Test:** Fresh database with no orders
- [ ] All counts show 0 (not loading forever)
- [ ] Charts show "No data available" message
- [ ] Recent activity shows "No recent activity"
- [ ] No console errors

**Test:** No data for specific time period
- [ ] Charts show "No data available"
- [ ] No JavaScript errors
- [ ] Other sections with data still render

### 3. Network Scenarios
**Test:** Slow network (Chrome DevTools → Network → Slow 3G)
- [ ] Loading spinners appear
- [ ] Dashboard doesn't crash
- [ ] Data loads eventually
- [ ] No timeout errors in console

---

## Performance Testing

### 1. Initial Load Time
- [ ] Dashboard loads in < 3 seconds (normal connection)
- [ ] No layout shifts (CLS) during load
- [ ] Progressive rendering (don't wait for all data)

### 2. Chart Rendering
- [ ] Charts render smoothly (no lag)
- [ ] Hover tooltips respond quickly
- [ ] No memory leaks (check Chrome DevTools → Memory)

### 3. Socket.IO Performance
- [ ] Updates happen within 1-2 seconds of data change
- [ ] No performance degradation over time
- [ ] Memory usage stable (no leaks)

---

## Accessibility Testing

### Keyboard Navigation
- [ ] Tab key navigates through interactive elements
- [ ] Focus indicators visible
- [ ] Enter/Space activates buttons

### Screen Reader (Optional)
- [ ] Chart titles announced
- [ ] Metric values announced
- [ ] Table structure navigable

---

## Cross-Browser Testing (Optional)

### Chrome
- [ ] All features work
- [ ] No console errors
- [ ] Charts render correctly

### Firefox
- [ ] All features work
- [ ] No console errors
- [ ] Charts render correctly

### Edge
- [ ] All features work
- [ ] No console errors
- [ ] Charts render correctly

### Safari (Mac/iOS - if available)
- [ ] All features work
- [ ] No console errors
- [ ] Charts render correctly

---

## Integration Testing Scenarios

### Scenario 1: New Order Created
1. [ ] Open dashboard
2. [ ] Create new order (via Inflow webhook or manual entry)
3. [ ] Verify dashboard updates:
   - [ ] "Picked" count increments
   - [ ] Recent activity shows new order
   - [ ] Charts update (if date-relevant)

### Scenario 2: Order Status Progression
1. [ ] Open dashboard
2. [ ] Advance order through workflow: Picked → QA → Pre-Delivery → In Delivery → Delivered
3. [ ] Verify for each transition:
   - [ ] Source status count decrements
   - [ ] Target status count increments
   - [ ] Recent activity logs the change
   - [ ] Status trends chart updates

### Scenario 3: Delivery Run Lifecycle
1. [ ] Open dashboard
2. [ ] Create new delivery run with 3 orders
3. [ ] Verify:
   - [ ] "Active Runs" increments
   - [ ] "In Delivery" count updates
   - [ ] Recent activity shows run creation
4. [ ] Complete delivery run
5. [ ] Verify:
   - [ ] "Active Runs" decrements
   - [ ] "Completed Today" increments
   - [ ] "Delivered" count increases by 3

### Scenario 4: Multiple Users
1. [ ] Open dashboard in User A's browser
2. [ ] Open dashboard in User B's browser
3. [ ] User A changes order status
4. [ ] Verify:
   - [ ] User B's dashboard updates automatically
   - [ ] Both see consistent data
   - [ ] No race conditions

---

## Security Testing

### Authentication
- [ ] Unauthenticated access redirects to login
- [ ] API endpoints return 401 without auth
- [ ] Session expires correctly (after 7 days default)
- [ ] Logout clears session

### Authorization
- [ ] All users can view dashboard (no role restrictions)
- [ ] Analytics endpoints accessible to authenticated users
- [ ] No unauthorized data leakage

---

## Final Checklist Before Deployment

- [ ] All critical tests passed
- [ ] No blocking bugs identified
- [ ] Performance acceptable
- [ ] Error handling robust
- [ ] Accessibility baseline met
- [ ] Code reviewed (if applicable)
- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Monitoring/logging in place

---

## Known Issues / Notes

**Document any issues discovered during testing:**

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Example: Chart tooltip flickers on fast hover | Low | Open | Non-blocking, cosmetic |
|  |  |  |  |

---

## Post-Deployment Verification

After deploying to production:
- [ ] Dashboard accessible at production URL
- [ ] All metrics load correctly
- [ ] Real-time updates work
- [ ] No console errors in production build
- [ ] Analytics endpoints respond quickly (<500ms)
- [ ] Mobile/tablet views work
- [ ] Monitor error logs for 24 hours

---

## Rollback Plan

If critical issues found:
1. Revert routing changes in `frontend/src/App.tsx`
2. Remove analytics blueprint registration in `backend/app/main.py`
3. Redeploy previous version
4. Document issues for fix

---

## Testing Sign-Off

**Tested By:** ___________________  
**Date:** ___________________  
**Build Version:** ___________________  
**Approval:** ___________________  

---

## Additional Resources

- **API Documentation:** See `backend/app/api/routes/analytics.py` for endpoint details
- **Component Documentation:** See `frontend/src/pages/Dashboard.tsx` for implementation
- **Architecture:** See README.md for system architecture
- **Troubleshooting:** Check Flask logs (`backend/`) and browser console for errors
