# TAMU Entra ID Authentication Setup Guide

This guide details how to set up the two Azure Applications required for the TechHub Delivery app:
1.  **SAML Application:** For user authentication via TAMU SSO.
2.  **Service Principal:** For backend operations (sending emails, SharePoint, Teams) via Microsoft Graph API.

---

## 1. SAML Application (User Authentication)

This application handles user login via TAMU's Single Sign-On.

### 1.1 Create App Registration
1.  Log in to the [Azure Portal](https://portal.azure.com) with your TAMU credentials.
2.  Navigate to **Microsoft Entra ID** -> **Enterprise applications** -> **New application**.
3.  Choose **Create your own application**.
4.  Name: `TechHub Delivery - User Auth` (or similar).
5.  Select **Integrate any other application you don't find in the gallery (Non-gallery)**.
6.  Click **Create**.

### 1.2 Configure Single Sign-On (SAML)
1.  In the app overview, go to **Single sign-on** -> **SAML**.
2.  **Basic SAML Configuration**:
    *   **Identifier (Entity ID):** `https://techhub.pythonanywhere.com`
    *   **Reply URL (Assertion Consumer Service URL):** `https://techhub.pythonanywhere.com/auth/saml/callback`
    *   **Sign on URL:** `https://techhub.pythonanywhere.com/auth/saml/login`
    *   **Logout Url:** `https://techhub.pythonanywhere.com/auth/logout`
3.  **Attributes & Claims**:
    Ensure the following claims are present (names might vary slightly, match your code):
    *   `user.displayname` -> `display_name`
    *   `user.userprincipalname` -> `email` (or `name_id`)
    *   `user.objectid` -> `oid` (Unique User ID)
    *   `user.department` -> `department` (Optional, may require admin approval)
    *   `user.employeeid` -> `employee_id` (Optional, may require admin approval)

### 1.3 Download Certificate & URLs
1.  In the **SAML Certificates** section, download **Certificate (Base64)**.
    *   Save this file as `saml_idp_cert.crt` in `backend/certs/` (create folder if needed).
    *   **Note:** This file is ignored by git for security. Upload manually to production.
2.  In the **Set up [App Name]** section, copy:
    *   **Login URL** -> Set as `SAML_IDP_SSO_URL` in `.env`.
    *   **Microsoft Entra Identifier** -> Set as `SAML_IDP_ENTITY_ID` in `.env`.

---

## 2. Service Principal (Backend Graph API)

This "daemon" application allows the backend to perform actions (email, file upload) without a signed-in user.

### 2.1 Create App Registration
1.  Navigate to **Microsoft Entra ID** -> **App registrations** -> **New registration**.
2.  Name: `TechHub Delivery - Backend Service`.
3.  Supported account types: **Accounts in this organizational directory only (Texas A&M University only - Single tenant)**.
4.  Redirect URI: Leave blank (not needed for Service Principal).
5.  Click **Register**.

### 2.2 Get Credentials
1.  **Client ID**: Copy **Application (client) ID** from the Overview page -> Set as `AZURE_CLIENT_ID` in `.env`.
2.  **Tenant ID**: Copy **Directory (tenant) ID** -> Set as `AZURE_TENANT_ID` in `.env`.
3.  **Client Secret**:
    *   Go to **Certificates & secrets** -> **New client secret**.
    *   Description: "Backend API Access".
    *   Expires: 24 months (recommended).
    *   **Copy the Value immediately** (you won't see it again) -> Set as `AZURE_CLIENT_SECRET` in `.env`.

### 2.3 API Permissions
Go to **API permissions** -> **Add a permission** -> **Microsoft Graph** -> **Application permissions** (NOT Delegated).

Add the following permissions:
*   `Mail.Send` (Send emails as any user - constrained to specific senders via Exchange policy if needed)
*   `Sites.ReadWrite.All` (Upload files to SharePoint)
*   `User.Read.All` (Look up user IDs for Teams messages)
*   `Chat.Create` (Create Teams chats - note: requires protected API access request usually)
*   `Chat.ReadWrite.All` (Send messages)

**Admin Consent**:
*   Click **Grant admin consent for Texas A&M University**.
*   **Note:** If you are not an admin, you must request this from TAMU IT Security (`cloudsecurity@tamu.edu` usually handles this). Provide the App ID and business justification.

---

## 3. Environment Configuration

Update your `.env` file with the gathered values:

```bash
# TAMU Entra ID Authentication
# ==============================================

# SAML Configuration
SAML_ENABLED=true
SAML_IDP_ENTITY_ID=<Microsoft Entra Identifier>
SAML_IDP_SSO_URL=<Login URL>
SAML_IDP_CERT_PATH=certs/saml_idp_cert.crt
SAML_SP_ENTITY_ID=https://techhub.pythonanywhere.com
SAML_ACS_URL=https://techhub.pythonanywhere.com/auth/saml/callback

# Service Principal Configuration
AZURE_TENANT_ID=<Directory (tenant) ID>
AZURE_CLIENT_ID=<Application (client) ID>
AZURE_CLIENT_SECRET=<Client Secret Value>
```
