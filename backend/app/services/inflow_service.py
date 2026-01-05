import httpx
from typing import Optional, List, Dict, Any
import logging
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from app.config import settings
from azure.identity import InteractiveBrowserCredential
from azure.keyvault.secrets import SecretClient

logger = logging.getLogger(__name__)


class InflowService:
    def __init__(self):
        self.base_url = settings.inflow_api_url
        self.company_id = settings.inflow_company_id
        self.api_key = self._get_api_key()
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json;version=2024-03-12"
        }

    def _get_api_key(self) -> str:
        """Get API key from Azure Key Vault or environment variable"""
        if settings.inflow_api_key:
            return settings.inflow_api_key

        if settings.azure_key_vault_url:
            try:
                credential = InteractiveBrowserCredential(additionally_allowed_tenants=["*"])
                kv_client = SecretClient(vault_url=settings.azure_key_vault_url, credential=credential)
                secret = kv_client.get_secret("inflow-API-key-new")
                return secret.value
            except Exception as e:
                raise ValueError(f"Failed to get API key from Key Vault: {e}")

        raise ValueError("INFLOW_API_KEY or AZURE_KEY_VAULT_URL must be set")

    async def fetch_orders(
        self,
        inventory_status: Optional[str] = None,
        is_active: bool = True,
        order_number: Optional[str] = None,
        count: int = 100,
        skip: int = 0,
        sort: str = "orderDate",
        sort_desc: bool = True
    ) -> List[Dict[str, Any]]:
        """Fetch orders from Inflow API"""
        url = f"{self.base_url}/{self.company_id}/sales-orders"

        params = {
            "include": "pickLines.product,shipLines,packLines.product,lines",
            "filter[isActive]": str(is_active).lower(),
            "count": str(count),
            "skip": str(skip),
            "sort": sort,
            "sortDesc": str(sort_desc).lower()
        }

        if inventory_status:
            params["filter[inventoryStatus][]"] = inventory_status

        if order_number:
            params["filter[orderNumber]"] = order_number

        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, headers=self.headers)
            response.raise_for_status()
            data = response.json()

            # Handle both dict with 'items' key and list response
            if isinstance(data, dict) and "items" in data:
                return data["items"]
            elif isinstance(data, list):
                return data
            else:
                return []

    async def get_order_by_number(self, order_number: str) -> Optional[Dict[str, Any]]:
        """Fetch a specific order by order number"""
        orders = await self.fetch_orders(order_number=order_number, count=1)
        if orders:
            return orders[0]
        return None

    async def sync_recent_started_orders(
        self,
        max_pages: int = 3,
        per_page: int = 100,
        target_matches: int = 100
    ) -> List[Dict[str, Any]]:
        """Sync recent unfulfilled orders, filtering for 'started' status AND pickLines"""
        matches = []

        for page in range(max_pages):
            orders = await self.fetch_orders(
                inventory_status="unfulfilled",
                count=per_page,
                skip=page * per_page
            )

            # Filter for 'started' status AND pickLines exist
            for order in orders:
                if self.is_started_and_picked(order):
                    matches.append(order)
                    if len(matches) >= target_matches:
                        return matches

            if len(orders) < per_page:
                break  # No more pages

        return matches

    def is_strict_started(self, order: Dict[str, Any]) -> bool:
        """Check if order has inventoryStatus='started' (case-insensitive)"""
        return str(order.get("inventoryStatus", "")).strip().lower() == "started"

    def is_started_and_picked(self, order: Dict[str, Any]) -> bool:
        """Check if order has started status AND has pickLines (ready for TechHub)"""
        return (
            self.is_strict_started(order) and
            bool(order.get("pickLines"))
        )

    async def get_order_by_id(self, sales_order_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a specific order by sales order ID (UUID)."""
        url = f"{self.base_url}/{self.company_id}/sales-orders/{sales_order_id}"
        params = {
            "include": "pickLines.product,shipLines,packLines.product,lines"
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, params=params, headers=self.headers)
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    return None
                logger.error(f"Failed to fetch order {sales_order_id}: {e.response.status_code} - {e.response.text}")
                raise

            data = response.json()

            if isinstance(data, dict) and "items" in data:
                return data["items"][0] if data["items"] else None
            if isinstance(data, list):
                return data[0] if data else None
            return data

    async def fulfill_sales_order(self, sales_order_id: str, db: Session = None, user_id: str = None) -> Dict[str, Any]:
        """
        Fulfill a sales order by ensuring pickLines, packLines, and shipLines are populated.
        Based on inFlow docs: inventoryStatus becomes fulfilled when all products are in pickLines
        and, for shippable orders, packLines/shipLines are present.
        """
        from app.services.audit_service import AuditService

        order = await self.get_order_by_id(sales_order_id)
        if not order:
            raise ValueError(f"Sales order {sales_order_id} not found in Inflow")

        # Require actual pickLines - don't create them artificially
        if not order.get("pickLines"):
            order_number = order.get("orderNumber") or sales_order_id
            raise ValueError(f"Order {order_number} has no pickLines - items were not picked from inventory")

        if not order.get("customerId"):
            raise ValueError("Sales order missing customerId; cannot fulfill")

        now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        order_number = order.get("orderNumber") or sales_order_id
        container_number = f"DELIVERY-{order_number}"

        def positive_quantity(line: Dict[str, Any]) -> bool:
            qty = line.get("quantity", {})
            raw = qty.get("standardQuantity")
            if raw is None:
                return False
            try:
                return float(raw) > 0
            except (TypeError, ValueError):
                return False

        # pickLines validation is now done above - they must exist

        if not order.get("packLines"):
            pack_lines = []
            for line in order.get("lines", []):
                if not positive_quantity(line):
                    continue
                pack_lines.append({
                    "salesOrderPackLineId": str(uuid.uuid4()),
                    "productId": line.get("productId"),
                    "quantity": line.get("quantity"),
                    "description": line.get("description"),
                    "containerNumber": container_number,
                })
            order["packLines"] = pack_lines

        if not order.get("shipLines") and order.get("packLines"):
            order["shipLines"] = [{
                "salesOrderShipLineId": str(uuid.uuid4()),
                "carrier": "TechHub",
                "containers": list({line.get("containerNumber") for line in order["packLines"] if line.get("containerNumber")}),
                "shippedDate": now,
            }]

        url = f"{self.base_url}/{self.company_id}/sales-orders"
        async with httpx.AsyncClient() as client:
            response = await client.put(url, json=order, headers=self.headers)
            response.raise_for_status()
            result = response.json()

            # Audit logging for inFlow fulfillment
            if db:
                audit_service = AuditService(db)
                audit_service.log_action(
                    entity_type="inflow_order",
                    entity_id=sales_order_id,
                    action="fulfilled",
                    user_id=user_id,
                    description=f"Order fulfilled in inFlow system",
                    audit_metadata={
                        "inflow_order_number": order.get("orderNumber"),
                        "pick_lines_count": len(order.get("pickLines", [])),
                        "pack_lines_count": len(order.get("packLines", [])),
                        "ship_lines_count": len(order.get("shipLines", []))
                    }
                )

            return result

    async def register_webhook(self, webhook_url: str, events: List[str]) -> Dict[str, Any]:
        """
        Register a webhook with Inflow API.

        Args:
            webhook_url: Public URL for webhook endpoint
            events: List of events to subscribe to (e.g., ["orderCreated", "orderUpdated"])

        Returns:
            Webhook registration response from Inflow
        """
        import uuid

        url = f"{self.base_url}/{self.company_id}/webhooks"

        # Generate a WebHookSubscriptionId for new webhook registration
        # Inflow API requires this field for PUT requests
        webhook_subscription_id = str(uuid.uuid4())

        # Map event names to Inflow's expected format
        # Inflow uses salesOrder.created, salesOrder.updated for order events
        event_mapping = {
            "orderCreated": "salesOrder.created",
            "orderUpdated": "salesOrder.updated",
            "orderStatusChanged": "salesOrder.updated"
        }

        # Map events to Inflow's format, fallback to original if no mapping exists
        mapped_events = [event_mapping.get(e, e) for e in events]
        mapped_events = list(dict.fromkeys(mapped_events))

        payload = {
            "webHookSubscriptionId": webhook_subscription_id,
            "url": webhook_url,
            "events": mapped_events
        }

        async with httpx.AsyncClient() as client:
            try:
                # Inflow API uses PUT for webhook registration (idempotent create/update)
                response = await client.put(url, json=payload, headers=self.headers)
                response.raise_for_status()
                result = response.json()
                logger.info(f"Webhook registered successfully: {result.get('id', 'unknown')}")
                return result
            except httpx.HTTPStatusError as e:
                logger.error(f"Failed to register webhook: {e.response.status_code} - {e.response.text}")
                raise
            except Exception as e:
                logger.error(f"Error registering webhook: {e}", exc_info=True)
                raise

    async def list_webhooks(self) -> List[Dict[str, Any]]:
        """
        List all registered webhooks for this company.

        Returns:
            List of webhook registrations
        """
        url = f"{self.base_url}/{self.company_id}/webhooks"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers)
                response.raise_for_status()
                data = response.json()

                # Handle both dict with 'items' key and list response
                if isinstance(data, dict) and "items" in data:
                    return data["items"]
                elif isinstance(data, list):
                    return data
                else:
                    return []
            except httpx.HTTPStatusError as e:
                logger.error(f"Failed to list webhooks: {e.response.status_code} - {e.response.text}")
                raise
            except Exception as e:
                logger.error(f"Error listing webhooks: {e}", exc_info=True)
                raise

    async def delete_webhook(self, webhook_id: str) -> bool:
        """
        Delete a webhook registration from Inflow.

        Args:
            webhook_id: Inflow's webhook ID

        Returns:
            True if successful
        """
        url = f"{self.base_url}/{self.company_id}/webhooks/{webhook_id}"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.delete(url, headers=self.headers)
                response.raise_for_status()
                logger.info(f"Webhook {webhook_id} deleted successfully")
                return True
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    logger.warning(f"Webhook {webhook_id} not found")
                    return False
                logger.error(f"Failed to delete webhook: {e.response.status_code} - {e.response.text}")
                raise
            except Exception as e:
                logger.error(f"Error deleting webhook: {e}", exc_info=True)
                raise

    def verify_webhook_signature(
        self,
        payload: bytes,
        signature: str,
        secret: Optional[str] = None
    ) -> bool:
        """
        Verify webhook signature using configured secret.

        Args:
            payload: Raw request body bytes
            signature: Signature from webhook header

        Returns:
            True if signature is valid
        """
        from app.utils.webhook_security import verify_webhook_signature as verify_signature
        secret_to_use = secret or settings.inflow_webhook_secret
        return verify_signature(payload, signature, secret_to_use) if secret_to_use else True

    # ========== SYNC VERSIONS FOR FLASK ==========

    def fetch_orders_sync(
        self,
        inventory_status: Optional[str] = None,
        is_active: bool = True,
        order_number: Optional[str] = None,
        count: int = 100,
        skip: int = 0,
        sort: str = "orderDate",
        sort_desc: bool = True
    ) -> List[Dict[str, Any]]:
        """Fetch orders from Inflow API (sync version)"""
        url = f"{self.base_url}/{self.company_id}/sales-orders"

        params = {
            "include": "pickLines.product,shipLines,packLines.product,lines",
            "filter[isActive]": str(is_active).lower(),
            "count": str(count),
            "skip": str(skip),
            "sort": sort,
            "sortDesc": str(sort_desc).lower()
        }

        if inventory_status:
            params["filter[inventoryStatus][]"] = inventory_status

        if order_number:
            params["filter[orderNumber]"] = order_number

        with httpx.Client() as client:
            response = client.get(url, params=params, headers=self.headers)
            response.raise_for_status()
            data = response.json()

            if isinstance(data, dict) and "items" in data:
                return data["items"]
            elif isinstance(data, list):
                return data
            else:
                return []

    def get_order_by_number_sync(self, order_number: str) -> Optional[Dict[str, Any]]:
        """Fetch a specific order by order number (sync version)"""
        orders = self.fetch_orders_sync(order_number=order_number, count=1)
        if orders:
            return orders[0]
        return None

    def sync_recent_started_orders_sync(
        self,
        max_pages: int = 3,
        per_page: int = 100,
        target_matches: int = 100
    ) -> List[Dict[str, Any]]:
        """Sync recent unfulfilled orders (sync version)"""
        matches = []

        for page in range(max_pages):
            orders = self.fetch_orders_sync(
                inventory_status="unfulfilled",
                count=per_page,
                skip=page * per_page
            )

            for order in orders:
                if self.is_started_and_picked(order):
                    matches.append(order)
                    if len(matches) >= target_matches:
                        return matches

            if len(orders) < per_page:
                break

        return matches

    def get_order_by_id_sync(self, sales_order_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a specific order by sales order ID (sync version)"""
        url = f"{self.base_url}/{self.company_id}/sales-orders/{sales_order_id}"
        params = {"include": "pickLines.product,shipLines,packLines.product,lines"}

        with httpx.Client() as client:
            try:
                response = client.get(url, params=params, headers=self.headers)
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    return None
                raise

            data = response.json()
            if isinstance(data, dict) and "items" in data:
                return data["items"][0] if data["items"] else None
            if isinstance(data, list):
                return data[0] if data else None
            return data

    def fulfill_sales_order_sync(self, sales_order_id: str, db: Session = None, user_id: str = None) -> Dict[str, Any]:
        """Fulfill a sales order (sync version)"""
        from app.services.audit_service import AuditService

        order = self.get_order_by_id_sync(sales_order_id)
        if not order:
            raise ValueError(f"Sales order {sales_order_id} not found in Inflow")

        if not order.get("pickLines"):
            order_number = order.get("orderNumber") or sales_order_id
            raise ValueError(f"Order {order_number} has no pickLines")

        if not order.get("customerId"):
            raise ValueError("Sales order missing customerId")

        now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        order_number = order.get("orderNumber") or sales_order_id
        container_number = f"DELIVERY-{order_number}"

        def positive_quantity(line: Dict[str, Any]) -> bool:
            qty = line.get("quantity", {})
            raw = qty.get("standardQuantity")
            if raw is None:
                return False
            try:
                return float(raw) > 0
            except (TypeError, ValueError):
                return False

        if not order.get("packLines"):
            pack_lines = []
            for line in order.get("lines", []):
                if not positive_quantity(line):
                    continue
                pack_lines.append({
                    "salesOrderPackLineId": str(uuid.uuid4()),
                    "productId": line.get("productId"),
                    "quantity": line.get("quantity"),
                    "description": line.get("description"),
                    "containerNumber": container_number,
                })
            order["packLines"] = pack_lines

        if not order.get("shipLines") and order.get("packLines"):
            order["shipLines"] = [{
                "salesOrderShipLineId": str(uuid.uuid4()),
                "carrier": "TechHub",
                "containers": list({line.get("containerNumber") for line in order["packLines"] if line.get("containerNumber")}),
                "shippedDate": now,
            }]

        url = f"{self.base_url}/{self.company_id}/sales-orders"
        with httpx.Client() as client:
            response = client.put(url, json=order, headers=self.headers)
            response.raise_for_status()
            result = response.json()

            if db:
                audit_service = AuditService(db)
                audit_service.log_action(
                    entity_type="inflow_order",
                    entity_id=sales_order_id,
                    action="fulfilled",
                    user_id=user_id,
                    description="Order fulfilled in inFlow system",
                    audit_metadata={
                        "inflow_order_number": order.get("orderNumber"),
                        "pick_lines_count": len(order.get("pickLines", [])),
                        "pack_lines_count": len(order.get("packLines", [])),
                        "ship_lines_count": len(order.get("shipLines", []))
                    }
                )

            return result

    def register_webhook_sync(self, webhook_url: str, events: List[str]) -> Dict[str, Any]:
        """Register a webhook with Inflow API (sync version)"""
        url = f"{self.base_url}/{self.company_id}/webhooks"
        webhook_subscription_id = str(uuid.uuid4())

        event_mapping = {
            "orderCreated": "salesOrder.created",
            "orderUpdated": "salesOrder.updated",
            "orderStatusChanged": "salesOrder.updated"
        }

        mapped_events = [event_mapping.get(e, e) for e in events]
        mapped_events = list(dict.fromkeys(mapped_events))

        payload = {
            "webHookSubscriptionId": webhook_subscription_id,
            "url": webhook_url,
            "events": mapped_events
        }

        with httpx.Client() as client:
            response = client.put(url, json=payload, headers=self.headers)
            response.raise_for_status()
            result = response.json()
            logger.info(f"Webhook registered successfully: {result.get('id', 'unknown')}")
            return result

    def list_webhooks_sync(self) -> List[Dict[str, Any]]:
        """List all registered webhooks (sync version)"""
        url = f"{self.base_url}/{self.company_id}/webhooks"

        with httpx.Client() as client:
            response = client.get(url, headers=self.headers)
            response.raise_for_status()
            data = response.json()

            if isinstance(data, dict) and "items" in data:
                return data["items"]
            elif isinstance(data, list):
                return data
            else:
                return []

    def delete_webhook_sync(self, webhook_id: str) -> bool:
        """Delete a webhook registration (sync version)"""
        url = f"{self.base_url}/{self.company_id}/webhooks/{webhook_id}"

        with httpx.Client() as client:
            try:
                response = client.delete(url, headers=self.headers)
                response.raise_for_status()
                logger.info(f"Webhook {webhook_id} deleted successfully")
                return True
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    logger.warning(f"Webhook {webhook_id} not found")
                    return False
                raise
