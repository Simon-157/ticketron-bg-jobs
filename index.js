const admin = require("firebase-admin");
const config = require("./config");

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: config.projectId,
                clientEmail: config.clientEmail,
                privateKey: config.privateKey.replace(/\\n/g, "\n"),
            }),
            databaseURL: `https://${config.projectId}.firebaseio.com`,
        });
        console.log('Firebase initialized successfully');
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        process.exit(1);
    }
}

const db = admin.firestore();
const messaging = admin.messaging();

// Helper function to send notifications
async function sendNotification(notificationData, userToken) {
    const message = {
        notification: {
            title: notificationData.title || "Notification",
            body: notificationData.message,
        },
        token: userToken,
        data: {
            type: notificationData.type,
            timestamp: notificationData.timestamp.toString(),
            senderId: notificationData.sender_id || '',
        },
    };

    try {
        const response = await messaging.send(message);
        console.log('Successfully sent message:', response);
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

// Helper function to fetch user data
async function fetchUser(userId) {
    if (!userId) {
        console.error('Invalid userId:', userId);
        return null;
    }
    try {
        const userSnapshot = await db.collection("users").doc(userId).get();
        return userSnapshot.data();
    } catch (error) {
        console.error('Error fetching user:', error);
        return null;
    }
}

// Listen for changes in events collection
const eventsRef = db.collection("events");
eventsRef.onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
            const event = change.doc.data();
            if (!event.organizer_id) {
                console.error('Invalid organizer_id in event:', event);
                return;
            }
            try {
                const organizerSnapshot = await db.collection("organizers").doc(event.organizer_id).get();
                const organizer = organizerSnapshot.data();
                const usersSnapshot = await db.collection("users").get();
                const users = usersSnapshot.docs.map(doc => doc.data());

                users.forEach(async (user) => {
                    if (user.userToken) {
                        const notificationData = {
                            type: "event_post",
                            message: `${organizer.name} has posted a new event. Check it out!`,
                            timestamp: Date.now(),
                            user_id: user.id,
                            event_id: event.id,
                        };
                        await sendNotification(notificationData, user.userToken);
                    }
                });
            } catch (error) {
                console.error('Error processing event changes:', error);
            }
        }
    });
});

// Listen for changes in payments collection
const paymentsRef = db.collection("payments");
paymentsRef.onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
            const payment = change.doc.data();
            if (!payment.user_id) {
                console.error('Invalid user_id in payment:', payment);
                return;
            }
            try {
                const user = await fetchUser(payment.user_id);
                if (user && user.userToken) {
                    const notificationData = {
                        type: "payment_status",
                        message: `${payment.name} has ${payment.status} your payment. Check it out!`,
                        timestamp: Date.now(),
                        user_id: user.id,
                        status: payment.status,
                    };
                    await sendNotification(notificationData, user.userToken);
                }
            } catch (error) {
                console.error('Error processing payment changes:', error);
            }
        }
    });
});

// Listen for changes in messages collection
const messagesRef = db.collection("messages");
messagesRef.onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
            const message = change.doc.data();
            if (!message.sender_id || !message.receiver_id) {
                console.error('Invalid sender_id or receiver_id in message:', message);
                return;
            }
            try {
                const sender = message.sender_type === "user" ? await fetchUser(message.sender_id) : await db.collection("organizers").doc(message.sender_id).get().then(doc => doc.data());
                const receiver = message.receiver_type === "user" ? await fetchUser(message.receiver_id) : await db.collection("organizers").doc(message.receiver_id).get().then(doc => doc.data());

                if (receiver && receiver.userToken) {
                    const notificationData = {
                        type: "new_message",
                        message: message.message,
                        timestamp: Date.now(),
                        user_id: receiver.id,
                        sender_id: sender ? sender.id : "",
                    };
                    await sendNotification(notificationData, receiver.userToken);
                }
            } catch (error) {
                console.error('Error processing message changes:', error);
            }
        }
    });
});

// Listen for changes in tickets collection
const ticketsRef = db.collection("tickets");
ticketsRef.onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
            const ticket = change.doc.data();
            if (!ticket.user_id || !ticket.event_id) {
                console.error('Invalid user_id or event_id in ticket:', ticket);
                return;
            }
            try {
                const user = await fetchUser(ticket.user_id);
                if (user && user.userToken) {
                    const eventSnapshot = await db.collection("events").doc(ticket.event_id).get();
                    const event = eventSnapshot.data();
                    const notificationData = {
                        type: "ticket_purchase",
                        message: `Thank you for purchasing for ${event.event_name}!`,
                        timestamp: Date.now(),
                        user_id: user.id,
                        event_id: ticket.event_id,
                    };
                    await sendNotification(notificationData, user.userToken);
                }
            } catch (error) {
                console.error('Error processing ticket changes:', error);
            }
        }
    });
});

// Listen for changes in attendance collection
const attendanceRef = db.collection("attendance");
attendanceRef.onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
            const attendance = change.doc.data();
            if (!attendance.user_id || !attendance.event_id) {
                console.error('Invalid user_id or event_id in attendance:', attendance);
                return;
            }
            try {
                const user = await fetchUser(attendance.user_id);
                if (user && user.userToken) {
                    const eventSnapshot = await db.collection("events").doc(attendance.event_id).get();
                    const event = eventSnapshot.data();
                    const notificationData = {
                        type: "event_attendance_reminder",
                        message: `Make sure to attend ${event.event_name}!`,
                        timestamp: Date.now(),
                        user_id: user.id,
                        event_id: attendance.event_id,
                        event_name: event.event_name,
                    };
                    await sendNotification(notificationData, user.userToken);
                }
            } catch (error) {
                console.error('Error processing attendance changes:', error);
            }
        }
    });
});

