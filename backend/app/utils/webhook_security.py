import base64
import hashlib
import hmac
import logging

logger = logging.getLogger(__name__)


def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """
    Verify webhook signature using HMAC SHA256.

    Args:
        payload: Raw request body bytes
        signature: Signature from webhook header (e.g., X-Inflow-Signature)
        secret: Shared secret for verification

    Returns:
        True if signature is valid, False otherwise
    """
    if not secret:
        logger.warning("No webhook secret configured, skipping signature verification")
        return True  # Allow if no secret configured (for development)

    if not signature:
        logger.warning("No signature provided in webhook request")
        return False

    try:
        # Handle Stripe-style secrets (whsec_ prefix)
        if secret.startswith("whsec_"):
            secret = secret[6:]  # Remove "whsec_" prefix

        # Common signature formats:
        # - "sha256=hexdigest"
        # - "sha256 hexdigest"
        # - Just the hexdigest
        # - Base64-encoded HMAC (x-inflow-hmac-sha256)
        normalized = signature.strip()
        if normalized.lower().startswith("sha256="):
            normalized = normalized.split("=", 1)[1].strip()
        elif normalized.lower().startswith("sha256 "):
            normalized = normalized.split(" ", 1)[1].strip()

        def matches_signature(secret_bytes: bytes) -> bool:
            logger.debug(
                "Verifying signature with secret length %s",
                len(secret_bytes)
            )
            digest = hmac.new(
                secret_bytes,
                payload,
                hashlib.sha256
            ).digest()
            computed_hex = digest.hex()
            computed_b64 = base64.b64encode(digest).decode("ascii")

            if hmac.compare_digest(normalized, computed_hex) or hmac.compare_digest(normalized, computed_b64):
                return True

            # Try base64 decoding for signatures without padding or with mixed casing.
            padded = normalized + "=" * (-len(normalized) % 4)
            try:
                decoded = base64.b64decode(padded, validate=False)
                return hmac.compare_digest(decoded, digest)
            except Exception:
                return False

        # Prefer raw secret bytes; optionally fall back to base64-decoded secrets
        raw_secret_bytes = secret.encode("utf-8")
        if matches_signature(raw_secret_bytes):
            return True

        secret_has_b64_markers = any(ch in secret for ch in "+/=")
        if secret_has_b64_markers:
            padded_secret = secret + "=" * (-len(secret) % 4)
            try:
                decoded_secret = base64.b64decode(padded_secret, validate=True)
                if matches_signature(decoded_secret):
                    return True
            except Exception:
                pass

        logger.warning("Webhook signature verification failed")
        return False
    except Exception as e:
        logger.error(f"Error verifying webhook signature: {e}", exc_info=True)
        return False
