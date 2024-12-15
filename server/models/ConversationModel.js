const mongoose = require('mongoose');

// Message Schema
const messageSchema = new mongoose.Schema({
    text: {
        type: String,
        default: null,
        trim: true, // Remove unnecessary whitespace
    },
    imageUrl: {
        type: String,
        default: null,
    },
    videoUrl: {
        type: String,
        default: null,
    },
    seen: {
        type: Boolean,
        default: false,
    },
    msgByUserId: {
        type: mongoose.Schema.ObjectId,
        required: [true, "Message must have a sender (msgByUserId)."],
        ref: 'User',
        validate: {
            validator: mongoose.Types.ObjectId.isValid,
            message: props => `${props.value} is not a valid ObjectId`,
        },
    },
}, {
    timestamps: true,
});

// Ensure at least one content field is present
messageSchema.pre('validate', function (next) {
    if (!this.text && !this.imageUrl && !this.videoUrl) {
        return next(new Error("A message must have at least text, an image, or a video."));
    }
    next();
});

// Conversation Schema
const conversationSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.ObjectId,
        required: [true, "Conversation must have a sender."],
        ref: 'User',
        validate: {
            validator: mongoose.Types.ObjectId.isValid,
            message: props => `${props.value} is not a valid ObjectId`,
        },
    },
    receiver: {
        type: mongoose.Schema.ObjectId,
        required: [true, "Conversation must have a receiver."],
        ref: 'User',
        validate: {
            validator: mongoose.Types.ObjectId.isValid,
            message: props => `${props.value} is not a valid ObjectId`,
        },
    },
    messages: {
        type: [mongoose.Schema.ObjectId],
        ref: 'Message',
        default: [],
    },
}, {
    timestamps: true,
});

// Add indexes for query optimization
conversationSchema.index({ sender: 1, receiver: 1 }, { unique: true });

// Cascade delete associated messages
conversationSchema.pre('remove', async function (next) {
    try {
        await mongoose.model('Message').deleteMany({ _id: { $in: this.messages } });
        next();
    } catch (err) {
        next(err);
    }
});

// Models
const MessageModel = mongoose.model('Message', messageSchema);
const ConversationModel = mongoose.model('Conversation', conversationSchema);

module.exports = {
    MessageModel,
    ConversationModel,
};
