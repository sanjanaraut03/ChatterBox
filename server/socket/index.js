const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const getUserDetailsFromToken = require('../helpers/getUserDetailsFromToken');
const UserModel = require('../models/UserModel');
const { ConversationModel, MessageModel } = require('../models/ConversationModel');
const getConversation = require('../helpers/getConversation');

const app = express();

/*** Socket connection setup */
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true,
    },
});

/*** Server URL */
// Socket server running at http://localhost:8080/

// Online users
const onlineUser = new Set();

io.on('connection', async (socket) => {
    console.log('Connected User:', socket.id);

    const token = socket.handshake.auth.token;

    let user;
    try {
        // Retrieve user details from the token
        user = await getUserDetailsFromToken(token);

        if (!user || !user._id) {
            console.error('User not found or token invalid.');
            socket.emit('error', 'Unauthorized'); // Notify client
            socket.disconnect(true);
            return;
        }

        // Add user to a room and online users list
        socket.join(user._id.toString());
        onlineUser.add(user._id.toString());
        io.emit('onlineUser', Array.from(onlineUser));
    } catch (error) {
        console.error('Error during user authentication:', error.message);
        socket.emit('error', 'Authentication failed'); // Notify client
        socket.disconnect(true);
        return;
    }

    // Event: Message page
    socket.on('message-page', async (userId) => {
        try {
            if (!userId) {
                throw new Error('userId not provided');
            }

            const userDetails = await UserModel.findById(userId).select('-password');

            const payload = {
                _id: userDetails?._id,
                name: userDetails?.name,
                email: userDetails?.email,
                profile_pic: userDetails?.profile_pic,
                online: onlineUser.has(userId),
            };
            socket.emit('message-user', payload);

            const getConversationMessage = await ConversationModel.findOne({
                $or: [
                    { sender: user._id, receiver: userId },
                    { sender: userId, receiver: user._id },
                ],
            })
                .populate('messages')
                .sort({ updatedAt: -1 });

            socket.emit('message', getConversationMessage?.messages || []);
        } catch (error) {
            console.error('Error in message-page event:', error.message);
            socket.emit('error', 'Failed to load messages');
        }
    });

    // Event: New message
    socket.on('new message', async (data) => {
        try {
            if (!data.sender || !data.receiver || !(data.text || data.imageUrl || data.videoUrl)) {
                throw new Error('Invalid message data');
            }

            let conversation = await ConversationModel.findOne({
                $or: [
                    { sender: data.sender, receiver: data.receiver },
                    { sender: data.receiver, receiver: data.sender },
                ],
            });

            if (!conversation) {
                const createConversation = new ConversationModel({
                    sender: data.sender,
                    receiver: data.receiver,
                });
                conversation = await createConversation.save();
            }

            const message = new MessageModel({
                text: data.text,
                imageUrl: data.imageUrl,
                videoUrl: data.videoUrl,
                msgByUserId: data.msgByUserId,
            });

            const saveMessage = await message.save();

            await ConversationModel.updateOne({ _id: conversation._id }, {
                $push: { messages: saveMessage._id },
            });

            const getConversationMessage = await ConversationModel.findOne({
                $or: [
                    { sender: data.sender, receiver: data.receiver },
                    { sender: data.receiver, receiver: data.sender },
                ],
            })
                .populate('messages')
                .sort({ updatedAt: -1 });

            io.to(data.sender).emit('message', getConversationMessage?.messages || []);
            io.to(data.receiver).emit('message', getConversationMessage?.messages || []);

            const conversationSender = await getConversation(data.sender);
            const conversationReceiver = await getConversation(data.receiver);

            io.to(data.sender).emit('conversation', conversationSender);
            io.to(data.receiver).emit('conversation', conversationReceiver);
        } catch (error) {
            console.error('Error in new message event:', error.message);
        }
    });

    // Event: Sidebar
    socket.on('sidebar', async (currentUserId) => {
        try {
            if (!currentUserId) {
                throw new Error('Current user ID not provided');
            }

            const conversation = await getConversation(currentUserId);
            socket.emit('conversation', conversation);
        } catch (error) {
            console.error('Error in sidebar event:', error.message);
        }
    });

    
    // Event: Seen
socket.on('seen', async (msgByUserId) => {
    try {
        if (!msgByUserId || !user?._id) {
            throw new Error('Invalid data for seen event');
        }

        // Find the conversation involving the current user and the sender
        const conversation = await ConversationModel.findOne({
            $or: [
                { sender: user._id, receiver: msgByUserId },
                { sender: msgByUserId, receiver: user._id },
            ],
        });

        if (!conversation) {
            throw new Error('Conversation not found');
        }

        // Mark messages as seen
        const conversationMessageIds = conversation.messages || [];
        await MessageModel.updateMany(
            { _id: { $in: conversationMessageIds }, msgByUserId },
            { $set: { seen: true } }
        );

        // Fetch updated conversations for both users
        const conversationSender = await getConversation(user._id.toString());
        const conversationReceiver = await getConversation(msgByUserId);

        // Emit the updated conversation
        io.to(user._id.toString()).emit('conversation', conversationSender);
        io.to(msgByUserId).emit('conversation', conversationReceiver);
    } catch (error) {
        console.error('Error in seen event:', error.message);
    }
});


    // Event: Disconnect
    socket.on('disconnect', () => {
        if (user && user._id) {
            onlineUser.delete(user._id.toString());
        }
        io.emit('onlineUser', Array.from(onlineUser));
        console.log('Disconnected User:', socket.id);
    });
});

module.exports = {
    app,
    server,
};
