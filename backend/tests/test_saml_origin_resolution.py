import os
from pathlib import Path
import sys

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.saml_auth_service import _resolve_public_origin


def test_resolve_public_origin_prefers_matching_configured_origin() -> None:
    assert _resolve_public_origin(
        "https://techhub.pythonanywhere.com",
        "https://techhub.pythonanywhere.com",
    ) == "https://techhub.pythonanywhere.com"


def test_resolve_public_origin_falls_back_to_frontend_when_hosts_differ() -> None:
    assert _resolve_public_origin(
        "https://techhub.pythonanywhere.com",
        "https://dev-techhub.pythonanywhere.com",
    ) == "https://dev-techhub.pythonanywhere.com"


def test_resolve_public_origin_uses_frontend_when_configured_missing() -> None:
    assert _resolve_public_origin(None, "https://dev-techhub.pythonanywhere.com") == "https://dev-techhub.pythonanywhere.com"


def test_resolve_public_origin_falls_back_to_configured_when_frontend_missing() -> None:
    assert _resolve_public_origin("https://techhub.pythonanywhere.com", None) == "https://techhub.pythonanywhere.com"


if __name__ == "__main__":
    test_resolve_public_origin_prefers_matching_configured_origin()
    print("[PASS] matching configured origin preserved")
    test_resolve_public_origin_falls_back_to_frontend_when_hosts_differ()
    print("[PASS] mismatched origin falls back to frontend")
    test_resolve_public_origin_uses_frontend_when_configured_missing()
    print("[PASS] frontend origin used when configured missing")
    test_resolve_public_origin_falls_back_to_configured_when_frontend_missing()
    print("[PASS] configured origin used when frontend missing")
    print("[SUCCESS] SAML origin resolution regressions passed")
