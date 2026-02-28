# Troubleshooting

## Common Issues

| Issue | Solution |
|-------|----------|
| Orders not syncing | Check Inflow API credentials and scheduler status |
| Building codes not showing | Verify ArcGIS service accessibility |
| Database connection errors | Verify DATABASE_URL in .env |
| WebSocket not connecting | Check CORS configuration and confirm PythonAnywhere uses ASGI beta with eventlet if applicable |
| SAML login fails | Verify certificate path and IdP URLs |
| SharePoint upload fails | Check Graph API permissions and site URL |
| Email not sending | Verify Graph API configuration |

## Logs

Backend logs output to console. Check application logs for detailed error messages.

For PythonAnywhere:
```bash
cat /var/log/techhub.pythonanywhere.com.error.log
cat /var/log/techhub.pythonanywhere.com.server.log
```

PythonAnywhere WebSocket support requires the ASGI beta with an Eventlet worker and a single worker process:

```bash
gunicorn --worker-class eventlet -w 1
```

Confirm the web app is configured for ASGI and points at the correct WSGI/ASGI entrypoint.

## Database Management

Use the database manager script for maintenance:

```bash
cd backend
python scripts/database_manager.py

# Or direct commands:
python scripts/database_manager.py --stats
python scripts/database_manager.py --list --status PreDelivery
python scripts/database_manager.py --search TH4013
```
