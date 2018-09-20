/* eslint-disable promise/always-return */
/**
 * My Meetup API for interacting with the actual Meetup API
 */
'use strict';

const {functions, firestore} = require('../firebase-imports');
const moment = require('moment');
const request = require('request');

// Meetup Constants
const meetupAPIEnd =  'https://api.meetup.com/';
// const meetup_integration_redirect_uri = '&redirect_uri=https://us-central1-wide-app.cloudfunctions.net/app/auth/meetup';
const meetup_integration_redirect_uri = '&redirect_uri=http://localhost:5000/wide-app/us-central1/app/auth/meetup';
const endpoint = 'https://secure.meetup.com/oauth2/access?';
const client_id = functions.config()['meetup-config'].client_id;
const client_secret = functions.config()['meetup-config'].client_secret;

/** Private Functions **/
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
        date: moment(meetup_data.time).format('YYYY-MM-DD'),
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
};

exports.integrateMeetup = (req, res, next) => {
    console.log(req.query);
    console.log(req.headers);
    res.send(`<h4>Please close this browser window now.</h4>`);
    if (!req.query.error) {
        const userId = req.query.state;
        const client_id_param = '&client_id=' + client_id;
        const client_secret_param = '&client_secret=' + client_secret;
        const grant_type = '&grant_type=authorization_code';
        const code = '&code=' + req.query.code;
        const opts = {
            uri: endpoint + client_id_param + client_secret_param + grant_type + meetup_integration_redirect_uri + code,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        const userDoc = firestore.doc(`users/${userId}`);

        request(opts, (error, response) => {
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
};

exports.rsvpForEvent = (req, res, next) => {
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

exports.getAuthEvents = (req, res, next) => {
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


exports.getEventComments = (req, res, next) => {
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

exports.getProfile = (req, res, next) => {
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

exports.getMinProfile = (req, res, next) => {
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

exports.postComment = (req, res, next) => {
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

exports.getRSVPList = (req, res, next) => {
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