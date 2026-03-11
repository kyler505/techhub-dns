# TanStack Query migration plan

## Goal

Introduce TanStack Query as the frontend server-state layer without rewriting the existing API client modules or real-time socket flows.

## Why this slice

The highest-friction server-state flows are the orders queue and order detail pages:

- `frontend/src/pages/Orders.tsx` manually debounces filters, fetches multiple queue endpoints, and reloads after updates.
- `frontend/src/pages/OrderDetailPage.tsx` manually fetches order detail and audit history, then repeats that fetch after every mutation.

These screens are the best first slice because they already centralize around `frontend/src/api/orders.ts` and they benefit immediately from shared caching and invalidation.

## Phase 1: foundation and first slice

1. Install `@tanstack/react-query`.
2. Add a shared `QueryClient` and wrap the app in `QueryClientProvider`.
3. Create order query keys and query helpers around `frontend/src/api/orders.ts`.
4. Migrate the orders queue page to `useQuery` and `useMutation`.
5. Migrate the order detail page to `useQuery` and `useMutation`.
6. Keep the existing socket hooks, but use them to invalidate or refresh relevant queries.

## Phase 2: expand high-value consumers

After the first slice is stable, move the next manual server-state flows that already use repeated reload patterns:

- `frontend/src/pages/TagRequest.tsx`
- `frontend/src/hooks/useDeliveryRun.ts`
- `frontend/src/hooks/useDeliveryRuns.ts`

Recommended follow-up patterns:

- Add query key factories per resource (`orders`, `deliveryRuns`, `settings`).
- Move page-local fetch logic into resource query hooks.
- Standardize mutation success handling around `invalidateQueries`.

## Phase 3: tighten cache behavior

Once the main screens use TanStack Query consistently:

- Tune `staleTime` by workflow (orders queues vs. slower-changing admin screens).
- Push socket updates into cache with `queryClient.setQueryData` where that is cheaper than invalidation.
- Add global retry/error defaults only after observing actual failure patterns.

## Guardrails

- Keep local UI state local; do not move form-only state into TanStack Query.
- Keep `frontend/src/api/client.ts` and `frontend/src/api/*` as the backend boundary.
- Prefer incremental migration over a repo-wide fetch rewrite.
- Do not replace WebSocket behavior with polling.

## Definition of done for Phase 1

- Orders list/detail fetch through TanStack Query.
- Status changes and detail actions invalidate the right order queries.
- Socket-driven updates refresh the list/detail views.
- Frontend lint and build pass.
