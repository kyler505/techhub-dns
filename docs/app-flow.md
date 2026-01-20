# TechHub Delivery Workflow App

**Product Requirements Document (PRD)**

## 1. Overview

The TechHub Delivery Workflow App is an internal system that manages the full lifecycle of hardware orders from **picked** in inFlow through **delivery, signature capture, QA documentation, and final fulfillment**.

The goal is to replace fragmented scripts, Google Forms, and manual document handling with a **single, auditable, end-to-end workflow**.

---

## 2. Goals

* Centralize all delivery prep, execution, and documentation in one app
* Enforce required steps before delivery (tagging, picklist, QA)
* Eliminate Google Forms dependency
* Provide clear delivery run tracking and accountability
* Ensure signed and QA’d documentation is bundled and verified before inFlow fulfillment
* Reduce human error and missing documentation

---

## 3. Non-Goals

* Route optimization or GPS tracking
* External recipient-facing portal
* Fully automated QA validation (QA remains human-driven)
* Replacing inFlow as the source of truth for inventory

---

## 4. Order Lifecycle & Status Model

### Order Classification & Status Flows

Orders are automatically classified based on shipping destination:

#### Local Delivery Orders (Bryan/College Station)
```
Picked → Pre-Delivery → In Delivery → Delivered
```

#### Shipping Orders (Outside Bryan/College Station)
```
Picked → Pre-Delivery → Shipping → Delivered
```

### Status Definitions

* **Picked**

  * Order pulled from inFlow after being picked
  * Awaiting internal preparation steps (tagging, QA, picklist)
* **Pre-Delivery**

  * Asset tagging, picklist generation, and QA completed
  * Order is ready for next workflow step
* **In Delivery**

  * Order assigned to active local delivery run
  * Runner transporting to recipient
* **Shipping**

  * Order prepared for shipping (FedEx, etc.)
  * Awaiting carrier pickup or processing
* **Delivered**

  * Local: Recipient signature captured
  * Shipping: Order confirmed shipped to recipient
  * QA + documentation bundled and stored
  * Awaiting final inFlow fulfillment confirmation
* **Issue**

  * Order has encountered a problem
  * Requires manual review and resolution

---

## 5. User Roles

| Role                | Capabilities                                                                         |
| ------------------- | ------------------------------------------------------------------------------------ |
| Technician / Runner | Perform tagging, generate picklists, complete QA, run local deliveries, capture signatures, process shipping orders |
| Shipping Coordinator| Prepare orders for shipping, coordinate with carriers (FedEx), track shipping status |
| Admin / Lead        | Verify completed orders, finalize delivery runs, trigger inFlow fulfillment, oversee shipping operations |

---

## 6. Functional Requirements

### 6.1 Order Ingest (inFlow → App)

* System periodically pulls orders from inFlow that are **picked**
* New records are created with:

  * `status = Picked`
  * Order metadata (ID, recipient, location, items)

---

### 6.2 Picked → Pre-Delivery Gate (Required Steps)

#### 6.2.1 Asset Tagging

* App provides an “Asset Tag” action per order
* Existing tagging script is integrated into backend
* System records:

  * Tag IDs
  * Technician
  * Timestamp
  * Success/failure

**Blocking requirement:** Order cannot advance without successful tagging.

---

#### 6.2.2 Picklist Generator

* App generates a **picklist PDF** after tagging
* Picklist is:

  * Saved to storage
  * Linked to the order
  * Printable (physical copy)

**Blocking requirement:** Picklist must exist before QA.

---

#### 6.2.3 QA Module (In-App Replacement)

* App includes a QA checklist matching the current Google Form
* QA submission:

  * Stores responses
  * Generates a QA record (and/or PDF)
  * Records technician + timestamp

**Blocking requirement:** QA must be completed to proceed.

---

#### 6.2.4 Transition to Pre-Delivery

Once all three steps are complete:

* Order status → **Pre-Delivery**
* Recipient is notified that delivery is ready (Teams integration)

---

### 6.3 Delivery Run Management

#### Create Delivery Run

* Only **Pre-Delivery** orders are selectable
* User assigns:

  * Runner
  * Orders
* System records:

  * Start time
  * DeliveryRun ID

**On creation:**

* Orders → `status = In Delivery`
* Teams notification is sent

---

### 6.4 Shipping Order Processing

#### 6.4.1 Shipping vs Delivery Classification

* Orders are automatically classified based on shipping address city:
  * **Local Delivery**: Bryan, College Station → Follows delivery workflow
  * **Shipping**: All other cities → Follows shipping workflow
* Classification happens during order import from inFlow

#### 6.4.2 Shipping Workflow

Shipping orders follow a structured, blocking requirement workflow with three distinct stages:

**Shipping Workflow Stages:**
```
Work Area → Dock → Shipped to Carrier
```

**Stage 1: Work Area**
* **Pre-Delivery** orders marked as shipping orders transition to **Shipping** status
* Shipping coordinator reviews order details and shipping requirements
* Order remains in **Work Area** status until ready for dock preparation
* **Blocking:** Cannot proceed to Dock stage until explicitly moved

**Stage 2: At Dock**
* Order moved from Work Area to **Dock** status
* Order prepared for carrier (FedEx, UPS, etc.)
* Physical preparation and labeling completed
* **Blocking:** Cannot proceed to Shipped stage until moved to Dock

