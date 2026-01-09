const socket = io();

// State
let currentUser = null;
let currentChatFriend = null;
let friendsCache = [];

// DOM Elements
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const authForm = document.getElementById('auth-form');
const msgForm = document.getElementById('message-form');

// --- Auth Handling ---
async function checkSession() {
    const res = await fetch('/me');
    const data = await res.json();
    if (data.loggedIn) {
        initApp(data.user);
    }
}
checkSession();

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('tab-login').classList.contains('active') ? 'login' : 'register';
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const res = await fetch(`/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    
    if (data.success) {
        initApp(data.user);
    } else {
        document.getElementById('auth-error').innerText = data.error;
    }
});

document.getElementById('tab-login').onclick = function() {
    this.classList.add('active'); document.getElementById('tab-register').classList.remove('active');
};
document.getElementById('tab-register').onclick = function() {
    this.classList.add('active'); document.getElementById('tab-login').classList.remove('active');
};

document.getElementById('logout-btn').onclick = async () => {
    await fetch('/logout', { method: 'POST' });
    location.reload();
};

function initApp(user) {
    currentUser = user;
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    // Setup UI
    document.getElementById('my-username').innerText = user.username;
    document.getElementById('my-avatar').src = user.avatar;

    loadFriends();
    loadRequests();
}

// --- Social Features (FRIENDS) ---

// Search User
const searchInput = document.getElementById('user-search');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('input', async (e) => {
    const val = e.target.value;
    if(val.length < 2) { searchResults.classList.add('hidden'); return; }
    
    const res = await fetch(`/search-users?q=${val}`);
    const users = await res.json();
    
    searchResults.innerHTML = '';
    if(users.length > 0) searchResults.classList.remove('hidden');
    
    users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'search-item';
        div.innerHTML = `
            <span>${u.username}</span>
            <button class="add-friend-btn" onclick="sendRequest(${u.id})">Add</button>
        `;
        searchResults.appendChild(div);
    });
});

window.sendRequest = async (id) => {
    await fetch('/send-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: id })
    });
    alert('Request Sent!');
    searchInput.value = '';
    searchResults.classList.add('hidden');
};

// Tabs
const btnFriends = document.getElementById('btn-friends');
const btnRequests = document.getElementById('btn-requests');
const listFriends = document.getElementById('friends-list');
const listRequests = document.getElementById('requests-list');

btnFriends.onclick = () => {
    btnFriends.classList.add('active'); btnRequests.classList.remove('active');
    listFriends.classList.remove('hidden'); listRequests.classList.add('hidden');
};
btnRequests.onclick = () => {
    btnRequests.classList.add('active'); btnFriends.classList.remove('active');
    listRequests.classList.remove('hidden'); listFriends.classList.add('hidden');
    document.getElementById('req-badge').classList.add('hidden'); // Clear badge
};

async function loadFriends() {
    const res = await fetch('/friends');
    friendsCache = await res.json();
    renderFriends();
}

function renderFriends() {
    listFriends.innerHTML = '';
    friendsCache.forEach(f => {
        const li = document.createElement('li');
        li.className = 'list-item';
        li.onclick = () => openChat(f);
        li.innerHTML = `
            <img src="${f.avatar}">
            <div class="meta">
                <span>${f.username}</span>
            </div>
            <div class="status-indicator ${f.status}" id="status-${f.id}"></div>
        `;
        listFriends.appendChild(li);
    });
}

async function loadRequests() {
    const res = await fetch('/friend-requests');
    const reqs = await res.json();
    const badge = document.getElementById('req-badge');
    
    listRequests.innerHTML = '';
    if(reqs.length > 0) {
        badge.innerText = reqs.length;
        badge.classList.remove('hidden');
    }

    reqs.forEach(r => {
        const li = document.createElement('li');
        li.className = 'list-item';
        li.innerHTML = `
            <img src="${r.avatar}">
            <span>${r.username}</span>
            <div class="req-actions">
                <button class="btn-accept" onclick="handleRequest(${r.requestId}, 'accept', ${r.userId})">✓</button>
                <button class="btn-decline" onclick="handleRequest(${r.requestId}, 'decline', ${r.userId})">X</button>
            </div>
        `;
        listRequests.appendChild(li);
    });
}

window.handleRequest = async (requestId, action, senderId) => {
    const res = await fetch('/handle-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action, senderId })
    });
    const data = await res.json();
    if(data.success) {
        loadRequests(); // Refresh UI
        if(action === 'accept') {
            loadFriends(); // Refresh Friends list immediately
        }
    }
};

// --- CHAT LOGIC ---

async function openChat(friend) {
    currentChatFriend = friend;
    document.getElementById('no-chat-selected').classList.add('hidden');
    document.getElementById('active-chat').classList.remove('hidden');
    
    document.getElementById('chat-username').innerText = friend.username;
    document.getElementById('chat-avatar').src = friend.avatar;
    
    // Load History
    const res = await fetch(`/messages/${friend.id}`);
    const msgs = await res.json();
    
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    msgs.forEach(m => appendMessage(m));
    scrollToBottom();
    
    // Join Socket Room
    socket.emit('join_chat', friend.id);
}

msgForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('msg-input');
    const content = input.value;
    if(!content || !currentChatFriend) return;

    socket.emit('send_message', {
        receiverId: currentChatFriend.id,
        content: content
    });
    
    input.value = '';
});

// Typing Indicator
const msgInput = document.getElementById('msg-input');
msgInput.addEventListener('input', () => {
    if(currentChatFriend) socket.emit('typing', { receiverId: currentChatFriend.id });
});

function appendMessage(msg) {
    const div = document.createElement('div');
    const isMine = msg.sender_id == currentUser.id;
    div.className = `message ${isMine ? 'sent' : 'received'}`;
    div.innerText = msg.content;
    document.getElementById('messages-container').appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    const c = document.getElementById('messages-container');
    c.scrollTop = c.scrollHeight;
}

// --- SOCKET EVENTS ---

socket.on('receive_message', (data) => {
    // If chat is open with this person
    if (currentChatFriend && (data.sender_id == currentChatFriend.id || data.sender_id == currentUser.id)) {
        appendMessage(data);
    } else {
        // Notification logic could go here
    }
});

socket.on('display_typing', (data) => {
    if(currentChatFriend && data.senderId == currentChatFriend.id) {
        const ind = document.getElementById('typing-indicator');
        ind.classList.remove('hidden');
        setTimeout(() => ind.classList.add('hidden'), 3000);
    }
});

socket.on('user_status', (data) => {
    const el = document.getElementById(`status-${data.userId}`);
    if(el) {
        el.className = `status-indicator ${data.status}`;
    }
});

// **CRITICAL: Real-time Friend Request Handling**
socket.on('new_friend_request', (data) => {
    // Alert user visually without reload
    const badge = document.getElementById('req-badge');
    badge.classList.remove('hidden');
    badge.innerText = "!"; // Or increment count
    
    // If request tab is open, reload list live
    if(document.getElementById('btn-requests').classList.contains('active')) {
        loadRequests();
    }
});

socket.on('friend_request_accepted', (data) => {
    // data contains newFriend object
    friendsCache.push(data.newFriend);
    renderFriends();
});
