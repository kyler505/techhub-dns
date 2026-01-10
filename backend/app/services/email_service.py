"""
Email Service using TAMU authenticated SMTP relay.

Uses relay.tamu.edu:587 with TLS authentication.
Requires a shared NetID authorized for SMTP by TAMU security.

Configuration:
  SMTP_HOST=relay.tamu.edu
  SMTP_PORT=587
  SMTP_USERNAME=shared_netid@tamu.edu
  SMTP_PASSWORD=<password>
  SMTP_FROM_ADDRESS=techhub@tamu.edu
"""

import base64
import logging
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails via TAMU SMTP relay."""

    def __init__(self):
        self.from_name = settings.email_from_name

        # SMTP settings
        self.smtp_enabled = settings.smtp_enabled
        self.smtp_host = settings.smtp_host
        self.smtp_port = settings.smtp_port
        self.smtp_username = settings.smtp_username
        self.smtp_password = settings.smtp_password
        self.smtp_from_address = settings.smtp_from_address

    def is_configured(self) -> bool:
        """Check if SMTP is properly configured."""
        return bool(
            self.smtp_host and
            self.smtp_username and
            self.smtp_password and
            self.smtp_from_address
        )

    def send_email(
        self,
        to_address: str,
        subject: str,
        body_html: str,
        body_text: Optional[str] = None,
        attachment_name: Optional[str] = None,
        attachment_content: Optional[bytes] = None,
        attachment_type: str = "application/pdf",
        force: bool = False
    ) -> bool:
        """
        Send an email via TAMU SMTP relay.

        Args:
            to_address: Recipient email address
            subject: Email subject
            body_html: HTML body content
            body_text: Optional plain text body
            attachment_name: Optional attachment filename
            attachment_content: Optional attachment content as bytes
            attachment_type: MIME type of attachment
            force: If True, bypass the enabled check (for testing)

        Returns:
            True if email sent successfully, False otherwise
        """
        if not force and not self.smtp_enabled:
            logger.info("Email sending is disabled (SMTP_ENABLED=false)")
            return False

        if not self.is_configured():
            logger.warning("SMTP not configured. Set SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_ADDRESS in .env")
            return False

        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.smtp_from_address}>"
            msg['To'] = to_address

            # Add plain text and HTML parts
            if body_text:
                msg.attach(MIMEText(body_text, 'plain'))
            msg.attach(MIMEText(body_html, 'html'))

            # Add attachment if provided
            if attachment_name and attachment_content:
                attachment = MIMEApplication(attachment_content, Name=attachment_name)
                attachment['Content-Disposition'] = f'attachment; filename="{attachment_name}"'
                msg.attach(attachment)

            # Send via SMTP with TLS
            logger.info(f"Sending email to {to_address} via {self.smtp_host}:{self.smtp_port}")

            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=30) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.sendmail(self.smtp_from_address, [to_address], msg.as_string())

            logger.info(f"Email sent successfully to {to_address}")
            return True

        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed: {e}")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email: {e}")
            return False
        except Exception as e:
            logger.error(f"Error sending email: {e}")
            return False

    def send_order_details_email(
        self,
        to_address: str,
        order_number: str,
        customer_name: str,
        pdf_content: bytes,
        force: bool = False
    ) -> bool:
        """
        Send Order Details PDF email to recipient.

        Args:
            to_address: Recipient email address
            order_number: The order number (e.g., TH4013)
            customer_name: Customer's display name
            pdf_content: Order Details PDF as bytes
            force: If True, bypass the enabled check (for testing)

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

Important: Do not edit preliminary asset information.

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
            force=force
        )


# Singleton instance
email_service = EmailService()
