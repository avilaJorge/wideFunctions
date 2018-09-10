/* eslint-disable promise/always-return */
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



// Firebase and Admin SDK initialization
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

const express = require('express');
const cookieParser = require('cookie-parser')();
const cors = require('cors')({origin: true});
const app = express();
const request = require('request');
const rp = require('request-promise-native');
const settings = {timestampsInSnapshots: true};
const fs = require('fs');
const os = require('os');
const path = require('path');

// Firestore variables
const firestore = admin.firestore();
firestore.settings(settings);

// Cloud Storage variables
const bucket = admin.storage().bucket();

// Meetup Constants
const meetupAPIEnd =  'https://api.meetup.com/';
const meetup_redirect_uri = '&redirect_uri=https://us-central1-wide-app.cloudfunctions.net/app/auth/meetup';
// const meetup_redirect_uri = '&redirect_uri=http://localhost:5000/wide-app/us-central1/app/auth/meetup';

// UA Constants
var uaClientCredentialsAccessToken = 0;
var uaCCAccessTokenExpires = 0;
const uaAPIEnd = 'https://api.ua.com/v7.1/';
const uaNextAPIEnd = 'https://api.ua.com'
const uaClientID = 'cuoxcst2q4yxbyutptpokm6rttklhozx';
const uaClientSecret = '33jpvlvmlhmjstwfmhcrsf7mp3c67uvepfsj27msovmaxb54trfgd34lkwzyxd7x';

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
        const code = '&code=' + req.query.code;
        const opts = {
            uri: endpoint + client_id + client_secret + grant_type + meetup_redirect_uri + code,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        const userDoc = firestore.doc(`users/${userId}`);
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
        'featured_photo,group_key_photo,how_to_find_us,self'; // rsvp_sample
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
    let fs_ref = firestore.collection('meetups');
    request(opts, (error, response) => {
        console.log(error);
        console.log(response.headers);
        res.send(response);
        const meetups = JSON.parse(response.body);
        meetups.forEach((meetup) => {
           storeMeetup(meetup, fs_ref);
        });
    });
};
// Function for storing the short meetups list to Firestore
// Below variables are used only in this function
const date_options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
const time_options = { hour: 'numeric', minute: 'numeric' };
const storeMeetup = (meetup_data, ref) => {
    const date_obj = new Date(meetup_data.time);
    let fs_data = {
        id: meetup_data.id,
        name: meetup_data.name,
        status: meetup_data.status,
        time: meetup_data.time,
        duration: meetup_data.duration,
        date_str: date_obj.toLocaleString('en-US', date_options),
        time_str: date_obj.toLocaleString('en-US', time_options)
    };
    ref.doc(fs_data.id).set(fs_data, {merge: true}).then((result) => {
        console.log('Meetup ', fs_data.id, ' stored in Firestore');
        console.log(result);
    }).catch((err) => {
        console.log(err);
        throw err;
    });
}

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
    let fs_ref = firestore.collection('replies');
    let batch = firestore.batch();
    request(opts, (error, response) => {
        console.log(error, response.body);
        console.log(response.headers);
        res.send(response);
        const comments = JSON.parse(response.body);
        comments.forEach((comment) => {
            storeComment(comment, fs_ref, batch, req.query.event_name);
        });
        batch.commit().then((result_arr) => {
            console.log('Successfully executed batch.');
            console.log(result_arr);
        }).catch((err) => {
            console.log(err);
            throw err;
        });
    });
};

// Function for storing comments that enable notifications
const storeComment = (comment_data, ref, batch, event_name) => {
    if (comment_data.replies) {
        comment_data.replies.forEach((reply) => {
            console.log(comment_data.id);
            console.log(comment_data);
            console.log(reply);
            let data = {
                id: reply.id,
                event_name: event_name,
                in_reply_to_id: reply.in_reply_to,
                comment: reply.comment,
                created: reply.created,
                link: reply.link,
                member_id: reply.member.id,
                member_name: reply.member.name,
                in_reply_to_member_id: comment_data.member.id,
                in_reply_to_member_name: comment_data.member.name,
            };
            batch.set(ref.doc(String(reply.id)), data, {merge: true});
        });
    }
};

const getProfile = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    const params = '?photo-host=public&fields=privacy,stats,topics,memberships';
    const endpoint = meetupAPIEnd + req.query.group + '/members/' + req.query.memberId + params;
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

const getMinProfile = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    const params = '?photo-host=public&only=' + req.query.only;
    const endpoint = meetupAPIEnd + req.query.group + '/members/' + req.query.memberId + params;
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

const updateClientCredentials = (req, res, next) => {
    console.log(uaClientCredentialsAccessToken);
    console.log(uaCCAccessTokenExpires);
    if (Date.now() > uaCCAccessTokenExpires) {
        const formData = {
            grant_type: 'client_credentials',
            client_id: uaClientID,
            client_secret: uaClientSecret
        };
        const endpoint = uaAPIEnd + 'oauth2/access_token';
        const opts = {
            uri: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            formData: formData
        };
        request(opts, (error, response) => {
            console.log(error, response.body);
            if (error) {
                res.status(403).send('An error occured at UA Api');
                return;
            }
            const data = JSON.parse(response.body);
            uaCCAccessTokenExpires = Date.now() + data.expires_in;
            uaClientCredentialsAccessToken = data.access_token;
            return next();
        });
    } else {
        return next();
    }
};

