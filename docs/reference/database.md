# Database Schema

## Orders Table

```sql
CREATE TABLE orders (
    id VARCHAR(36) PRIMARY KEY,
    inflow_order_id VARCHAR(255) UNIQUE NOT NULL,
    inflow_sales_order_id VARCHAR(255),
    recipient_name VARCHAR(255),
    recipient_contact VARCHAR(255),
    delivery_location VARCHAR(500),
    po_number VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'picked',
    assigned_deliverer VARCHAR(255),
    issue_reason TEXT,
    delivery_run_id VARCHAR(36),

    -- Prep steps
    tagged_at DATETIME,
    tagged_by VARCHAR(255),
    tag_data JSON,
    picklist_generated_at DATETIME,
    picklist_generated_by VARCHAR(255),
    picklist_path VARCHAR(500),
    qa_completed_at DATETIME,
    qa_completed_by VARCHAR(255),
    qa_data JSON,
    qa_path VARCHAR(500),
    qa_method VARCHAR(50),

    -- Signature
    signature_captured_at DATETIME,
    signed_picklist_path VARCHAR(500),

    -- Order details
    order_details_path VARCHAR(500),
    order_details_generated_at DATETIME,

    -- Shipping
    shipping_workflow_status VARCHAR(50) DEFAULT 'work_area',
    shipping_workflow_status_updated_at DATETIME,
    shipping_workflow_status_updated_by VARCHAR(255),
    shipped_to_carrier_at DATETIME,
    shipped_to_carrier_by VARCHAR(255),
    carrier_name VARCHAR(100),
    tracking_number VARCHAR(255),

    -- Inflow data
    inflow_data JSON,

    -- Timestamps
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    FOREIGN KEY (delivery_run_id) REFERENCES delivery_runs(id)
);

CREATE INDEX ix_orders_inflow_order_id ON orders(inflow_order_id);
CREATE INDEX ix_orders_status ON orders(status);
CREATE INDEX ix_orders_delivery_run_id ON orders(delivery_run_id);
```

## Delivery Runs Table

```sql
CREATE TABLE delivery_runs (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    runner VARCHAR(255) NOT NULL,
    vehicle VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    start_time DATETIME,
    end_time DATETIME,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
```

## Users Table

```sql
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    department VARCHAR(255),
    employee_id VARCHAR(255),
    created_at DATETIME NOT NULL,
    last_login_at DATETIME
);
```

## Sessions Table

```sql
CREATE TABLE sessions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Audit Logs Table

```sql
CREATE TABLE audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    changed_by VARCHAR(255),
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    reason TEXT,
    timestamp DATETIME NOT NULL,
    metadata JSON,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX ix_audit_logs_order_id ON audit_logs(order_id);
CREATE INDEX ix_audit_logs_timestamp ON audit_logs(timestamp);
```

## Inflow Webhooks Table

```sql
CREATE TABLE inflow_webhooks (
    id VARCHAR(36) PRIMARY KEY,
    webhook_id VARCHAR(255) NOT NULL UNIQUE,
    url VARCHAR(500) NOT NULL,
    events JSON NOT NULL,
    status ENUM('active', 'inactive', 'failed') NOT NULL DEFAULT 'active',
    last_received_at DATETIME,
    failure_count INTEGER NOT NULL DEFAULT 0,
    secret VARCHAR(255),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
```
