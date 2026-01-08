"""
Email Service for sending Order Details PDFs via SMTP.
"""

import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from typing import Optional, List, Tuple
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails via SMTP."""

    def __init__(self):
        self.host = settings.smtp_host
        self.port = settings.smtp_port
        self.user = settings.smtp_user
        self.password = settings.smtp_password
        self.from_address = settings.email_from_address
        self.from_name = settings.email_from_name
        self.use_tls = settings.smtp_use_tls

    def _is_configured(self) -> bool:
        """Check if SMTP is properly configured."""
        return bool(self.host and self.port)

    def send_email(
        self,
        to_address: str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None,
        attachments: Optional[List[Tuple[str, bytes, str]]] = None
    ) -> bool:
        """
        Send an email with optional attachments.

        Args:
            to_address: Recipient email address
            subject: Email subject
            body_text: Plain text body
            body_html: Optional HTML body
            attachments: Optional list of (filename, content, mime_type) tuples

        Returns:
            True if email sent successfully, False otherwise
        """
        if not self._is_configured():
            logger.warning("SMTP not configured, skipping email send")
            return False

        if not to_address:
            logger.warning("No recipient email address provided")
            return False

        try:
            # Create message
            msg = MIMEMultipart('mixed')
            msg['From'] = f"{self.from_name} <{self.from_address}>" if self.from_name else self.from_address
            msg['To'] = to_address
            msg['Subject'] = subject

            # Create alternative part for text/html
            msg_alt = MIMEMultipart('alternative')

            # Add plain text
            msg_alt.attach(MIMEText(body_text, 'plain'))

            # Add HTML if provided
            if body_html:
                msg_alt.attach(MIMEText(body_html, 'html'))

            msg.attach(msg_alt)

            # Add attachments
            if attachments:
                for filename, content, mime_type in attachments:
                    part = MIMEApplication(content, Name=filename)
                    part['Content-Disposition'] = f'attachment; filename="{filename}"'
                    msg.attach(part)

            # Connect and send
            if self.use_tls:
                server = smtplib.SMTP(self.host, self.port)
                server.starttls()
            else:
                server = smtplib.SMTP(self.host, self.port)

            if self.user and self.password:
                server.login(self.user, self.password)

            server.sendmail(self.from_address, [to_address], msg.as_string())
            server.quit()

            logger.info(f"Email sent successfully to {to_address}")
            return True

        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email to {to_address}: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to send email to {to_address}: {e}")
            return False

    def send_order_details_email(
        self,
        to_address: str,
        order_number: str,
        customer_name: str,
        pdf_content: bytes
    ) -> bool:
        """
        Send Order Details PDF email to a recipient.

        Args:
            to_address: Recipient email address
            order_number: Order number for subject line
            customer_name: Customer name for greeting
            pdf_content: PDF file content as bytes

        Returns:
            True if email sent successfully
        """
        subject = f"Your Order Details - {order_number}"

        body_text = f"""Dear {customer_name or 'Valued Customer'},

Thank you for your order through TechHub!

Please find attached the Order Details document for your order {order_number}.

This document contains:
- Your order information and PO number
- Line item details with pricing
- Order totals

If you have any questions about your order, please contact TechHub at techhub@tamu.edu.

Best regards,
TechHub Technology Services
Texas A&M University
"""

        body_html = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .header {{ color: #500000; }}
        .footer {{ margin-top: 20px; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <p>Dear {customer_name or 'Valued Customer'},</p>

    <p>Thank you for your order through TechHub!</p>

    <p>Please find attached the <strong>Order Details</strong> document for your order <strong>{order_number}</strong>.</p>

    <p>This document contains:</p>
    <ul>
        <li>Your order information and PO number</li>
        <li>Line item details with pricing</li>
        <li>Order totals</li>
    </ul>

    <p>If you have any questions about your order, please contact TechHub at
    <a href="mailto:techhub@tamu.edu">techhub@tamu.edu</a>.</p>

    <p>Best regards,<br>
    <strong>TechHub Technology Services</strong><br>
    Texas A&M University</p>

    <div class="footer">
        <hr>
        <p>This is an automated message from TechHub. Please do not reply directly to this email.</p>
    </div>
</body>
</html>
"""

        attachments = [
            (f"OrderDetails_{order_number}.pdf", pdf_content, "application/pdf")
        ]

        return self.send_email(
            to_address=to_address,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            attachments=attachments
        )


# Singleton instance
email_service = EmailService()
