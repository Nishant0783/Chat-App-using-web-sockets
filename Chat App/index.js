import express from 'express'
import { Server } from "socket.io"
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3500
const ADMIN = "Admin"

const app = express()
app.use(express.static(path.join(__dirname, "public")))

const expressServer = app.listen(PORT, () => {
    console.log("Listening to port: ", PORT)
})

// state
const UsersState = {
    users: [],
    setUsers: function (newUsersArray) {
        this.users = newUsersArray
    }
}

const io = new Server(expressServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5500", "http://127.0.0.1:5500"]
    }
})

io.on('connection', socket => {
    // Upon connection - only to user
    socket.emit('message', buildMsg(ADMIN, "Welcome to chat App!")) // goes only to user

    socket.on('enterRoom', ({ name, room }) => {
        // Leave previous room if the user was in one
        const prevRoom = getUser(socket.id)?.room;
        console.log(`${name} has previous room as ${prevRoom}`)
        if (prevRoom) {
            socket.leave(prevRoom);
            io.to(prevRoom).emit('message', buildMsg(ADMIN, `${name} has left the room`));

            // Update user list for the previous room
            io.to(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            });
        }

        // Activate user in the new room
        const user = activateUser(socket.id, name, room);

        // Join the new room
        socket.join(user.room);

        // Send a welcome message to the new user
        socket.emit('message', buildMsg(ADMIN, `You have joined the ${user.room} chat room.`));

        // Notify other users in the new room
        socket.broadcast.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has joined the room.`));

        // Update user list for the new room
        io.to(user.room).emit('userList', {
            users: getUsersInRoom(user.room)
        });

        // Update rooms list for everyone
        io.emit('roomList', {
            rooms: getAllActiveRooms()
        });
    });


    // When users disconnects
    socket.on('disconnect', () => {
        const user = getUser(socket.id)
        userLeavesApp(socket.id)
        if (user) {
            io.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has left the room.`))

            io.to(user.room).emit('UserList', {
                users: getUsersInRoom(user.room)
            })

            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
        }

        console.log(`User ${socket.id} disconnected`)
    })

    // Listening for a message event
    socket.on('message', ({ name, text }) => {
        const room = getUser(socket.id)?.room
        if (room) {
            io.to(room).emit('message', buildMsg(name, text))
        }
    })



    // Listen for activity
    socket.on('activity', (name) => {
        const room = getUser(socket.id)?.room
        if (room) {
            socket.broadcast.to(room).emit('activity', name)
        }
    })
})


function buildMsg(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date())
    }
}

// Users Functions
function activateUser(id, name, room) {
    const user = { id, name, room }
    UsersState.setUsers([
        ...UsersState.users.filter(user => user.id != id),
        user
    ])
    return user
}

function userLeavesApp(id) {
    UsersState.setUsers(
        UsersState.users.filter(user => user.id !== id)
    )
}

function getUser(id) {
    return UsersState.users.find(user => user.id === id)
}

function getUsersInRoom(room) {
    return UsersState.users.filter(user => user.room === room)
}

function getAllActiveRooms() {
    return Array.from(new Set(UsersState.users.map(user => user.room)))
}