const getUARoutes = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    const params = '?close_to_location=' + req.query.location + '&order_by=distance_from_point&text_search=walk&field_set=detailed';
    const endpoint = uaAPIEnd + 'route/' + params;
    const opts = {
        uri: endpoint,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + uaClientCredentialsAccessToken
        }
    };
    request(opts, (error, response) => {
        res.send(response);
    });
};

const getNextRoutes = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    console.log(req.params);
    const endpoint = uaNextAPIEnd + req.query.endpoint;
    const opts = {
        uri: endpoint,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + uaClientCredentialsAccessToken
        }
    };
    request(opts, (error, response) => {
        res.send(response);
    });
};

const getKMLFile = (req, res, next) => {

    const fileName = req.query.id + '.kml';
    bucket.file('routes/' + fileName).exists().then((fileExists) => {
        console.log(fileExists);
        console.log("DEBUG: Does the file exist? " + fileExists);
        if (fileExists[0]) {
            console.log('This file does exist so we will just get the mediaLink for it!!!');
            const config = {
                action: 'read',
                expires: Date.now() + (1000 * 60 * 60 * 24 * 5)
            }
            bucket.file('routes/' + fileName).getMetadata().then((data) => {
                console.log('DEBUG: This file already exists!');
                console.log(data);
                res.send(data);
            }).catch((err) => {
                console.log(err);
                throw err;
            });
        } else {
            console.log('DEBUG: This file does not exist yet, will be created!');
            // console.log(req.body);
            const params = '?format=kml&field_set=detailed&line_color=ff0000ff&marker_unit=mile&show_marker_every=1';
            const endpoint = uaAPIEnd + 'route/' + req.query.id + '/' + params;
            const opts = {
                uri: endpoint,
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + uaClientCredentialsAccessToken
                }
            };
            req.body.filename = fileName;
            const tempFilePath = path.join(os.tmpdir(), fileName);
            return rp(opts).then((response) => {
                // console.log(response);
                return new Promise((resolve,reject) => {
                    fs.writeFile(tempFilePath, response, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }).then(() => {
                console.log('Does the file exist yet?');
                console.log(fs.existsSync(tempFilePath));
                const options = {
                    resumable: false,
                    public: true,
                    metadata: { metadata: {route_id: req.query.id} },
                    destination: 'routes/' + fileName
                };
                return bucket.upload(tempFilePath, options);
            }).then((data) => {
                console.log(data);
                fs.unlinkSync(tempFilePath);
                res.send(data);
            }).catch((err) => {console.log(err)});
        }
    }).catch((err) => {
        console.log('ERROR: A serious error occured!!!!');
        console.log(err);
        throw err;
    });
};

const createKMLFile = (req, res, next) => {
    let filename = req.body.filename;
    fs.writeFileSync(filename, req.body.data);
    console.log('Saved file!');
    return next();
    // fs.writeFile(filename, req.body.data, (err) => {
    //     if (err) {
    //         console.log('ERROR: inside getKMLFile');
    //         console.log(err);
    //         res.status(401).json({message: "An error occured while saving the file"});
    //         throw err;
    //     }
    //     console.log('Saved File!!!');
    //     return next();
    // });
};

const storeKMLFile = (req, res, next) => {
    console.log('Does the file exist yet?');
    console.log(fs.existsSync(req.body.filename));
    let filename = req.body.filename;
    console.log('./' + filename);
    return bucket.upload('./' + filename).then((data) => {
        console.log(data);
        fs.unlinkSync('./' + filename);
        return res.send(data);
    }).catch((err) => {console.log(err)});
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
app.get('/meetup/profile', getProfile);
// Get the minimal profile for user
app.get('/meetup/profile/minimal', getMinProfile);
// Get UA API client credentials
app.use(updateClientCredentials);
// Get UA Routes
app.get('/ua/routes', getUARoutes);
// Get Next UA Routes for Infinite Scroll Effect.
app.get('/ua/routes/next', getNextRoutes);
// Get KML file
app.get('/ua/route/kml', getKMLFile);

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

exports.newMeetupNotification = functions.firestore
    .document('meetups/{meetupId}')
    .onCreate((snap, context) => {
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

        // ref to the parent doucment
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
                console.log('No registered users need to be notified.');
                return null;
            }

        }).catch((err) => {
            console.log(err);
            throw err;
        });
    });

exports.commentReplyNotification = functions.firestore
    .document('replies/{comment_id}')
    .onCreate((snap, context) => {
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
                console.log('No registered users need to be notified.');
                return null;
            }

        }).catch((err) => {
            console.log(err);
            throw err;
        });
    });