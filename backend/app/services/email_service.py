"""
Email Service using Power Automate HTTP trigger.

This service sends emails via a Power Automate flow that handles
the actual email sending through Outlook/Exchange.
"""

import base64
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails via Power Automate flow."""

    def __init__(self):
        self.enabled = settings.power_automate_email_enabled
        self.flow_url = settings.power_automate_email_flow_url
        self.from_name = settings.email_from_name

    def is_configured(self) -> bool:
        """Check if email sending is properly configured."""
        return bool(self.enabled and self.flow_url)

    def send_email(
        self,
        to_address: str,
        subject: str,
        body_html: str,
        body_text: Optional[str] = None,
        attachment_name: Optional[str] = None,
        attachment_content: Optional[bytes] = None,
        attachment_type: str = "application/pdf"
    ) -> bool:
        """
        Send an email via Power Automate flow.

        Args:
            to_address: Recipient email address
            subject: Email subject
            body_html: HTML body content
            body_text: Optional plain text body (fallback)
            attachment_name: Optional attachment filename
            attachment_content: Optional attachment content as bytes
            attachment_type: MIME type of attachment

        Returns:
            True if email sent successfully, False otherwise
        """
        if not self.enabled:
            logger.info("Power Automate email is disabled")
            return False

        if not self.flow_url:
            logger.warning("Power Automate email flow URL not configured")
            return False

        # Build payload for Power Automate
        payload = {
            "to": to_address,
            "subject": subject,
            "bodyHtml": body_html,
            "bodyText": body_text or "",
            "fromName": self.from_name,
        }

        # Add attachment if provided
        if attachment_name and attachment_content:
            payload["attachmentName"] = attachment_name
            payload["attachmentContentBase64"] = base64.b64encode(attachment_content).decode("utf-8")
            payload["attachmentType"] = attachment_type

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    self.flow_url,
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )

                if response.status_code in (200, 202):
                    logger.info(f"Email sent successfully to {to_address}")
                    return True
                else:
                    logger.error(
                        f"Power Automate email flow returned {response.status_code}: {response.text}"
                    )
                    return False

        except httpx.TimeoutException:
            logger.error(f"Timeout sending email to {to_address}")
            return False
        except httpx.RequestError as e:
            logger.error(f"Error sending email: {e}")
            return False

    def send_order_details_email(
        self,
        to_address: str,
        order_number: str,
        customer_name: str,
        pdf_content: bytes
    ) -> bool:
        """
        Send Order Details PDF email to recipient.

        Args:
            to_address: Recipient email address
            order_number: The order number (e.g., TH4013)
            customer_name: Customer's display name
            pdf_content: Order Details PDF as bytes

        Returns:
            True if email sent successfully, False otherwise
        """
        subject = f"TechHub Order Details - {order_number}"

        body_html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #500000;">Your TechHub Order Details</h2>
            <p>Dear {customer_name},</p>
            <p>Thank you for your order with TechHub Technology Services.</p>
            <p>Please find attached your <strong>Order Details</strong> document for order <strong>{order_number}</strong>.</p>
            <p><em>Important:</em> Do not edit preliminary asset information. Editing preliminary asset information may result in items on your order arriving without asset tags.</p>
            <hr style="border: 1px solid #ddd; margin: 20px 0;">
            <p style="font-size: 12px; color: #666;">
                This is an automated message from TechHub Technology Services.<br>
                WCDC - TechHub | 474 Agronomy Rd | College Station, TX 77843
            </p>
        </body>
        </html>
        """

        body_text = f"""
Your TechHub Order Details

Dear {customer_name},

Thank you for your order with TechHub Technology Services.

Please find attached your Order Details document for order {order_number}.

Important: Do not edit preliminary asset information. Editing preliminary asset information may result in items on your order arriving without asset tags.

---
TechHub Technology Services
WCDC - TechHub | 474 Agronomy Rd | College Station, TX 77843
        """

        return self.send_email(
            to_address=to_address,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
            attachment_name=f"OrderDetails_{order_number}.pdf",
            attachment_content=pdf_content,
            attachment_type="application/pdf"
        )


# Singleton instance
email_service = EmailService()
