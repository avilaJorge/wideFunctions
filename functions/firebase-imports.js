/**
 * Initializes the admin and firebase sdk and allows for using a single instance of the admin sdk in other files.
 */
'use strict';
// Firebase and Admin SDK initialization
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

// Firestore variables
const firestore = admin.firestore();
const settings = {timestampsInSnapshots: true};
firestore.settings(settings);

// Cloud Storage variables
const bucket = admin.storage().bucket();


module.exports = {
    functions,
    admin,
    firestore,
    bucket,
};