/* eslint-disable promise/always-return */
/**
 * Notifications related to step logs
 */
'use strict';

const {functions, admin, firestore} = require('../firebase-imports');
const secureCompare = require('secure-compare');
const moment = require('moment');

exports.logReminderNotification = (req, res) => {
    console.log(req.query);
    const key = req.query.key;
    const dateStr = moment().format('YYYY-MM-DD');

    // Exit if the keys don't match
    if (!secureCompare(key, functions.config().cron.key)) {
        console.log('The key provided in the request does not match the key set in the environment. Check that', key,
            'matches the cron.key attribute in `firebase env:get`');
        res.status(403).send('Security key does not match. Make sure your "key" URL query parameter matches the ' +
            'cron.key environment variable.');
        return null;
    }

    const goal_payload = {
        notification: {
            title: 'Great job!',
            body: 'You met your goal for today!',
            icon: 'notification_icon'
        }
    };
    let goal_not_met_payload = {
        notification: {
            title: 'You\'re almost there!',
            body: '',
            icon: 'notification_icon'
        }
    };
    const no_log_payload = {
        notification: {
            title: 'No steps logged today',
            body: 'Did you forget to log your steps?  Need to find a group walk or nearby route?',
            icon: 'notification_icon'
        }
    };

    let devicesArr = [];
    let entriesMap = {};
    firestore.collection('devices').get().then((devices) => {
        if (!devices.empty) {
            devices.forEach((device) => {
                devicesArr.push(device.data());
            });
        } else {
            console.log('No registered users.js need to be notified.');
            return null;
        }
        return firestore.collection('step-entries').where('date', '==', dateStr).get();
    }).then((entries) => {
        entries.forEach((entry) => {
            let entryData = entry.data();
            entriesMap[entryData.uid] = entryData;
        });

        let goalMetArr = [];
        let noEntryArr = [];
        devicesArr.forEach((device) => {
            let userData = entriesMap[device.userId];
            if (!userData) {
                noEntryArr.push(device.token);
            } else if (userData.steps <= 0) {
                noEntryArr.push(device.token);
            } else if (userData.steps < userData.goal) {
                goal_not_met_payload.notification.body = `You only need ${userData.goal - userData.steps} more steps to meet your goal!`;
                admin.messaging().sendToDevice(device.token, goal_not_met_payload);
            } else if (userData.steps >= userData.goal) {
                goalMetArr.push(device.token);
            } else {
                console.log('Something may have gone wrong. No case was met');
            }
        });
        if (goalMetArr.length > 0) {
            admin.messaging().sendToDevice(goalMetArr, goal_payload);
        }
        if (noEntryArr.length > 0) {
            admin.messaging().sendToDevice(noEntryArr, no_log_payload);
        }
        res.send('Success');
    }).catch((err) => { throw err});
};