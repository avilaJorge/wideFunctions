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
const request = require('request');
const fs = admin.firestore();
const settings = {timestampsInSnapshots: true};
fs.settings(settings);
const meetupAPIEnd =  'https://api.meetup.com/';

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
    constructor(date, steps, description, goal) {
        this.date = date;
        this.steps = steps;
        this.description = description;
        this.goal = goal;
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
    const log = new StepLog(
        req.body.date,
        req.body.steps,
        req.body.description,
        req.body.goal
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

const integrateMeetup = (req, res, next) => {
    console.log(req.query);
    console.log(req.headers);
    res.send(`<h4>Please close this browser window now.</h4>`);
    if (!req.query.error) {
        const endpoint = 'https://secure.meetup.com/oauth2/access?';
        const userId = req.query.state;
        const client_id = '&client_id=22lh8rm9tair7fn49qco8n3j1c';
        const client_secret = '&client_secret=cbc07j336l0r1c48senntuci9o';
        const grant_type = '&grant_type=authorization_code';
        // const redirect_uri = '&redirect_uri=https://us-central1-wide-app.cloudfunctions.net/app/auth/meetup';
        const redirect_uri = '&redirect_uri=http://localhost:5000/wide-app/us-central1/app/auth/meetup';
        const code = '&code=' + req.query.code;
        const opts = {
            uri: endpoint + client_id + client_secret + grant_type + redirect_uri + code,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        const userDoc = fs.doc(`users/${userId}`);
        userDoc.get().then((doc) => {
            console.log(doc);
            return;
        }).catch((err) => {
            console.log(err);
            return;
        });

        request(opts, (error, response) => {
            console.log(error,response.body);
            console.log(response.body.access_token);
            console.log(userId);
            console.log(response.headers);
            const respData = JSON.parse(response.body);
            console.log(respData);
            const exp = new Date(Date.now() + respData.expires_in).getTime();
            const newUserData = {
                meetupAccessToken: respData.access_token,
                isMeetupAuthenticated: true,
                meetupRefreshToken: respData.refresh_token,
                meetupTokenExpiresIn: respData.expires_in,
                meetupTokenType: respData.token_type,
                meetupTokenExpirationDate: exp
            };
            console.log(newUserData);
            userDoc.update(newUserData).then((doc) => {
              console.log(doc);
              return;
            }).catch((err) => {
                console.log(err);
                return;
            });
        });
    } else {
        res.send(req.query.error);
        return;
    }
}

const rsvpForEvent = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    const endpoint = meetupAPIEnd + req.query.group + '/events/' + req.query.eventId + '/rsvps?response=' + req.query.response;
    const opts = {
        uri: endpoint,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': req.query.authorization
        }
    };
    request(opts, (error, response) => {
        console.log(error,response.body);
        console.log(response.headers);
        res.send(response);
    });
};

const getAuthEvents = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    const params = '?photo-host=public&page=20&fields=description_images,' +
        'featured_photo,group_key_photo,how_to_find_us,rsvp_sample,self';
    const endpoint = meetupAPIEnd + req.query.group + '/events' + params;
    console.log(endpoint);
    const opts = {
        uri: endpoint,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': req.query.authorization
        }
    };
    request(opts, (error, response) => {
        console.log(error, response.body);
        console.log(response.headers);
        res.send(response);
    });
};

const getEventComments = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    const params = '?photo-host=public&page=20';
    const endpoint = meetupAPIEnd + req.query.group + '/events/' + req.query.eventId + '/comments' + params;
    console.log(endpoint);
    const opts = {
        uri: endpoint,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': req.query.authorization
        }
    };
    request(opts, (error, response) => {
        console.log(error, response.body);
        console.log(response.headers);
        res.send(response);
    });
};

const getSelfProfile = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    const endpoint = meetupAPIEnd + 'members/self?photo-host=public';
    console.log(endpoint);
    const opts = {
        uri: endpoint,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': req.query.authorization
        }
    };
    request(opts, (error, response) => {
        console.log(error, response.body);
        console.log(response.headers);
        res.send(response);
    });
};

const postComment = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    console.log(req.body);
    let body = {
        comment: req.body.comment,
        notifications: false
    };
    let params = '?comment=' + req.body.comment + '&notifications=false';
    if (req.body.in_reply_to) {
        body.in_reply_to = req.body.in_reply_to;
        params += '&in_reply_to=' + req.body.in_reply_to;
    }
    console.log(body);
    const endpoint = meetupAPIEnd + req.body.group + '/events/' + req.body.eventId + '/comments' + params;
    console.log(endpoint);
    const opts = {
        uri: endpoint,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': req.query.authorization
        }
    };
    console.log(opts);
    request(opts, (error, response) => {
        console.log(error, response.body);
        console.log(response.headers);
        res.send(response);
    });
};

const getRSVPList = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    const params = '?photo-host=public&omit=group,venue,event';
    const endpoint = meetupAPIEnd + req.query.group + '/events/' + req.query.eventId + '/rsvps' + params;
    console.log(endpoint);
    const opts = {
        uri: endpoint,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': req.query.authorization
        }
    };
    request(opts, (error, response) => {
        console.log(error, response.body);
        console.log(response.headers);
        res.send(response);
    });
};

app.get('/skip-auth', (req, res) => {
    res.send(`Hello there!  This works okay!`);
});
// Verify Authentication
app.use(cors);
app.use(cookieParser);
// Integrate Meetup for User
app.get('/auth/meetup', integrateMeetup);
// Create a user
app.post('/auth/user', createUser);
// RSVP for an event
app.get('/meetup/rsvp', rsvpForEvent);
// Get RSVP List
app.get('/meetup/rsvp/list', getRSVPList);
// Get authenticated events with user rsvps
app.get('/meetup/events', getAuthEvents);
// Get comments for a particular event.
app.get('/meetup/event/comments', getEventComments);
// Post a new comment
app.post('/meetup/event/comment', postComment);
// Get the profile for self
app.get('/meetup/profile/self', getSelfProfile);
app.use(validateFirebaseIdToken);
// Get User
app.get('/auth/user/:uid', getUser);
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

