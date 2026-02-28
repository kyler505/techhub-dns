import logging

from flask import request
from flask_socketio import emit, join_room, leave_room

logger = logging.getLogger(__name__)

def _format_forwarded_headers():
    header_keys = [
        "Origin",
        "Host",
        "X-Forwarded-For",
        "X-Forwarded-Host",
        "X-Forwarded-Proto",
        "X-Forwarded-Port",
        "X-Forwarded-Ssl",
    ]
    return {key: request.headers.get(key) for key in header_keys if request.headers.get(key) is not None}


def register_socket_events(socketio):
    """Register Socket.IO event handlers"""

    @socketio.on('connect')
    def handle_connect():
        forwarded_headers = _format_forwarded_headers()
        logger.info("Client connected: %s headers=%s", request.sid, forwarded_headers)

    @socketio.on('disconnect')
    def handle_disconnect():
        logger.info(f"Client disconnected: {request.sid}")

    @socketio.on_error_default
    def handle_socket_error(error):
        forwarded_headers = _format_forwarded_headers()
        logger.warning("Socket.IO error: %s headers=%s", error, forwarded_headers)

    @socketio.on('join')
    def on_join(data):
        """Handle join room event"""
        room = data.get('room')
        if not room:
            logger.warning(f"Client {request.sid} tried to join without room")
            return

        join_room(room)
        logger.info(f"Client {request.sid} joined room: {room}")
        emit('joined', {'room': room})

    @socketio.on('leave')
    def on_leave(data):
        """Handle leave room event"""
        room = data.get('room')
        if not room:
            logger.warning(f"Client {request.sid} tried to leave without room")
            return

        leave_room(room)
        logger.info(f"Client {request.sid} left room: {room}")
        emit('left', {'room': room})
