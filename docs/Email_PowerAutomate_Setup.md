# Power Automate Email Flow Setup Guide

## Overview

This guide explains how to create a Power Automate flow that receives HTTP requests from TechHub and sends emails with PDF attachments via Outlook.

---

## Step 1: Create the Flow

1. Go to [Power Automate](https://make.powerautomate.com)
2. Sign in with your TAMU account
3. Click **Create** → **Instant cloud flow**
4. Name it: `TechHub Email Sender`
5. Select **When an HTTP request is received** trigger
6. Click **Create**

---

## Step 2: Configure the HTTP Trigger

In the HTTP trigger, paste this JSON Schema:

```json
{
    "type": "object",
    "properties": {
        "to": { "type": "string" },
        "subject": { "type": "string" },
        "bodyHtml": { "type": "string" },
        "bodyText": { "type": "string" },
        "fromName": { "type": "string" },
        "attachmentName": { "type": "string" },
        "attachmentContentBase64": { "type": "string" },
        "attachmentType": { "type": "string" }
    },
    "required": ["to", "subject", "bodyHtml"]
}
```

---

## Step 3: Add "Send an Email (V2)" Action

1. Click **+ New step**
2. Search for **Office 365 Outlook**
3. Select **Send an email (V2)**
4. Configure:
   - **To**: `@{triggerBody()?['to']}`
   - **Subject**: `@{triggerBody()?['subject']}`
   - **Body**: `@{triggerBody()?['bodyHtml']}`
   - Click **Show advanced options**
   - **Is HTML**: Yes

---

## Step 4: Add Attachment (Condition)

1. Click **+ New step**
2. Add **Condition**: `triggerBody()?['attachmentName']` is not equal to `null`
3. In **If yes** branch:
   - Add **Send an email (V2)** with attachment:
     - Configure same as above
     - **Attachments Name - 1**: `@{triggerBody()?['attachmentName']}`
     - **Attachments Content - 1**: `@{base64ToBinary(triggerBody()?['attachmentContentBase64'])}`

**Simpler Alternative:** Use a single "Send an email" with optional attachment using expressions.

---

## Step 5: Add Response Action

1. Click **+ New step** (after email actions)
2. Search for **Response**
3. Configure:
   - **Status Code**: 200
   - **Body**: `{"success": true}`

---

## Step 6: Save and Get URL

1. Click **Save**
2. Go back to the **HTTP trigger** step
3. Copy the **HTTP POST URL**

---

## Step 7: Configure TechHub

Add to your `.env` file:

```env
POWER_AUTOMATE_EMAIL_ENABLED=true
POWER_AUTOMATE_EMAIL_FLOW_URL=<paste your URL here>
```

---

## Step 8: Test

```powershell
python scripts/test_order_details.py TH3969 your-email@tamu.edu
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Flow not triggering | Check run history in Power Automate |
| Email not arriving | Check spam/junk folder |
| Attachment missing | Verify base64 encoding in payload |
| Permission errors | Ensure Outlook connector is authorized |

---

## Notes

- This flow uses your TAMU account to send emails
- The "From" address will be your TAMU email
- Attachments are sent as base64-encoded content