**Stage 3: Shipped to Carrier**
* Order marked as **Shipped to Carrier** with carrier name and optional tracking number
* Shipping coordinator confirms order handed to carrier
* Order status automatically transitions to **Delivered**
* **Blocking:** Cannot be marked as shipped until at Dock stage

**Key Features:**
* Each stage must be completed in sequence - no skipping stages
* All transitions are audited with user attribution and timestamps
* Carrier information and tracking numbers are captured
* Automatic status transition to Delivered upon shipping confirmation

#### 6.4.3 QA Method Selection

* QA checklist includes method selection:
  * **"Delivery"**: For local delivery orders
  * **"Shipping"**: For shipping orders
* Different QA requirements based on fulfillment method

---

### 6.5 Local Delivery & Signature Capture

* Runner opens the order's picklist in the in-app PDF editor
* Recipient signs using stylus
* Signed picklist is saved as a new document version

**Requirement:** Signature must be captured to complete delivery.

---

### 6.5 Delivered Document Bundling

After signature capture:

* System bundles:

  * Signed picklist
  * QA form
* Creates a folder/package:

  ```
  Completed/
    TH3950/
      signed_picklist.pdf
      qa_form.pdf
  ```
* Order status → **Delivered**

---

### 6.6 Order Completion & inFlow Fulfillment

#### 6.6.1 Delivery Run Completion

* Staff manually verifies all orders in delivery run are delivered
* User clicks **Complete Delivery** on the Delivery Run

**Requirements:**
* All orders in run must be in "Delivered" status
* All orders must have been signed (for local deliveries)

**System behavior:**
* Validates all orders are properly delivered
* Bulk marks orders as **fulfilled** in inFlow
* Records success/failure per order
* Closes Delivery Run with completion timestamp

#### 6.6.2 Shipping Order Completion

* Shipping coordinator confirms order shipped via carrier
* Updates shipping status and tracking information
* Order transitions to **Delivered** status
* System marks order as fulfilled in inFlow

---

## 7. Key Screens / UX Modules

### Orders Dashboard

* Status tabs: Picked / Pre-Delivery / In Delivery / Delivered / Issue
* Search: Order ID, recipient, location

### Order Detail View

* Order metadata
* Stepper showing:

  * Asset Tagging
  * Picklist
  * QA
  * Signature
* Document links and audit trail

### QA Module

* Internal checklist UI
* Submit + export/store responses

### Delivery Runs

* Create run (local deliveries only)
* Active run view with order status tracking
* Complete Delivery action (requires all orders delivered)

### Shipping Operations

* Shipping queue management
* Dock status tracking
* Carrier coordination (FedEx, UPS, etc.)
* Shipping confirmation and tracking updates

### PDF Signing Interface

* Stylus input for signature capture
* Save signed version
* Order status update to Delivered

### Document Manager

* View completed bundles
* Per-order folder access

---

## 8. Data Model (Conceptual)

### Order

* `id`
* `status` (Picked, Pre-Delivery, In Delivery, Shipping, Delivered, Issue)
* `recipient`
* `location`
* `orderType` ("delivery" or "shipping" based on destination)
* `qaMethod` ("Delivery" or "Shipping")
* `stepFlags { tagged, picklistGenerated, qaComplete }`
* `documents[]`
* `deliveryRunId` (only for local delivery orders)
* `signatureCapturedAt`
* `shippingWorkflowStatus` (work_area, dock, shipped) - only for shipping orders
* `shippingWorkflowStatusUpdatedAt`
* `shippingWorkflowStatusUpdatedBy`
* `shippedToCarrierAt`
* `shippedToCarrierBy`
* `carrierName` (FedEx, UPS, etc.)
* `trackingNumber`
* `inflowFulfillmentStatus`
* timestamps

### DeliveryRun

* `id`
* `runner`
* `orders[]`
* `startTime`
* `endTime`
* `status`

### Document

* `type` (picklist, signed_picklist, qa, bundle)
* `storagePath`
* `createdBy`
* `createdAt`

### Audit Log (Recommended)

* entity
* action
* user
* timestamp

---

## 9. Integrations

* **inFlow**

  * Order ingest (picked orders with pickLines)
  * Order classification (delivery vs shipping)
  * Fulfillment confirmation for completed orders
* **Shipping Carriers (FedEx, UPS, etc.)**

  * Shipping label generation
  * Tracking number integration
  * Shipping confirmation callbacks
* **Microsoft Teams**

  * Ready-to-deliver notification
  * Delivery started notification
  * Shipping status updates
* **Asset Tagging System**

  * Existing script wrapped as service
* **File/Object Storage**

  * PDFs and completed bundles
  * Shipping documentation storage

---

## 10. Error & Exception Handling

* Step failures block status transitions
* Orders can be marked **Issue** with reason
* inFlow fulfillment failures keep run open with alerts

---

## 11. Success Metrics

* **Delivery Metrics:**
  * % of deliveries completed without missing documentation
  * Average time from Picked → Delivered
  * On-time delivery rate
  * Customer signature capture rate

* **Shipping Metrics:**
  * % of shipping orders completed without issues
  * Average time from Picked → Shipped
  * Carrier on-time pickup rate
  * Shipping documentation completeness

* **Overall:**
  * Time from Picked → Pre-Delivery readiness
  * Reduction in manual verification errors
  * Zero missing QA cases at fulfillment
  * Order classification accuracy (delivery vs shipping)
