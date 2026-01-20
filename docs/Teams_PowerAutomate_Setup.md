# Power Automate Flow Setup Guide

## Overview

This guide explains how to create a Power Automate flow that receives HTTP requests from the TechHub backend and sends Teams chat messages to order recipients.

## Step 1: Create the Flow

1. Go to [Power Automate](https://make.powerautomate.com)
2. Sign in with your TAMU account
3. Click **Create** → **Instant cloud flow**
4. Name it: `TechHub Delivery Notification`
5. Select **When an HTTP request is received** trigger
6. Click **Create**

## Step 2: Configure the HTTP Trigger

In the HTTP trigger, paste this JSON Schema:

```json
{
    "type": "object",
    "properties": {
        "recipientEmail": { "type": "string" },
        "recipientName": { "type": "string" },
        "orderNumber": { "type": "string" },
        "deliveryRunner": { "type": "string" },
        "timestamp": { "type": "string" },
        "estimatedTime": { "type": "string" },
        "orderItems": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["recipientEmail", "orderNumber", "deliveryRunner"]
}
```

## Step 3: Add Teams Action

1. Click **+ New step**
2. Search for **Microsoft Teams**
3. Select **Post message in a chat or channel**
4. Configure:
   - **Post as**: Flow bot
   - **Post in**: Chat with Flow bot
   - **Recipient**: `recipientEmail` (from dynamic content)
   - **Message**:

```
🚚 Your TechHub Order is On Its Way!

Hi @{triggerBody()?['recipientName']},

Your order **@{triggerBody()?['orderNumber']}** is now out for delivery!

**Delivery Runner:** @{triggerBody()?['deliveryRunner']}

Please ensure someone is available to receive the delivery.

---
*TechHub Technology Services*
```

## Step 4: Add Response Action

1. Click **+ New step**
2. Search for **Response**
3. Configure:
   - **Status Code**: 200
   - **Body**: `{"success": true}`

## Step 5: Save and Get URL

1. Click **Save**
2. Go back to the **HTTP trigger** step
3. Copy the **HTTP POST URL**
4. This is your `POWER_AUTOMATE_FLOW_URL`

## Step 6: Configure TechHub

Add to your `.env` file:

```env
TEAMS_RECIPIENT_NOTIFICATIONS_ENABLED=true
POWER_AUTOMATE_FLOW_URL=<paste your URL here>
```

## Step 7: Test

```powershell
python scripts/test_teams_recipient.py your-email@tamu.edu --force
```

## Troubleshooting

- **Flow not triggering?** Check the flow's run history in Power Automate
- **Teams message not appearing?** Ensure recipient has Teams and allow messages from apps
- **Permission errors?** May need to request Teams connector access from IT
