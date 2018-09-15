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

/** Firebase imports **/
const {functions} = require('./firebase-imports');
const fbTokenValidationModule = require('./middleware/fb-token-validator');
/** Meetup imports **/
const meetupAPI = require('./apis/meetup');
const meetupNotificationsModule = require('./notifications/meetup');
/** Under Armour (MapMyWalk) imports **/
const uaAPI = require('./apis/under-armour');
/** (WIDE) Log imports **/
const logNotificationsModule = require('./notifications/log');
/** Fitbit imports **/
const fitbitAPI = require('./apis/fitbit');
/** Other imports **/
const express = require('express');
const cookieParser = require('cookie-parser')();
const cors = require('cors')({origin: true});
const app = express();

app.get('/skip-auth', (req, res) => {
    res.send(`Hello there!  This works okay!`);
});
// Verify Authentication
app.use(cors);
app.use(cookieParser);

/** Meetup Routes **/
// Integrate Meetup for User
app.get('/auth/meetup', meetupAPI.integrateMeetup);
// RSVP for an event
app.get('/meetup/rsvp', meetupAPI.rsvpForEvent);
// Get RSVP List
app.get('/meetup/rsvp/list', meetupAPI.getRSVPList);
// Get authenticated events with user rsvps
app.get('/meetup/events', meetupAPI.getAuthEvents);
// Get comments for a particular event.
app.get('/meetup/event/comments', meetupAPI.getEventComments);
// Post a new comment
app.post('/meetup/event/comment', meetupAPI.postComment);
// Get the profile for self
app.get('/meetup/profile', meetupAPI.getProfile);
// Get the minimal profile for user
app.get('/meetup/profile/minimal', meetupAPI.getMinProfile);

/** Under Armour (MapMyWalk) Routes **/
// Get UA Routes
app.get('/ua/routes', uaAPI.updateClientCredentials, uaAPI.getUARoutes);
// Get Next UA Routes for Infinite Scroll Effect.
app.get('/ua/routes/next', uaAPI.updateClientCredentials, uaAPI.getNextRoutes);
// Get KML file
app.get('/ua/route/kml', uaAPI.updateClientCredentials, uaAPI.getKMLFile);

/** Fitbit Routes **/
// Integrate Fitbit for User
app.get('/auth/fitbit', fitbitAPI.integrateFitbit);
// Get steps for a particular date
app.get('/fitbit/steps/:date', fitbitAPI.checkAccessToken, fitbitAPI.getSteps);

// TODO: Need to move this to the top of the file and send this token when every call from the app
app.use(fbTokenValidationModule.validateFirebaseIdToken);

// This HTTPS endpoint can only be accessed by your Firebase Users.
// Requests need to be authorized by providing an `Authorization` HTTP header
// with value `Bearer <Firebase ID Token>`.
exports.app = functions.https.onRequest((req, res) => {
    return app(req, res);
});

exports.newMeetupNotification = functions.firestore
    .document('meetups/{meetupId}')
    .onCreate(meetupNotificationsModule.newMeetupNotification);

exports.commentReplyNotification = functions.firestore
    .document('replies/{comment_id}')
    .onCreate(meetupNotificationsModule.commentReplyNotification);

exports.lognotification = functions.https.onRequest(logNotificationsModule.logReminderNotification);

