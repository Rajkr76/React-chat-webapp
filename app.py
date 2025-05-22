from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
CORS(app)  # Enable CORS for all routes
socketio = SocketIO(app, cors_allowed_origins="*")

# Store active users and their rooms
user_rooms = {}
# Store message history for each room
room_messages = {}
# Store user status (online/offline)
user_status = {}
# Store user sid mapping
user_sids = {}

@app.route('/')
def index():
    return render_template('index.html')  # Ensure the path is correct

def get_private_room(sender, recipient):
    """Create a unique, consistent room ID for two users"""
    # If sender and recipient are the same (self-chat), create a special room
    if sender == recipient:
        return f"self_chat_{sender}"
    
    # Sort to ensure same room regardless of who initiates
    users = sorted([sender, recipient])
    return f"private_{users[0]}_{users[1]}"

@socketio.on('user_status_change')
def handle_status_change(data):
    # Find the user associated with this session
    user_email = None
    for email, room in user_rooms.items():
        if request.sid in socketio.server.rooms(request.sid):
            user_email = email
            break
    
    if not user_email:
        return
    
    status = data.get('status', 'offline')
    user_status[user_email] = status
    
    # Notify all rooms where this user is present
    for room_name in socketio.server.rooms(request.sid):
        if room_name != request.sid:  # Skip personal room
            emit('user_status_update', {
                'email': user_email,
                'status': status
            }, to=room_name)
            
    print(f"User {user_email} status changed to: {status}")

@socketio.on('join_private_chat')
def handle_join_private_chat(data):
    sender_email = data.get('senderEmail')
    recipient_email = data.get('recipientEmail')
    
    if not sender_email or not recipient_email:
        emit('error', {'message': 'Missing sender or recipient email'}, to=request.sid)
        return
    
    # Store user sid mapping
    user_sids[sender_email] = request.sid
    
    # Set initial online status
    user_status[sender_email] = 'online'
    
    # Get private room ID
    room = get_private_room(sender_email, recipient_email)
    
    # Leave any previous rooms if user reconnects
    if sender_email in user_rooms:
        previous_room = user_rooms[sender_email]
        leave_room(previous_room)
        print(f"User {sender_email} left room: {previous_room}")
    
    # Join the private room
    join_room(room)
    user_rooms[sender_email] = room
    
    print(f"User {sender_email} joined private room with {recipient_email}: {room}")
    
    # Create room_messages entry if it doesn't exist
    if room not in room_messages:
        room_messages[room] = []
    
    # Check if recipient is online
    recipient_online = recipient_email in user_status and user_status[recipient_email] == 'online'
    
    # Send room joined event with the past messages
    emit('room_joined', {
        'room': room, 
        'sender': sender_email, 
        'recipient': recipient_email,
        'recipientOnline': recipient_online,
        'messageHistory': room_messages[room]
    }, to=request.sid)
    
    # Broadcast user's online status to everyone in the room
    emit('user_status_update', {
        'email': sender_email,
        'status': 'online'
    }, to=room)
    
    # Notify others in the room that this user has joined
    # For self-chat, we don't need to notify "other" users
    if sender_email != recipient_email:
        emit('user_joined', {
            'email': sender_email,
            'status': 'online',
            'room': room
        }, to=room, skip_sid=request.sid)

@socketio.on('send_message')
def handle_message(data):
    username = data.get('username')
    message = data.get('message')
    recipient = data.get('recipient')
    timestamp = data.get('timestamp')
    
    if not username or not message:
        emit('message_sent', {'status': 'error', 'message': 'Missing required fields'}, to=request.sid)
        return
    
    print(f"[{username} -> {recipient}] {message}")  # Logs message in terminal
    
    # Get the private room for these users
    room = get_private_room(username, recipient)
    
    # Create message object with timestamp
    message_obj = {
        'username': username,
        'message': message,
        'recipient': recipient,
        'timestamp': timestamp or time.time() * 1000  # Use client timestamp if provided
    }
    
    # Store message in history even if recipient is not in room
    if room in room_messages:
        room_messages[room].append(message_obj)
    else:
        room_messages[room] = [message_obj]
    
    # Send message to everyone in the room (including the sender for confirmation)
    emit('receive_message', message_obj, to=room)
    
    # Always send confirmation back to sender
    emit('message_sent', {'status': 'ok', 'id': f"{time.time()}-{username}-{len(message)}"}, to=request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    # Clean up user_rooms when a user disconnects
    sid = request.sid
    disconnected_user = None
    
    # Find the disconnected user and update status
    for email, sid_value in list(user_sids.items()):
        if sid == sid_value:
            disconnected_user = email
            user_status[email] = 'offline'
            # Don't delete from user_sids to allow reconnection
            break
    
    # Notify others about the disconnection
    if disconnected_user and disconnected_user in user_rooms:
        room_id = user_rooms[disconnected_user]
        print(f"User {disconnected_user} disconnected and set to offline in room {room_id}")
        
        # Notify others in the room about the disconnection
        emit('user_status_update', {
            'email': disconnected_user,
            'status': 'offline'
        }, to=room_id)

@socketio.on('connect')
def on_connect():
    print("User connected:", request.sid)
    
    # Send success status to client
    emit('connection_success', {
        'sid': request.sid,
        'status': 'connected',
        'timestamp': time.time() * 1000
    })
    
    # Update user status for any rooms they were previously in
    user_email = None
    for email, sid in user_sids.items():
        if sid == request.sid:
            user_email = email
            break
    
    if user_email:
        # Update their status
        user_status[user_email] = 'online'
        print(f"User {user_email} is back online")
        
        # Notify rooms
        if user_email in user_rooms:
            room_id = user_rooms[user_email]
            print(f"Broadcasting that {user_email} is online to room {room_id}")
            
            # Broadcast to everyone in the room
            emit('user_status_update', {
                'email': user_email,
                'status': 'online'
            }, to=room_id)

@socketio.on('request_user_status')
def handle_status_request(data):
    """Handle requests to get the latest status of a user"""
    target_email = data.get('targetEmail')
    if not target_email:
        return
    
    # Get the current status
    status = 'offline'
    if target_email in user_status:
        status = user_status[target_email]
    
    # Return the status to the requester
    emit('user_status_update', {
        'email': target_email,
        'status': status
    }, to=request.sid)
    
    print(f"Status request for {target_email}: {status}")

if __name__ == '__main__':
    try:
        # Try with a different port (5001) since 5000 has permissions issues
        print("Starting server on port 5001...")
        socketio.run(app, host='0.0.0.0', port=5001, debug=True, allow_unsafe_werkzeug=True)
    except Exception as e:
        print(f"Error starting server: {e}")
        print("Trying alternative configuration...")
        socketio.run(app, debug=True, allow_unsafe_werkzeug=True)
