const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active sessions
const sessions = new Map();

// Default map data
const defaultMaps = [
    "Bind", "Haven", "Split", 
    "Sunset","Pearl", "Abyss", "Corrode"
];

// Map ban/pick order tracking
function getNextBanPickAction(format, currentStage, currentTeam, mapsSelected) {
    const actions = {
        bo3: [
            { stage: 'ban', team: 0 },    // Team 1 bans
            { stage: 'ban', team: 1 },    // Team 2 bans
            { stage: 'pick', team: 0 },   // Team 1 picks map
            { stage: 'side', team: 1 },   // Team 2 picks side
            { stage: 'pick', team: 1 },   // Team 2 picks map
            { stage: 'side', team: 0 },
            { stage: 'ban', team: 0 },    // Team 1 bans
            { stage: 'ban', team: 1 },
            { stage: 'pick', team: 1 }
        ],
        bo5: [
            { stage: 'ban', team: -1 },   // Customizable ban
            { stage: 'ban', team: -1 },   // Customizable ban
            { stage: 'pick', team: -1 },  // Customizable pick and side
            { stage: 'pick', team: -1 },  // Customizable pick and side
            { stage: 'pick', team: -1 },  // Customizable pick and side
            { stage: 'pick', team: -1 },  // Customizable pick and side
            { stage: 'decider', team: -1 }// Customizable side for decider
        ]
    };

    const sequence = actions[format];
    if (!sequence) return null;

    const currentIndex = mapsSelected.length;
    return currentIndex < sequence.length ? sequence[currentIndex] : null;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('logon', (data) => {
        const { sessionId } = data;
        console.log(`Client logging on to session: ${sessionId}`);
        socket.join(sessionId);
        
        // Log connection details
        console.log('Socket ID:', socket.id);
        const room = io.sockets.adapter.rooms.get(sessionId);
        const clientCount = room ? room.size : 0;
        console.log(`Number of clients in session ${sessionId}:`, clientCount);

        // Send initial session data
        if (sessions.has(sessionId)) {
            socket.emit('session_data', sessions.get(sessionId));
            console.log('Sent initial session data');
        } else {
            // Create new session if it doesn't exist
            const initialSession = {
                sessionIdentifier: sessionId,
                organizationName: "Spectra",
                teams: [
                    { name: "Team 1", tricode: "T1", url: "/assets/misc/icon.webp" },
                    { name: "Team 2", tricode: "T2", url: "/assets/misc/icon.webp" }
                ],
                format: "bo3",
                availableMaps: defaultMaps.map(name => ({ name })),
                selectedMaps: defaultMaps.map(name => ({ name })),
                stage: "ban",
                actingTeamCode: "T1",
                actingTeam: 0
            };
            sessions.set(sessionId, initialSession);
            socket.emit('session_data', initialSession);
            console.log('Created and sent new session');
        }

        // If session doesn't exist, create it
        if (!sessions.has(sessionId)) {
            sessions.set(sessionId, {
                sessionIdentifier: sessionId,
                organizationName: "Spectra",
                teams: [
                    { name: "Team 1", tricode: "T1", url: "/assets/misc/icon.webp" },
                    { name: "Team 2", tricode: "T2", url: "/assets/misc/icon.webp" }
                ],
                format: "bo3",
                availableMaps: defaultMaps.map(name => ({ name })),
                selectedMaps: defaultMaps.map(name => ({ name })),
                stage: "ban",
                actingTeamCode: "T1",
                actingTeam: 0
            });
        }

        // Send current session state
        socket.emit('mapban', { data: sessions.get(sessionId) });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// API endpoints for the control panel
app.get('/api/sessions', (req, res) => {
    const sessionData = Array.from(sessions.entries()).map(([id, data]) => ({
        id,
        data
    }));
    res.json(sessionData);
});

app.post('/api/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const sessionData = req.body;

    console.log('Updating session:', sessionId);
    console.log('New session data:', JSON.stringify(sessionData, null, 2));

    sessions.set(sessionId, sessionData);
    
    // Emit to all clients in the session
    io.to(sessionId).emit('mapban', { event: 'mapban', data: sessionData });
    console.log('Emitted mapban event to session:', sessionId);
    
    // Get socket count in this room
    const room = io.sockets.adapter.rooms.get(sessionId);
    const clientCount = room ? room.size : 0;
    console.log(`Number of clients in session ${sessionId}:`, clientCount);
    
    res.json({ success: true });
});

// Serve the control panel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = 11201;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});