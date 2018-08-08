/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modifications copyright (C) 2018 Jorge Avila
 */
'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const express = require('express');
const cookieParser = require('cookie-parser')();
const cors = require('cors')({origin: true});
const app = express();

class User {
    constructor(googleUID, userName, photoURL, email, authExpires, groupName) {
        this.googleUID = googleUID;
        this.userName = userName;
        this.photoURL = photoURL;
        this.email = email;
        this.authExpires = authExpires;
        this.groupName = groupName;
        this.isMeetupAuthenticated = false;
        this.meetupAuthToken = '';
        this.isUAAuthenticated = false;
        this.underArmourAuthToken = '';
    }
}

class StepLog {
    constructor(name, date, steps, description, goal, weekGoal) {
        this.name = name;
        this.date = date;
        this.steps = steps;
        this.description = description;
        this.goal = goal;
        this.weekGoal = weekGoal;
    }
}

// Express middleware that validates Firebase ID Tokens passed in the Authorization HTTP header.
// The Firebase ID token needs to be passed as a Bearer token in the Authorization HTTP header like this:
// `Authorization: Bearer <Firebase ID Token>`.
// when decoded successfully, the ID Token content will be added as `req.user`.
const validateFirebaseIdToken = (req, res, next) => {
    console.log('Check if request is authorized with Firebase ID token');

    if ((!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) &&
        !(req.cookies && req.cookies.__session)) {
        console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.',
            'Make sure you authorize your request by providing the following HTTP header:',
            'Authorization: Bearer <Firebase ID Token>',
            'or by passing a "__session" cookie.');
        res.status(403).send('Unauthorized');
        return;
    }

    let idToken;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        console.log('Found "Authorization" header');
        // Read the ID Token from the Authorization header.
        idToken = req.headers.authorization.split('Bearer ')[1];
    } else if(req.cookies) {
        console.log('Found "__session" cookie');
        // Read the ID Token from cookie.
        idToken = req.cookies.__session;
    } else {
        // No cookie
        res.status(403).send('Unauthorized');
        return;
    }
    admin.auth().verifyIdToken(idToken).then((decodedIdToken) => {
        console.log('ID Token correctly decoded', decodedIdToken);
        req.user = decodedIdToken;
        return next();
    }).catch((error) => {
        console.error('Error while verifying Firebase ID token:', error);
        res.status(403).send('Unauthorized');
    });
};

const createUser = (req, res, next) => {
    console.log(req.body);
    const user = req.body;
    admin.database().ref('/users/' + user.googleUID).set(
        new User(
            user.googleUID,
            user.userName,
            user.photoURL,
            user.email,
            user.authExpires,
            user.groupName
        )
    ).then(() => {
        console.log("User " + user.userName + " was added to database!");
        res.send("User was successfully added to the database!");
        return;
    }).catch((error) => {
        console.log(error);
    });
};

const postStepLog = (req, res, next) => {
    req.body = JSON.parse(req.body);
    const log = new StepLog(
        req.body.name,
        req.body.date,
        req.body.steps,
        req.body.description,
        req.body.goal,
        req.body.weekGoal
    );
    admin.database().ref('/step-logs/' + req.params.uid + '/' + req.params.date).set(log)
        .then(() => {
            console.log("User " + req.user.name + " now has a log posted for " + req.body.date);
            return;
        }).catch((error) => {
            console.log(error);
    });
};

const getUser = (req, res, next) => {
    admin.database().ref('/users').child(req.params.uid).once('value').then((dataSnapShot) => {
        const user = dataSnapShot.val();
        res.send(user);
        return;
    }).catch((error) => {
        console.log(error);
    });
};

const getLogEntry = (req, res, next) => {
    admin.database().ref('/step-logs/' + req.params.uid + '/' + req.params.date).once('value').then((dataSnapShot) => {
        const log = dataSnapShot.val();
        res.send(log);
        return;
    }).catch((error) => {
        console.log(error);
    });
};

const getUserLogEntries = (req, res, next) => {
    admin.database().ref('/step-logs/' + req.params.uid).once('value').then((dataSnapShot) => {
        const logs = dataSnapShot.val();
        res.send(logs);
        return;
    }).catch((error) => {
        console.log(error);
    });
};

const getAllLogEntries = (req, res, next) => {
    admin.database().ref('/step-logs/').once('value').then((dataSnapShot) => {
        const logs = dataSnapShot.val();
        res.send(logs);
        return;
    }).catch((error) => {
        console.log(error);
    });
};

const getUsersInGroup = (req, res, next) => {
    admin.database().ref('users').once('value').then((dataSnapShot) => {
        const users = {};
        console.log(dataSnapShot.numChildren());
        dataSnapShot.forEach((child) => {
            if (child.val().groupName === req.params.group) {
                users[child.key] = child.val();
            }
        });
        res.send(users);
        return;
    }).catch((error) => {
        console.log(error);
    });
}

app.get('/skip-auth', (req, res) => {
    res.send(`Hello there!  This works okay!`);
});
// Verify Authentication
app.use(cors);
app.use(cookieParser);
// Create a user
app.post('/auth/user', createUser);
app.use(validateFirebaseIdToken);
// Get User
app.get('/auth/:uid', getUser);
// Get Users in Group
app.get('/auth/users/:group', getUsersInGroup);
// Create a log entry
app.post('/log/:uid/:date', postStepLog);
// Update a log entry
app.put('/log/:uid/:date', postStepLog);
// Get a log entry
app.get('/log/:uid/:date', getLogEntry);
// Get all log entries for user
app.get('/log/:uid', getUserLogEntries);
// Get all log entries
app.get('/log', getAllLogEntries);
app.get('/hello', (req, res) => {
    res.send(`Hello ${req.user.name}`);
});

// This HTTPS endpoint can only be accessed by your Firebase Users.
// Requests need to be authorized by providing an `Authorization` HTTP header
// with value `Bearer <Firebase ID Token>`.
exports.app = functions.https.onRequest((req, res) => {
    return app(req, res);
});

