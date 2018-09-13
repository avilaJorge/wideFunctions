/**
 * Meetup notifications such as new Meetup and comment reply
 */
'use strict';

const {admin, firestore} = require('../firebase-imports');

exports.commentReplyNotification = (snap, context) => {
    const reply = snap.data();
    console.log(`INFO: New notification for reply ${reply.in_reply_to_member_name}`);
    const payload = {
        notification: {
            title: 'New Message',
            body: `${reply.member_name} replied to your comment in ${reply.event_name}`,
            icon: 'notification_icon'
        }
    };

    const devicesRef = firestore.collection('devices').where('meetup_id', '==', reply.in_reply_to_member_id);
    return devicesRef.get().then((devices) => {
        const tokens = [];

        if (!devices.empty) {
            // Loop over documents to get device tokens (should only be one)
            devices.forEach((result) => {
                const token = result.data().token;
                tokens.push(token);
            });

            // send the notifications
            return admin.messaging().sendToDevice(tokens, payload);
        } else {
            console.log('No registered users.js need to be notified.');
            return null;
        }

    }).catch((err) => {
        console.log(err);
        throw err;
    });
};

exports.newMeetupNotification = (snap, context) => {
    const newMeetup = snap.data();
    console.log(`INFO: New notification for ${newMeetup.name}!`);
    const meetup_name = newMeetup.name;
    // Notification Content
    const payload = {
        notification: {
            title: 'New Walk Added to Meetup',
            body: `${meetup_name} was added.`,
            icon: 'notification_icon'
        }
    };

    // ref to the parent document
    const devicesRef = firestore.collection('devices');
    return devicesRef.get().then((devices) => {
        const tokens = [];

        if (!devices.empty) {
            // Loop over documents to get device tokens
            devices.forEach((result) => {
                const token = result.data().token;
                tokens.push(token);
            });

            // send the notifications
            return admin.messaging().sendToDevice(tokens, payload);
        } else {
            console.log('No registered users.js need to be notified.');
            return null;
        }

    }).catch((err) => {
        console.log(err);
        throw err;
    });
};