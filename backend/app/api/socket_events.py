from flask_socketio import emit, join_room, leave_room
from flask import request
import logging

logger = logging.getLogger(__name__)

def register_socket_events(socketio):
    """Register Socket.IO event handlers"""

    @socketio.on('connect')
    def handle_connect():
        logger.info(f"Client connected: {request.sid}")

    @socketio.on('disconnect')
    def handle_disconnect():
        logger.info(f"Client disconnected: {request.sid}")

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
